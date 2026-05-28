const admin = require('firebase-admin');
const serviceAccount = require('/Users/alish/Desktop/alex/whitecross-site/functions/service-account.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const TENANT = 'tenants/whitecross';

function pp(v) {
  if (v == null) return 0;
  return parseFloat(String(v).replace('£', '').replace('-', '')) || 0;
}

function normPhone(p) {
  return String(p || '').replace(/\D/g, '').slice(-10);
}

async function main() {
  console.log('Loading bookings…');
  const bSnap = await db.collection(`${TENANT}/bookings`).get();
  const bookings = bSnap.docs.map(d => ({ _id: d.id, ...d.data() }));
  const paid = bookings.filter(b => (b.status || '').toUpperCase() === 'CHECKED_OUT');
  console.log(`Total bookings: ${bookings.length}, paid: ${paid.length}`);

  console.log('Loading clients…');
  const cSnap = await db.collection(`${TENANT}/clients`).get();
  const clients = cSnap.docs.map(d => ({ _ref: d.ref, _id: d.id, ...d.data() }));
  console.log(`Total clients: ${clients.length}`);

  // Build a map: normalised phone → client doc ref
  // And normalised email → client doc ref
  const phoneMap = {};
  const emailMap = {};
  for (const c of clients) {
    if (c.phone) phoneMap[normPhone(c.phone)] = c;
    if (c.email) emailMap[(c.email || '').toLowerCase()] = c;
  }

  // Aggregate stats per client doc (keyed by Firestore doc ID)
  const stats = {}; // docId → { totalSpent, totalVisits, totalDiscount, lastVisit, lastBarber, lastService }

  function findClient(phone, email) {
    if (phone) {
      const norm = normPhone(phone);
      if (norm && phoneMap[norm]) return phoneMap[norm];
    }
    if (email) {
      const lc = (email || '').toLowerCase();
      if (lc && emailMap[lc]) return emailMap[lc];
    }
    return null;
  }

  for (const b of paid) {
    const phone = b.clientPhone || '';
    const email = b.clientEmail || '';
    const client = findClient(phone, email);
    if (!client) continue;

    const id = client._id;
    if (!stats[id]) {
      stats[id] = { ref: client._ref, totalSpent: 0, totalVisits: 0, totalDiscount: 0, lastVisit: null, lastBarber: '', lastService: '' };
    }
    const s = stats[id];
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

  console.log(`Updating ${Object.keys(stats).length} client docs…`);
  let updated = 0;
  const BATCH_SIZE = 400;
  let batch = db.batch();
  let ops = 0;

  for (const [id, s] of Object.entries(stats)) {
    const update = {
      totalSpent:    s.totalSpent,
      totalVisits:   s.totalVisits,
      totalDiscount: s.totalDiscount,
      lastBarber:    s.lastBarber,
      lastService:   s.lastService,
    };
    if (s.lastVisit) update.lastVisit = admin.firestore.Timestamp.fromDate(s.lastVisit);

    batch.update(s.ref, update);
    ops++;
    updated++;

    if (ops >= BATCH_SIZE) {
      await batch.commit();
      console.log(`  Committed ${updated} so far…`);
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
  console.log(`Done. Updated ${updated} client docs.`);
}

main().catch(err => { console.error(err); process.exit(1); });
