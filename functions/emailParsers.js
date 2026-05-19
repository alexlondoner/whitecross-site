'use strict';

const { google } = require('googleapis');
const admin = require('firebase-admin');

const MONTH_MAP = {
    january:1, february:2, march:3, april:4, may:5, june:6,
    july:7, august:8, september:9, october:10, november:11, december:12,
    jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
};

function addMins(ts, mins) {
    return admin.firestore.Timestamp.fromMillis(ts.toMillis() + mins * 60000);
}

// "15 May 2026" + "14:30" → Firestore Timestamp (Europe/London midnight offset)
function toStartTime(dateStr, timeStr) {
    const parts = dateStr.trim().split(/\s+/);
    const day   = parseInt(parts[0]);
    const month = MONTH_MAP[(parts[1] || '').toLowerCase()] || 1;
    const year  = parseInt(parts[2]);
    const [h, m] = (timeStr || '00:00').split(':').map(Number);
    // Build as UTC then shift by London offset (GMT = UTC+0, BST = UTC+1)
    // Use a Date string approach; London BST is UTC+1 May–Oct
    const isBST = month >= 4 && month <= 10;
    const offsetMs = isBST ? -60 * 60 * 1000 : 0;
    const utc = Date.UTC(year, month - 1, day, h, m) + offsetMs;
    return admin.firestore.Timestamp.fromMillis(utc);
}

// ── Service duration map (Booksy) ─────────────────────────────────────────────
const BOOKSY_DURATION_MAP = {
    'classic short back': 20, 'skin fade': 30, 'scissor cut': 30,
    'i cut royal': 60, 'i cut deluxe': 50, 'full skin fade': 40,
    'full experience': 30, 'senior full': 30, 'hot towel': 15,
    'clipper cut': 15, 'senior haircut': 20, 'young gents skin fade': 25,
    'young gents': 20, 'full facial': 10, 'beard dyeing': 20,
    'face mask': 10, 'face steam': 10, 'threading': 5,
    'waxing': 10, 'shape up': 15, 'wash': 10,
};

// ── Service price + duration map (Fresha) ────────────────────────────────────
const FRESHA_PRICE_MAP = {
    'full-experience':            { p: '£40', d: 30 },
    'full-skinfade-beard-luxury': { p: '£48', d: 40 },
    'i-cut-deluxe':               { p: '£55', d: 50 },
    'i-cut-royal':                { p: '£65', d: 60 },
    'senior-full-experience':     { p: '£35', d: 30 },
    'skin-fade':                  { p: '£32', d: 30 },
    'scissor-cut':                { p: '£30', d: 30 },
    'classic-sbs':                { p: '£28', d: 20 },
    'hot-towel-shave':            { p: '£22', d: 15 },
    'clipper-cut':                { p: '£22', d: 15 },
    'senior-haircut':             { p: '£23', d: 20 },
    'young-gents':                { p: '£20', d: 20 },
    'young-gents-skin-fade':      { p: '£24', d: 25 },
    'full-facial':                { p: '£24', d: 10 },
    'beard-dyeing':               { p: '£24', d: 20 },
    'face-mask':                  { p: '£12', d: 10 },
    'face-steam':                 { p: '£12', d: 10 },
    'threading':                  { p: '£10', d:  5 },
    'waxing':                     { p: '£10', d: 10 },
    'shape-up-clean-up':          { p: '£20', d: 15 },
    'wash-hot-towel':             { p: '£10', d: 10 },
};

// ── Gmail API helpers ─────────────────────────────────────────────────────────

function getGmailClient() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    return google.gmail({ version: 'v1', auth: oauth2Client });
}

function extractPlainText(payload) {
    if (!payload) return '';
    if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
        return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    if (payload.parts) {
        for (const part of payload.parts) {
            const text = extractPlainText(part);
            if (text) return text;
        }
    }
    return '';
}

async function fetchUnreadMessages(gmail, query) {
    const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 50 });
    if (!res.data.messages || res.data.messages.length === 0) return [];
    return Promise.all(
        res.data.messages.map(m =>
            gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' }).then(r => r.data)
        )
    );
}

async function markRead(gmail, messageId) {
    await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: { removeLabelIds: ['UNREAD'] },
    });
}

async function isDuplicateBooking(db, name, date, time) {
    const [byClientName, byName] = await Promise.all([
        db.collection('tenants/whitecross/bookings').where('clientName', '==', name).where('date', '==', date).where('time', '==', time).get(),
        db.collection('tenants/whitecross/bookings').where('name', '==', name).where('date', '==', date).where('time', '==', time).get(),
    ]);
    return !byClientName.empty || !byName.empty;
}

// ── Booksy: new booking confirmations ────────────────────────────────────────
// Subject format: "John Smith: 15 January 2026 14:30"
// Body:  Standard Packages: Skin Fade | with Alex | £32.00 | phone
async function parseBooksyConfirmations(gmail, db) {
    const messages = await fetchUnreadMessages(gmail, 'from:no-reply@booksy.com subject:"new booking" is:unread');
    for (const msg of messages) {
        try {
            const subject = (msg.payload.headers.find(h => h.name === 'Subject') || {}).value || '';
            const body    = extractPlainText(msg.payload);

            const nameMatch = subject.match(/^(.+?):/);
            const name      = nameMatch ? nameMatch[1].trim() : '';
            const dateMatch = subject.match(/(\d{1,2})\s(\w+)\s(\d{4})\s(\d{1,2}):(\d{2})/);
            if (!name || !dateMatch) { await markRead(gmail, msg.id); continue; }

            const bookingDate = `${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]}`;
            const bookingTime = `${dateMatch[4]}:${dateMatch[5]}`;

            const serviceMatch = body.match(/(?:Standard Packages?|Exclusive[^:]*):?\s*([^\n£\d]+)/i);
            const service      = serviceMatch ? serviceMatch[1].trim() : '';
            let duration = 30;
            for (const key of Object.keys(BOOKSY_DURATION_MAP)) {
                if (service.toLowerCase().includes(key)) { duration = BOOKSY_DURATION_MAP[key]; break; }
            }

            const phoneMatch  = body.match(/0[\d\s]{9,12}/);
            const phone       = phoneMatch ? phoneMatch[0].trim() : '';
            const emailMatch  = body.match(/[\w.-]+@[\w.-]+\.\w+/);
            const email       = emailMatch ? emailMatch[0] : '';
            const priceMatch  = body.match(/£([\d.]+)/);
            const price       = priceMatch ? `£${priceMatch[1]}` : '';
            const barberMatch = body.match(/with\s+(\w+)/i);
            const barber      = barberMatch ? barberMatch[1].toLowerCase() : 'alex';

            if (await isDuplicateBooking(db, name, bookingDate, bookingTime)) {
                await markRead(gmail, msg.id); continue;
            }

            const bookingId = `BOOKSY-${Date.now()}`;
            const booksyStart = toStartTime(bookingDate, bookingTime);
            await db.collection('tenants/whitecross/bookings').doc(bookingId).set({
                bookingId,
                clientName: name, clientEmail: email, clientPhone: phone,
                barberId: barber, serviceId: service, price,
                paidAmount: 10, platformDepositAmount: 10, paymentType: 'DEPOSIT', status: 'CONFIRMED', source: 'Booksy',
                date: bookingDate, time: bookingTime,
                startTime: booksyStart,
                endTime: addMins(booksyStart, duration),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Booksy confirmation: ${bookingId} ${name}`);
            await markRead(gmail, msg.id);
        } catch (err) {
            console.error('Booksy confirm error', msg.id, err.message);
        }
    }
}

// ── Booksy: cancellations ─────────────────────────────────────────────────────
// Subject format: "John Smith: Monday, 15 January 2026 14:30"
// Finds existing CONFIRMED booking and marks CANCELLED; creates record if not found.
async function parseBooksyCancellations(gmail, db) {
    const messages = await fetchUnreadMessages(gmail, 'from:no-reply@booksy.com subject:"cancelled appointment" is:unread');
    for (const msg of messages) {
        try {
            const subject = (msg.payload.headers.find(h => h.name === 'Subject') || {}).value || '';
            const body    = extractPlainText(msg.payload);

            const nameMatch = subject.match(/^(.+?):/);
            const name      = nameMatch ? nameMatch[1].trim() : '';
            const dateMatch = subject.match(/(\w+),\s+(\d{1,2})\s+(\w+)\s+(\d{4})\s+(\d{1,2}):(\d{2})/);
            if (!name || !dateMatch) { await markRead(gmail, msg.id); continue; }

            const bookingDate = `${dateMatch[2]} ${dateMatch[3]} ${dateMatch[4]}`;
            const bookingTime = `${dateMatch[5]}:${dateMatch[6]}`;

            const snap = await db.collection('tenants/whitecross/bookings')
                .where('name',   '==', name)
                .where('date',   '==', bookingDate)
                .where('time',   '==', bookingTime)
                .where('source', '==', 'Booksy')
                .get();

            if (!snap.empty) {
                for (const doc of snap.docs) {
                    if (doc.data().status !== 'CANCELLED') {
                        await doc.ref.update({
                            status: 'CANCELLED',
                            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                        console.log(`Booksy cancellation: updated ${doc.id} for ${name}`);
                    }
                }
            } else {
                const barberMatch  = body.match(/with\s+(\w+)/i);
                const serviceMatch = body.match(/Standard Packages?:\s*([^\n£\d,]+)/i);
                const priceMatch   = body.match(/£([\d.]+)/);
                const bookingId    = `BOOKSY-${Date.now()}`;
                await db.collection('tenants/whitecross/bookings').doc(bookingId).set({
                    bookingId,
                    clientName: name,
                    barberId:  barberMatch  ? barberMatch[1].toLowerCase()  : 'alex',
                    serviceId: serviceMatch ? serviceMatch[1].trim()         : '',
                    price:     priceMatch   ? `£${priceMatch[1]}`           : '',
                    status: 'CANCELLED', source: 'Booksy',
                    date: bookingDate, time: bookingTime,
                    startTime: toStartTime(bookingDate, bookingTime),
                    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                    createdAt:   admin.firestore.FieldValue.serverTimestamp(),
                });
                console.log(`Booksy cancellation: new CANCELLED record ${bookingId} for ${name}`);
            }
            await markRead(gmail, msg.id);
        } catch (err) {
            console.error('Booksy cancel error', msg.id, err.message);
        }
    }
}

// ── Fresha: appointment confirmations ────────────────────────────────────────
// Body: "Customer details: John Smith" | "Skin Fade with Alex" |
//       "Sunday, 12 Apr 2026, 1:30pm"
async function parseFreshaConfirmations(gmail, db) {
    const messages = await fetchUnreadMessages(gmail, 'from:fresha.com "Appointment confirmed" is:unread');
    for (const msg of messages) {
        try {
            const body = extractPlainText(msg.payload);

            const nameMatch = body.match(/Customer details:\s*([\s\S]*?)\n/i);
            const name      = nameMatch ? nameMatch[1].trim() : 'New Customer';

            const serviceBarberMatch = body.match(/(.+) with (\w+)/i);
            let service = '', barber = 'alex';
            if (serviceBarberMatch) {
                service = serviceBarberMatch[1].trim();
                barber  = serviceBarberMatch[2].trim().toLowerCase().includes('arda') ? 'arda' : 'alex';
            }

            const dtMatch = body.match(/(\w+), (\d{1,2}) (\w+) (\d{4}), (\d{1,2}):(\d{2})(am|pm)/i);
            if (!dtMatch) { await markRead(gmail, msg.id); continue; }

            const bookingDate = `${dtMatch[2]} ${dtMatch[3]} ${dtMatch[4]}`;
            let h = parseInt(dtMatch[5]), m = parseInt(dtMatch[6]);
            const ampm = dtMatch[7].toLowerCase();
            if (ampm === 'pm' && h < 12) h += 12;
            if (ampm === 'am' && h === 12) h = 0;
            const bookingTime = `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`;

            let price = '£0';
            let freshaDuration = 30;
            const cleanService = service.toLowerCase().replace(/\s+/g, '-');
            for (const key of Object.keys(FRESHA_PRICE_MAP)) {
                if (cleanService.includes(key) || key.includes(cleanService)) {
                    price = FRESHA_PRICE_MAP[key].p;
                    freshaDuration = FRESHA_PRICE_MAP[key].d || 30;
                    break;
                }
            }

            const phoneMatch = body.match(/(?:\+|0)[\d\s-]{9,17}/);
            const phone      = phoneMatch ? phoneMatch[0].replace(/[\s-]/g, '').trim() : '';
            const emailMatch = body.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            const email      = emailMatch ? emailMatch[0] : '';

            if (await isDuplicateBooking(db, name, bookingDate, bookingTime)) {
                await markRead(gmail, msg.id); continue;
            }

            const bookingId = `FRESHA-${Date.now()}`;
            const priceNum = parseFloat(String(price).replace(/[£,]/g, '')) || 0;
            const freshaStart = toStartTime(bookingDate, bookingTime);
            await db.collection('tenants/whitecross/bookings').doc(bookingId).set({
                bookingId,
                clientName: name, clientEmail: email, clientPhone: phone,
                barberId: barber, barberName: barber,
                serviceId: service, serviceName: service, price,
                status: 'CONFIRMED', source: 'Fresha',
                date: bookingDate, time: bookingTime,
                startTime: freshaStart,
                endTime: addMins(freshaStart, freshaDuration),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Fresha confirmation: ${bookingId} ${name}`);
            await markRead(gmail, msg.id);
        } catch (err) {
            console.error('Fresha confirm error', msg.id, err.message);
        }
    }
}

// ── Treatwell: new booking confirmations ─────────────────────────────────────
// Subject: "You've got a new Treatwell booking (Our Ref. T2181236951)"
// Body fields:
//   Product Name:   Ladies - Wash & Blow Dry
//   Date/time       11 May 2026 at 1:30 pm
//   Price paid:     £35.00
//   with            HERO
//   Guest name      Zlata Mechetina Repeat
//   Guest Email:    zl.mechetina@gmail.com
//   Guest Tel.:     +44 7796 563495
// Bookings are always pre-paid (Status: Prepaid) — no remaining to collect.
async function parseTreatwell(gmail, db) {
    const messages = await fetchUnreadMessages(gmail, 'from:noreply@treatwell.co.uk subject:"new Treatwell booking" is:unread');
    for (const msg of messages) {
        try {
            const headers = msg.payload.headers;
            const subject = (headers.find(h => h.name === 'Subject') || {}).value || '';
            const body    = extractPlainText(msg.payload);

            // Use Treatwell order ref as a stable, idempotent booking ID
            const refMatch = subject.match(/Our Ref\.\s*(T\d+)/i);
            const orderRef  = refMatch ? refMatch[1] : `${Date.now()}`;
            const bookingId = `TREATWELL-${orderRef}`;

            const existing = await db.collection('tenants/whitecross/bookings').doc(bookingId).get();
            if (existing.exists) { await markRead(gmail, msg.id); continue; }

            // Date/time: "Date/time    11 May 2026 at 1:30 pm"
            const dtMatch = body.match(/Date\/time\s+(\d{1,2})\s+(\w+)\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
            if (!dtMatch) { await markRead(gmail, msg.id); continue; }

            const bookingDate = `${dtMatch[1]} ${dtMatch[2]} ${dtMatch[3]}`;
            let h = parseInt(dtMatch[4]), m = parseInt(dtMatch[5]);
            const ampm = dtMatch[6].toLowerCase();
            if (ampm === 'pm' && h < 12) h += 12;
            if (ampm === 'am' && h === 12) h = 0;
            const bookingTime = `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`;

            // "Product Name:          Ladies - Wash & Blow Dry"
            const serviceMatch = body.match(/Product Name:\s*(.+?)(?:\s{2,}|\t|\r?\n)/i);
            const service      = serviceMatch ? serviceMatch[1].trim() : '';

            // "with    HERO" — two or more spaces distinguish it from prose "with"
            const barberMatch = body.match(/\bwith\s{2,}([\w\s]+?)(?:\r?\n|$)/im);
            const barberRaw   = barberMatch ? barberMatch[1].trim().toLowerCase() : '';
            const barber      = barberRaw.includes('arda') ? 'arda' : 'alex';

            // "Price paid:          £35.00"
            const priceMatch = body.match(/Price paid:\s*£([\d.]+)/i);
            const price      = priceMatch ? `£${priceMatch[1]}` : '';

            // "Guest name    Zlata Mechetina Repeat" — strip Treatwell's "Repeat"/"New" label
            const nameMatch = body.match(/Guest name\s+(.+?)(?:\s+Repeat|\s+New customer|\s+New)?\s*(?:\r?\n|$)/im);
            const name      = nameMatch ? nameMatch[1].replace(/\s+(Repeat|New customer|New)$/i, '').trim() : 'Guest';

            const emailMatch = body.match(/Guest Email:\s*([\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,})/i);
            const email      = emailMatch ? emailMatch[1].trim() : '';
            const phoneMatch = body.match(/Guest Tel\.:\s*([+\d][\d\s]+)/i);
            const phone      = phoneMatch ? phoneMatch[1].trim() : '';

            if (await isDuplicateBooking(db, name, bookingDate, bookingTime)) {
                await markRead(gmail, msg.id); continue;
            }

            let twDuration = 30;
            const twServiceLower = service.toLowerCase();
            for (const key of Object.keys(BOOKSY_DURATION_MAP)) {
                if (twServiceLower.includes(key)) { twDuration = BOOKSY_DURATION_MAP[key]; break; }
            }

            const priceNumTW = parseFloat(String(price).replace(/[£,]/g, '')) || 0;
            const treatwellStart = toStartTime(bookingDate, bookingTime);
            await db.collection('tenants/whitecross/bookings').doc(bookingId).set({
                bookingId,
                clientName: name, clientEmail: email, clientPhone: phone,
                barberId: barber, serviceId: service, price,
                paidAmount: priceNumTW, paymentType: 'FULL', status: 'CONFIRMED', source: 'Treatwell',
                date: bookingDate, time: bookingTime,
                startTime: treatwellStart,
                endTime: addMins(treatwellStart, twDuration),
                treatwellRef: orderRef,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Treatwell: ${bookingId} ${name}`);
            await markRead(gmail, msg.id);
        } catch (err) {
            console.error('Treatwell error', msg.id, err.message);
        }
    }
}

module.exports = {
    getGmailClient,
    parseBooksyConfirmations,
    parseBooksyCancellations,
    parseFreshaConfirmations,
    parseTreatwell,
};
