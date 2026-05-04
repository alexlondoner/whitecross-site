const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'havuz-44f70' });
const db = admin.firestore();

function parsePrice(val) {
  return parseFloat(String(val || '0').replace(/[£,]/g, '').replace('-', '').trim()) || 0;
}

async function run() {
  const snap = await db.collection('tenants/whitecross/bookings').get();

  const aprilBk = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => {
      const rawStatus = String(d.status || '').trim().toUpperCase().replace(/[-\s]+/g, '_');
      if (rawStatus !== 'CHECKED_OUT') return false;
      const st = d.startTime?.toDate?.();
      if (!st) return false;
      return st.getFullYear() === 2026 && st.getMonth() === 3; // April = month 3
    });

  console.log(`April CHECKED_OUT bookings: ${aprilBk.length}`);

  let total = 0;
  const bySource = {};
  const byBarber = {};

  aprilBk.forEach(b => {
    const paid = parsePrice(b.paidAmount);
    const price = parsePrice(b.price);
    const rev = paid > 0 ? paid : price;
    total += rev;

    const src = String(b.source || 'manual').toLowerCase();
    bySource[src] = (bySource[src] || 0) + rev;

    const barber = String(b.barberName || b.barberId || 'unknown');
    byBarber[barber] = (byBarber[barber] || 0) + rev;

    // Flag potential issues
    if (paid > 0 && price > 0 && paid !== price) {
      console.log(`  MISMATCH id=${d.id?.slice(0,10)} barber=${barber} price=£${price} paidAmount=£${paid} src=${src}`);
    }
  });

  console.log(`\nTotal revenue: £${total.toFixed(2)}`);
  console.log('\nBy source:');
  Object.entries(bySource).sort((a,b) => b[1]-a[1]).forEach(([s, v]) => console.log(`  ${s}: £${v.toFixed(2)}`));
  console.log('\nBy barber:');
  Object.entries(byBarber).sort((a,b) => b[1]-a[1]).forEach(([n, v]) => console.log(`  ${n}: £${v.toFixed(2)}`));

  // Find duplicate bookings (same barber, same date, same price)
  console.log('\n--- Potential duplicates (same barber + date + price) ---');
  const seen = {};
  aprilBk.forEach(b => {
    const st = b.startTime?.toDate?.();
    const dateStr = st ? `${st.getFullYear()}-${String(st.getMonth()+1).padStart(2,'0')}-${String(st.getDate()).padStart(2,'0')}` : 'nodate';
    const paid = parsePrice(b.paidAmount); const price = parsePrice(b.price);
    const rev = paid > 0 ? paid : price;
    const key = `${String(b.barberName||b.barberId||'?').toLowerCase()}|${dateStr}|${rev}`;
    if (!seen[key]) seen[key] = [];
    seen[key].push(b.id);
  });
  let dupCount = 0;
  Object.entries(seen).forEach(([k, ids]) => {
    if (ids.length > 1) {
      dupCount++;
      console.log(`  DUPLICATE: ${k} → ids: ${ids.join(', ')}`);
    }
  });
  if (dupCount === 0) console.log('  None found.');
}

run().catch(err => { console.error(err); process.exit(1); });
