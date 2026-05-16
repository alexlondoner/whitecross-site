const admin = require('firebase-admin');
const serviceAccount = require('/Users/alish/Desktop/alex/whitecross-site/functions/service-account.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const MONTH_MAP = {
    january:1,february:2,march:3,april:4,may:5,june:6,
    july:7,august:8,september:9,october:10,november:11,december:12,
    jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
};

function toStartTime(dateStr, timeStr) {
    const parts = (dateStr||'').trim().split(/\s+/);
    const day   = parseInt(parts[0]);
    const month = MONTH_MAP[(parts[1]||'').toLowerCase()] || 1;
    const year  = parseInt(parts[2]);
    const [h, m] = (timeStr||'00:00').split(':').map(Number);
    const isBST = month >= 4 && month <= 10;
    const offsetMs = isBST ? -60*60*1000 : 0;
    const utc = Date.UTC(year, month-1, day, h, m) + offsetMs;
    return admin.firestore.Timestamp.fromMillis(utc);
}

async function main() {
    const snap = await db.collection('tenants/whitecross/bookings').get();
    const batch = db.batch();
    let count = 0;
    for (const doc of snap.docs) {
        const d = doc.data();
        if (!d.startTime && d.date && d.time) {
            batch.update(doc.ref, { startTime: toStartTime(d.date, d.time) });
            console.log(`Fixing: ${doc.id} — ${d.date} ${d.time} (${d.name || d.clientName})`);
            count++;
        }
    }
    if (count === 0) { console.log('Nothing to fix.'); process.exit(0); }
    await batch.commit();
    console.log(`Fixed ${count} bookings.`);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
