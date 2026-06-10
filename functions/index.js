const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');
const Anthropic = require('@anthropic-ai/sdk');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

function getAdminDb() {
    return admin.firestore();
}

// ── Telegram helper ───────────────────────────────────────────────────────────
async function sendTelegramMessage(token, chatIdsRaw, text) {
    const chatIds = String(chatIdsRaw || '').split(',').map(s => s.trim()).filter(Boolean);
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await Promise.allSettled(chatIds.map(chatId =>
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
        })
    ));
}

// ── Firestore notification writer ────────────────────────────────────────────
async function writeNotification(db, tenantId, type, title, body, bookingId, extra = {}) {
    try {
        await db.collection(`tenants/${tenantId}/notifications`).add({
            type,
            title,
            body,
            bookingId: bookingId || null,
            read: false,
            createdAt: admin.firestore.Timestamp.now(),
            ...extra,
        });
    } catch (err) {
        console.error('writeNotification error:', err);
    }
}


// TO ENABLE EMAIL: Google Account → Security → 2FA → App passwords
// Generate password for "Mail" → add as Firebase secret GMAIL_PASS
if (!process.env.GMAIL_PASS) {
    console.error('⚠️  WARNING: GMAIL_PASS not set — email confirmations disabled');
}

function getTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
    });
}

const SERVICE_NAMES = {
    'full-experience':             'The Full Experience',
    'the-full-experience':         'The Full Experience',
    'full-skinfade-beard-luxury':  'Full Skin Fade & Beard Luxury',
    'full-skin-fade-beard-luxury': 'Full Skin Fade & Beard Luxury',
    'i-cut-deluxe':                'I CUT Deluxe',
    'i-cut-royal':                 'I CUT Royal',
    'senior-full-experience':      'Senior Full Experience',
    'skin-fade':                   'Skin Fade Cut',
    'scissor-cut':                 'Scissor Cut',
    'classic-sbs':                 'Classic Short Back & Sides',
    'hot-towel-shave':             'Hot Towel Shave',
    'clipper-cut':                 'Clipper Cut',
    'senior-haircut':              'Senior Haircut (65+)',
    'young-gents':                 'Young Gents (0-12)',
    'young-gents-skin-fade':       'Young Gents Skin Fade',
    'full-facial':                 'Full Facial Treatment',
    'beard-dyeing':                'Beard Dyeing',
    'face-mask':                   'Face Mask',
    'face-steam':                  'Face Steam',
    'threading':                   'Threading',
    'waxing':                      'Waxing',
    'shape-up-clean-up':           'Shape Up & Clean Up',
    'wash-hot-towel':              'Wash, Style & Hot Towel',
};

function lookupServiceName(id) {
    if (!id) return 'Service';
    return SERVICE_NAMES[id]
        || SERVICE_NAMES[id.replace(/skin-fade/g, 'skinfade')]
        || SERVICE_NAMES[id.replace(/skinfade/g, 'skin-fade')]
        || id;
}

async function lookupBarberName(db, barberId, fallbackName) {
    if (fallbackName && fallbackName.trim() && fallbackName.trim() !== barberId) {
        return fallbackName.trim();
    }
    if (!barberId) return 'TBC';
    try {
        const doc = await db.collection('tenants/whitecross/barbers').doc(barberId).get();
        if (doc.exists && doc.data().name) return doc.data().name;
    } catch (_) {}
    return barberId;
}

const SERVICE_PRICES = {
    'i-cut-royal': 65,
    'i-cut-deluxe': 55,
    'full-skinfade-beard-luxury': 48,
    'full-skin-fade-beard-luxury': 48,
    'full-experience': 40,
    'senior-full-experience': 35,
    'skin-fade': 32,
    'scissor-cut': 30,
    'classic-sbs': 28,
    'hot-towel-shave': 22,
    'clipper-cut': 22,
    'senior-haircut': 23,
    'young-gents': 20,
    'young-gents-skin-fade': 24,
    'full-facial': 24,
    'beard-dyeing': 24,
    'face-mask': 12,
    'face-steam': 12,
    'threading': 10,
    'waxing': 10,
    'shape-up-clean-up': 20,
    'wash-hot-towel': 10,
};

const DEPOSIT_AMOUNTS = {
    'i-cut-royal': 10, 'i-cut-deluxe': 10,
    'full-skinfade-beard-luxury': 10, 'full-skin-fade-beard-luxury': 10, 'full-experience': 10,
};

exports.health = onRequest((req, res) => {
    res.status(200).send('ok');
});


// ── Create dynamic Stripe Checkout Session ────────────────────────────────────
// Called from the public booking form instead of redirecting to a static Payment Link.
// Embeds all booking details in the session metadata so the webhook can always
// match by bookingId — no email guessing, no lost bookings.
exports.createCheckoutSession = onRequest(
    {
        secrets: ['STRIPE_SECRET_KEY', 'STRIPE_TEST_SECRET_KEY'],
        cors: ['https://whitecrossbarbers.com', 'https://www.whitecrossbarbers.com'],
    },
    async (req, res) => {
        if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

        const testMode = req.body?.testMode === true;
        const stripeKey = testMode
            ? (process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY)
            : process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) { res.status(500).json({ error: 'Stripe not configured' }); return; }

        const {
            bookingId, serviceId, serviceName, price,
            barberId, barberName, date, time,
            clientName, clientEmail, clientPhone, paymentType,
            // Group booking fields
            groupId, groupMembers, groupDepositPerPerson,
        } = req.body || {};

        const isGroup = !!(groupId && Array.isArray(groupMembers) && groupMembers.length > 1);

        if (!isGroup && (!bookingId || !serviceId || !price)) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        if (isGroup && (!groupId || !groupMembers.length)) {
            res.status(400).json({ error: 'Missing group fields' });
            return;
        }

        try {
            const stripe = new Stripe(stripeKey);
            let session;

            if (isGroup) {
                const isGroupDeposit   = paymentType === 'DEPOSIT';
                const depositPerPerson = parseFloat(groupDepositPerPerson) || 10;

                const lineItems = groupMembers.map((m, i) => {
                    // Deposit mode: flat £20/person. Full mode: actual service price
                    let chargeAmount;
                    if (isGroupDeposit) {
                        chargeAmount = depositPerPerson;
                    } else {
                        chargeAmount = parseFloat(m.price) > 0
                            ? parseFloat(m.price)
                            : (SERVICE_PRICES[m.serviceId] || 0);
                    }
                    const label = isGroupDeposit
                        ? `Deposit – Person ${i + 1} (${SERVICE_NAMES[m.serviceId] || m.serviceName || m.serviceId})`
                        : `Person ${i + 1} – ${SERVICE_NAMES[m.serviceId] || m.serviceName || m.serviceId}`;
                    return {
                        price_data: {
                            currency: 'gbp',
                            product_data: {
                                name: label,
                                description: `${m.barberName || 'Barber'} · ${date}`,
                            },
                            unit_amount: Math.round(chargeAmount * 100),
                        },
                        quantity: 1,
                    };
                }).filter(li => li.price_data.unit_amount >= 50);

                if (!lineItems.length) {
                    res.status(400).json({ error: 'Could not resolve prices for group booking' });
                    return;
                }

                session = await stripe.checkout.sessions.create({
                    payment_method_types: ['card'],
                    line_items: lineItems,
                    mode: 'payment',
                    customer_email: clientEmail || undefined,
                    metadata: {
                        groupId,
                        bookingId:             groupMembers[0].bookingId || '',
                        clientName:            clientName  || '',
                        clientPhone:           clientPhone || '',
                        clientEmail:           clientEmail || '',
                        paymentType:           isGroupDeposit ? 'DEPOSIT' : 'FULL',
                        isGroup:               'true',
                        groupSize:             String(groupMembers.length),
                        groupDepositPerPerson: isGroupDeposit ? String(depositPerPerson) : '0',
                    },
                    success_url: testMode
                        ? `https://whitecrossbarbers.com/success.html?session_id={CHECKOUT_SESSION_ID}&id=${groupMembers[0].bookingId}&testMode=1`
                        : `https://whitecrossbarbers.com/success.html?session_id={CHECKOUT_SESSION_ID}&id=${groupMembers[0].bookingId}`,
                    cancel_url: `https://whitecrossbarbers.com/?cancelled=${groupMembers[0].bookingId}#booking`,
                });
            } else {
                const isDeposit  = paymentType === 'DEPOSIT';
                const depositAmt = DEPOSIT_AMOUNTS[serviceId] || 10;
                const chargeGBP  = isDeposit ? depositAmt : Math.max(0, parseFloat(price) || 0);
                if (chargeGBP <= 0) { res.status(400).json({ error: 'Invalid amount' }); return; }

                session = await stripe.checkout.sessions.create({
                    payment_method_types: ['card'],
                    line_items: [{
                        price_data: {
                            currency: 'gbp',
                            product_data: {
                                name: isDeposit ? `Deposit – ${serviceName}` : serviceName,
                                description: `${barberName || 'Barber'} · ${date} at ${time}`,
                            },
                            unit_amount: Math.round(chargeGBP * 100),
                        },
                        quantity: 1,
                    }],
                    mode: 'payment',
                    customer_email: clientEmail || undefined,
                    metadata: {
                        bookingId,
                        serviceId:   serviceId   || '',
                        barberId:    barberId     || '',
                        barberName:  barberName   || '',
                        date:        date         || '',
                        time:        time         || '',
                        clientName:  clientName   || '',
                        clientPhone: clientPhone  || '',
                        clientEmail: clientEmail  || '',
                        paymentType: isDeposit ? 'DEPOSIT' : 'FULL',
                        price:       String(price),
                    },
                    success_url: testMode
                        ? `https://whitecrossbarbers.com/success.html?session_id={CHECKOUT_SESSION_ID}&id=${bookingId}&testMode=1`
                        : `https://whitecrossbarbers.com/success.html?session_id={CHECKOUT_SESSION_ID}&id=${bookingId}`,
                    cancel_url: `https://whitecrossbarbers.com/?cancelled=${bookingId}#booking`,
                });
            }

            res.json({ url: session.url, sessionId: session.id });
        } catch (err) {
            console.error('createCheckoutSession error:', err.message);
            res.status(500).json({ error: err.message });
        }
    }
);

// ── Stripe webhook: confirm pending booking even if client never returns ────
exports.stripeWebhook = onRequest(
    {
        secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_TEST_SECRET_KEY', 'STRIPE_TEST_WEBHOOK_SECRET'],
    },
    async (req, res) => {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const signature = req.headers['stripe-signature'];
        if (!signature) {
            res.status(400).send('Missing stripe-signature');
            return;
        }

        let event;
        let stripeKey;
        // Try live secret first, then test secret
        const secrets = [
            { key: process.env.STRIPE_SECRET_KEY,      webhook: process.env.STRIPE_WEBHOOK_SECRET },
            { key: process.env.STRIPE_TEST_SECRET_KEY, webhook: process.env.STRIPE_TEST_WEBHOOK_SECRET },
        ];
        for (const { key, webhook } of secrets) {
            if (!key || !webhook) continue;
            try {
                event = new Stripe(key).webhooks.constructEvent(req.rawBody, signature, webhook);
                stripeKey = key;
                break;
            } catch (_) {}
        }
        if (!event) {
            console.error('stripeWebhook: signature verification failed for all secrets');
            res.status(400).send('Webhook signature verification failed');
            return;
        }

        try {
            const db = getAdminDb();
            const stripeApi = stripeKey ? new Stripe(stripeKey) : null;
            const handledSessionEvents = new Set([
                'checkout.session.completed',
                'checkout.session.async_payment_succeeded',
            ]);
            const handledPaymentEvents = new Set([
                'payment_intent.succeeded',
                'charge.succeeded',
            ]);

            const confirmBookingFromPayment = async ({
                metadata,
                email,
                amountPaid,
                sessionId,
                paymentIntent,
                paymentLink,
            }) => {
                const meta = metadata || {};

                // ── Mobile app checkout: flip booking to CHECKED_OUT ────────
                if (meta.paymentType === 'MOBILE_CHECKOUT') {
                    const mobileBookingId = String(meta.bookingId || '').trim();
                    if (!mobileBookingId) {
                        console.warn('stripeWebhook: MOBILE_CHECKOUT missing bookingId');
                        return;
                    }
                    const mobileSnap = await db
                        .collection('tenants/whitecross/bookings')
                        .where('bookingId', '==', mobileBookingId)
                        .limit(1)
                        .get();
                    if (mobileSnap.empty) {
                        console.warn('stripeWebhook: MOBILE_CHECKOUT booking not found', mobileBookingId);
                        return;
                    }
                    const bookingData = mobileSnap.docs[0].data();
                    const tipAmt      = parseFloat(meta.tip || '0');
                    const pointsEarned = parseInt(meta.loyaltyPointsEarned || '0', 10);
                    await mobileSnap.docs[0].ref.set({
                        status:                'CHECKED_OUT',
                        paymentMethod:         'CARD',
                        paidAmount:            amountPaid || parseFloat(meta.amount || '0'),
                        tip:                   tipAmt,
                        tipPaymentMethod:      tipAmt > 0 ? (meta.tipPaymentMethod || 'CARD') : '',
                        note:                  meta.note || '',
                        checkedOutAt:          admin.firestore.Timestamp.now(),
                        loyaltyPointsEarned:   pointsEarned,
                        loyaltyPointsRedeemed: 0,
                        sendLoyaltyEmail:      meta.sendLoyaltyEmail === 'true',
                        stripeSessionId:       sessionId || null,
                        stripePaymentIntent:   paymentIntent || null,
                        stripeAmountPaid:      amountPaid,
                        stripeEventId:         event.id || null,
                        updatedAt:             admin.firestore.Timestamp.now(),
                    }, { merge: true });
                    // Update client loyalty balance so sendLoyaltyCardEmail reads correct total
                    if (pointsEarned > 0) {
                        const clientPhone = bookingData.clientPhone || '';
                        const clientEmail = bookingData.clientEmail || '';
                        try {
                            const clientsRef = db.collection('tenants/whitecross/clients');
                            let clientRef = null;
                            if (clientPhone) {
                                const cs = await clientsRef.where('phone', '==', clientPhone).limit(1).get();
                                if (!cs.empty) clientRef = cs.docs[0].ref;
                            }
                            if (!clientRef && clientEmail) {
                                const cs = await clientsRef.where('email', '==', clientEmail).limit(1).get();
                                if (!cs.empty) clientRef = cs.docs[0].ref;
                            }
                            if (clientRef) {
                                await clientRef.update({
                                    loyaltyPoints: admin.firestore.FieldValue.increment(pointsEarned),
                                    lastVisit:     admin.firestore.Timestamp.now(),
                                    lastBarber:    bookingData.barberName  || '',
                                    lastService:   bookingData.serviceId   || bookingData.service || '',
                                });
                            } else if (clientPhone || clientEmail) {
                                await clientsRef.add({
                                    name:          bookingData.clientName || '',
                                    phone:         clientPhone,
                                    email:         clientEmail,
                                    loyaltyPoints: pointsEarned,
                                    createdAt:     admin.firestore.Timestamp.now(),
                                });
                            }
                        } catch (e) {
                            console.warn('stripeWebhook: MOBILE_CHECKOUT client loyalty update failed', e.message);
                        }
                    }
                    console.log('stripeWebhook: mobile checkout complete', mobileBookingId, { pointsEarned });
                    return;
                }

                // ── Group booking: confirm all members at once ──────────────
                if (meta.isGroup === 'true' && meta.groupId) {
                    const groupSnap = await db
                        .collection('tenants/whitecross/bookings')
                        .where('groupId', '==', meta.groupId)
                        .get();
                    if (!groupSnap.empty) {
                        const isGroupDeposit   = meta.paymentType === 'DEPOSIT';
                        const depositPerPerson = parseFloat(meta.groupDepositPerPerson) || 10;
                        const batch = db.batch();
                        groupSnap.docs.forEach(doc => {
                            const existing = doc.data();
                            const isLead = existing.groupLead === true || existing.groupIndex === 0;
                            const memberPrice = parseFloat(existing.price) || 0;
                            const memberDeposit = isGroupDeposit ? depositPerPerson : memberPrice;
                            // Lead stores total Stripe charge as paidAmount (matches groupTotalPrice in price field)
                            const memberPaidAmount = isLead
                                ? (isGroupDeposit ? amountPaid : memberPrice)
                                : memberDeposit;
                            batch.update(doc.ref, {
                                status:              'CONFIRMED',
                                paymentState:        isGroupDeposit ? 'DEPOSIT_PAID' : 'PAID',
                                paymentType:         isGroupDeposit ? 'DEPOSIT' : 'FULL',
                                paidAt:              admin.firestore.Timestamp.now(),
                                stripeSessionId:     sessionId || null,
                                stripePaymentIntent: paymentIntent || null,
                                stripeAmountPaid:    amountPaid,
                                paidAmount:          memberPaidAmount,
                                stripeEventId:       event.id || null,
                                updatedAt:           admin.firestore.Timestamp.now(),
                            });
                        });
                        await batch.commit();
                        console.log(`stripeWebhook: confirmed ${groupSnap.size} group bookings (${meta.paymentType}) for groupId=${meta.groupId}`);
                    }
                    return;
                }

                const metadataBookingId = String(meta.bookingId || '').trim();
                let targetRef = null;

                if (metadataBookingId) {
                    const byBookingId = await db
                        .collection('tenants/whitecross/bookings')
                        .where('bookingId', '==', metadataBookingId)
                        .limit(1)
                        .get();
                    if (!byBookingId.empty) targetRef = byBookingId.docs[0].ref;
                }

                if (!targetRef && email) {
                    const pendingByEmail = await db
                        .collection('tenants/whitecross/bookings')
                        .where('status', '==', 'PENDING')
                        .where('source', '==', 'website')
                        .where('clientEmail', '==', email)
                        .get();

                    if (!pendingByEmail.empty) {
                        const docs = pendingByEmail.docs.slice().sort((a, b) => {
                            const av = a.get('pendingCreatedAt') || a.get('createdAt') || a.get('updatedAt');
                            const bv = b.get('pendingCreatedAt') || b.get('createdAt') || b.get('updatedAt');
                            const am = av?.toMillis ? av.toMillis() : 0;
                            const bm = bv?.toMillis ? bv.toMillis() : 0;
                            return bm - am;
                        });
                        targetRef = docs[0].ref;
                    }
                }

                if (!targetRef && email) {
                    const allByEmail = await db
                        .collection('tenants/whitecross/bookings')
                        .where('clientEmail', '==', email)
                        .get();

                    if (!allByEmail.empty) {
                        const docs = allByEmail.docs
                            .filter((d) => {
                                const row = d.data() || {};
                                const status = String(row.status || '').toUpperCase();
                                const source = String(row.source || '').toLowerCase();
                                const reason = String(row.cancelReason || '').toLowerCase();
                                return status === 'CANCELLED' && source === 'website' && reason === 'expired_pending';
                            })
                            .sort((a, b) => {
                                const av = a.get('cancelledAt') || a.get('updatedAt') || a.get('createdAt');
                                const bv = b.get('cancelledAt') || b.get('updatedAt') || b.get('createdAt');
                                const am = av?.toMillis ? av.toMillis() : 0;
                                const bm = bv?.toMillis ? bv.toMillis() : 0;
                                return bm - am;
                            });

                        if (docs.length) targetRef = docs[0].ref;
                    }
                }

                if (!targetRef) {
                    if (meta.bookingId && meta.serviceId && meta.date && meta.time) {
                        console.log('stripeWebhook: no pending found, creating CONFIRMED from metadata', meta.bookingId);
                        let startTime = null;
                        let endTime = null;
                        try {
                            const dateParts = meta.date.split('-');
                            const [th, tm, ap] = (meta.time.match(/(\d+):(\d+)\s*(AM|PM)/i) || []).slice(1);
                            let h = parseInt(th, 10);
                            const m = parseInt(tm, 10);
                            if (ap?.toUpperCase() === 'PM' && h !== 12) h += 12;
                            if (ap?.toUpperCase() === 'AM' && h === 12) h = 0;
                            const d = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10), h, m, 0);
                            startTime = admin.firestore.Timestamp.fromDate(d);
                            endTime = admin.firestore.Timestamp.fromDate(new Date(d.getTime() + 30 * 60 * 1000));
                        } catch {}

                        const newRef = db.collection('tenants/whitecross/bookings').doc();
                        await newRef.set({
                            bookingId: meta.bookingId,
                            tenantId: 'whitecross',
                            clientName: meta.clientName || 'Guest',
                            clientEmail: meta.clientEmail || email || '',
                            clientPhone: meta.clientPhone || '',
                            barberId: meta.barberId || '',
                            barberName: meta.barberName || '',
                            serviceId: meta.serviceId,
                            price: parseFloat(meta.price) || 0,
                            paymentType: meta.paymentType || 'FULL',
                            status: 'CONFIRMED',
                            paymentState: 'PAID',
                            source: 'website',
                            paidAt: admin.firestore.Timestamp.now(),
                            stripeSessionId: sessionId || null,
                            stripePaymentIntent: paymentIntent || null,
                            stripePaymentLink: paymentLink || null,
                            stripeAmountPaid: amountPaid,
                            stripeEventId: event.id || null,
                            startTime: startTime,
                            endTime: endTime,
                            createdAt: admin.firestore.Timestamp.now(),
                            updatedAt: admin.firestore.Timestamp.now(),
                            note: 'Auto-created by Stripe webhook (no matching pending)',
                        });
                        return;
                    }

                    console.warn('stripeWebhook: no matching booking and insufficient metadata', {
                        email,
                        metadataBookingId,
                        sessionId,
                        paymentIntent,
                    });
                    return;
                }

                // Always backfill key fields from metadata if missing

                // Calculate paidAmount and remaining
                let priceNum = 0;
                if (meta && meta.price) priceNum = parseFloat(meta.price) || 0;
                let paymentType = (meta && meta.paymentType) ? meta.paymentType : 'FULL';
                let depositAmount = 0;
                if (paymentType === 'DEPOSIT') {
                    // Use DEPOSIT_AMOUNTS or fallback to 10
                    depositAmount = DEPOSIT_AMOUNTS[meta.serviceId] || 10;
                } else {
                    depositAmount = priceNum;
                }
                let paidAmount = paymentType === 'DEPOSIT' ? depositAmount : priceNum;
                let remaining = priceNum - paidAmount;
                if (remaining < 0) remaining = 0;

                const updateData = {
                    status: 'CONFIRMED',
                    paymentState: paymentType === 'DEPOSIT' ? 'DEPOSIT_PAID' : 'PAID',
                    paidAt: admin.firestore.Timestamp.now(),
                    stripeSessionId: sessionId || null,
                    stripePaymentIntent: paymentIntent || null,
                    stripePaymentLink: paymentLink || null,
                    stripeEventId: event.id || null,
                    stripeAmountPaid: amountPaid,
                    paidAmount: paidAmount,
                    platformDepositAmount: paymentType === 'DEPOSIT' ? depositAmount : 0,
                    remaining: remaining,
                    cancelReason: admin.firestore.FieldValue.delete(),
                    cancelledAt: admin.firestore.FieldValue.delete(),
                    updatedAt: admin.firestore.Timestamp.now(),
                };
                // Backfill missing fields from metadata
                if (meta) {
                    if (meta.date) updateData.date = meta.date;
                    if (meta.time) updateData.time = meta.time;
                    // Always set service name, never expose serviceId to client
                    if (meta.serviceName) updateData.service = meta.serviceName;
                    else if (meta.service) updateData.service = meta.service;
                    if (meta.barberName) updateData.barberName = meta.barberName;
                    if (meta.barberId) updateData.barberId = meta.barberId;
                    if (meta.price) updateData.price = priceNum;
                    if (meta.clientName) updateData.clientName = meta.clientName;
                    if (meta.clientPhone) updateData.clientPhone = meta.clientPhone;
                    if (meta.clientEmail) updateData.clientEmail = meta.clientEmail;
                    if (meta.paymentType) updateData.paymentType = meta.paymentType;
                }
                await targetRef.set(updateData, { merge: true });

                console.log('stripeWebhook: booking confirmed from Stripe webhook', {
                    ref: targetRef.path,
                    email,
                    sessionId,
                    paymentIntent,
                    eventType: event.type,
                });
            };

            if (handledSessionEvents.has(event.type)) {
                const session = event.data.object || {};

                if (
                    event.type === 'checkout.session.completed' &&
                    session?.payment_status &&
                    String(session.payment_status).toLowerCase() !== 'paid'
                ) {
                    console.log('stripeWebhook: checkout completed but not paid yet; waiting for async success', {
                        sessionId: session.id,
                        paymentStatus: session.payment_status,
                    });
                    res.status(200).json({ received: true, skipped: 'not_paid_yet' });
                    return;
                }

                await confirmBookingFromPayment({
                    metadata: session?.metadata || {},
                    email: String(session?.customer_details?.email || session?.customer_email || '').trim(),
                    amountPaid: Number.isFinite(session?.amount_total) ? session.amount_total / 100 : null,
                    sessionId: session.id || null,
                    paymentIntent: session.payment_intent || null,
                    paymentLink: session.payment_link || null,
                });
            } else if (handledPaymentEvents.has(event.type)) {
                const obj = event.data.object || {};
                let metadata = obj?.metadata || {};
                let email = String(
                    obj?.receipt_email ||
                    obj?.charges?.data?.[0]?.billing_details?.email ||
                    obj?.billing_details?.email ||
                    ''
                ).trim();
                let paymentIntent = obj?.payment_intent || obj?.id || null;
                let sessionId = null;
                let paymentLink = null;
                let amountPaid = null;

                if (event.type === 'payment_intent.succeeded') {
                    amountPaid = Number.isFinite(obj?.amount_received) ? obj.amount_received / 100 : null;
                } else {
                    amountPaid = Number.isFinite(obj?.amount_captured) ? obj.amount_captured / 100 : null;
                }

                if (stripeApi && paymentIntent) {
                    try {
                        const sessions = await stripeApi.checkout.sessions.list({ payment_intent: String(paymentIntent), limit: 1 });
                        const session = sessions?.data?.[0];
                        if (session) {
                            metadata = Object.keys(metadata || {}).length ? metadata : (session.metadata || {});
                            email = email || String(session?.customer_details?.email || session?.customer_email || '').trim();
                            sessionId = session.id || null;
                            paymentLink = session.payment_link || null;
                            if (amountPaid === null && Number.isFinite(session?.amount_total)) {
                                amountPaid = session.amount_total / 100;
                            }
                        }
                    } catch (lookupErr) {
                        console.warn('stripeWebhook: checkout session lookup failed for payment event', {
                            eventType: event.type,
                            paymentIntent,
                            error: lookupErr?.message || String(lookupErr),
                        });
                    }
                }

                await confirmBookingFromPayment({
                    metadata,
                    email,
                    amountPaid,
                    sessionId,
                    paymentIntent,
                    paymentLink,
                });
            }

            res.status(200).json({ received: true });
        } catch (err) {
            console.error('stripeWebhook processing error:', err);
            res.status(500).send('Webhook processing error');
        }
    }
);

exports.sendBookingConfirmation = onDocumentCreated(
    { document: 'tenants/whitecross/bookings/{bookingId}', secrets: ['GMAIL_USER', 'GMAIL_PASS'] },
    async (event) => {
        const data = event.data.data();
        if (!data) return;

        // Only send confirmation email for fully confirmed bookings.
        const status = String(data.status || '').trim().toUpperCase();
        if (status !== 'CONFIRMED') return;

        // Skip walk-ins — they're already there, no confirmation needed
        // Skip platform bookings — Booksy/Fresha/Treatwell send their own confirmation emails
        const source = String(data.source || '').trim().toLowerCase();
        if (['walk-in', 'walk_in', 'walkin', 'booksy', 'fresha', 'treatwell'].includes(source)) return;

        const email = data.clientEmail;
        if (!email) return;

        // Check if email confirmations are enabled in settings
        try {
            const settingsSnap = await getAdminDb().doc('tenants/whitecross/settings/settings').get();
            if (settingsSnap.exists) {
                const s = settingsSnap.data();
                if (s.emailConfirmationEnabled === false) {
                    console.log('Email confirmations disabled — skipping.');
                    return;
                }
            }
        } catch (err) {
            console.warn('Could not read settings, sending email anyway:', err.message);
        }

        const name        = data.clientName || 'Guest';
        const service     = lookupServiceName(data.serviceId);
        const barber      = (await lookupBarberName(getAdminDb(), data.barberId, data.barberName)).toUpperCase();
        const bookingId   = data.bookingId || event.params.bookingId;
        const paymentType = data.paymentType || 'FULL';

        let dateStr = 'TBC', timeStr = 'TBC';
        if (data.startTime) {
            const d = data.startTime.toDate();
            dateStr = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
            timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' });
        }


                const totalPriceNum  = data.price ? Number(data.price) : 0;
                const totalPriceStr  = totalPriceNum ? `£${totalPriceNum.toFixed(2)}` : '';
                const depositAmount  = paymentType === 'DEPOSIT' ? (DEPOSIT_AMOUNTS[data.serviceId] || 10) : 0;
                const remainingAmount = paymentType === 'DEPOSIT' ? (totalPriceNum - depositAmount) : 0;

                let paymentRow = '';
                if (paymentType === 'DEPOSIT') {
                        paymentRow = `
                                <tr>
                                        <td style="padding:8px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Deposit Paid</td>
                                        <td style="padding:8px 0;color:#4caf50;font-size:15px;text-align:right;font-weight:700;">£${depositAmount.toFixed(2)}</td>
                                </tr>
                                <tr>
                                        <td style="padding:8px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Remaining</td>
                                        <td style="padding:8px 0;color:#ff9800;font-size:15px;text-align:right;font-weight:700;">£${remainingAmount.toFixed(2)} on the day</td>
                                </tr>
                        `;
                } else {
                        paymentRow = `
                                <tr>
                                        <td style="padding:15px 0 8px 0;border-top:1px solid #222;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Paid in Full ✓</td>
                                        <td style="padding:15px 0 8px 0;border-top:1px solid #222;color:#4caf50;font-size:15px;text-align:right;font-weight:700;">${totalPriceStr}</td>
                                </tr>
                        `;
                }

                const baseUrl       = 'https://whitecrossbarbers.com';
                const cancelUrl     = `${baseUrl}/cancel.html?id=${bookingId}&email=${encodeURIComponent(email)}`;
                const rescheduleUrl = `${baseUrl}/Reschedule.html?id=${bookingId}&email=${encodeURIComponent(email)}`;

                const htmlBody = `<!DOCTYPE html>
<html>
<head><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700&display=swap');</style></head>
<body style="font-family:'Inter',Arial,sans-serif;background-color:#0a0a0a;margin:0;padding:40px 20px;">
    <div style="max-width:550px;margin:0 auto;background:#111111;color:#ffffff;border-radius:4px;border:1px solid #222;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,0.5);">

        <div style="padding:40px 20px;text-align:center;background:#000000;border-bottom:1px solid #1a1a1a;">
            <img src="https://whitecrossbarbers.com/whitecross-logo.png" alt="I CUT" style="width:70px;margin-bottom:20px;">
            <h1 style="margin:0;color:#d4af37;font-size:18px;letter-spacing:5px;text-transform:uppercase;font-weight:300;">I CUT WHITECROSS</h1>
        </div>

        <div style="padding:45px 40px;text-align:center;">
            <p style="color:#d4af37;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin-bottom:15px;font-weight:700;">Appointment Confirmed</p>
            <h2 style="margin:0 0 30px 0;font-size:26px;font-weight:300;color:#fff;line-height:1.2;">See you soon,<br><span style="font-weight:700;">${name}</span></h2>

            <div style="background:#161616;border:1px solid #222;padding:30px;border-radius:2px;margin-bottom:35px;text-align:left;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding:8px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Date</td>
                        <td style="padding:8px 0;color:#fff;font-size:15px;text-align:right;font-weight:700;">${dateStr}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Time</td>
                        <td style="padding:8px 0;color:#fff;font-size:15px;text-align:right;font-weight:700;">${timeStr}</td>
                    </tr>
                    <tr>
                        <td style="padding:15px 0 8px 0;border-top:1px solid #222;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Service</td>
                        <td style="padding:15px 0 8px 0;border-top:1px solid #222;color:#d4af37;font-size:15px;text-align:right;font-weight:700;">${service}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Barber</td>
                        <td style="padding:8px 0;color:#fff;font-size:15px;text-align:right;font-weight:700;">${barber}</td>
                    </tr>
                    ${paymentRow}
                </table>
                <p style="margin:20px 0 0 0;font-size:11px;color:#444;text-align:center;letter-spacing:1px;">ID: ${bookingId}</p>
            </div>

            <p style="color:#aaa;font-size:13px;line-height:1.8;margin-bottom:35px;">
                <strong style="color:#fff;">136 Whitecross Street, London EC1Y 8QJ</strong><br>
                Old Street · Barbican · Moorgate<br>
                <span style="color:#666;">Please arrive 5 minutes before your scheduled time.</span>
            </p>

            <div style="margin-bottom:40px;">
                <a href="${rescheduleUrl}" style="display:inline-block;width:180px;margin:5px;padding:15px 0;background:#d4af37;color:#000;border-radius:2px;text-decoration:none;font-weight:700;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Reschedule</a>
                <a href="${cancelUrl}" style="display:inline-block;width:180px;margin:5px;padding:15px 0;background:transparent;border:1px solid #444;color:#666;border-radius:2px;text-decoration:none;font-weight:700;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Cancel</a>
            </div>

            <!-- Review CTA -->
            <div style="text-align:center;margin:20px 0;padding:16px;background:rgba(212,175,55,0.04);border:1px solid rgba(212,175,55,0.12);border-radius:10px;">
                <p style="margin:0 0 8px;font-size:18px;">⭐⭐⭐⭐⭐</p>
                <p style="margin:0 0 12px;font-size:12px;color:#aaa;line-height:1.5;">Enjoyed your visit? A quick Google review helps us grow and means a lot to the team.</p>
                <a href="https://g.page/r/CUSLYyi8-N-lEBM/review" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#b8860b);color:#000;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;padding:10px 22px;border-radius:6px;text-decoration:none;">★ Leave a Google Review</a>
            </div>

            <div style="border-top:1px solid #222;padding-top:30px;">
                <p style="color:#555;font-size:11px;letter-spacing:1px;line-height:2;">
                    CONTACT US: <a href="tel:+442036215929" style="color:#888;text-decoration:none;">020 3621 5929</a><br>
                    <a href="https://whitecrossbarbers.com/terms.html" style="color:#444;text-decoration:underline;">Cancellation Policy</a>
                </p>
            </div>
        </div>

        <div style="padding:30px;text-align:center;">
            <p style="color:#333;font-size:10px;letter-spacing:2px;text-transform:uppercase;">© 2026 I CUT Whitecross Barbers</p>
            <p style="color:#2a2a2a;font-size:10px;line-height:1.7;margin-top:8px;">You received this because you are a client of I CUT Whitecross Barbers. We use your email for booking confirmations, loyalty updates and personalised marketing. To unsubscribe, reply to this email with "unsubscribe". · <a href="https://whitecrossbarbers.com/terms.html" style="color:#333;text-decoration:underline;">Privacy &amp; Terms</a></p>
        </div>
    </div>
</body>
</html>`;

        try {
            await getTransporter().sendMail({
                from: `"I CUT Whitecross Barbers" <${process.env.GMAIL_USER}>`,
                to: email,
                subject: `✅ Booking Confirmed – ${dateStr} | I CUT Whitecross`,
                html: htmlBody,
            });
            console.log(`Confirmation email sent to ${email}`);
        } catch (err) {
            console.error('Email send error:', err);
        }
    }
);

exports.sendBookingConfirmationOnUpdate = onDocumentUpdated(
    { document: 'tenants/whitecross/bookings/{bookingId}', secrets: ['GMAIL_USER', 'GMAIL_PASS'] },
    async (event) => {
        const before = event.data.before.data();
        const after  = event.data.after.data();
        if (!before || !after) return;

        const prevStatus = String(before.status || '').trim().toUpperCase();
        const newStatus  = String(after.status  || '').trim().toUpperCase();

        // Skip platform bookings — they send their own emails
        const source = String(after.source || '').trim().toLowerCase();
        if (['walk-in', 'walk_in', 'walkin', 'booksy', 'fresha', 'treatwell'].includes(source)) return;

        // For group bookings: only the lead sends the email
        if (after.groupId && after.groupLead === false) return;

        // ── Reschedule email: CONFIRMED→CONFIRMED with date or time change ──
        const isReschedule = prevStatus === 'CONFIRMED' && newStatus === 'CONFIRMED' &&
            (before.date !== after.date || before.time !== after.time);

        if (isReschedule) {
            const email = after.clientEmail || after.email;
            if (!email) return;

            const nameR      = after.clientName || after.name || 'Guest';
            const serviceR   = lookupServiceName(after.serviceId || after.service);
            const newBarber  = (await lookupBarberName(getAdminDb(), after.barberId || after.barber, after.barberName)).toUpperCase();
            const bookingId  = after.bookingId || event.params.bookingId;
            const priceR     = after.price ? `£${parseFloat(String(after.price).replace(/[^0-9.]/g,'') || 0).toFixed(2)}` : '';

            const oldDate = before.date || 'Previous date';
            const oldTime = before.time || '';

            let newDateFormatted = after.date || 'TBC';
            let newTime = after.time || 'TBC';
            if (after.startTime) {
                const d = after.startTime.toDate();
                newDateFormatted = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
                newTime = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' });
            }

            const baseUrl       = 'https://whitecrossbarbers.com';
            const cancelUrl     = `${baseUrl}/cancel.html?id=${bookingId}&email=${encodeURIComponent(email)}`;
            const rescheduleUrl = `${baseUrl}/Reschedule.html?id=${bookingId}&email=${encodeURIComponent(email)}`;

            const rescheduleHtml = `<!DOCTYPE html><html><head><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700&display=swap');</style></head>
<body style="font-family:'Inter',Arial,sans-serif;background-color:#0a0a0a;margin:0;padding:40px 20px;">
<div style="max-width:550px;margin:0 auto;background:#111111;color:#ffffff;border-radius:4px;border:1px solid #222;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,0.5);">
<div style="padding:40px 20px;text-align:center;background:#000000;border-bottom:1px solid #1a1a1a;">
<img src="https://whitecrossbarbers.com/whitecross-logo.png" alt="I CUT" style="width:70px;margin-bottom:20px;">
<h1 style="margin:0;color:#d4af37;font-size:18px;letter-spacing:5px;text-transform:uppercase;font-weight:300;">I CUT WHITECROSS</h1>
</div>
<div style="padding:45px 40px;text-align:center;">
<p style="color:#4caf50;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin-bottom:15px;font-weight:700;">Booking Rescheduled ✓</p>
<h2 style="margin:0 0 30px 0;font-size:26px;font-weight:300;color:#fff;line-height:1.2;">Your update is confirmed,<br><span style="font-weight:700;">${nameR}</span></h2>
<div style="background:#161616;border:1px solid #222;padding:30px;border-radius:2px;margin-bottom:35px;text-align:left;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:8px 0;color:#666;font-size:11px;text-transform:uppercase;text-decoration:line-through;">Previous</td><td style="padding:8px 0;color:#666;font-size:13px;text-align:right;text-decoration:line-through;">${oldDate} @ ${oldTime}</td></tr>
<tr><td style="padding:15px 0 8px 0;border-top:1px solid #222;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">New Date</td><td style="padding:15px 0 8px 0;border-top:1px solid #222;color:#fff;font-size:15px;text-align:right;font-weight:700;">${newDateFormatted}</td></tr>
<tr><td style="padding:8px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">New Time</td><td style="padding:8px 0;color:#fff;font-size:15px;text-align:right;font-weight:700;">${newTime}</td></tr>
<tr><td style="padding:8px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Service</td><td style="padding:8px 0;color:#d4af37;font-size:15px;text-align:right;font-weight:700;">${serviceR}</td></tr>
<tr><td style="padding:8px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Barber</td><td style="padding:8px 0;color:#fff;font-size:15px;text-align:right;font-weight:700;">${newBarber}</td></tr>
<tr><td style="padding:8px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Total Price</td><td style="padding:8px 0;color:#4caf50;font-size:15px;text-align:right;font-weight:700;">${priceR}</td></tr>
</table>
<p style="margin:20px 0 0 0;font-size:11px;color:#444;text-align:center;letter-spacing:1px;">ID: ${bookingId}</p>
</div>
<p style="color:#aaa;font-size:13px;line-height:1.8;margin-bottom:35px;">
<strong style="color:#fff;">136 Whitecross Street, London EC1Y 8QJ</strong><br>
Old Street · Barbican · Moorgate<br>
<span style="color:#666;">Please arrive 5 minutes before your new scheduled time.</span>
</p>
<div style="margin-bottom:40px;">
<a href="${rescheduleUrl}" style="display:inline-block;width:180px;margin:5px;padding:15px 0;background:#d4af37;color:#000;border-radius:2px;text-decoration:none;font-weight:700;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Reschedule</a>
<a href="${cancelUrl}" style="display:inline-block;width:180px;margin:5px;padding:15px 0;background:transparent;border:1px solid #444;color:#666;border-radius:2px;text-decoration:none;font-weight:700;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Cancel</a>
</div>
<div style="border-top:1px solid #222;padding-top:30px;">
<p style="color:#555;font-size:11px;letter-spacing:1px;line-height:2;">
CONTACT US: <a href="tel:+442036215929" style="color:#888;text-decoration:none;">020 3621 5929</a><br>
<a href="https://whitecrossbarbers.com/terms.html" style="color:#444;text-decoration:underline;">Cancellation Policy</a>
</p>
</div>
</div>
<div style="padding:30px;text-align:center;">
<p style="color:#333;font-size:10px;letter-spacing:2px;text-transform:uppercase;">© 2026 I CUT Whitecross Barbers</p>
</div>
</div></body></html>`;

            try {
                await getTransporter().sendMail({
                    from: `"I CUT Whitecross Barbers" <${process.env.GMAIL_USER}>`,
                    to: email,
                    subject: `🔄 Booking Rescheduled — ${newDateFormatted} | I CUT Whitecross`,
                    html: rescheduleHtml,
                });
                console.log(`Reschedule email sent to ${email}`);
            } catch (err) {
                console.error('Reschedule email error:', err);
            }
            return;
        }

        // Only fire when transitioning to CONFIRMED (e.g. PENDING → CONFIRMED via Stripe)
        if (prevStatus === 'CONFIRMED' || newStatus !== 'CONFIRMED') return;

        const email = after.clientEmail;
        if (!email) return;

        try {
            const settingsSnap = await getAdminDb().doc('tenants/whitecross/settings/settings').get();
            if (settingsSnap.exists) {
                const s = settingsSnap.data();
                if (s.emailConfirmationEnabled === false) {
                    console.log('Email confirmations disabled — skipping.');
                    return;
                }
            }
        } catch (err) {
            console.warn('Could not read settings, sending email anyway:', err.message);
        }

        const data = after;
        const name        = data.clientName || 'Guest';
        const service     = lookupServiceName(data.serviceId);
        const barber      = (await lookupBarberName(getAdminDb(), data.barberId, data.barberName)).toUpperCase();
        const bookingId   = data.bookingId || event.params.bookingId;
        const paymentType = data.paymentType || 'FULL';

        let dateStr = 'TBC', timeStr = 'TBC';
        if (data.startTime) {
            const d = data.startTime.toDate();
            dateStr = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
            timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' });
        }

        const totalPriceNum   = data.price ? Number(data.price) : 0;
        const totalPriceStr   = totalPriceNum ? `£${totalPriceNum.toFixed(2)}` : '';
        const depositAmount   = paymentType === 'DEPOSIT' ? (DEPOSIT_AMOUNTS[data.serviceId] || 10) : 0;
        const remainingAmount = paymentType === 'DEPOSIT' ? (totalPriceNum - depositAmount) : 0;

        let paymentRow = '';
        if (paymentType === 'DEPOSIT') {
            paymentRow = `
                <tr>
                    <td style="padding:8px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Deposit Paid</td>
                    <td style="padding:8px 0;color:#4caf50;font-size:15px;text-align:right;font-weight:700;">£${depositAmount.toFixed(2)}</td>
                </tr>
                <tr>
                    <td style="padding:8px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Remaining</td>
                    <td style="padding:8px 0;color:#ff9800;font-size:15px;text-align:right;font-weight:700;">£${remainingAmount.toFixed(2)} on the day</td>
                </tr>
            `;
        } else {
            paymentRow = `
                <tr>
                    <td style="padding:15px 0 8px 0;border-top:1px solid #222;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Paid in Full ✓</td>
                    <td style="padding:15px 0 8px 0;border-top:1px solid #222;color:#4caf50;font-size:15px;text-align:right;font-weight:700;">${totalPriceStr}</td>
                </tr>
            `;
        }

        const baseUrl       = 'https://whitecrossbarbers.com';
        const cancelUrl     = `${baseUrl}/cancel.html?id=${bookingId}&email=${encodeURIComponent(email)}`;
        const rescheduleUrl = `${baseUrl}/Reschedule.html?id=${bookingId}&email=${encodeURIComponent(email)}`;

        const htmlBody = `<!DOCTYPE html>
<html>
<head><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700&display=swap');</style></head>
<body style="font-family:'Inter',Arial,sans-serif;background-color:#0a0a0a;margin:0;padding:40px 20px;">
    <div style="max-width:550px;margin:0 auto;background:#111111;color:#ffffff;border-radius:4px;border:1px solid #222;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,0.5);">
        <div style="padding:40px 20px;text-align:center;background:#000000;border-bottom:1px solid #1a1a1a;">
            <img src="https://whitecrossbarbers.com/whitecross-logo.png" alt="I CUT" style="width:70px;margin-bottom:20px;">
            <h1 style="margin:0;color:#d4af37;font-size:18px;letter-spacing:5px;text-transform:uppercase;font-weight:300;">I CUT WHITECROSS</h1>
        </div>
        <div style="padding:45px 40px;text-align:center;">
            <p style="color:#d4af37;font-size:12px;letter-spacing:3px;text-transform:uppercase;margin-bottom:15px;font-weight:700;">Appointment Confirmed</p>
            <h2 style="margin:0 0 30px 0;font-size:26px;font-weight:300;color:#fff;line-height:1.2;">See you soon,<br><span style="font-weight:700;">${name}</span></h2>
            <div style="background:#161616;border:1px solid #222;padding:30px;border-radius:2px;margin-bottom:35px;text-align:left;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding:8px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Date</td>
                        <td style="padding:8px 0;color:#fff;font-size:15px;text-align:right;font-weight:700;">${dateStr}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Time</td>
                        <td style="padding:8px 0;color:#fff;font-size:15px;text-align:right;font-weight:700;">${timeStr}</td>
                    </tr>
                    <tr>
                        <td style="padding:15px 0 8px 0;border-top:1px solid #222;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Service</td>
                        <td style="padding:15px 0 8px 0;border-top:1px solid #222;color:#d4af37;font-size:15px;text-align:right;font-weight:700;">${service}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Barber</td>
                        <td style="padding:8px 0;color:#fff;font-size:15px;text-align:right;font-weight:700;">${barber}</td>
                    </tr>
                    ${paymentRow}
                </table>
                <p style="margin:20px 0 0 0;font-size:11px;color:#444;text-align:center;letter-spacing:1px;">ID: ${bookingId}</p>
            </div>
            <p style="color:#aaa;font-size:13px;line-height:1.8;margin-bottom:35px;">
                <strong style="color:#fff;">136 Whitecross Street, London EC1Y 8QJ</strong><br>
                Old Street · Barbican · Moorgate<br>
                <span style="color:#666;">Please arrive 5 minutes before your scheduled time.</span>
            </p>
            <div style="margin-bottom:40px;">
                <a href="${rescheduleUrl}" style="display:inline-block;width:180px;margin:5px;padding:15px 0;background:#d4af37;color:#000;border-radius:2px;text-decoration:none;font-weight:700;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Reschedule</a>
                <a href="${cancelUrl}" style="display:inline-block;width:180px;margin:5px;padding:15px 0;background:transparent;border:1px solid #444;color:#666;border-radius:2px;text-decoration:none;font-weight:700;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Cancel</a>
            </div>
            <!-- Review CTA -->
            <div style="text-align:center;margin:20px 0;padding:16px;background:rgba(212,175,55,0.04);border:1px solid rgba(212,175,55,0.12);border-radius:10px;">
                <p style="margin:0 0 8px;font-size:18px;">⭐⭐⭐⭐⭐</p>
                <p style="margin:0 0 12px;font-size:12px;color:#aaa;line-height:1.5;">Enjoyed your visit? A quick Google review helps us grow and means a lot to the team.</p>
                <a href="https://g.page/r/CUSLYyi8-N-lEBM/review" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#b8860b);color:#000;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;padding:10px 22px;border-radius:6px;text-decoration:none;">★ Leave a Google Review</a>
            </div>

            <div style="border-top:1px solid #222;padding-top:30px;">
                <p style="color:#555;font-size:11px;letter-spacing:1px;line-height:2;">
                    CONTACT US: <a href="tel:+442036215929" style="color:#888;text-decoration:none;">020 3621 5929</a><br>
                    <a href="https://whitecrossbarbers.com/terms.html" style="color:#444;text-decoration:underline;">Cancellation Policy</a>
                </p>
            </div>
        </div>
        <div style="padding:30px;text-align:center;">
            <p style="color:#333;font-size:10px;letter-spacing:2px;text-transform:uppercase;">© 2026 I CUT Whitecross Barbers</p>
            <p style="color:#2a2a2a;font-size:10px;line-height:1.7;margin-top:8px;">You received this because you are a client of I CUT Whitecross Barbers. We use your email for booking confirmations, loyalty updates and personalised marketing. To unsubscribe, reply to this email with "unsubscribe". · <a href="https://whitecrossbarbers.com/terms.html" style="color:#333;text-decoration:underline;">Privacy &amp; Terms</a></p>
        </div>
    </div>
</body>
</html>`;

        try {
            await getTransporter().sendMail({
                from: `"I CUT Whitecross Barbers" <${process.env.GMAIL_USER}>`,
                to: email,
                subject: `✅ Booking Confirmed – ${dateStr} | I CUT Whitecross`,
                html: htmlBody,
            });
            console.log(`Confirmation email (update trigger) sent to ${email}`);
        } catch (err) {
            console.error('Email send error:', err);
        }
    }
);

// ── Telegram: notify on new online booking ────────────────────────────────────
// Only fires for Booksy / Fresha / Website bookings.
// Walk-ins, historical imports, and blocked slots are explicitly skipped so a
// bulk import never floods the bot again.
// TODO [EeKurt]: When adding EeKurt Telegram, add a parallel function using
//   secrets: ['EEK_TELEGRAM_TOKEN', 'EEK_TELEGRAM_CHAT_IDS']
//   document: 'tenants/eekurt/bookings/{bookingId}'
//   Then set EEK_TELEGRAM_TOKEN and EEK_TELEGRAM_CHAT_IDS in Firebase Console → Functions → Secrets
exports.notifyNewBooking = onDocumentCreated(
    {
        document: 'tenants/whitecross/bookings/{bookingId}',
        secrets: ['WC_TELEGRAM_TOKEN', 'WC_TELEGRAM_CHAT_IDS'],
    },
    async (event) => {
        const data = event.data?.data();
        if (!data) return;

        const status = String(data.status || '').trim().toUpperCase();
        const source = String(data.source || '').trim().toLowerCase();

        // Skip non-online entries
        if (status !== 'CONFIRMED' || status === 'BLOCKED') return;
        if (['walk_in', 'walk-in', 'walkin', 'historical', 'manual', ''].includes(source)) return;
        const ONLINE_SOURCES = ['booksy', 'fresha', 'treatwell', 'website'];
        if (!ONLINE_SOURCES.includes(source)) return;

        // For group bookings: only notify once (for the lead)
        if (data.groupId && data.groupLead === false) return;

        const token      = process.env.WC_TELEGRAM_TOKEN;
        const chatIdsRaw = process.env.WC_TELEGRAM_CHAT_IDS;
        if (!token || !chatIdsRaw) {
            console.warn('notifyNewBooking: WC_TELEGRAM_TOKEN or WC_TELEGRAM_CHAT_IDS not set');
            return;
        }

        // Support both website schema (clientName/serviceId/barberName) and GAS schema (name/service/barber)
        const name      = data.clientName || data.name || 'Guest';
        const service   = SERVICE_NAMES[data.serviceId] || data.serviceId || data.service || 'Service';
        const barber    = (data.barberName || data.barberId || data.barber || 'TBC').toUpperCase();
        const bookingId = data.bookingId || event.params.bookingId;
        const srcLabel  = source.charAt(0).toUpperCase() + source.slice(1);

        let dateStr = 'TBC', timeStr = 'TBC';
        if (data.startTime) {
            const d = data.startTime.toDate();
            dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
            timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' });
        } else if (data.date && data.time) {
            dateStr = data.date;
            timeStr = data.time;
        }

        const phone      = data.clientPhone || data.phone ? `\n📞 ${data.clientPhone || data.phone}` : '';
        const groupLabel = data.groupId ? `\n👥 Group Booking ×${data.groupSize || '?'}` : '';

        const totalPrice = parseFloat(String(data.price || data.amount || '0').replace('£', '')) || 0;
        const paid       = parseFloat(String(data.paidAmount || '0').replace('£', '')) || 0;
        let paymentLine  = '';
        if (source !== 'fresha' && totalPrice > 0) {
            if (paid >= totalPrice) {
                paymentLine = `\n💳 Paid in full: £${totalPrice.toFixed(2)}`;
            } else if (paid > 0) {
                const remaining = totalPrice - paid;
                paymentLine = `\n💳 Deposit: £${paid.toFixed(2)} · Remaining: £${remaining.toFixed(2)}`;
            } else {
                paymentLine = `\n💳 Total: £${totalPrice.toFixed(2)} (unpaid)`;
            }
        }

        const msg = `📅 <b>New Booking</b> · ${srcLabel}${groupLabel}\n👤 ${name}${phone}\n✂️ ${service}\n💈 ${barber}\n🕐 ${dateStr} at ${timeStr}${paymentLine}\n🆔 <code>${bookingId}</code>`;

        try {
            await sendTelegramMessage(token, chatIdsRaw, msg);
            console.log(`Telegram sent for ${bookingId}`);
        } catch (err) {
            console.error('Telegram error:', err);
        }
        await writeNotification(getAdminDb(), 'whitecross', 'new_booking', 'New Booking', `${name}${data.groupId ? ` (Group ×${data.groupSize})` : ''} – ${service} · ${dateStr} at ${timeStr}`, bookingId);
    }
);

// ── Telegram: notify on cancellation ─────────────────────────────────────────
exports.notifyBookingCancelled = onDocumentUpdated(
    {
        document: 'tenants/whitecross/bookings/{bookingId}',
        secrets: ['WC_TELEGRAM_TOKEN', 'WC_TELEGRAM_CHAT_IDS'],
    },
    async (event) => {
        const before = event.data.before.data();
        const after  = event.data.after.data();
        if (!before || !after) return;

        const prevStatus = String(before.status || '').trim().toUpperCase();
        const newStatus  = String(after.status  || '').trim().toUpperCase();

        // Only fire when status just changed TO CANCELLED
        if (newStatus !== 'CANCELLED' || prevStatus === 'CANCELLED') return;

        const token      = process.env.WC_TELEGRAM_TOKEN;
        const chatIdsRaw = process.env.WC_TELEGRAM_CHAT_IDS;
        if (!token || !chatIdsRaw) return;

        const name      = after.clientName || 'Guest';
        const service   = SERVICE_NAMES[after.serviceId] || after.serviceId || 'Service';
        const barber    = (after.barberName || after.barberId || 'TBC').toUpperCase();
        const bookingId = after.bookingId || event.params.bookingId;
        const source    = after.source || '';

        let dateStr = 'TBC', timeStr = 'TBC';
        if (after.startTime) {
            const d = after.startTime.toDate();
            dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
            timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' });
        }

        const phone = after.clientPhone ? `\n📞 ${after.clientPhone}` : '';
        const msg = `❌ <b>Booking Cancelled</b>${source ? ' · ' + source : ''}\n👤 ${name}${phone}\n✂️ ${service}\n💈 ${barber}\n🕐 ${dateStr} at ${timeStr}\n🆔 <code>${bookingId}</code>`;

        try {
            await sendTelegramMessage(token, chatIdsRaw, msg);
            console.log(`Telegram cancellation sent for ${bookingId}`);
        } catch (err) {
            console.error('Telegram cancellation error:', err);
        }
        await writeNotification(getAdminDb(), 'whitecross', 'cancelled', 'Booking Cancelled', `${name} – ${service} · ${dateStr} at ${timeStr}`, bookingId);
    }
);

// ── Telegram: notify when PENDING → CONFIRMED (Stripe webhook path) ───────────
exports.notifyBookingConfirmed = onDocumentUpdated(
    {
        document: 'tenants/whitecross/bookings/{bookingId}',
        secrets: ['WC_TELEGRAM_TOKEN', 'WC_TELEGRAM_CHAT_IDS'],
    },
    async (event) => {
        const before = event.data.before.data();
        const after  = event.data.after.data();
        if (!before || !after) return;

        const prevStatus = String(before.status || '').trim().toUpperCase();
        const newStatus  = String(after.status  || '').trim().toUpperCase();

        // Only fire when transitioning INTO CONFIRMED (not already confirmed)
        if (newStatus !== 'CONFIRMED' || prevStatus === 'CONFIRMED') return;

        // Skip if this is a reschedule update re-activating a booking — rescheduled notification handles it
        const prevRescheduled = before.rescheduledAt?.seconds ?? before.rescheduledAt?._seconds ?? null;
        const newRescheduled  = after.rescheduledAt?.seconds  ?? after.rescheduledAt?._seconds  ?? null;
        if (newRescheduled && newRescheduled !== prevRescheduled) return;

        // For group bookings: only notify once (for the lead)
        if (after.groupId && after.groupLead === false) return;

        const source = String(after.source || '').trim().toLowerCase();
        const ONLINE_SOURCES = ['booksy', 'fresha', 'treatwell', 'website'];
        if (!ONLINE_SOURCES.includes(source)) return;

        const token      = process.env.WC_TELEGRAM_TOKEN;
        const chatIdsRaw = process.env.WC_TELEGRAM_CHAT_IDS;
        if (!token || !chatIdsRaw) return;

        const name      = after.clientName || 'Guest';
        const service   = SERVICE_NAMES[after.serviceId] || after.serviceId || 'Service';
        const barber    = (after.barberName || after.barberId || 'TBC').toUpperCase();
        const bookingId = after.bookingId || event.params.bookingId;
        const srcLabel  = source.charAt(0).toUpperCase() + source.slice(1);
        const paid      = after.paymentState === 'PAID' ? ' · 💳 Paid' : '';

        let dateStr = 'TBC', timeStr = 'TBC';
        if (after.startTime) {
            const d = after.startTime.toDate();
            dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
            timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' });
        }

        const phone = after.clientPhone ? `\n📞 ${after.clientPhone}` : '';
        const msg = `✅ <b>Booking Confirmed</b> · ${srcLabel}${paid}\n👤 ${name}${phone}\n✂️ ${service}\n💈 ${barber}\n🕐 ${dateStr} at ${timeStr}\n🆔 <code>${bookingId}</code>`;

        try {
            await sendTelegramMessage(token, chatIdsRaw, msg);
            console.log(`Telegram confirmation sent for ${bookingId}`);
        } catch (err) {
            console.error('Telegram confirmation error:', err);
        }
        await writeNotification(getAdminDb(), 'whitecross', 'confirmed', 'Booking Confirmed', `${name} – ${service} · ${dateStr} at ${timeStr}${paid}`, bookingId);
    }
);

// ── Telegram: notify on reschedule ────────────────────────────────────────────
exports.notifyBookingRescheduled = onDocumentUpdated(
    {
        document: 'tenants/whitecross/bookings/{bookingId}',
        secrets: ['WC_TELEGRAM_TOKEN', 'WC_TELEGRAM_CHAT_IDS'],
    },
    async (event) => {
        const before = event.data.before.data();
        const after  = event.data.after.data();
        if (!before || !after) return;

        const newStatus = String(after.status || '').trim().toUpperCase();
        if (newStatus === 'CANCELLED' || newStatus === 'BLOCKED') return;

        // Only fire when startTime actually changed
        const prevSec = before.startTime?.seconds ?? before.startTime?._seconds ?? null;
        const newSec  = after.startTime?.seconds  ?? after.startTime?._seconds  ?? null;
        if (!prevSec || !newSec || prevSec === newSec) return;

        const token      = process.env.WC_TELEGRAM_TOKEN;
        const chatIdsRaw = process.env.WC_TELEGRAM_CHAT_IDS;
        if (!token || !chatIdsRaw) return;

        const name      = after.clientName || 'Guest';
        const service   = SERVICE_NAMES[after.serviceId] || after.serviceId || 'Service';
        const barber    = (after.barberName || after.barberId || 'TBC').toUpperCase();
        const bookingId = after.bookingId || event.params.bookingId;

        const fmtDate = (ts) => {
            const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
            const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
            const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' });
            return `${dateStr} at ${timeStr}`;
        };

        const oldDateTime = before.startTime ? fmtDate(before.startTime) : 'unknown';
        const newDateTime = after.startTime  ? fmtDate(after.startTime)  : 'unknown';

        const phone = after.clientPhone ? `\n📞 ${after.clientPhone}` : '';
        const msg = `🔄 <b>Booking Rescheduled</b>\n👤 ${name}${phone}\n✂️ ${service}\n💈 ${barber}\n📅 <s>${oldDateTime}</s>\n✅ ${newDateTime}\n🆔 <code>${bookingId}</code>`;

        try {
            await sendTelegramMessage(token, chatIdsRaw, msg);
            console.log(`Telegram reschedule sent for ${bookingId}`);
        } catch (err) {
            console.error('Telegram reschedule error:', err);
        }
        await writeNotification(getAdminDb(), 'whitecross', 'rescheduled', 'Booking Rescheduled', `${name} – ${service} → ${newDateTime}`, bookingId, {
            beforeDate:   before.date   || oldDateTime,
            beforeTime:   before.time   || '',
            beforeBarber: (before.barberName || before.barberId || '').toUpperCase(),
            beforeService: SERVICE_NAMES[before.serviceId] || before.serviceId || before.serviceName || '',
            afterDate:    after.date    || newDateTime,
            afterTime:    after.time    || '',
            afterBarber:  (after.barberName  || after.barberId  || '').toUpperCase(),
            afterService: SERVICE_NAMES[after.serviceId]  || after.serviceId  || after.serviceName  || '',
        });
    }
);

// ── Cleanup expired PENDING website bookings every 30 minutes ─────────────────
// Prevents ghost-blocked slots on the public booking page when customers
// start checkout but never pay and never return to complete it.
exports.cleanupExpiredPending = onSchedule('every 5 minutes', async () => {
    const db  = getAdminDb();
    const now = admin.firestore.Timestamp.now();

    const snap = await db
        .collection('tenants/whitecross/bookings')
        .where('status',  '==', 'PENDING')
        .where('source',  '==', 'website')
        .where('expiresAt', '<=', now)
        .get();

    if (snap.empty) {
        console.log('cleanupExpiredPending: nothing to expire');
        return;
    }

    const batch = db.batch();
    snap.docs.forEach((doc) => {
        batch.update(doc.ref, {
            status:      'CANCELLED',
            cancelledAt: now,
            cancelReason: 'expired_pending',
            updatedAt:   now,
        });
    });
    await batch.commit();
    console.log(`cleanupExpiredPending: cancelled ${snap.size} expired pending booking(s)`);
});

// ── Loyalty card email: fires when a booking is checked out ──────────────────
exports.sendLoyaltyCardEmail = onDocumentUpdated(
    { document: 'tenants/whitecross/bookings/{bookingId}', secrets: ['GMAIL_USER', 'GMAIL_PASS'] },
    async (event) => {
        const before = event.data.before.data();
        const after  = event.data.after.data();
        if (!before || !after) return;

        const prevStatus = String(before.status || '').trim().toUpperCase();
        const newStatus  = String(after.status  || '').trim().toUpperCase();
        const isManualTrigger = after.manualLoyaltyEmailTrigger === true && before.manualLoyaltyEmailTrigger !== true;

        // Normal checkout flow: status must transition TO CHECKED_OUT
        // Manual trigger: panel button sets manualLoyaltyEmailTrigger = true on already-checked-out booking
        if (!isManualTrigger) {
            if (newStatus !== 'CHECKED_OUT' || prevStatus === 'CHECKED_OUT') return;
            // Platform bookings only get loyalty email if explicitly opted-in at checkout
            const platformSources = ['Booksy', 'Fresha', 'Treatwell'];
            if (platformSources.includes(after.source) && after.sendLoyaltyEmail !== true) {
                console.log(`Platform booking (${after.source}) — loyalty email not opted-in, skipping.`);
                return;
            }
        }

        // Clear the manual trigger flag so it doesn't re-fire
        if (isManualTrigger) {
            await event.data.after.ref.update({ manualLoyaltyEmailTrigger: false });
        }

        const email = after.clientEmail;
        if (!email) return;

        const db = getAdminDb();

        // Check if checkout emails are enabled in settings
        // loyaltyEmailBypassSettings: user explicitly confirmed from panel despite setting being off
        if (!after.loyaltyEmailBypassSettings) {
            try {
                const settingsSnap = await db.doc('tenants/whitecross/settings/settings').get();
                if (settingsSnap.exists) {
                    const s = settingsSnap.data();
                    if (s.checkoutEmailEnabled === false) {
                        console.log('Checkout emails disabled — skipping.');
                        return;
                    }
                }
            } catch (err) {
                console.warn('Could not read settings, sending email anyway:', err.message);
            }
        }

        // Fetch client doc for loyalty points + member status
        let loyaltyPoints = 0;
        let isMember = false;
        try {
            const phone = after.clientPhone || '';
            let clientData = null;
            if (phone) {
                const snap = await db.collection('tenants/whitecross/clients').where('phone', '==', phone).limit(1).get();
                if (!snap.empty) clientData = snap.docs[0].data();
            }
            if (!clientData) {
                const snap = await db.collection('tenants/whitecross/clients').where('email', '==', email).limit(1).get();
                if (!snap.empty) clientData = snap.docs[0].data();
            }
            if (clientData) {
                loyaltyPoints = clientData.loyaltyPoints || 0;
                isMember = clientData.isMember || false;
            }
        } catch (err) {
            console.warn('sendLoyaltyCardEmail: could not fetch client doc', err.message);
        }

        // Members don't earn points — send a simpler receipt, no card
        // (uncomment below to skip email for members entirely)
        // if (isMember) return;

        const name        = after.clientName || 'Guest';
        const service     = SERVICE_NAMES[after.serviceId] || after.serviceId || 'Service';
        const barber      = (after.barberName || after.barberId || 'TBC').toUpperCase();
        const isWalkIn    = ['Walk-in', 'walk-in', 'walkin', 'Walk_in'].includes(after.source || '');
        const todayPaid   = parseFloat(String(after.paidAmount || '0').replace('£', '')) || 0;
        const fullPrice   = parseFloat(String(after.price || '0').replace('£', '')) || todayPaid;
        const isDeposit   = after.paymentType === 'DEPOSIT' && fullPrice > todayPaid;
        const depositPaid = isDeposit ? (DEPOSIT_AMOUNTS[after.serviceId] || DEPOSIT_AMOUNTS[after.service] || 10) : 0;
        const paidAmount  = isDeposit ? fullPrice : todayPaid;  // show full service value as total
        let pointsEarned = after.loyaltyPointsEarned || 0;
        // Safety net: if not pre-calculated (old mobile code / race condition), derive from paid amount
        if (!pointsEarned && !isMember && !after.discount) {
            pointsEarned = Math.floor(todayPaid || fullPrice);
        }
        const redeemed    = after.loyaltyPointsRedeemed || 0;
        const discount    = parseFloat(String(after.discount || '0').replace('£', '')) || 0;
        const tipAmount   = parseFloat(String(after.tip || '0').replace('£', '')) || 0;

        let dateStr = 'Today';
        if (after.startTime) {
            const d = after.startTime.toDate();
            dateStr = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
        }

        // Loyalty progress
        const REDEEM_RATE = 20; // 20pts = £1
        const milestones = [100, 250, 500, 1000];
        const nextMilestone = milestones.find(m => loyaltyPoints < m) || 1000;
        const prevMilestone = milestones[milestones.indexOf(nextMilestone) - 1] || 0;
        const progressPct = Math.min(Math.round(((loyaltyPoints - prevMilestone) / (nextMilestone - prevMilestone)) * 100), 100);
        const redeemable = (loyaltyPoints / REDEEM_RATE).toFixed(2).replace(/\.00$/, '').replace(/\.(\d)0$/, '.$1');

        // Progress bar (table-based for email compatibility)
        const filledCells = Math.round(progressPct / 5); // 20 cells total
        const barCells = Array.from({ length: 20 }, (_, i) =>
            `<td style="width:5%;height:8px;background:${i < filledCells ? '#d4af37' : '#2a2a2a'};${i === 0 ? 'border-radius:4px 0 0 4px;' : ''}${i === 19 ? 'border-radius:0 4px 4px 0;' : ''}"></td>`
        ).join('');

        // Milestone icons
        const milestoneRows = [
            { pts: 100,  label: '£5 reward',   icon: '🥉' },
            { pts: 250,  label: '£12.50 reward', icon: '🥈' },
            { pts: 500,  label: '£25 reward',  icon: '🥇' },
            { pts: 1000, label: '£50 reward',  icon: '👑' },
        ].map(m => `
            <tr>
                <td style="padding:7px 0;border-bottom:1px solid #1e1e1e;font-size:16px;">${m.icon}</td>
                <td style="padding:7px 0;border-bottom:1px solid #1e1e1e;font-size:13px;color:${loyaltyPoints >= m.pts ? '#fff' : '#555'};padding-left:10px;font-weight:${loyaltyPoints >= m.pts ? '700' : '400'};">${m.pts} pts — ${m.label}</td>
                <td style="padding:7px 0;border-bottom:1px solid #1e1e1e;font-size:12px;color:${loyaltyPoints >= m.pts ? '#4caf50' : '#444'};text-align:right;">${loyaltyPoints >= m.pts ? '✓ Reached' : (m.pts - loyaltyPoints) + ' to go'}</td>
            </tr>
        `).join('');

        const memberSection = isMember ? `
            <div style="margin:20px 0;padding:16px 20px;background:#1a0d24;border:1px solid #4a2070;border-radius:4px;text-align:center;">
                <p style="margin:0;color:#ce93d8;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">◆ MemberZone ${after.membershipTier ? '· ' + after.membershipTier.toUpperCase() : ''}</p>
                <p style="margin:6px 0 0 0;color:#9c4dcc;font-size:11px;">Your membership benefits are active.</p>
            </div>
        ` : '';

        const pointsSection = !isMember ? `
            <!-- Loyalty Card -->
            <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:4px;overflow:hidden;margin:30px 0;">

                <!-- Card header -->
                <div style="background:linear-gradient(135deg,#1a1500,#0d0d0d);padding:22px 24px 18px;border-bottom:1px solid #222;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td>
                                <p style="margin:0;color:#d4af37;font-size:10px;letter-spacing:3px;text-transform:uppercase;font-weight:700;">Loyalty Card</p>
                                <p style="margin:4px 0 0 0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">${name}</p>
                            </td>
                            <td style="text-align:right;vertical-align:top;">
                                <p style="margin:0;color:#d4af37;font-size:32px;font-weight:800;line-height:1;">⭐ ${loyaltyPoints}</p>
                                <p style="margin:2px 0 0 0;color:#888;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Points</p>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- Progress bar -->
                <div style="padding:18px 24px 14px;">
                    <table width="100%" cellpadding="0" cellspacing="1" style="margin-bottom:8px;">
                        <tr>${barCells}</tr>
                    </table>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="font-size:11px;color:#555;">${prevMilestone} pts</td>
                            <td style="font-size:11px;color:#d4af37;text-align:center;font-weight:700;">Next: ${nextMilestone} pts</td>
                            <td style="font-size:11px;color:#555;text-align:right;">${progressPct}%</td>
                        </tr>
                    </table>
                </div>

                <!-- Redeem value -->
                ${loyaltyPoints >= 20 ? `
                <div style="margin:0 24px 18px;padding:14px;background:#0f1f0f;border:1px solid #1e3d1e;border-radius:3px;text-align:center;">
                    <p style="margin:0;color:#4caf50;font-size:18px;font-weight:800;">£${redeemable} available to redeem</p>
                    <p style="margin:4px 0 0 0;color:#2e7d32;font-size:11px;">Tell your barber at your next visit · Min 20 pts</p>
                </div>
                ` : `
                <div style="margin:0 24px 18px;padding:12px;background:#111;border:1px solid #222;border-radius:3px;text-align:center;">
                    <p style="margin:0;color:#555;font-size:12px;">${20 - loyaltyPoints} more points until your first £1 off</p>
                </div>
                `}

                <!-- This visit summary -->
                <div style="padding:0 24px 18px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #1e1e1e;padding-top:14px;">
                        <tr>
                            <td style="padding:5px 0;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:1px;">This visit</td>
                            <td style="padding:5px 0;color:#888;font-size:12px;text-align:right;">${dateStr}</td>
                        </tr>
                        <tr>
                            <td style="padding:3px 0;color:#aaa;font-size:13px;">${service}</td>
                            <td style="padding:3px 0;color:#d4af37;font-size:14px;font-weight:700;text-align:right;">£${paidAmount.toFixed(2)}</td>
                        </tr>
                        ${pointsEarned > 0 ? `
                        <tr>
                            <td colspan="2" style="padding:6px 0 0 0;color:#d4af37;font-size:12px;font-weight:600;">+ ${pointsEarned} points earned</td>
                        </tr>
                        ` : ''}
                        ${redeemed > 0 ? `
                        <tr>
                            <td colspan="2" style="padding:3px 0 0 0;color:#4caf50;font-size:12px;">− ${redeemed} points redeemed (£${(redeemed / REDEEM_RATE).toFixed(2)} off)</td>
                        </tr>
                        ` : ''}
                        ${discount > 0 && pointsEarned === 0 ? `
                        <tr>
                            <td colspan="2" style="padding:3px 0 0 0;color:#888;font-size:11px;">Discount applied — points not earned on this visit</td>
                        </tr>
                        ` : ''}
                    </table>
                </div>

                <!-- Milestones -->
                <div style="background:#0a0a0a;border-top:1px solid #1e1e1e;padding:18px 24px;">
                    <p style="margin:0 0 10px 0;color:#555;font-size:10px;letter-spacing:2px;text-transform:uppercase;">Milestones</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                        ${milestoneRows}
                    </table>
                </div>

                <!-- Rate info -->
                <div style="padding:12px 24px;text-align:center;background:#070707;">
                    <p style="margin:0;color:#333;font-size:10px;letter-spacing:1px;">1 pt per £1 spent · 20 pts = £1 off · Min 20 pts to redeem</p>
                </div>
            </div>
        ` : '';

        const htmlBody = `<!DOCTYPE html>
<html>
<head><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700;800&display=swap');</style></head>
<body style="font-family:'Inter',Arial,sans-serif;background-color:#0a0a0a;margin:0;padding:40px 20px;">
    <div style="max-width:560px;margin:0 auto;color:#ffffff;">

        <!-- Header -->
        <div style="background:#000;border:1px solid #1a1a1a;border-radius:4px 4px 0 0;padding:36px 20px 28px;text-align:center;border-bottom:1px solid #1a1a1a;">
            <img src="https://whitecrossbarbers.com/whitecross-logo.png" alt="I CUT" style="width:60px;margin-bottom:16px;">
            <h1 style="margin:0;color:#d4af37;font-size:16px;letter-spacing:5px;text-transform:uppercase;font-weight:300;">I CUT WHITECROSS</h1>
        </div>

        <!-- Body -->
        <div style="background:#111;border:1px solid #1a1a1a;border-top:none;padding:36px 32px;">
            <p style="color:#d4af37;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 12px 0;font-weight:700;">Payment Receipt</p>
            <h2 style="margin:0 0 6px 0;font-size:24px;font-weight:300;color:#fff;">Thanks, <strong>${name}</strong></h2>
            <p style="margin:0 0 28px 0;color:#666;font-size:13px;">${service} · ${barber} · ${dateStr}</p>

            <!-- Receipt summary -->
            <div style="background:#161616;border:1px solid #222;padding:20px 24px;border-radius:3px;margin-bottom:8px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;padding-bottom:8px;">Service</td>
                        <td style="color:#fff;font-size:14px;font-weight:700;text-align:right;padding-bottom:8px;">${service}</td>
                    </tr>
                    <tr>
                        <td style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;padding-bottom:8px;">Barber</td>
                        <td style="color:#fff;font-size:14px;font-weight:700;text-align:right;padding-bottom:8px;">${barber}</td>
                    </tr>
                    ${discount > 0 ? `
                    <tr>
                        <td style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;padding-bottom:8px;">Discount</td>
                        <td style="color:#ff9800;font-size:14px;font-weight:700;text-align:right;padding-bottom:8px;">-£${discount.toFixed(2)}</td>
                    </tr>
                    ` : ''}
                    ${redeemed > 0 ? `
                    <tr>
                        <td style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;padding-bottom:8px;">Points Redeemed</td>
                        <td style="color:#4caf50;font-size:14px;font-weight:700;text-align:right;padding-bottom:8px;">-£${(redeemed / REDEEM_RATE).toFixed(2)} (${redeemed} pts)</td>
                    </tr>
                    ` : ''}
                    ${isDeposit ? `
                    <tr style="border-top:1px solid #222;">
                        <td style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;padding-top:12px;padding-bottom:4px;">Deposit (online)</td>
                        <td style="color:#4caf50;font-size:14px;font-weight:700;text-align:right;padding-top:12px;padding-bottom:4px;">£${depositPaid.toFixed(2)} ✓</td>
                    </tr>
                    <tr>
                        <td style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;padding-bottom:8px;">Paid today</td>
                        <td style="color:#fff;font-size:14px;font-weight:700;text-align:right;padding-bottom:8px;">£${todayPaid.toFixed(2)}</td>
                    </tr>
                    <tr style="border-top:1px solid #333;">
                        <td style="color:#d4af37;font-size:13px;text-transform:uppercase;letter-spacing:1px;padding-top:12px;font-weight:700;">Total</td>
                        <td style="color:#d4af37;font-size:20px;font-weight:800;text-align:right;padding-top:12px;">£${paidAmount.toFixed(2)}</td>
                    </tr>
                    ${tipAmount > 0 ? `
                    <tr>
                        <td style="color:#4caf50;font-size:12px;text-transform:uppercase;letter-spacing:1px;padding-top:10px;">Tip</td>
                        <td style="color:#4caf50;font-size:14px;font-weight:700;text-align:right;padding-top:10px;">£${tipAmount.toFixed(2)}</td>
                    </tr>
                    ` : ''}
                    ` : `
                    <tr style="border-top:1px solid #222;">
                        <td style="color:#d4af37;font-size:13px;text-transform:uppercase;letter-spacing:1px;padding-top:12px;font-weight:700;">Total Paid</td>
                        <td style="color:#d4af37;font-size:20px;font-weight:800;text-align:right;padding-top:12px;">£${paidAmount.toFixed(2)}</td>
                    </tr>
                    ${tipAmount > 0 ? `
                    <tr>
                        <td style="color:#4caf50;font-size:12px;text-transform:uppercase;letter-spacing:1px;padding-top:10px;">Tip</td>
                        <td style="color:#4caf50;font-size:14px;font-weight:700;text-align:right;padding-top:10px;">£${tipAmount.toFixed(2)}</td>
                    </tr>
                    ` : ''}
                    `}
                </table>
            </div>

            ${tipAmount > 0 ? `
            <div style="background:#071a07;border:1px solid #1a3d1a;border-radius:3px;padding:13px 20px;margin-top:8px;text-align:center;">
                <p style="margin:0;color:#66bb6a;font-size:13px;font-weight:600;">Thanks for your generosity 😊</p>
            </div>
            ` : ''}

            ${memberSection}
            ${pointsSection}

            <!-- Review CTA -->
            <div style="text-align:center;margin:16px 0;padding:16px;background:rgba(212,175,55,0.05);border:1px solid rgba(212,175,55,0.15);border-radius:10px;">
                <p style="margin:0 0 10px;font-size:18px;">⭐⭐⭐⭐⭐</p>
                <p style="margin:0 0 12px;font-size:12px;color:#aaa;line-height:1.5;">Enjoyed your visit? A quick Google review helps us grow and means a lot to the team.</p>
                <a href="https://g.page/r/CUSLYyi8-N-lEBM/review" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#b8860b);color:#000;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;padding:10px 22px;border-radius:6px;text-decoration:none;">★ Leave a Google Review</a>
            </div>

            <!-- Footer contact -->
            <div style="border-top:1px solid #1e1e1e;padding-top:24px;text-align:center;margin-top:8px;">
                <p style="color:#555;font-size:11px;line-height:2;letter-spacing:0.5px;">
                    136 Whitecross Street, London EC1Y 8QJ<br>
                    <a href="tel:+442036215929" style="color:#666;text-decoration:none;">Call us: 020 3621 5929</a>
                </p>
            </div>
        </div>

        ${isWalkIn ? `
        <!-- Double points promo for walk-ins -->
        <div style="background:#0e0c07;border:1px solid #d4af3740;border-radius:10px;padding:18px 22px;margin:0 0 16px;text-align:center;">
            <p style="margin:0 0 6px;font-size:11px;color:#d4af37;letter-spacing:2px;text-transform:uppercase;font-weight:700;">💡 Book Online Next Time</p>
            <p style="margin:0;font-size:14px;color:#f0e6c8;font-weight:600;line-height:1.5">Earn <span style="color:#d4af37;font-weight:800">DOUBLE POINTS</span> when you book at<br><a href="https://whitecrossbarbers.com" style="color:#d4af37;text-decoration:none;">whitecrossbarbers.com</a></p>
        </div>` : ''}

        <!-- Footer -->
        <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-top:none;border-radius:0 0 4px 4px;padding:20px;text-align:center;">
            <p style="margin:0;color:#2a2a2a;font-size:10px;letter-spacing:2px;text-transform:uppercase;">© 2026 I CUT Whitecross Barbers</p>
            <p style="color:#2a2a2a;font-size:10px;line-height:1.7;margin-top:8px;">You received this because you are a client of I CUT Whitecross Barbers. We use your email for booking confirmations, loyalty updates and personalised marketing. To unsubscribe, reply to this email with "unsubscribe". · <a href="https://whitecrossbarbers.com/terms.html" style="color:#333;text-decoration:underline;">Privacy &amp; Terms</a></p>
        </div>
    </div>
</body>
</html>`;

        try {
            const subject = isMember
                ? `Receipt – ${service} · ${dateStr} | I CUT Whitecross`
                : `Receipt + Your Loyalty Card · ⭐ ${loyaltyPoints} pts | I CUT Whitecross`;
            await getTransporter().sendMail({
                from: `"I CUT Whitecross Barbers" <${process.env.GMAIL_USER}>`,
                to: email,
                subject,
                html: htmlBody,
            });
            console.log(`Loyalty card email sent to ${email} · ${loyaltyPoints} pts`);
            // Mark booking so the panel can show email-sent indicator
            try {
                await event.data.after.ref.update({
                    loyaltyEmailSent: true,
                    loyaltyEmailSentAt: admin.firestore.Timestamp.now(),
                });
            } catch (_) {}
        } catch (err) {
            console.error('sendLoyaltyCardEmail error:', err);
        }
    }
);

// ── Loyalty enrolment (public, called from success.html) ─────────────────────
exports.enrollLoyalty = onRequest(
    { cors: ['https://whitecrossbarbers.com', 'https://www.whitecrossbarbers.com'] },
    async (req, res) => {
        if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
        const { clientName, clientPhone, clientEmail } = req.body || {};
        if (!clientName && !clientPhone && !clientEmail) {
            res.status(400).json({ error: 'At least one of name/phone/email required.' });
            return;
        }
        try {
            const db = getAdminDb();
            const clientsRef = db.collection('tenants/whitecross/clients');

            // Prevent duplicates
            let existing = null;
            if (clientPhone) {
                const s = await clientsRef.where('phone', '==', clientPhone).limit(1).get();
                if (!s.empty) existing = s.docs[0];
            }
            if (!existing && clientEmail) {
                const s = await clientsRef.where('email', '==', clientEmail).limit(1).get();
                if (!s.empty) existing = s.docs[0];
            }
            if (existing) {
                res.json({ success: true, alreadyEnrolled: true, data: existing.data() });
                return;
            }

            const now     = admin.firestore.Timestamp.now();
            const expDate = new Date();
            expDate.setMonth(expDate.getMonth() + 3);
            const docData = {
                name:          clientName  || '',
                phone:         clientPhone || '',
                email:         clientEmail || '',
                loyaltyPoints: 0,
                enrolledVia:   'website',
                createdAt:     now,
                welcomeOffer:  {
                    type:      'pct',
                    value:     10,
                    expiresAt: admin.firestore.Timestamp.fromDate(expDate),
                },
            };
            await clientsRef.add(docData);
            res.json({ success: true, alreadyEnrolled: false, expiresAt: expDate.toISOString() });
        } catch (err) {
            console.error('enrollLoyalty error:', err);
            res.status(500).json({ error: err.message });
        }
    }
);

// ── Staff account creation (callable) ────────────────────────────────────────
exports.createStaffUser = onCall({ cors: true }, async (request) => {
    try {
        const callerUid = request.auth?.uid;
        console.log('createStaffUser called, callerUid:', callerUid);
        if (!callerUid) throw new HttpsError('unauthenticated', 'Must be signed in.');

        const db = getAdminDb();

        const { tenantId: callerTenantId } = request.data || {};
        const callerTenant = callerTenantId || 'whitecross';
        const callerDoc = await db.doc(`tenants/${callerTenant}/staff/${callerUid}`).get();
        const isOwner = callerDoc.exists && ['owner', 'admin'].includes(callerDoc.data().role);
        console.log('callerDoc exists:', callerDoc.exists, 'isOwner:', isOwner, 'tenant:', callerTenant);
        if (!isOwner) throw new HttpsError('permission-denied', 'Only owners can create staff accounts.');

        const { name, email, password, role, tenantId: reqTenantId } = request.data || {};
        const tenantId = reqTenantId || 'whitecross';
        console.log('Creating user:', email, 'role:', role, 'tenant:', tenantId);
        if (!name || !email || !password) throw new HttpsError('invalid-argument', 'name, email and password are required.');
        if (!['owner', 'admin', 'staff'].includes(role)) throw new HttpsError('invalid-argument', 'role must be "owner", "admin" or "staff".');

        let userRecord;
        try {
            userRecord = await admin.auth().createUser({ email, password, displayName: name });
            console.log('Auth user created:', userRecord.uid);
        } catch (err) {
            console.error('createUser error:', err.code, err.message);
            if (err.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'Bu email zaten kayıtlı.');
            throw new HttpsError('internal', 'Kullanıcı oluşturulamadı: ' + err.message);
        }

        try {
            await admin.auth().setCustomUserClaims(userRecord.uid, { tenantId });
            console.log('Custom claims set for:', userRecord.uid, 'tenantId:', tenantId);
        } catch (err) {
            console.error('setCustomUserClaims error:', err.message);
            throw new HttpsError('internal', 'Claim hatası: ' + err.message);
        }

        try {
            await db.doc(`tenants/${tenantId}/staff/${userRecord.uid}`).set({
                name,
                email,
                role,
                createdAt: admin.firestore.Timestamp.now(),
                createdBy: callerUid,
            });
            console.log('Staff doc written for:', userRecord.uid);
        } catch (err) {
            console.error('Firestore write error:', err.message);
            throw new HttpsError('internal', 'Firestore yazma hatası: ' + err.message);
        }

        return { uid: userRecord.uid };
    } catch (err) {
        if (err instanceof HttpsError) throw err;
        console.error('createStaffUser unhandled error:', err);
        throw new HttpsError('internal', err.message || 'Bilinmeyen hata');
    }
});

// ── Manual receipt send (from admin panel "Send Email" button) ────────────────
exports.sendReceipt = onRequest(
    {
        cors: true,
        secrets: ['GMAIL_USER', 'GMAIL_PASS'],
    },
    async (req, res) => {
        if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

        const {
            email, name, service, barber,
            date, time, total, discount, tip,
            paymentMethod, bookingId,
            soldProducts, soldAddOns, basePrice,
            tenantId,
        } = req.body || {};

        if (!email) { res.status(400).json({ error: 'email is required' }); return; }

        const isEekurt = tenantId === 'eekurt';
        const BRAND = isEekurt ? {
            name:    'Ee Kurt Barbers',
            address: '318 St John Street, London EC1V 4NT',
            phone:   '020 7833 1525',
            wa:      '447577487547',
            website: 'eekurtbarbers.com',
            logo:    'https://eekurtbarbers.com/img/logo.png',
            accent:  '#c8c8c8',
            from:    'Ee Kurt Barbers',
        } : {
            name:    'I CUT Whitecross Barbers',
            address: '136 Whitecross Street, London EC1Y 8QJ',
            phone:   '020 3621 5929',
            website: 'whitecrossbarbers.com',
            logo:    'https://whitecrossbarbers.com/whitecross-logo.png',
            accent:  '#d4af37',
            from:    'I CUT Whitecross Barbers',
        };

        const totalNum    = parseFloat(total)    || 0;
        const discountNum = parseFloat(discount) || 0;
        const tipNum      = parseFloat(tip)      || 0;
        const basePriceNum = parseFloat(basePrice) || 0;
        const barberLabel = (barber || 'Your Barber').toUpperCase();
        const nameLabel   = name || 'Guest';
        const serviceLabel = service || 'Service';

        const productRows = Array.isArray(soldProducts) && soldProducts.length
            ? soldProducts.map(p => `
                <tr>
                    <td style="padding:5px 0;color:#aaa;font-size:13px;">${p.name}${p.qty > 1 ? ` × ${p.qty}` : ''}</td>
                    <td style="padding:5px 0;color:#8bc4ff;font-size:13px;font-weight:600;text-align:right;">£${(parseFloat(p.price) * (parseInt(p.qty, 10) || 1)).toFixed(2)}</td>
                </tr>`).join('')
            : '';

        const addOnRows = Array.isArray(soldAddOns) && soldAddOns.length
            ? soldAddOns.map(p => `
                <tr>
                    <td style="padding:5px 0;color:#aaa;font-size:13px;">${p.name}${p.qty > 1 ? ` × ${p.qty}` : ''}</td>
                    <td style="padding:5px 0;color:#ff9800;font-size:13px;font-weight:600;text-align:right;">£${(parseFloat(p.price) * (parseInt(p.qty, 10) || 1)).toFixed(2)}</td>
                </tr>`).join('')
            : '';

        const discountRow = discountNum > 0 ? `
            <tr>
                <td style="padding:5px 0;color:#4caf50;font-size:13px;">Discount</td>
                <td style="padding:5px 0;color:#4caf50;font-size:13px;font-weight:600;text-align:right;">-£${discountNum.toFixed(2)}</td>
            </tr>` : '';

        const tipRow = tipNum > 0 ? `
            <tr>
                <td style="padding:5px 0;color:#aaa;font-size:13px;">Tip</td>
                <td style="padding:5px 0;color:#aaa;font-size:13px;font-weight:600;text-align:right;">£${tipNum.toFixed(2)}</td>
            </tr>` : '';

        const htmlBody = `<!DOCTYPE html>
<html>
<head><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700;800&display=swap');</style></head>
<body style="font-family:'Inter',Arial,sans-serif;background-color:#0a0a0a;margin:0;padding:40px 20px;">
    <div style="max-width:520px;margin:0 auto;color:#ffffff;">
        <div style="background:#000;border:1px solid #1a1a1a;border-radius:4px 4px 0 0;padding:36px 20px 28px;text-align:center;border-bottom:1px solid #1a1a1a;">
            <img src="${BRAND.logo}" alt="${BRAND.name}" style="width:60px;margin-bottom:16px;">
            <h1 style="margin:0;color:${BRAND.accent};font-size:16px;letter-spacing:5px;text-transform:uppercase;font-weight:300;">${BRAND.name.toUpperCase()}</h1>
        </div>
        <div style="background:#111;border:1px solid #1a1a1a;border-top:none;padding:36px 32px;">
            <p style="color:${BRAND.accent};font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 12px 0;font-weight:700;">Payment Receipt</p>
            <h2 style="margin:0 0 6px 0;font-size:24px;font-weight:300;color:#fff;">Thanks, <strong>${nameLabel}</strong></h2>
            <p style="margin:0 0 28px 0;color:#666;font-size:13px;">${serviceLabel} · ${barberLabel} · ${date || ''} ${time ? '· ' + time : ''}</p>
            <div style="background:#161616;border:1px solid #222;padding:20px 24px;border-radius:3px;margin-bottom:28px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Service</td>
                        <td style="padding:8px 0;border-bottom:1px solid #1e1e1e;color:${BRAND.accent};font-size:14px;font-weight:700;text-align:right;">${serviceLabel}</td>
                    </tr>
                    <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Barber</td>
                        <td style="padding:8px 0;border-bottom:1px solid #1e1e1e;color:#fff;font-size:14px;font-weight:700;text-align:right;">${barberLabel}</td>
                    </tr>
                    ${basePriceNum > 0 ? `
                    <tr>
                        <td style="padding:5px 0;color:#aaa;font-size:13px;">${serviceLabel}</td>
                        <td style="padding:5px 0;color:#fff;font-size:13px;font-weight:600;text-align:right;">£${basePriceNum.toFixed(2)}</td>
                    </tr>` : ''}
                    ${productRows}
                    ${addOnRows}
                    ${discountRow}
                    ${tipRow}
                    <tr style="border-top:1px solid #333;">
                        <td style="color:${BRAND.accent};font-size:13px;text-transform:uppercase;letter-spacing:1px;padding-top:14px;font-weight:700;">Total Paid</td>
                        <td style="color:${BRAND.accent};font-size:22px;font-weight:800;text-align:right;padding-top:14px;">£${totalNum.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td style="color:#666;font-size:12px;padding-top:6px;">Payment</td>
                        <td style="color:#aaa;font-size:12px;font-weight:600;text-align:right;padding-top:6px;">${paymentMethod || 'Cash'}</td>
                    </tr>
                </table>
                ${bookingId ? `<p style="margin:18px 0 0 0;font-size:11px;color:#333;text-align:center;letter-spacing:1px;">ID: ${bookingId}</p>` : ''}
            </div>
            <div style="border-top:1px solid #1e1e1e;padding-top:24px;text-align:center;">
                <p style="color:#555;font-size:11px;line-height:2;letter-spacing:0.5px;">
                    ${BRAND.address}<br>
                    <a href="tel:${BRAND.phone.replace(/\s/g,'')}" style="color:#666;text-decoration:none;">Call us: ${BRAND.phone}</a>
                </p>
            </div>
        </div>
        <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-top:none;border-radius:0 0 4px 4px;padding:20px;text-align:center;">
            <p style="margin:0;color:#2a2a2a;font-size:10px;letter-spacing:2px;text-transform:uppercase;">© 2026 ${BRAND.name}</p>
            <p style="color:#2a2a2a;font-size:10px;line-height:1.7;margin-top:8px;">You received this because you are a client of I CUT Whitecross Barbers. We use your email for booking confirmations, loyalty updates and personalised marketing. To unsubscribe, reply to this email with "unsubscribe". · <a href="https://whitecrossbarbers.com/terms.html" style="color:#333;text-decoration:underline;">Privacy &amp; Terms</a></p>
        </div>
    </div>
</body>
</html>`;

        try {
            await getTransporter().sendMail({
                from: `"${BRAND.from}" <${process.env.GMAIL_USER}>`,
                to: email,
                subject: `Receipt – ${serviceLabel} | ${BRAND.name}`,
                html: htmlBody,
            });
            console.log(`sendReceipt: sent to ${email} for booking ${bookingId}`);
            res.json({ success: true });
        } catch (err) {
            console.error('sendReceipt error:', err);
            res.status(500).json({ error: err.message });
        }
    }
);

// ── Email parsers: Booksy, Fresha, Treatwell → Firestore ─────────────────────
const {
    getGmailClient,
    parseBooksyConfirmations,
    parseBooksyCancellations,
    // parseFreshaConfirmations disabled (2026-06-08) — salownParseEmails handles Fresha parsing now
    parseTreatwell,
} = require('./emailParsers');

async function parseBounceEmails(gmail, db) {
    const messages = await fetchRecentMessages(gmail, 'from:mailer-daemon@googlemail.com');
    for (const msg of messages) {
        try {
            const body = extractPlainText(msg.payload) || extractHtmlAsText(msg.payload);
            // Extract the bounced email address from the delivery failure notification
            const m = body.match(/wasn't delivered to\s+([\w._%+\-]+@[\w.\-]+\.[a-zA-Z]{2,})/i)
                   || body.match(/Delivery to the following recipient[^:]*:\s*([\w._%+\-]+@[\w.\-]+\.[a-zA-Z]{2,})/i)
                   || body.match(/Final-Recipient:[^\n]*?;\s*([\w._%+\-]+@[\w.\-]+\.[a-zA-Z]{2,})/i);
            if (!m) continue;
            const bouncedEmail = m[1].toLowerCase().trim();

            // Find bookings with this clientEmail that had loyalty email sent but not yet marked bounced
            const snap = await db.collection('tenants/whitecross/bookings')
                .where('clientEmail', '==', bouncedEmail)
                .where('loyaltyEmailSent', '==', true)
                .get();
            for (const docSnap of snap.docs) {
                if (docSnap.data().loyaltyEmailBounced) continue;
                await docSnap.ref.update({ loyaltyEmailBounced: true, loyaltyEmailBouncedAt: admin.firestore.Timestamp.now() });
                console.log(`Bounce detected: ${bouncedEmail} → booking ${docSnap.id}`);
            }
        } catch (err) {
            console.error('parseBounceEmails error:', err.message);
        }
    }
}

exports.parseBookingEmails = onSchedule(
    {
        schedule: 'every 5 minutes',
        timeZone: 'Europe/London',
        secrets: ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'],
    },
    async () => {
        const db     = getAdminDb();
        const gmail  = getGmailClient();
        await Promise.all([
            parseBooksyConfirmations(gmail, db),
            parseBooksyCancellations(gmail, db),
            // parseFreshaConfirmations disabled (2026-06-08) — salownParseEmails handles Fresha parsing now
            // parseTreatwell disabled — salownParseEmails handles Treatwell parsing now
            parseBounceEmails(gmail, db),
        ]);
        console.log('parseBookingEmails: completed');
    }
);

// ── Mobile checkout: create Stripe session for in-person card payment ─────────
exports.createMobileCheckout = onCall(
    { secrets: ['STRIPE_SECRET_KEY'] },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

        const {
            bookingId, amount, clientEmail, clientName,
            serviceName, barberName,
            tip, tipPaymentMethod, note,
            loyaltyPointsEarned, sendLoyaltyEmail,
        } = request.data || {};

        if (!bookingId || !amount) throw new HttpsError('invalid-argument', 'Missing bookingId or amount');

        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) throw new HttpsError('internal', 'Stripe not configured');

        const chargeGBP = parseFloat(amount);
        if (!(chargeGBP > 0)) throw new HttpsError('invalid-argument', 'Invalid amount');

        const stripe = new Stripe(stripeKey);
        const appUrl = 'https://whitecrossbarbers-app.web.app';

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    product_data: {
                        name: serviceName || 'Haircut',
                        description: barberName ? `with ${barberName} · Whitecross Barbers` : 'Whitecross Barbers',
                    },
                    unit_amount: Math.round(chargeGBP * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            customer_email: clientEmail || undefined,
            metadata: {
                bookingId:           String(bookingId),
                paymentType:         'MOBILE_CHECKOUT',
                amount:              String(chargeGBP),
                tip:                 String(parseFloat(tip) || 0),
                tipPaymentMethod:    String(tipPaymentMethod || ''),
                note:                String(note || '').substring(0, 490),
                loyaltyPointsEarned: String(parseInt(loyaltyPointsEarned) || 0),
                sendLoyaltyEmail:    String(sendLoyaltyEmail === true || sendLoyaltyEmail === 'true'),
            },
            success_url: `${appUrl}/?stripe_success=${encodeURIComponent(bookingId)}`,
            cancel_url:  `${appUrl}/?stripe_cancel=${encodeURIComponent(bookingId)}`,
        });

        return { url: session.url, sessionId: session.id };
    }
);

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
async function sendBookingPush(booking, bookingId) {
    const db = getAdminDb();
    const tokensSnap = await db.collection('tenants/whitecross/fcmTokens').get();
    const bookingBarber = (booking.barberName || booking.barber || booking.barberId || '').toLowerCase();
    console.log(`sendBookingPush: ${bookingId} barber="${bookingBarber}" totalTokenDocs=${tokensSnap.size}`);
    const tokens = tokensSnap.docs
        .map(d => d.data())
        .filter(d => {
            if (!d.token) return false;
            const role = (d.role || 'staff').toLowerCase();
            if (role === 'owner' || role === 'admin') return true;
            const tokenBarber = (d.barberName || '').toLowerCase();
            return !tokenBarber || !bookingBarber || tokenBarber === bookingBarber;
        })
        .map(d => d.token);
    console.log(`sendBookingPush: sending to ${tokens.length} token(s)`);
    if (!tokens.length) return;

    const client  = booking.clientName || booking.client || 'New client';
    const time    = booking.time || '';
    const service = booking.serviceId || booking.service || booking.serviceName || '';
    const source  = (booking.source || '').toLowerCase();

    const title =
        source.includes('fresha')                            ? 'New Fresha Booking'    :
        source.includes('treatwell')                         ? 'New Treatwell Booking' :
        source.includes('booksy')                            ? 'New Booksy Booking'    :
        source.includes('website') || source.includes('web') ? 'New Web Booking'       :
        source.includes('walk')                              ? 'New Walk-in'           :
                                                               'New Booking';

    const body = [client, time, service].filter(Boolean).join(' · ');

    const response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        webpush: {
            notification: {
                icon:     'https://whitecrossbarbers-app.web.app/icon-192.png',
                badge:    'https://whitecrossbarbers-app.web.app/icon-192.png',
                tag:      'new-booking',
                renotify: true,
            },
            data: { bookingId, clientName: client, time, service },
        },
    });

    response.responses.forEach((r, i) => {
        if (!r.success) console.error(`FCM send failed token[${i}]:`, r.error?.code, r.error?.message);
        else console.log(`FCM sent ok token[${i}]`);
    });
    const expired = response.responses
        .map((r, i) => (!r.success && r.error?.code === 'messaging/registration-token-not-registered') ? tokens[i] : null)
        .filter(Boolean);
    if (expired.length) console.log(`Removing ${expired.length} expired token(s)`);
    await Promise.all(expired.map(t => db.collection('tenants/whitecross/fcmTokens').doc(t).delete()));
}

// Created directly as CONFIRMED (walk-ins, Booksy, Fresha, Treatwell)
exports.onNewBookingPush = onDocumentCreated(
    'tenants/whitecross/bookings/{bookingId}',
    async event => {
        const booking = event.data?.data();
        if (!booking) return;
        if ((booking.status || '').toUpperCase() !== 'CONFIRMED') return;
        await sendBookingPush(booking, event.params.bookingId);
    }
);

// Created as PENDING, then payment confirmed → status flips to CONFIRMED
exports.onBookingConfirmedPush = onDocumentUpdated(
    'tenants/whitecross/bookings/{bookingId}',
    async event => {
        const before = event.data?.before?.data();
        const after  = event.data?.after?.data();
        if (!before || !after) return;
        const wasPending = (before.status || '').toUpperCase() !== 'CONFIRMED';
        const nowConfirmed = (after.status || '').toUpperCase() === 'CONFIRMED';
        if (!wasPending || !nowConfirmed) return;
        await sendBookingPush(after, event.params.bookingId);
    }
);

// ── iCalendar feed ────────────────────────────────────────────────────────────
// URL: /icalFeed?barber=Alex          → Alex's calendar
// URL: /icalFeed                      → all barbers
// URL: /icalFeed?barber=Alex&key=KEY  → with secret key (optional)
//
// Treatwell / Google Cal / Apple Cal subscribe to this URL.
// They pull every 15–30 min automatically — no manual work needed.

function escIcal(str) {
    return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function toIcalDate(date) {
    // Returns YYYYMMDDTHHMMSSZ in UTC
    const pad = n => String(n).padStart(2, '0');
    return date.getUTCFullYear()
        + pad(date.getUTCMonth() + 1)
        + pad(date.getUTCDate())
        + 'T' + pad(date.getUTCHours())
        + pad(date.getUTCMinutes())
        + pad(date.getUTCSeconds()) + 'Z';
}

exports.icalFeed = onRequest({ cors: false }, async (req, res) => {
    const db = getAdminDb();
    const TENANT = 'whitecross';

    // Optional secret key check — set ICAL_KEY in Firebase secrets if you want protection
    // For now open (Treatwell needs a public URL)
    const barberFilter = (req.query.barber || '').trim().toLowerCase();

    // Fetch bookings: past 14 days → next 90 days
    const from = new Date(); from.setDate(from.getDate() - 14); from.setHours(0, 0, 0, 0);
    const to   = new Date(); to.setDate(to.getDate() + 90);     to.setHours(23, 59, 59, 999);

    let snap;
    try {
        snap = await db.collection(`tenants/${TENANT}/bookings`)
            .where('startTime', '>=', admin.firestore.Timestamp.fromDate(from))
            .where('startTime', '<=', admin.firestore.Timestamp.fromDate(to))
            .get();
    } catch (e) {
        res.status(500).send('Error fetching bookings');
        return;
    }

    const SKIP_STATUSES = ['CANCELLED'];
    const now = new Date();

    let events = '';
    snap.docs.forEach(doc => {
        const b = doc.data();
        const status = (b.status || '').toUpperCase();
        if (SKIP_STATUSES.includes(status)) return;

        // Barber filter
        const bName = (b.barberName || b.barber || b.barberId || '').toLowerCase();
        if (barberFilter && bName !== barberFilter) return;

        // Resolve start/end times
        let start, end;
        if (b.startTime?.toDate) {
            start = b.startTime.toDate();
        } else {
            return; // skip if no startTime
        }
        if (b.endTime?.toDate) {
            end = b.endTime.toDate();
        } else {
            end = new Date(start.getTime() + 30 * 60 * 1000); // default 30min
        }

        const uid = `${doc.id}@whitecrossbarbers.com`;
        const created = b.createdAt?.toDate ? b.createdAt.toDate() : now;
        const barberName = escIcal(b.barberName || b.barber || '');

        let summary, desc, icalStatus;
        if (status === 'BLOCKED') {
            // Show as Unavailable — no client details exposed
            summary    = barberName ? `Unavailable – ${barberName}` : 'Unavailable';
            desc       = escIcal(b.note || 'Blocked');
            icalStatus = 'CONFIRMED';
        } else {
            const clientName = escIcal(b.clientName || 'Client');
            const service    = escIcal(b.service || b.serviceId || '');
            summary    = barberName ? `${clientName} – ${barberName}` : clientName;
            desc       = [service, b.source, b.note].filter(Boolean).map(escIcal).join(' | ');
            icalStatus = 'CONFIRMED';
        }

        events += [
            'BEGIN:VEVENT',
            `UID:${uid}`,
            `DTSTAMP:${toIcalDate(now)}`,
            `DTSTART:${toIcalDate(start)}`,
            `DTEND:${toIcalDate(end)}`,
            `SUMMARY:${summary}`,
            desc ? `DESCRIPTION:${desc}` : '',
            `CREATED:${toIcalDate(created)}`,
            `STATUS:${icalStatus}`,
            'END:VEVENT',
        ].filter(Boolean).join('\r\n') + '\r\n';
    });

    const calName = barberFilter
        ? `Whitecross – ${barberFilter.charAt(0).toUpperCase() + barberFilter.slice(1)}`
        : 'Whitecross Barbers';

    const ical = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Whitecross Barbers//Booking Feed//EN',
        `X-WR-CALNAME:${calName}`,
        'X-WR-TIMEZONE:Europe/London',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        events.trimEnd(),
        'END:VCALENDAR',
    ].join('\r\n');

    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    if (req.query.download === '1') {
        res.set('Content-Disposition', `attachment; filename="${barberFilter || 'whitecross'}.ics"`);
    }
    res.send(ical);
});

// ── ONE-TIME: backfill loyalty points from checkout history ───────────────────

// ── ONE-TIME: backfill client stats (totalSpent, totalVisits, totalDiscount, lastVisit…) ──
exports.backfillClientStats = onRequest({ timeoutSeconds: 540, memory: '512MiB' }, async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('POST only'); return; }
    const db = admin.firestore();
    const TENANT = 'tenants/whitecross';

    function pp(v) { return parseFloat(String(v || 0).replace('£', '').replace('-', '')) || 0; }
    function normPhone(p) { return String(p || '').replace(/\D/g, '').slice(-10); }

    // Load all bookings + clients
    const [bSnap, cSnap] = await Promise.all([
        db.collection(`${TENANT}/bookings`).get(),
        db.collection(`${TENANT}/clients`).get(),
    ]);

    const paid = bSnap.docs
        .map(d => ({ _id: d.id, ...d.data() }))
        .filter(b => (b.status || '').toUpperCase() === 'CHECKED_OUT');

    const clients = cSnap.docs.map(d => ({ _ref: d.ref, _id: d.id, ...d.data() }));

    // Phone / email lookup maps
    const phoneMap = {}, emailMap = {};
    for (const c of clients) {
        if (c.phone) phoneMap[normPhone(c.phone)] = c;
        if (c.email) emailMap[(c.email || '').toLowerCase()] = c;
    }

    function findClient(phone, email) {
        if (phone) { const n = normPhone(phone); if (n && phoneMap[n]) return phoneMap[n]; }
        if (email) { const e = (email || '').toLowerCase(); if (e && emailMap[e]) return emailMap[e]; }
        return null;
    }

    // Aggregate
    const stats = {};
    for (const b of paid) {
        const c = findClient(b.clientPhone || '', b.clientEmail || '');
        if (!c) continue;
        if (!stats[c._id]) stats[c._id] = { ref: c._ref, totalSpent: 0, totalVisits: 0, totalDiscount: 0, lastVisit: null, lastBarber: '', lastService: '' };
        const s = stats[c._id];
        s.totalSpent    += pp(b.paidAmount || b.price);
        s.totalVisits   += 1;
        s.totalDiscount += pp(b.discount || 0);
        const bDate = b.startTime?.toDate ? b.startTime.toDate() : null;
        if (bDate && (!s.lastVisit || bDate > s.lastVisit)) {
            s.lastVisit   = bDate;
            s.lastBarber  = b.barberName || b.barberId || '';
            s.lastService = b.serviceId  || b.service  || '';
        }
    }

    // Batch write
    let updated = 0, batch = db.batch(), ops = 0;
    for (const [, s] of Object.entries(stats)) {
        const upd = {
            totalSpent:    s.totalSpent,
            totalVisits:   s.totalVisits,
            totalDiscount: s.totalDiscount,
            lastBarber:    s.lastBarber,
            lastService:   s.lastService,
        };
        if (s.lastVisit) upd.lastVisit = admin.firestore.Timestamp.fromDate(s.lastVisit);
        batch.update(s.ref, upd);
        updated++; ops++;
        if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();

    res.json({ ok: true, updatedClients: updated, paidBookings: paid.length, totalClients: clients.length });
});


// ── Manual loyalty adjustment email ──────────────────────────────────────────
exports.sendManualLoyaltyAdjustmentEmail = onCall(
    { secrets: ['GMAIL_USER', 'GMAIL_PASS'], cors: true },
    async (req) => {
        const { clientEmail, clientName, points, reason, newTotal } = req.data || {};
        if (!clientEmail) throw new HttpsError('invalid-argument', 'clientEmail required');
        if (!points || isNaN(points)) throw new HttpsError('invalid-argument', 'points required');

        const isAdd = points > 0;
        const absPoints = Math.abs(points);
        const REDEEM_RATE = 20;
        const redeemable = (newTotal / REDEEM_RATE).toFixed(2).replace(/\.00$/, '').replace(/\.(\d)0$/, '.$1');
        const name = clientName || 'Valued Client';
        const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

        const htmlBody = `<!DOCTYPE html>
<html>
<head><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700;800&display=swap');</style></head>
<body style="font-family:'Inter',Arial,sans-serif;background-color:#0a0a0a;margin:0;padding:40px 20px;">
    <div style="max-width:560px;margin:0 auto;color:#ffffff;">

        <!-- Header -->
        <div style="background:#000;border:1px solid #1a1a1a;border-radius:4px 4px 0 0;padding:36px 20px 28px;text-align:center;border-bottom:1px solid #1a1a1a;">
            <img src="https://whitecrossbarbers.com/whitecross-logo.png" alt="I CUT" style="width:60px;margin-bottom:16px;">
            <h1 style="margin:0;color:#d4af37;font-size:16px;letter-spacing:5px;text-transform:uppercase;font-weight:300;">I CUT WHITECROSS</h1>
        </div>

        <!-- Body -->
        <div style="background:#111;border:1px solid #1a1a1a;border-top:none;padding:36px 32px;">
            <p style="color:#d4af37;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 12px 0;font-weight:700;">Loyalty Points Update</p>
            <h2 style="margin:0 0 6px 0;font-size:24px;font-weight:300;color:#fff;">Hi, <strong>${name}</strong></h2>
            <p style="margin:0 0 28px 0;color:#666;font-size:13px;">${dateStr}</p>

            <!-- Adjustment card -->
            <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:4px;overflow:hidden;margin:0 0 24px;">
                <div style="background:linear-gradient(135deg,#1a1500,#0d0d0d);padding:22px 24px 18px;border-bottom:1px solid #222;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td>
                                <p style="margin:0;color:#d4af37;font-size:10px;letter-spacing:3px;text-transform:uppercase;font-weight:700;">Loyalty Card</p>
                                <p style="margin:4px 0 0 0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">${name}</p>
                            </td>
                            <td style="text-align:right;vertical-align:top;">
                                <p style="margin:0;color:#d4af37;font-size:32px;font-weight:800;line-height:1;">⭐ ${newTotal}</p>
                                <p style="margin:2px 0 0 0;color:#888;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Points</p>
                            </td>
                        </tr>
                    </table>
                </div>
                <div style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;padding-bottom:10px;">Adjustment</td>
                            <td style="font-size:20px;font-weight:800;text-align:right;padding-bottom:10px;color:${isAdd ? '#4caf50' : '#ff5252'};">${isAdd ? '+' : '−'}${absPoints} pts</td>
                        </tr>
                        <tr>
                            <td style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;padding-bottom:10px;">Reason</td>
                            <td style="color:#fff;font-size:13px;text-align:right;padding-bottom:10px;">${reason}</td>
                        </tr>
                        <tr style="border-top:1px solid #222;">
                            <td style="color:#d4af37;font-size:13px;text-transform:uppercase;letter-spacing:1px;padding-top:12px;font-weight:700;">New Total</td>
                            <td style="color:#d4af37;font-size:20px;font-weight:800;text-align:right;padding-top:12px;">${newTotal} pts</td>
                        </tr>
                    </table>
                </div>
                ${newTotal >= 20 ? `
                <div style="margin:0 24px 18px;padding:14px;background:#0f1f0f;border:1px solid #1e3d1e;border-radius:3px;text-align:center;">
                    <p style="margin:0;color:#4caf50;font-size:18px;font-weight:800;">£${redeemable} available to redeem</p>
                    <p style="margin:4px 0 0 0;color:#2e7d32;font-size:11px;">Tell your barber at your next visit · Min 20 pts</p>
                </div>
                ` : `
                <div style="margin:0 24px 18px;padding:12px;background:#111;border:1px solid #222;border-radius:3px;text-align:center;">
                    <p style="margin:0;color:#555;font-size:12px;">${20 - newTotal} more points until your first £1 off</p>
                </div>
                `}
                <div style="padding:12px 24px;text-align:center;background:#070707;">
                    <p style="margin:0;color:#333;font-size:10px;letter-spacing:1px;">1 pt per £1 spent · 20 pts = £1 off · Min 20 pts to redeem</p>
                </div>
            </div>

            <!-- Footer contact -->
            <div style="border-top:1px solid #1e1e1e;padding-top:24px;text-align:center;">
                <p style="color:#555;font-size:11px;line-height:2;letter-spacing:0.5px;">
                    136 Whitecross Street, London EC1Y 8QJ<br>
                    <a href="tel:+442036215929" style="color:#666;text-decoration:none;">Call us: 020 3621 5929</a>
                </p>
            </div>
        </div>

        <!-- Footer -->
        <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-top:none;border-radius:0 0 4px 4px;padding:20px;text-align:center;">
            <p style="margin:0;color:#2a2a2a;font-size:10px;letter-spacing:2px;text-transform:uppercase;">© 2026 I CUT Whitecross Barbers</p>
            <p style="color:#2a2a2a;font-size:10px;line-height:1.7;margin-top:8px;">You received this because you are a client of I CUT Whitecross Barbers. We use your email for booking confirmations, loyalty updates and personalised marketing. To unsubscribe, reply to this email with "unsubscribe". · <a href="https://whitecrossbarbers.com/terms.html" style="color:#333;text-decoration:underline;">Privacy &amp; Terms</a></p>
        </div>
    </div>
</body>
</html>`;

        const subject = `Your loyalty points have been ${isAdd ? 'updated' : 'adjusted'} · ⭐ ${newTotal} pts | I CUT Whitecross`;
        await getTransporter().sendMail({
            from: `"I CUT Whitecross Barbers" <${process.env.GMAIL_USER}>`,
            to: clientEmail,
            subject,
            html: htmlBody,
        });
        console.log(`Manual loyalty adjustment email sent to ${clientEmail} · ${isAdd ? '+' : ''}${points} pts · reason: ${reason}`);
        return { success: true };
    }
);

// ── AI Analytics Assistant ────────────────────────────────────────────────────
exports.askAI = onCall({ secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 60 }, async (req) => {
    const { question, context } = req.data || {};
    if (!question) throw new HttpsError('invalid-argument', 'question required');

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `You are a senior business analyst embedded inside the admin panel of Whitecross Barbers — a premium barbershop at 136 Whitecross Street, London EC1Y 8QJ.

== BUSINESS STRUCTURE ==
Partners: Alex (50% share, £100/day wage), Arda (25% share, £100/day wage), Tuncay (25% share, £0/day wage but receives Kadim and Manoj's wages as credit).
Employed barbers: Kadim (wages credit to Tuncay, £100/day), Manoj (wages credit to Tuncay, £50/day).
Initial investment pool: £35,904.40. Alex paid £20,755.20 (50%), Arda paid £5,500 (25%), Tuncay paid £1,400 (25%).

== FINANCE FORMULAS ==
- Gross Revenue: sum of all completed booking amounts (excluding tips).
- Net Revenue: Gross Revenue − Cash Expenses − Bank Expenses.
- Company Net P&L: Net Revenue − Total Wages − Fixed Costs (fixed daily rate × shop open days).
- El Emeği (labour earnings) per partner: (days worked × daily wage) + credited employee wages − advances taken.
- Hisseden (profit share) per partner: Company Net P&L × partner's share %.
- Net Durum per partner: El Emeği + Hisseden. Positive = company owes them. Negative = they owe the company.
- Total Position: cumulative Net Durum across all months + initial investment balance (paid − required share of pool).
- Settlement: partners with negative Total Position must pay partners with positive Total Position.

== BOOKING SOURCES ==
Walk-in (or historical/manual), Booksy, Fresha, Website, Treatwell, Product Sale.

== YOUR JOB ==
You have live data from Firestore passed in the context. Use it to answer any question precisely.
- Quote exact numbers from the data — never estimate if the number is there.
- Use £ (GBP) for all monetary values.
- Answer in the same language the user writes in (Turkish or English).
- For finance questions, explain what the numbers mean in plain terms, not just raw figures.
- Give a clear takeaway or recommendation where relevant.
- Use bullet points or short paragraphs — keep it readable, not a wall of text.
- If data for something isn't available in the context, say so clearly.`;

    const userMessage = context
        ? `Here is the current live data for Whitecross Barbers:\n\n${context}\n\n---\n\nQuestion: ${question}`
        : question;

    const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
    });

    return { answer: message.content[0].text };
});


// ── Google Ads Customer Match — Sync clients to Google Sheet ─────────────────
const { google } = require('googleapis');

exports.syncClientsToSheet = onSchedule({
    schedule: 'every 24 hours',
    secrets: ['GOOGLE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT'],
}, async () => {
    const db = getAdminDb();

    // Auth via service account
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
        credentials: serviceAccount,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Fetch all clients (manual + from bookings)
    const [clientSnap, bookingSnap] = await Promise.all([
        db.collection('tenants/whitecross/clients').get(),
        db.collection('tenants/whitecross/bookings').get(),
    ]);

    const seen = new Set();
    const rows = [['Email', 'Phone', 'First Name', 'Last Name', 'Country']]; // header

    const addClient = (name, email, phone) => {
        const key = email || phone;
        if (!key || seen.has(key)) return;
        seen.add(key);
        const parts = (name || '').trim().split(/\s+/);
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || '';
        const formattedPhone = phone
            ? '+44' + String(phone).replace(/\D/g, '').replace(/^0/, '').replace(/^44/, '')
            : '';
        rows.push([email || '', formattedPhone, firstName, lastName, 'GB']);
    };

    // Manual clients collection
    clientSnap.forEach(d => {
        const { name, email, phone } = d.data();
        addClient(name, email, phone);
    });

    // Clients derived from bookings
    bookingSnap.forEach(d => {
        const { name, email, phone, status } = d.data();
        if (['CANCELLED', 'NO_SHOW', 'DELETED'].includes(String(status || '').toUpperCase())) return;
        if (name && name !== 'Walk-in') addClient(name, email, phone);
    });

    // Clear sheet and rewrite
    await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: 'clients!A:D',
    });
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'clients!A1',
        valueInputOption: 'RAW',
        requestBody: { values: rows },
    });

    console.log(`Synced ${rows.length - 1} clients to Google Sheet`);
});

// ── Salown waitlist ───────────────────────────────────────────────────────────
exports.addToWaitlist = onRequest(
    { region: 'europe-west2', cors: true },
    async (req, res) => {
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }
        const email = (req.body.email || '').trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            res.status(400).json({ error: 'Invalid email' });
            return;
        }
        const db = getAdminDb();
        await db
            .collection('superAdmin')
            .doc('waitlist')
            .collection('emails')
            .doc(email)
            .set({
                email,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                source: req.body.source || 'landing',
            }, { merge: true });
        res.json({ success: true });
    }
);

exports.sendProInterest = onRequest(
    { region: 'europe-west2', cors: true, secrets: ['GMAIL_USER', 'GMAIL_PASS'] },
    async (req, res) => {
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }
        const email = (req.body.email || '').trim().toLowerCase();
        const phone = (req.body.phone || '').trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            res.status(400).json({ error: 'Invalid email' });
            return;
        }

        const db = getAdminDb();
        await db.collection('superAdmin').doc('proInterest').collection('leads').add({
            email, phone,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        try {
            const transporter = getTransporter();
            await transporter.sendMail({
                from: `"Salown" <${process.env.GMAIL_USER}>`,
                to: ['whitecrossbarbers@gmail.com', 'aerulas@gmail.com'],
                subject: '🚀 New Pro+ Interest — Salown',
                html: `
                    <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;">
                        <div style="background:#534AB7;color:#fff;padding:12px 20px;border-radius:8px;margin-bottom:24px;">
                            <strong style="font-size:16px;">New Pro+ Interest</strong>
                        </div>
                        <p style="margin:0 0 12px;font-size:15px;color:#111;"><strong>Email:</strong> ${email}</p>
                        <p style="margin:0 0 24px;font-size:15px;color:#111;"><strong>Phone:</strong> ${phone || '—'}</p>
                        <p style="font-size:12px;color:#9ca3af;">Submitted via salown.com Pro+ interest form</p>
                    </div>
                `,
            });
        } catch (err) {
            console.error('sendProInterest email failed:', err.message);
        }

        res.json({ success: true });
    }
);

// ── Phase 3: Provision new tenant on self-signup ──────────────────────────────
exports.provisionTenant = onCall(
    {
        region: 'europe-west2',
        secrets: ['GMAIL_USER', 'GMAIL_PASS'],
    },
    async (request) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in');

        const { salonName, businessType, city, ownerName } = request.data;
        if (!salonName || !businessType || !ownerName) {
            throw new HttpsError('invalid-argument', 'salonName, businessType, ownerName required');
        }

        const uid = request.auth.uid;
        const ownerEmail = request.auth.token.email;
        const db = getAdminDb();

        // 1. Generate unique tenantId
        const base = salonName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        let tenantId = base;
        let suffix = 2;
        while ((await db.collection('tenants').doc(tenantId).get()).exists) {
            tenantId = `${base}-${suffix++}`;
        }

        // 2. Create tenant document
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 90);

        await db.collection('tenants').doc(tenantId).set({
            name: salonName,
            ownerName,
            ownerEmail,
            ownerUID: uid,
            businessType,
            city: city || '',
            domain: null,
            plan: 'free',
            status: 'trial',
            trialEndsAt: admin.firestore.Timestamp.fromDate(trialEndsAt),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            onboardingComplete: false,
            features: {
                stripe: false,
                telegram: false,
                booksyParser: false,
                freshaParser: false,
                treatwellParser: false,
                cancelReschedule: true,
                emailConfirmation: false,
                loyaltySystem: false,
                personalizedAI: false,
            },
        });

        // 3. Create initial barber doc (owner)
        await db.collection('tenants').doc(tenantId).collection('barbers').doc(uid).set({
            name: ownerName,
            email: ownerEmail,
            color: '#534AB7',
            active: true,
            isOwner: true,
            services: [],
            workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        });

        // 4. Set custom claim
        await admin.auth().setCustomUserClaims(uid, { tenantId });

        // 5. Audit log
        await db.collection('superAdmin').doc('auditLog').collection('entries').add({
            action: 'tenant_self_signup',
            tenantId,
            ownerEmail,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            details: `${salonName} — self-signup via salown.com`,
        });

        // 6. Welcome email
        try {
            const transporter = getTransporter();
            await transporter.sendMail({
                from: `"Salown" <${process.env.GMAIL_USER}>`,
                to: ownerEmail,
                subject: 'Welcome to Salown — your panel is ready',
                html: `
                <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#fff;">
                  <div style="display:inline-flex;align-items:center;margin-bottom:28px;">
                    <span style="font-size:22px;font-weight:900;letter-spacing:-1px;color:#0a0a0a">sal</span>
                    <div style="background:#534AB7;padding:1px 10px 3px;border-radius:6px;margin-left:4px">
                      <span style="font-size:22px;font-weight:900;letter-spacing:-1px;color:#fff">OWN</span>
                    </div>
                  </div>
                  <h2 style="font-size:22px;font-weight:800;color:#0a0a0a;margin-bottom:8px;">Hi ${ownerName}, your panel is ready.</h2>
                  <p style="color:#6b7280;font-size:15px;line-height:1.7;margin-bottom:24px;">Welcome to Salown! Your ${salonName} panel has been set up.</p>
                  <a href="https://salown.com/app" style="display:inline-block;background:#534AB7;color:#fff;padding:13px 28px;border-radius:9px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:28px;">Open my panel →</a>
                  <p style="color:#6b7280;font-size:14px;line-height:1.8;"><strong>Plan:</strong> Free (90-day trial on all features)<br>
                  <strong>Salon:</strong> ${salonName}<br>
                  <strong>Booking page:</strong> salown.com/book/${tenantId}</p>
                  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
                  <p style="color:#6b7280;font-size:13px;line-height:1.8;"><strong>Next steps:</strong><br>
                  1. Add your services and pricing<br>
                  2. Set your working hours<br>
                  3. Connect Treatwell/Booksy if you use them</p>
                  <p style="color:#9ca3af;font-size:13px;margin-top:24px;">Questions? WhatsApp us: <a href="https://wa.me/442036215929" style="color:#534AB7;">+44 20 3621 5929</a></p>
                </div>`,
            });
        } catch (emailErr) {
            console.error('provisionTenant: welcome email failed', emailErr.message);
        }

        return { success: true, tenantId };
    }
);

// ── Set tenant claim for existing user (superAdmin only) ──────────────────────
exports.setTenantClaim = onCall(
    { region: 'europe-west2' },
    async (request) => {
        if (!request.auth?.token?.superAdmin) {
            throw new HttpsError('permission-denied', 'superAdmin only');
        }
        const { uid, tenantId, superAdmin, tenantRole } = request.data;
        if (!uid) throw new HttpsError('invalid-argument', 'uid required');
        // Merge with existing claims — setCustomUserClaims replaces, so read first
        const existingUser = await admin.auth().getUser(uid);
        const existing = existingUser.customClaims || {};
        const claims = { ...existing };
        if (tenantId) claims.tenantId = tenantId;
        if (superAdmin != null) claims.superAdmin = superAdmin;
        if (tenantRole != null) claims.tenantRole = tenantRole;
        await admin.auth().setCustomUserClaims(uid, claims);
        return { success: true, uid, claims };
    }
);

// ── Salown: Telegram notification on new booking (all tenants) ────────────────
// Reads token + chatIds from tenant Firestore doc — no secrets needed.
// Skips whitecross (has its own dedicated function above).
exports.salownNotifyNewBooking = onDocumentCreated(
    { document: 'tenants/{tenantId}/bookings/{bookingId}', region: 'europe-west2' },
    async (event) => {
        const tenantId = event.params.tenantId;
        if (tenantId === 'whitecross') return; // handled by notifyNewBooking

        const data = event.data?.data();
        if (!data) return;

        const source = String(data.source || '').trim().toLowerCase();
        const status = String(data.status || '').trim().toUpperCase();

        // Skip blocked slots and bulk imports
        if (status === 'BLOCKED') return;
        if (['historical', 'manual'].includes(source)) return;

        const tenantSnap = await getAdminDb().doc(`tenants/${tenantId}`).get();
        const tenantData = tenantSnap.data() || {};
        const token = tenantData.telegramToken;
        const chatIdsRaw = tenantData.telegramChatIds;
        if (!token || !chatIdsRaw) return;

        const name = data.clientName || data.name || 'Guest';
        const service = data.service || data.serviceId || 'Service';
        const barber = data.barber || data.barberName || '';
        const bookingId = event.params.bookingId;
        const srcLabel = source ? source.charAt(0).toUpperCase() + source.slice(1) : 'Direct';

        let dateStr = 'TBC', timeStr = 'TBC';
        if (data.startTime) {
            const d = data.startTime.toDate();
            dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
            timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' });
        } else if (data.date && data.time) {
            dateStr = data.date;
            timeStr = data.time;
        }

        const phone = data.clientPhone || data.phone ? `\n📞 ${data.clientPhone || data.phone}` : '';
        const barberLine = barber ? `\n💈 ${barber}` : '';
        const priceLine = data.price ? `\n💳 £${data.price}` : '';

        const msg = `📅 <b>New Booking</b> · ${srcLabel}\n👤 ${name}${phone}\n✂️ ${service}${barberLine}\n🕐 ${dateStr} at ${timeStr}${priceLine}\n🆔 <code>${bookingId}</code>`;

        try {
            await sendTelegramMessage(token, chatIdsRaw, msg);
            console.log(`[salown] Telegram sent for ${tenantId}/${bookingId}`);
        } catch (err) {
            console.error(`[salown] Telegram error for ${tenantId}:`, err);
        }
    }
);

// ── Salown: send test Telegram message (callable) ─────────────────────────────
exports.salownSendTestTelegram = onCall(
    { region: 'europe-west2' },
    async (request) => {
        const tenantId = request.auth?.token?.tenantId;
        if (!tenantId) throw new HttpsError('unauthenticated', 'No tenant claim');

        const tenantSnap = await getAdminDb().doc(`tenants/${tenantId}`).get();
        const td = tenantSnap.data() || {};
        const token = td.telegramToken;
        const chatIdsRaw = td.telegramChatIds;
        if (!token || !chatIdsRaw) throw new HttpsError('failed-precondition', 'Telegram not configured — save bot token and chat ID first');

        await sendTelegramMessage(token, chatIdsRaw, `✅ <b>Test notification from Salown</b>\n\nYour Telegram notifications are working correctly.\n🏪 Salon: ${td.salonName || tenantId}`);
        return { success: true };
    }
);

// ── Salown: iCal sync — fetch Treatwell iCal for all tenants every 5 min ──────
// Parses VEVENT blocks and upserts bookings keyed by iCal UID.
function parseIcal(text) {
    const events = [];
    const blocks = text.split('BEGIN:VEVENT');
    for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        function val(key) {
            const m = block.match(new RegExp(`${key}[^:]*:([^\\r\\n]+)`));
            return m ? m[1].trim() : '';
        }
        function parseIcalDate(str) {
            if (!str) return null;
            // Handle TZID or Z suffix: 20260601T100000Z or 20260601T100000
            const clean = str.replace(/Z$/, '');
            const m = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
            if (!m) return null;
            return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
        }
        const uid = val('UID');
        const summary = val('SUMMARY');
        const dtstart = parseIcalDate(val('DTSTART'));
        const dtend = parseIcalDate(val('DTEND'));
        const description = val('DESCRIPTION');
        if (uid && dtstart) {
            events.push({ uid, summary, dtstart, dtend, description });
        }
    }
    return events;
}

exports.salownSyncTreatwellIcal = onSchedule(
    { schedule: 'every 5 minutes', region: 'europe-west2', timeoutSeconds: 120 },
    async () => {
        const db = getAdminDb();
        const tenantsSnap = await db.collection('tenants').get();

        for (const tenantDoc of tenantsSnap.docs) {
            const tenantId = tenantDoc.id;
            const icalUrl = tenantDoc.data().treatwellIcal;
            if (!icalUrl) continue;

            try {
                const resp = await fetch(icalUrl, { signal: AbortSignal.timeout(15000) });
                if (!resp.ok) { console.warn(`[ical] ${tenantId}: HTTP ${resp.status}`); continue; }
                const text = await resp.text();
                const events = parseIcal(text);

                const batch = db.batch();
                let count = 0;
                for (const ev of events) {
                    const docId = `tw_${ev.uid.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                    const ref = db.doc(`tenants/${tenantId}/bookings/${docId}`);
                    const dateStr = ev.dtstart.toISOString().split('T')[0];
                    const timeStr = ev.dtstart.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
                    batch.set(ref, {
                        source: 'treatwell',
                        status: 'CONFIRMED',
                        icalUid: ev.uid,
                        summary: ev.summary,
                        service: ev.summary,
                        date: dateStr,
                        time: timeStr,
                        startTime: admin.firestore.Timestamp.fromDate(ev.dtstart),
                        endTime: ev.dtend ? admin.firestore.Timestamp.fromDate(ev.dtend) : null,
                        description: ev.description,
                        updatedAt: admin.firestore.Timestamp.now(),
                    }, { merge: true });
                    count++;
                }
                await batch.commit();
                await db.doc(`tenants/${tenantId}`).update({
                    treatwellLastSync: admin.firestore.Timestamp.now(),
                    treatwellSyncError: null,
                });
                console.log(`[ical] ${tenantId}: synced ${count} events`);
            } catch (err) {
                console.error(`[ical] ${tenantId} sync error:`, err.message);
                try {
                    await db.doc(`tenants/${tenantId}`).update({ treatwellSyncError: err.message });
                } catch {}
            }
        }
    }
);


