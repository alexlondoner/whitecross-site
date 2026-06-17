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

// Fallback: extract raw text from HTML by stripping tags
function extractHtmlAsText(payload) {
    if (!payload) return '';
    if (payload.mimeType === 'text/html' && payload.body && payload.body.data) {
        const html = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        return html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(?:p|div|td|tr|li|h[1-6])>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
            .replace(/[ \t]{2,}/g, '  ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
    if (payload.parts) {
        for (const part of payload.parts) {
            const text = extractHtmlAsText(part);
            if (text) return text;
        }
    }
    return '';
}

function sinceDate7Days() {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

async function fetchRecentMessages(gmail, query) {
    const fullQuery = `${query} after:${sinceDate7Days()}`;
    const res = await gmail.users.messages.list({ userId: 'me', q: fullQuery, maxResults: 50 });
    if (!res.data.messages || res.data.messages.length === 0) return [];
    return Promise.all(
        res.data.messages.map(m =>
            gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' }).then(r => r.data)
        )
    );
}

async function hasExternalId(db, tenantPath, externalId) {
    const snap = await db.collection(`${tenantPath}/bookings`)
        .where('externalId', '==', externalId)
        .limit(1)
        .get();
    return !snap.empty;
}

async function isDuplicateBooking(db, name, date, time) {
    const [byClientName, byName] = await Promise.all([
        db.collection('tenants/whitecross/bookings').where('clientName', '==', name).where('date', '==', date).where('time', '==', time).get(),
        db.collection('tenants/whitecross/bookings').where('name', '==', name).where('date', '==', date).where('time', '==', time).get(),
    ]);
    return !byClientName.empty || !byName.empty;
}

// ── Booksy: new booking confirmations ────────────────────────────────────────
// Subject: old format "John Smith: 17 June 2026 15:00" OR new format "John Smith: new booking"
// Body:  Wednesday, 17 June 2026, 15:00 - 15:25 / Standard Packages: Classic Short Back and Side / with Alex
async function parseBooksyConfirmations(gmail, db) {
    const messages = await fetchRecentMessages(gmail, 'from:no-reply@booksy.com subject:"new booking"');
    for (const msg of messages) {
        try {
            const subject = (msg.payload.headers.find(h => h.name === 'Subject') || {}).value || '';
            const body    = extractPlainText(msg.payload) || extractHtmlAsText(msg.payload);

            const nameMatch = subject.match(/^(.+?):/);
            const name      = nameMatch ? nameMatch[1].trim() : '';
            if (!name) continue;

            // Old format: date in subject. New format: parse date from body.
            let bookingDate, bookingTime;
            const subjDate = subject.match(/(\d{1,2})\s(\w+)\s(\d{4})\s(\d{1,2}):(\d{2})/);
            if (subjDate) {
                bookingDate = `${subjDate[1]} ${subjDate[2]} ${subjDate[3]}`;
                bookingTime = `${subjDate[4]}:${subjDate[5]}`;
            } else {
                // "Wednesday, 17 June 2026, 15:00 - 15:25"
                const bodyDate = body.match(/\w+,\s+(\d{1,2})\s+(\w+)\s+(\d{4}),\s+(\d{1,2}):(\d{2})/);
                if (!bodyDate) continue;
                bookingDate = `${bodyDate[1]} ${bodyDate[2]} ${bodyDate[3]}`;
                bookingTime = `${bodyDate[4]}:${bodyDate[5]}`;
            }

            const refMatch   = body.match(/Booking\s*#\s*(\d+)/i) || body.match(/\bID[:\s]+(\d{5,})/i);
            const externalId = refMatch
                ? `BOOKSY-${refMatch[1]}`
                : `BOOKSY-${name.replace(/\s+/g,'-')}-${bookingDate.replace(/\s+/g,'-')}-${bookingTime}`;

            if (await hasExternalId(db, 'tenants/whitecross', externalId)) continue;

            const serviceMatch = body.match(/(?:Standard Packages?|Exclusive[^:]*):?\s*([^\n£\d]+)/i);
            const service      = serviceMatch ? serviceMatch[1].trim() : '';

            // Duration: derive from time range in body, fall back to map
            let duration = 30;
            const timeRange = body.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
            if (timeRange) {
                const startM = parseInt(timeRange[1]) * 60 + parseInt(timeRange[2]);
                const endM   = parseInt(timeRange[3]) * 60 + parseInt(timeRange[4]);
                if (endM > startM) duration = endM - startM;
            } else {
                for (const key of Object.keys(BOOKSY_DURATION_MAP)) {
                    if (service.toLowerCase().includes(key)) { duration = BOOKSY_DURATION_MAP[key]; break; }
                }
            }

            // Price: look up from Firestore services (single source of truth)
            let price = '';
            if (service) {
                try {
                    const svcSnap = await db.collection('tenants/whitecross/services')
                        .where('name', '==', service).limit(1).get();
                    if (!svcSnap.empty) {
                        const svcData = svcSnap.docs[0].data();
                        const p = svcData.price || (svcData.variations && svcData.variations[0]?.price) || 0;
                        if (p) price = `£${parseFloat(p).toFixed(2)}`;
                    }
                } catch {}
            }
            // Fallback: extract from email body
            if (!price) {
                const priceMatch = body.match(/£([\d.]+)/);
                price = priceMatch ? `£${priceMatch[1]}` : '';
            }

            const phoneMatch  = body.match(/0[\d\s]{9,12}/);
            const phone       = phoneMatch ? phoneMatch[0].trim() : '';
            const emailMatch  = body.match(/[\w.-]+@[\w.-]+\.\w+/);
            const email       = emailMatch ? emailMatch[0] : '';
            const barberMatch = body.match(/with\s+(\w+)/i);
            const barber      = barberMatch ? barberMatch[1].toLowerCase() : 'alex';

            const bookingId   = externalId;
            const booksyStart = toStartTime(bookingDate, bookingTime);
            await db.collection('tenants/whitecross/bookings').doc(bookingId).set({
                bookingId,
                externalId,
                rawEmailSubject: subject,
                parsedAt: admin.firestore.FieldValue.serverTimestamp(),
                clientName: name, clientEmail: email, clientPhone: phone,
                barberId: barber, serviceId: service, price,
                paidAmount: 10, platformDepositAmount: 10, paymentType: 'DEPOSIT', status: 'CONFIRMED', source: 'Booksy',
                date: bookingDate, time: bookingTime,
                startTime: booksyStart,
                endTime: addMins(booksyStart, duration),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Booksy confirmation: ${bookingId} ${name} service:${service} price:${price}`);
        } catch (err) {
            console.error('Booksy confirm error', msg.id, err.message);
        }
    }
}

// ── Booksy: cancellations ─────────────────────────────────────────────────────
// Subject format: "John Smith: Monday, 15 January 2026 14:30"
// Finds existing CONFIRMED booking and marks CANCELLED; creates record if not found.
async function parseBooksyCancellations(gmail, db) {
    const messages = await fetchRecentMessages(gmail, 'from:no-reply@booksy.com subject:"cancelled appointment"');
    for (const msg of messages) {
        try {
            const subject = (msg.payload.headers.find(h => h.name === 'Subject') || {}).value || '';
            const body    = extractPlainText(msg.payload) || extractHtmlAsText(msg.payload);

            const nameMatch = subject.match(/^(.+?):/);
            const name      = nameMatch ? nameMatch[1].trim() : '';
            const dateMatch = subject.match(/(\w+),\s+(\d{1,2})\s+(\w+)\s+(\d{4})\s+(\d{1,2}):(\d{2})/);
            if (!name || !dateMatch) continue;

            const bookingDate = `${dateMatch[2]} ${dateMatch[3]} ${dateMatch[4]}`;
            const bookingTime = `${dateMatch[5]}:${dateMatch[6]}`;

            const refMatch   = body.match(/Booking\s*#\s*(\d+)/i) || body.match(/\bID[:\s]+(\d{5,})/i);
            const externalId = refMatch
                ? `BOOKSY-${refMatch[1]}`
                : `BOOKSY-CANCEL-${name.replace(/\s+/g,'-')}-${bookingDate.replace(/\s+/g,'-')}-${bookingTime}`;

            // Try to cancel existing booking by externalId first, then by name+date+time
            const byRef = refMatch
                ? await db.collection('tenants/whitecross/bookings').doc(`BOOKSY-${refMatch[1]}`).get()
                : null;

            const snap = (!byRef || !byRef.exists)
                ? await db.collection('tenants/whitecross/bookings')
                    .where('clientName', '==', name).where('date', '==', bookingDate)
                    .where('time', '==', bookingTime).where('source', '==', 'Booksy').get()
                : null;

            if (byRef && byRef.exists) {
                if (byRef.data().status !== 'CANCELLED') {
                    await byRef.ref.update({ status: 'CANCELLED', cancelledAt: admin.firestore.FieldValue.serverTimestamp() });
                    console.log(`Booksy cancellation: updated ${byRef.id} for ${name}`);
                }
            } else if (snap && !snap.empty) {
                for (const d of snap.docs) {
                    if (d.data().status !== 'CANCELLED') {
                        await d.ref.update({ status: 'CANCELLED', cancelledAt: admin.firestore.FieldValue.serverTimestamp() });
                        console.log(`Booksy cancellation: updated ${d.id} for ${name}`);
                    }
                }
            } else if (!await hasExternalId(db, 'tenants/whitecross', externalId)) {
                const barberMatch  = body.match(/with\s+(\w+)/i);
                const serviceMatch = body.match(/Standard Packages?:\s*([^\n£\d,]+)/i);
                const priceMatch   = body.match(/£([\d.]+)/);
                await db.collection('tenants/whitecross/bookings').doc(externalId).set({
                    bookingId: externalId, externalId,
                    rawEmailSubject: subject,
                    parsedAt: admin.firestore.FieldValue.serverTimestamp(),
                    clientName: name,
                    barberId:  barberMatch  ? barberMatch[1].toLowerCase() : 'alex',
                    serviceId: serviceMatch ? serviceMatch[1].trim()        : '',
                    price:     priceMatch   ? `£${priceMatch[1]}`          : '',
                    status: 'CANCELLED', source: 'Booksy',
                    date: bookingDate, time: bookingTime,
                    startTime: toStartTime(bookingDate, bookingTime),
                    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
                    createdAt:   admin.firestore.FieldValue.serverTimestamp(),
                });
                console.log(`Booksy cancellation: new CANCELLED record ${externalId} for ${name}`);
            }
        } catch (err) {
            console.error('Booksy cancel error', msg.id, err.message);
        }
    }
}

// ── Fresha: appointment confirmations ────────────────────────────────────────
// Body: "Customer details: John Smith" | "Skin Fade with Alex" |
//       "Sunday, 12 Apr 2026, 1:30pm"
async function parseFreshaConfirmations(gmail, db) {
    const messages = await fetchRecentMessages(gmail, 'from:fresha.com');
    for (const msg of messages) {
        try {
            const subject = (msg.payload.headers.find(h => h.name === 'Subject') || {}).value || '';
            const body    = extractPlainText(msg.payload);
            console.log(`Fresha email found — subject: "${subject}" body[:120]: ${body.slice(0,120).replace(/\n/g,' ')}`);

            // Only process appointment notifications, skip marketing/receipts
            const lsubj = subject.toLowerCase();
            if (!lsubj.includes('appointment') && !lsubj.includes('booking') && !lsubj.includes('reservation')) {
                continue;
            }

            // Name: try several Fresha body formats
            const nameMatch = body.match(/Customer(?:\s+details)?:?\s*([\w][\w\s'-]{1,50}?)(?:\n|$)/i)
                           || body.match(/Client(?:\s+name)?:?\s*([\w][\w\s'-]{1,50}?)(?:\n|$)/i)
                           || body.match(/Name:?\s*([\w][\w\s'-]{1,50}?)(?:\n|$)/i);
            const name = nameMatch ? nameMatch[1].trim() : 'New Customer';

            // Service + barber: "Skin Fade with Alex" OR "Service: Skin Fade\nBarber: Alex"
            let service = '', barber = 'alex';
            const sbMatch = body.match(/(.+?)\s+with\s+(\w+)/i);
            const svcMatch = body.match(/Service(?:\s+name)?:?\s*(.+?)(?:\n|$)/i);
            const brbMatch = body.match(/(?:Barber|Staff|Employee|Provider|with):?\s*(\w+)/i);
            if (sbMatch) {
                service = sbMatch[1].trim();
                barber  = sbMatch[2].toLowerCase().includes('arda') ? 'arda' : 'alex';
            } else {
                if (svcMatch) service = svcMatch[1].trim();
                if (brbMatch) barber  = brbMatch[1].toLowerCase().includes('arda') ? 'arda' : 'alex';
            }

            // Date/time: "Sunday, 12 Apr 2026, 1:30pm"  OR  "12 Apr 2026 at 1:30pm"  OR  "12/04/2026 13:30"
            const dtMatch = body.match(/(\w+),?\s*(\d{1,2})\s+(\w+)\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(am|pm)/i)
                         || body.match(/(\d{1,2})\s+(\w+)\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
            if (!dtMatch) { console.log(`Fresha: no date match in email ${msg.id}, skipping`); continue; }

            // Handle both regex formats: with day-of-week prefix (7 groups) or without (6 groups)
            let day, month, year, rawH, rawM, ampm;
            if (dtMatch.length === 8) {
                // "Sunday, 12 Apr 2026, 1:30pm"
                [, , day, month, year, rawH, rawM, ampm] = dtMatch;
            } else {
                // "12 Apr 2026 at 1:30pm"
                [, day, month, year, rawH, rawM, ampm] = dtMatch;
            }
            const bookingDate = `${day} ${month} ${year}`;
            let h = parseInt(rawH), m2 = parseInt(rawM);
            const ampmL = (ampm || '').toLowerCase();
            if (ampmL === 'pm' && h < 12) h += 12;
            if (ampmL === 'am' && h === 12) h = 0;
            const bookingTime = `${h < 10 ? '0' + h : h}:${m2 < 10 ? '0' + m2 : m2}`;

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

            const freshaRefMatch = body.match(/[Rr]ef(?:erence)?[:\s#]+([A-Z0-9-]{4,20})/i)
                                || body.match(/[Cc]onfirmation[:\s#]+([A-Z0-9-]{4,20})/i)
                                || body.match(/Order\s*(?:ref|#|number)[:\s]+([A-Z0-9-]{4,20})/i);
            const externalId = freshaRefMatch
                ? `FRESHA-${freshaRefMatch[1]}`
                : `FRESHA-${name.replace(/\s+/g,'-')}-${bookingDate.replace(/\s+/g,'-')}-${bookingTime}`;

            if (await hasExternalId(db, 'tenants/whitecross', externalId)) continue;

            const bookingId = externalId;
            const freshaStart = toStartTime(bookingDate, bookingTime);
            await db.collection('tenants/whitecross/bookings').doc(bookingId).set({
                bookingId,
                externalId,
                rawEmailSubject: subject,
                parsedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        } catch (err) {
            console.error('Fresha confirm error', msg.id, err.message);
        }
    }
}

// ── Treatwell: new booking confirmations ─────────────────────────────────────
// Old subject: "You've got a new Treatwell booking (Our Ref. T2181236951)"
// New subject: "Congratulations, you've got a new customer via Treatwell!"
// Body fields (new format):
//   Product Name:          Young Gents Skin Fade (4–12)
//   Date/time    25 May 2026 at 9:00 am
//   Price    £24.00
//   with    Arda Uzun
//   Status    Unpaid
//   Guest name    Juan David Mejia Alvarez New
//   Guest Email:    j.david31m@gmail.com
//   Guest Tel.:    +44 7440 160204
//   Order ref #: T2182596753   (body, not subject)
async function parseTreatwell(gmail, db) {
    const messages = await fetchRecentMessages(
        gmail,
        'from:noreply@treatwell.co.uk (subject:"new Treatwell booking" OR subject:"via Treatwell" OR subject:"new customer" OR subject:"rescheduled")'
    );
    for (const msg of messages) {
        try {
            const headers = msg.payload.headers;
            const subject = (headers.find(h => h.name === 'Subject') || {}).value || '';
            let body = extractPlainText(msg.payload);
            // Treatwell sends HTML-only emails — fall back to stripping HTML
            if (!body) body = extractHtmlAsText(msg.payload);
            console.log(`Treatwell email found — subject: "${subject}" bodyLen: ${body.length} body[:200]: ${body.slice(0,200).replace(/\n/g,' ')}`);

            const isReschedule = /has been rescheduled/i.test(body);

            // Skip non-booking emails (receipts, newsletters, etc.) that slip through
            if (!body.includes('Guest name') && !body.includes('Product Name') && !isReschedule) {
                console.log('Treatwell: skipping — no Guest name or Product Name in body');
                continue;
            }

            // Order ref: old format in subject "Our Ref. T123", new format in body "Order ref #: T123"
            const refMatch = subject.match(/Our Ref\.\s*(T\d+)/i) || body.match(/Order ref #?:?\s*(T\d+)/i);
            const orderRef  = refMatch ? refMatch[1] : `${Date.now()}`;
            const bookingId = `TREATWELL-${orderRef}`;

            const existing = await db.collection('tenants/whitecross/bookings').doc(bookingId).get();
            if (existing.exists && !isReschedule) continue;

            // Date/time: "Date/time    25 May 2026 at 9:00 am"
            const dtMatch = body.match(/Date\/time\s+(\d{1,2})\s+(\w+)\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
            if (!dtMatch) continue;

            const bookingDate = `${dtMatch[1]} ${dtMatch[2]} ${dtMatch[3]}`;
            let h = parseInt(dtMatch[4]), m = parseInt(dtMatch[5]);
            const ampm = dtMatch[6].toLowerCase();
            if (ampm === 'pm' && h < 12) h += 12;
            if (ampm === 'am' && h === 12) h = 0;
            const bookingTime = `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`;

            // "Product Name:          Young Gents Skin Fade (4–12)"
            const serviceMatch = body.match(/Product Name:\s*(.+?)(?:\s{2,}|\t|\r?\n)/i);
            const service      = serviceMatch ? serviceMatch[1].trim() : '';

            // "with    Arda Uzun" — one or more spaces/tabs after "with"
            const barberMatch = body.match(/\bwith\s+([\w][\w\s]+?)(?:\r?\n|$)/im);
            const barberRaw   = barberMatch ? barberMatch[1].trim().toLowerCase() : '';
            const barber      = barberRaw.includes('arda') ? 'arda' : 'alex';

            // "Price paid:    £35.00"  OR  "Price    £24.00"
            const priceMatch = body.match(/Price paid:\s*£([\d.]+)/i) || body.match(/^Price\s+£([\d.]+)/im);
            const price      = priceMatch ? `£${priceMatch[1]}` : '';

            // "Status    Unpaid" → UNPAID; anything else → CONFIRMED
            const statusMatch = body.match(/^Status\s+(\w+)/im);
            const statusRaw   = statusMatch ? statusMatch[1].toLowerCase() : 'confirmed';
            const status      = statusRaw === 'unpaid' ? 'UNPAID' : 'CONFIRMED';
            const paymentType = statusRaw === 'unpaid' ? 'UNPAID' : 'FULL';

            const nameMatch = body.match(/Guest name[:\s]+(.+?)(?:\s+Repeat|\s+New customer|\s+New)?\s*(?:\r?\n|$)/im)
                           || body.match(/Customer(?:\s+name)?[:\s]+(.+?)(?:\r?\n|$)/im)
                           || body.match(/Booking(?:\s+for)?[:\s]+(.+?)(?:\r?\n|$)/im);
            const name      = nameMatch ? nameMatch[1].replace(/\s+(Repeat|New customer|New)$/i, '').trim() : 'Guest';

            const emailMatch = body.match(/Guest Email:\s*([\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,})/i);
            const email      = emailMatch ? emailMatch[1].trim() : '';
            const phoneMatch = body.match(/Guest Tel\.:\s*([+\d][\d\s]+)/i);
            const phone      = phoneMatch ? phoneMatch[1].trim() : '';

            // Duration: try "(15 minutes)" in body first, then service name map
            const bodyDurMatch = body.match(/\((\d+)\s+minutes?\s*\)/i);
            let twDuration = bodyDurMatch ? parseInt(bodyDurMatch[1]) : 30;
            if (!bodyDurMatch) {
                const twServiceLower = service.toLowerCase();
                for (const key of Object.keys(BOOKSY_DURATION_MAP)) {
                    if (twServiceLower.includes(key)) { twDuration = BOOKSY_DURATION_MAP[key]; break; }
                }
            }

            const priceNumTW = parseFloat(String(price).replace(/[£,]/g, '')) || 0;
            const treatwellStart = toStartTime(bookingDate, bookingTime);

            // ── Reschedule: update existing booking ───────────────────────────
            if (isReschedule && existing.exists) {
                const existingData = existing.data();
                if (existingData.status !== 'CANCELLED' && existingData.status !== 'CHECKED_OUT') {
                    await existing.ref.update({
                        date: bookingDate, time: bookingTime,
                        startTime: treatwellStart,
                        endTime: addMins(treatwellStart, twDuration),
                        ...(barber && { barberId: barber }),
                        rescheduledAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    console.log(`Treatwell reschedule updated: ${bookingId} → ${bookingDate} ${bookingTime}`);
                }
                continue;
            }

            await db.collection('tenants/whitecross/bookings').doc(bookingId).set({
                bookingId,
                externalId: bookingId,
                rawEmailSubject: subject,
                parsedAt: admin.firestore.FieldValue.serverTimestamp(),
                clientName: name, clientEmail: email, clientPhone: phone,
                barberId: barber, serviceId: service, price,
                paidAmount: statusRaw === 'unpaid' ? 0 : priceNumTW,
                paymentType, status, source: 'Treatwell',
                date: bookingDate, time: bookingTime,
                startTime: treatwellStart,
                endTime: addMins(treatwellStart, twDuration),
                treatwellRef: orderRef,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Treatwell: ${bookingId} ${name} ${status}`);
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
