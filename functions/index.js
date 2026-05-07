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

const GMAIL_USER = 'whitecrossbarbers@gmail.com';
const GMAIL_PASS = 'YOUR_APP_PASSWORD_HERE'; // Gmail App Password

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
});

const SERVICE_NAMES = {
    'full-experience': 'The Full Experience',
    'full-skinfade-beard-luxury': 'Full Skin Fade & Beard Luxury',
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
    'full-skinfade-beard-luxury': 10, 'full-experience': 10,
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
                    bookingId:   bookingId,
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
            if (event.type === 'checkout.session.completed') {
                const session = event.data.object || {};
                const metadataBookingId = String(session?.metadata?.bookingId || '').trim();
                const email = String(session?.customer_details?.email || session?.customer_email || '').trim();
                const amountPaid = Number.isFinite(session?.amount_total) ? session.amount_total / 100 : null;

                const db = getAdminDb();
                let targetRef = null;

                // Preferred match: explicit bookingId metadata (future-proof if added later).
                if (metadataBookingId) {
                    const q = await db
                        .collection('tenants/whitecross/bookings')
                        .where('bookingId', '==', metadataBookingId)
                        .limit(1)
                        .get();
                    if (!q.empty) targetRef = q.docs[0].ref;
                }

                // Fallback match for current Payment Link flow: latest pending by email.
                if (!targetRef && email) {
                    const q = await db
                        .collection('tenants/whitecross/bookings')
                        .where('status', '==', 'PENDING')
                        .where('source', '==', 'website')
                        .where('clientEmail', '==', email)
                        .get();

                    if (!q.empty) {
                        const docs = q.docs.slice().sort((a, b) => {
                            const av = a.get('pendingCreatedAt') || a.get('createdAt') || a.get('updatedAt');
                            const bv = b.get('pendingCreatedAt') || b.get('createdAt') || b.get('updatedAt');
                            const am = av?.toMillis ? av.toMillis() : 0;
                            const bm = bv?.toMillis ? bv.toMillis() : 0;
                            return bm - am;
                        });
                        targetRef = docs[0].ref;
                    }
                }

                if (!targetRef) {
                    // No PENDING found — if session has full metadata, create a CONFIRMED booking
                    const meta = session?.metadata || {};
                    if (meta.bookingId && meta.serviceId && meta.date && meta.time) {
                        console.log('stripeWebhook: no pending found, creating CONFIRMED from metadata', meta.bookingId);
                        const months = { January:0, February:1, March:2, April:3, May:4, June:5, July:6, August:7, September:8, October:9, November:10, December:11 };
                        let startTime = null, endTime = null;
                        try {
                            const dateParts = meta.date.split('-'); // YYYY-MM-DD
                            const [th, tm, ap] = (meta.time.match(/(\d+):(\d+)\s*(AM|PM)/i) || []).slice(1);
                            let h = parseInt(th), m = parseInt(tm);
                            if (ap?.toUpperCase() === 'PM' && h !== 12) h += 12;
                            if (ap?.toUpperCase() === 'AM' && h === 12) h = 0;
                            const d = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), h, m, 0);
                            startTime = admin.firestore.Timestamp.fromDate(d);
                            endTime   = admin.firestore.Timestamp.fromDate(new Date(d.getTime() + 30 * 60 * 1000));
                        } catch {}

                        const newRef = db.collection('tenants/whitecross/bookings').doc();
                        await newRef.set({
                            bookingId:      meta.bookingId,
                            tenantId:       'whitecross',
                            clientName:     meta.clientName  || 'Guest',
                            clientEmail:    meta.clientEmail || email || '',
                            clientPhone:    meta.clientPhone || '',
                            barberId:       meta.barberId    || '',
                            barberName:     meta.barberName  || '',
                            serviceId:      meta.serviceId,
                            price:          parseFloat(meta.price) || 0,
                            paymentType:    meta.paymentType || 'FULL',
                            status:         'CONFIRMED',
                            paymentState:   'PAID',
                            source:         'website',
                            paidAt:         admin.firestore.Timestamp.now(),
                            stripeSessionId: session.id || null,
                            stripeAmountPaid: amountPaid,
                            stripeEventId:  event.id || null,
                            startTime:      startTime,
                            endTime:        endTime,
                            createdAt:      admin.firestore.Timestamp.now(),
                            updatedAt:      admin.firestore.Timestamp.now(),
                            note:           'Auto-created by Stripe webhook (no matching pending)',
                        });
                    } else {
                        console.warn('stripeWebhook: no matching pending booking and insufficient metadata', {
                            email, metadataBookingId, sessionId: session.id,
                        });
                    }
                } else {
                    await targetRef.set(
                        {
                            status: 'CONFIRMED',
                            paymentState: 'PAID',
                            paidAt: admin.firestore.Timestamp.now(),
                            stripeSessionId: session.id || null,
                            stripePaymentIntent: session.payment_intent || null,
                            stripePaymentLink: session.payment_link || null,
                            stripeEventId: event.id || null,
                            stripeAmountPaid: amountPaid,
                            updatedAt: admin.firestore.Timestamp.now(),
                        },
                        { merge: true }
                    );
                    console.log('stripeWebhook: booking confirmed from Stripe webhook', {
                        ref: targetRef.path,
                        email,
                        sessionId: session.id,
                    });
                }
            }

            res.status(200).json({ received: true });
        } catch (err) {
            console.error('stripeWebhook processing error:', err);
            res.status(500).send('Webhook processing error');
        }
    }
);

exports.sendBookingConfirmation = onDocumentCreated(
    'tenants/whitecross/bookings/{bookingId}',
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
        const totalPriceStr  = totalPriceNum ? `£${totalPriceNum}` : '';
        const depositAmount  = DEPOSIT_AMOUNTS[data.serviceId] || 10;
        const remainingAmount = totalPriceNum ? totalPriceNum - depositAmount : 0;

        const paymentRow = paymentType === 'DEPOSIT'
            ? `<tr>
                <td style="padding:8px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Deposit Paid</td>
                <td style="padding:8px 0;color:#4caf50;font-size:15px;text-align:right;font-weight:700;">£${depositAmount}</td>
               </tr>
               <tr>
                <td style="padding:8px 0;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Remaining</td>
                <td style="padding:8px 0;color:#ff9800;font-size:15px;text-align:right;font-weight:700;">£${remainingAmount} on the day</td>
               </tr>`
            : `<tr>
                <td style="padding:15px 0 8px 0;border-top:1px solid #222;color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Paid in Full ✓</td>
                <td style="padding:15px 0 8px 0;border-top:1px solid #222;color:#4caf50;font-size:15px;text-align:right;font-weight:700;">${totalPriceStr}</td>
               </tr>`;

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
        <a href="${cancelUrl}" style="display:inline-block;width:180px;margin:5px;padding:15px 0;background:transparent;border:1px solid #444;color:#666;border-radius:2px;text-decoration:none;font-weight:700;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Cancel Appointment</a>
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
            await transporter.sendMail({
                from: `"I CUT Whitecross Barbers" <${GMAIL_USER}>`,
                to: email,
                subject: `Booking Confirmed – ${dateStr} at ${timeStr} | I CUT Whitecross`,
                html: htmlBody,
            });
            console.log(`Confirmation email sent to ${email}`);
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
