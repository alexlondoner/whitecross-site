const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const nodemailer = require('nodemailer');

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

exports.health = onRequest((req, res) => {
    res.status(200).send('ok');
});

exports.sendBookingConfirmation = onDocumentCreated(
    'tenants/whitecross/bookings/{bookingId}',
    async (event) => {
        const data = event.data.data();
        if (!data) return;

        const email = data.clientEmail;
        if (!email) return;

        const name = data.clientName || 'Guest';
        const service = SERVICE_NAMES[data.serviceId] || data.serviceId || 'Service';
        const barber = (data.barberId || 'TBC').toUpperCase();
        const bookingId = data.bookingId || event.params.bookingId;
        const paymentType = data.paymentType || 'FULL';

        // Tarih ve saat formatla
        let dateStr = 'TBC', timeStr = 'TBC';
        if (data.startTime) {
            const d = data.startTime.toDate();
            dateStr = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const h = d.getHours(), m = d.getMinutes();
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            timeStr = `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
        }

        // Ödeme satırları
        const depositMap = {
            'i-cut-royal': 10, 'i-cut-deluxe': 10,
            'full-skinfade-beard-luxury': 10, 'full-experience': 10,
        };
        const totalPrice = data.price ? `£${data.price}` : '';
        const depositAmount = depositMap[data.serviceId] || 10;
        const remainingAmount = data.price ? `£${data.price - depositAmount}` : '';
        const paymentRow = paymentType === 'DEPOSIT'
            ? `<p style="margin:10px 0;font-size:16px;"><strong style="color:#4caf50;">💳 Deposit paid:</strong> £${depositAmount}</p>
               <p style="margin:10px 0;font-size:16px;"><strong style="color:#ff9800;">💰 Remaining:</strong> ${remainingAmount} (pay on the day)</p>`
            : `<p style="margin:10px 0;font-size:16px;"><strong style="color:#4caf50;">💳 Paid in full:</strong> ${totalPrice}</p>`;

        // Cancel / Reschedule linkleri
        const baseUrl = 'https://whitecrossbarbers.com';
        const cancelUrl = `${baseUrl}/cancel.html?id=${bookingId}&email=${encodeURIComponent(email)}`;
        const rescheduleUrl = `${baseUrl}/Reschedule.html?id=${bookingId}&email=${encodeURIComponent(email)}`;

        const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family:'Inter',Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px;">
    <div style="max-width:600px;margin:0 auto;background:#111;color:#fff;border-radius:15px;border:1px solid #d4af37;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
        
        <!-- Header -->
        <div style="background:#000;padding:30px;text-align:center;border-bottom:2px solid #d4af37;">
            <img src="https://whitecrossbarbers.com/whitecross-logo.png" alt="I CUT Whitecross Barbers" style="width:80px;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;">
            <h1 style="margin:0;color:#d4af37;font-size:22px;letter-spacing:3px;text-transform:uppercase;">I CUT WHITECROSS</h1>
            <p style="color:#666;font-size:12px;margin:6px 0 0;letter-spacing:2px;text-transform:uppercase;">136 Whitecross Street · EC1Y 8QJ · London</p>
        </div>

        <!-- Body -->
        <div style="padding:35px 30px;text-align:center;">
            <p style="color:#d4af37;text-transform:uppercase;font-weight:bold;margin-bottom:8px;letter-spacing:2px;font-size:13px;">✅ Booking Confirmed</p>
            <h2 style="margin:0 0 24px 0;font-size:22px;color:#fff;">See you soon, ${name}!</h2>

            <div style="background:rgba(212,175,55,0.08);border:1px dashed rgba(212,175,55,0.5);padding:20px;border-radius:12px;margin-bottom:24px;text-align:left;">
                <p style="margin:10px 0;font-size:16px;"><strong style="color:#d4af37;">📅 Date:</strong> ${dateStr}</p>
                <p style="margin:10px 0;font-size:16px;"><strong style="color:#d4af37;">⏰ Time:</strong> ${timeStr}</p>
                <p style="margin:10px 0;font-size:16px;"><strong style="color:#d4af37;">✂️ Service:</strong> ${service}</p>
                <p style="margin:10px 0;font-size:16px;"><strong style="color:#d4af37;">💈 Barber:</strong> ${barber}</p>
                ${totalPrice ? `<p style="margin:10px 0;font-size:16px;"><strong style="color:#d4af37;">💷 Total:</strong> ${totalPrice}</p>` : ''}
                ${paymentRow}
                <p style="margin:10px 0;font-size:13px;color:#666;"><strong style="color:#aaa;">🔖 Booking ID:</strong> ${bookingId}</p>
            </div>

            <p style="color:#aaa;font-size:14px;line-height:1.7;margin-bottom:24px;">
                📍 <strong style="color:#fff;">136 Whitecross Street, London EC1Y 8QJ</strong><br>
                Nearest stations: Old Street · Barbican · Moorgate<br>
                Please arrive 5 minutes early.
            </p>

            <!-- Manage buttons -->
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:24px;">
                <a href="${rescheduleUrl}" style="display:inline-block;padding:12px 20px;background:transparent;border:2px solid #d4af37;color:#d4af37;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:1px;text-transform:uppercase;">🔄 Reschedule</a>
                <a href="${cancelUrl}" style="display:inline-block;padding:12px 20px;background:transparent;border:2px solid #ff5252;color:#ff5252;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:1px;text-transform:uppercase;">✕ Cancel</a>
            </div>

            <div style="border-top:1px solid #222;padding-top:20px;">
                <p style="color:#555;font-size:12px;line-height:1.7;">
                    Need help? Call us on <a href="tel:+442036215929" style="color:#d4af37;text-decoration:none;">020 3621 5929</a> or 
                    <a href="https://wa.me/447470108578" style="color:#25D366;text-decoration:none;">WhatsApp</a><br>
                    <a href="https://whitecrossbarbers.com/terms.html" style="color:#555;text-decoration:none;">Cancellation Policy</a>
                </p>
            </div>
        </div>

        <!-- Footer -->
        <div style="background:#000;padding:16px;text-align:center;border-top:1px solid #222;">
            <p style="color:#444;font-size:11px;margin:0;letter-spacing:1px;">© 2026 I CUT Whitecross Barbers · whitecrossbarbers.com</p>
        </div>
    </div>
</body>
</html>`;

        try {
            await transporter.sendMail({
                from: `"I CUT Whitecross Barbers" <${GMAIL_USER}>`,
                to: email,
                subject: `✅ Booking Confirmed – ${dateStr} at ${timeStr} | I CUT Whitecross`,
                html: htmlBody,
            });
            console.log(`Confirmation email sent to ${email}`);
        } catch (err) {
            console.error('Email send error:', err);
        }
    }
);
