/**
 * One-time migration: fix serviceId on imported bookings where it was stored
 * as a random Firestore document ID instead of a real service slug.
 *
 * Run: cd functions && node migrate-services.js
 * Requires: firebase-admin (already in package.json)
 *           firebase CLI logged in (uses application default credentials)
 */

const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'havuz-44f70' });
const db = admin.firestore();

const SERVICES = [
  { id: 'i-cut-royal',               price: 65 },
  { id: 'i-cut-deluxe',              price: 55 },
  { id: 'full-skinfade-beard-luxury', price: 48 },
  { id: 'full-experience',           price: 40 },
  { id: 'senior-full-experience',    price: 35 },
  { id: 'skin-fade',                 price: 32 },
  { id: 'scissor-cut',               price: 30 },
  { id: 'classic-sbs',               price: 28 },
  { id: 'hot-towel-shave',           price: 22 },
  { id: 'clipper-cut',               price: 22 },
  { id: 'senior-haircut',            price: 23 },
  { id: 'young-gents',               price: 20 },
  { id: 'young-gents-skin-fade',     price: 24 },
  { id: 'full-facial',               price: 24 },
  { id: 'beard-dyeing',              price: 24 },
  { id: 'face-mask',                 price: 12 },
  { id: 'face-steam',                price: 12 },
  { id: 'threading',                 price: 10 },
  { id: 'waxing',                    price: 10 },
  { id: 'shape-up-clean-up',         price: 20 },
  { id: 'wash-hot-towel',            price: 10 },
];

const KNOWN_IDS = new Set(SERVICES.map(s => s.id));

function closestService(price) {
  // Price 24-30 → always classic-sbs
  if (price >= 24 && price <= 30) return 'classic-sbs';
  let best = SERVICES[0];
  let bestDiff = Math.abs(price - best.price);
  for (const s of SERVICES) {
    const diff = Math.abs(price - s.price);
    if (diff < bestDiff) { best = s; bestDiff = diff; }
  }
  return best.id;
}

async function run() {
  const snap = await db.collection('tenants/whitecross/bookings').get();
  console.log(`Total bookings fetched: ${snap.size}`);

  let updated = 0, skipped = 0;
  const batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const sid = d.serviceId || '';

    // Skip if serviceId is already a known slug
    if (KNOWN_IDS.has(sid)) { skipped++; continue; }

    const price = parseFloat(String(d.price || '0').replace('£', '')) || 0;
    if (!price) { skipped++; continue; } // no price info — skip

    const newId = closestService(price);
    console.log(`  ${doc.id.slice(0, 12)}… serviceId="${sid}" price=${price} → ${newId}`);
    batch.update(doc.ref, { serviceId: newId });
    updated++;
    batchCount++;

    // Firestore batch limit is 500
    if (batchCount === 499) {
      await batch.commit();
      batchCount = 0;
    }
  }

  if (batchCount > 0) await batch.commit();
  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
}

run().catch(err => { console.error(err); process.exit(1); });
