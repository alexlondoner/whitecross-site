const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');
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
async function writeNotification(db, tenantId, type, title, body, bookingId) {
    try {
        await db.collection(`tenants/${tenantId}/notifications`).add({
            type,
            title,
            body,
            bookingId: bookingId || null,
            read: false,
            createdAt: admin.firestore.Timestamp.now(),
        });
    } catch (err) {
        console.error('writeNotification error:', err);
    }
}


// For security, use Firebase Functions config for Gmail password
function getTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
    });
}

const SERVICE_NAMES = {
    'full-experience': 'The Full Experience',
    'full-skinfade-beard-luxury': 'Full Skin Fade & Beard Luxury',
    'full-skin-fade-beard-luxury': 'Full Skin Fade & Beard Luxury',
    'i-cut-deluxe': 'I CUT Deluxe',
    'i-cut-royal': 'I CUT Royal',
    'senior-full-experience': 'Senior Full Experience',
    'skin-fade': 'Skin Fade Cut',
    'scissor-cut': 'Scissor Cut',
    'classic-sbs': 'Classic Short Back & Sides',
    'hot-towel-shave': 'Hot Towel Shave',
    'clipper-cut': 'Clipper Cut',
    'senior-haircut': 'Senior Haircut (65+)',
    'young-gents': 'Young Gents (0-12)',
    'young-gents-skin-fade': 'Young Gents Skin Fade',
    'full-facial': 'Full Facial Treatment',
    'beard-dyeing': 'Beard Dyeing',
    'face-mask': 'Face Mask',
    'face-steam': 'Face Steam',
    'threading': 'Threading',
    'waxing': 'Waxing',
    'shape-up-clean-up': 'Shape Up & Clean Up',
    'wash-hot-towel': 'Wash, Style & Hot Towel'
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
        } = req.body || {};

        if (!bookingId || !serviceId || !price) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const isDeposit  = paymentType === 'DEPOSIT';
        const depositAmt = DEPOSIT_AMOUNTS[serviceId] || 10;
        const chargeGBP  = isDeposit ? depositAmt : Math.max(0, parseFloat(price) || 0);
        if (chargeGBP <= 0) { res.status(400).json({ error: 'Invalid amount' }); return; }

        try {
            const stripe  = new Stripe(stripeKey);
            const session = await stripe.checkout.sessions.create({
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
                    paymentState: 'PAID',
                    paidAt: admin.firestore.Timestamp.now(),
                    stripeSessionId: sessionId || null,
                    stripePaymentIntent: paymentIntent || null,
                    stripePaymentLink: paymentLink || null,
                    stripeEventId: event.id || null,
                    stripeAmountPaid: amountPaid,
                    paidAmount: paidAmount,
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
        const service     = SERVICE_NAMES[data.serviceId] || data.serviceId || 'Service';
        const barber      = (data.barberName || data.barberId || 'TBC').toUpperCase();
        const bookingId   = data.bookingId || event.params.bookingId;
        const paymentType = data.paymentType || 'FULL';

        let dateStr = 'TBC', timeStr = 'TBC';
        if (data.startTime) {
            const d = data.startTime.toDate();
            dateStr = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const h = d.getHours(), m = d.getMinutes();
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            timeStr = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
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

            <div style="border-top:1px solid #222;padding-top:30px;">
                <p style="color:#555;font-size:11px;letter-spacing:1px;line-height:2;">
                    CONTACT US: <a href="tel:+442036215929" style="color:#888;text-decoration:none;">020 3621 5929</a> | <a href="https://wa.me/447470108578" style="color:#25D366;text-decoration:none;">WHATSAPP</a><br>
                    <a href="https://whitecrossbarbers.com/terms.html" style="color:#444;text-decoration:underline;">Cancellation Policy</a>
                </p>
            </div>
        </div>

        <div style="padding:30px;text-align:center;">
            <p style="color:#333;font-size:10px;letter-spacing:2px;text-transform:uppercase;">© 2026 I CUT Whitecross Barbers</p>
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
        const service     = SERVICE_NAMES[data.serviceId] || data.serviceId || 'Service';
        const barber      = (data.barberName || data.barberId || 'TBC').toUpperCase();
        const bookingId   = data.bookingId || event.params.bookingId;
        const paymentType = data.paymentType || 'FULL';

        let dateStr = 'TBC', timeStr = 'TBC';
        if (data.startTime) {
            const d = data.startTime.toDate();
            dateStr = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const h = d.getHours(), m = d.getMinutes();
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            timeStr = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
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
            <div style="border-top:1px solid #222;padding-top:30px;">
                <p style="color:#555;font-size:11px;letter-spacing:1px;line-height:2;">
                    CONTACT US: <a href="tel:+442036215929" style="color:#888;text-decoration:none;">020 3621 5929</a> | <a href="https://wa.me/447470108578" style="color:#25D366;text-decoration:none;">WHATSAPP</a><br>
                    <a href="https://whitecrossbarbers.com/terms.html" style="color:#444;text-decoration:underline;">Cancellation Policy</a>
                </p>
            </div>
        </div>
        <div style="padding:30px;text-align:center;">
            <p style="color:#333;font-size:10px;letter-spacing:2px;text-transform:uppercase;">© 2026 I CUT Whitecross Barbers</p>
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
        const ONLINE_SOURCES = ['booksy', 'fresha', 'website'];
        if (!ONLINE_SOURCES.includes(source)) return;

        const token      = process.env.WC_TELEGRAM_TOKEN;
        const chatIdsRaw = process.env.WC_TELEGRAM_CHAT_IDS;
        if (!token || !chatIdsRaw) {
            console.warn('notifyNewBooking: WC_TELEGRAM_TOKEN or WC_TELEGRAM_CHAT_IDS not set');
            return;
        }

        const name      = data.clientName || 'Guest';
        const service   = SERVICE_NAMES[data.serviceId] || data.serviceId || 'Service';
        const barber    = (data.barberName || data.barberId || 'TBC').toUpperCase();
        const bookingId = data.bookingId || event.params.bookingId;
        const srcLabel  = source.charAt(0).toUpperCase() + source.slice(1);

        let dateStr = 'TBC', timeStr = 'TBC';
        if (data.startTime) {
            const d = data.startTime.toDate();
            dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
            const h = d.getHours(), m = d.getMinutes();
            const ampm = h >= 12 ? 'PM' : 'AM';
            timeStr = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
        }

        const phone = data.clientPhone ? `\n📞 ${data.clientPhone}` : '';
        const msg = `📅 <b>New Booking</b> · ${srcLabel}\n👤 ${name}${phone}\n✂️ ${service}\n💈 ${barber}\n🕐 ${dateStr} at ${timeStr}\n🆔 <code>${bookingId}</code>`;

        try {
            await sendTelegramMessage(token, chatIdsRaw, msg);
            console.log(`Telegram sent for ${bookingId}`);
        } catch (err) {
            console.error('Telegram error:', err);
        }
        await writeNotification(getAdminDb(), 'whitecross', 'new_booking', 'New Booking', `${name} – ${service} · ${dateStr} at ${timeStr}`, bookingId);
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
            dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
            const h = d.getHours(), m = d.getMinutes();
            const ampm = h >= 12 ? 'PM' : 'AM';
            timeStr = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
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

        const source = String(after.source || '').trim().toLowerCase();
        const ONLINE_SOURCES = ['booksy', 'fresha', 'website'];
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
            dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
            const h = d.getHours(), m = d.getMinutes();
            const ampm = h >= 12 ? 'PM' : 'AM';
            timeStr = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
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
            const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
            const h = d.getHours(), m = d.getMinutes();
            const ampm = h >= 12 ? 'PM' : 'AM';
            return `${dateStr} at ${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
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
        await writeNotification(getAdminDb(), 'whitecross', 'rescheduled', 'Booking Rescheduled', `${name} – ${service} → ${newDateTime}`, bookingId);
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
        if (newStatus !== 'CHECKED_OUT' || prevStatus === 'CHECKED_OUT') return;

        const email = after.clientEmail;
        if (!email) return;

        const db = getAdminDb();

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
        const todayPaid   = parseFloat(String(after.paidAmount || '0').replace('£', '')) || 0;
        const fullPrice   = parseFloat(String(after.price || '0').replace('£', '')) || todayPaid;
        const isDeposit   = after.paymentType === 'DEPOSIT' && fullPrice > todayPaid;
        const depositPaid = isDeposit ? (DEPOSIT_AMOUNTS[after.serviceId] || DEPOSIT_AMOUNTS[after.service] || 10) : 0;
        const paidAmount  = isDeposit ? fullPrice : todayPaid;  // show full service value as total
        const pointsEarned = after.loyaltyPointsEarned || 0;
        const redeemed    = after.loyaltyPointsRedeemed || 0;
        const discount    = parseFloat(String(after.discount || '0').replace('£', '')) || 0;

        let dateStr = 'Today';
        if (after.startTime) {
            const d = after.startTime.toDate();
            dateStr = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        }

        // Loyalty progress
        const REDEEM_RATE = 20; // 20pts = £1
        const milestones = [100, 250, 500, 1000];
        const nextMilestone = milestones.find(m => loyaltyPoints < m) || 1000;
        const prevMilestone = milestones[milestones.indexOf(nextMilestone) - 1] || 0;
        const progressPct = Math.min(Math.round(((loyaltyPoints - prevMilestone) / (nextMilestone - prevMilestone)) * 100), 100);
        const redeemable = Math.floor(loyaltyPoints / REDEEM_RATE);

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
                ${redeemable > 0 ? `
                <div style="margin:0 24px 18px;padding:14px;background:#0f1f0f;border:1px solid #1e3d1e;border-radius:3px;text-align:center;">
                    <p style="margin:0;color:#4caf50;font-size:18px;font-weight:800;">£${redeemable} available to redeem</p>
                    <p style="margin:4px 0 0 0;color:#2e7d32;font-size:11px;">Tell your barber at your next visit · Min 20 pts</p>
                </div>
                ` : `
                <div style="margin:0 24px 18px;padding:12px;background:#111;border:1px solid #222;border-radius:3px;text-align:center;">
                    <p style="margin:0;color:#555;font-size:12px;">${20 - loyaltyPoints > 0 ? (20 - loyaltyPoints) + ' more points until your first £1 off' : 'Redeem at your next visit'}</p>
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
                    ` : `
                    <tr style="border-top:1px solid #222;">
                        <td style="color:#d4af37;font-size:13px;text-transform:uppercase;letter-spacing:1px;padding-top:12px;font-weight:700;">Total Paid</td>
                        <td style="color:#d4af37;font-size:20px;font-weight:800;text-align:right;padding-top:12px;">£${paidAmount.toFixed(2)}</td>
                    </tr>
                    `}
                </table>
            </div>

            ${memberSection}
            ${pointsSection}

            <!-- Footer contact -->
            <div style="border-top:1px solid #1e1e1e;padding-top:24px;text-align:center;margin-top:8px;">
                <p style="color:#555;font-size:11px;line-height:2;letter-spacing:0.5px;">
                    136 Whitecross Street, London EC1Y 8QJ<br>
                    <a href="tel:+442036215929" style="color:#666;text-decoration:none;">020 3621 5929</a> ·
                    <a href="https://wa.me/447470108578" style="color:#25D366;text-decoration:none;">WhatsApp</a>
                </p>
            </div>
        </div>

        <!-- Footer -->
        <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-top:none;border-radius:0 0 4px 4px;padding:20px;text-align:center;">
            <p style="margin:0;color:#2a2a2a;font-size:10px;letter-spacing:2px;text-transform:uppercase;">© 2026 I CUT Whitecross Barbers</p>
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
        } catch (err) {
            console.error('sendLoyaltyCardEmail error:', err);
        }
    }
);

// ── ONE-TIME: backfill loyalty points from checkout history ───────────────────
