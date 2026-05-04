const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

function getAdminDb() {
    return admin.firestore();
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

exports.sendBookingConfirmation = onDocumentCreated(
    'tenants/whitecross/bookings/{bookingId}',
    async (event) => {
        const data = event.data.data();
        if (!data) return;

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
