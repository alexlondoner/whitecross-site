import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const app = initializeApp({
  apiKey: "AIzaSyA16eMVtA4ZOIu3ixCg8y8RUh-EAjMev3A",
  projectId: "havuz-44f70",
});
const db = getFirestore(app);

const snap = await getDocs(collection(db, 'tenants/whitecross/bookings'));

const months = { 0:'Jan', 1:'Feb', 2:'Mar', 3:'Apr', 4:'May', 5:'Jun', 6:'Jul', 7:'Aug', 8:'Sep', 9:'Oct', 10:'Nov', 11:'Dec' };
const monthNums = { 'January':1,'February':2,'March':3,'April':4,'May':5,'June':6,'July':7,'August':8,'September':9,'October':10,'November':11,'December':12 };

const byMonth = {};

snap.docs.forEach(doc => {
  const d = doc.data();
  if (d.status !== 'CHECKED_OUT') return;

  // Get month from startTime or date string
  let monthKey = null;
  if (d.startTime && d.startTime.toDate) {
    const dt = d.startTime.toDate();
    monthKey = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
  } else if (d.date) {
    const parts = d.date.split(' ');
    if (parts.length === 3) {
      const m = monthNums[parts[1]];
      if (m) monthKey = `${parts[2]}-${String(m).padStart(2,'0')}`;
    }
  }
  if (!monthKey) return;

  if (!byMonth[monthKey]) byMonth[monthKey] = { revenue: 0, count: 0, booksy: 0, walkin: 0, website: 0, historical: 0 };

  const raw = parseFloat(String(d.paidAmount || d.price || '0').replace('£','')) || 0;
  const deposit = d.source === 'Booksy' ? 10 : 0;
  const amount = d.source === 'Booksy' ? raw + deposit : raw;

  byMonth[monthKey].revenue += amount;
  byMonth[monthKey].count++;
  if (d.source === 'Booksy') byMonth[monthKey].booksy++;
  else if (d.source === 'Historical') byMonth[monthKey].historical++;
  else if (d.source === 'Walk-in') byMonth[monthKey].walkin++;
  else byMonth[monthKey].website++;
});

console.log('\n── MONTHLY REVENUE BREAKDOWN ──────────────────────\n');
let grandTotal = 0;
let grandCount = 0;
for (const key of Object.keys(byMonth).sort()) {
  const m = byMonth[key];
  grandTotal += m.revenue;
  grandCount += m.count;
  console.log(`${key}  £${m.revenue.toFixed(0).padStart(6)}  (${m.count} transactions | Historical:${m.historical} Walk-in:${m.walkin} Website:${m.website} Booksy:${m.booksy})`);
}
console.log(`\nTOTAL:  £${grandTotal.toFixed(0)}  (${grandCount} transactions)`);
process.exit(0);
