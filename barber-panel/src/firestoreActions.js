import { db } from './firebase';
import { collection, doc, query, where, getDocs, addDoc, updateDoc, deleteDoc, setDoc, Timestamp } from 'firebase/firestore';

const TENANT = 'tenants/whitecross';

// ── CHECKOUT ──────────────────────────────────────────────────────────────
export async function checkoutBooking({ bookingId, paymentMethod, total, discount, tip, note, splitSecond, splitAmount }) {
  const q = query(collection(db, `${TENANT}/bookings`), where('bookingId', '==', bookingId));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('Booking not found');
  const ref = snap.docs[0].ref;
  await updateDoc(ref, {
    status: 'CHECKED_OUT',
    paymentMethod,
    paidAmount: total,
    discount: discount || 0,
    tip: tip || 0,
    note: note || '',
    splitSecond: splitSecond || '',
    splitAmount: splitAmount || 0,
    checkedOutAt: Timestamp.fromDate(new Date()),
  });
}

export async function saveUnpaidBooking({ bookingId }) {
  const q = query(collection(db, `${TENANT}/bookings`), where('bookingId', '==', bookingId));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('Booking not found');
  await updateDoc(snap.docs[0].ref, { status: 'UNPAID' });
}

// ── WALK-IN ───────────────────────────────────────────────────────────────
export async function createWalkIn({ name, email, phone, date, time, service, barber, price, paymentType, source }) {
  const bookingId = 'WCB-' + Date.now();
  const months = { January:0, February:1, March:2, April:3, May:4, June:5, July:6, August:7, September:8, October:9, November:10, December:11 };
  const parts = date.split(' ');
  const timeMatch = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  let h = parseInt(timeMatch[1]), m = parseInt(timeMatch[2]);
  const ap = timeMatch[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  const startTime = new Date(parseInt(parts[2]), months[parts[1]], parseInt(parts[0]), h, m, 0);
  const durationMap = {
    "i-cut-royal":60,"i-cut-deluxe":50,"full-skinfade-beard-luxury":40,"full-experience":30,
    "senior-full-experience":30,"skin-fade":30,"scissor-cut":30,"classic-sbs":20,
    "hot-towel-shave":15,"clipper-cut":15,"senior-haircut":20,"young-gents":20,
    "young-gents-skin-fade":25,"full-facial":10,"beard-dyeing":20,"face-mask":10,
    "face-steam":10,"threading":5,"waxing":10,"shape-up-clean-up":15,"wash-hot-towel":10
  };
  const duration = durationMap[service] || 30;
  const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
  await addDoc(collection(db, `${TENANT}/bookings`), {
    bookingId,
    tenantId: 'whitecross',
    clientName: name,
    clientEmail: email || '',
    clientPhone: phone || '',
    barberId: barber,
    serviceId: service,
    startTime: Timestamp.fromDate(startTime),
    endTime: Timestamp.fromDate(endTime),
    status: 'CONFIRMED',
    paymentType: paymentType || 'CASH',
    paidAmount: price || 0,
    source: source || 'Walk-in',
    createdAt: Timestamp.fromDate(new Date()),
  });
  return bookingId;
}

// ── BLOCK TIME ────────────────────────────────────────────────────────────
export async function blockTime({ date, startTime, endTime, barber, note }) {
  const blockId = 'BLOCKED-' + Date.now();
  const months = { January:0, February:1, March:2, April:3, May:4, June:5, July:6, August:7, September:8, October:9, November:10, December:11 };
  const parts = date.split(' ');
  const parseT = (t) => {
    const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
    let h = parseInt(m[1]), min = parseInt(m[2]);
    const ap = m[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return { h, min };
  };
  const st = parseT(startTime), et = parseT(endTime);
  const start = new Date(parseInt(parts[2]), months[parts[1]], parseInt(parts[0]), st.h, st.min, 0);
  const end = new Date(parseInt(parts[2]), months[parts[1]], parseInt(parts[0]), et.h, et.min, 0);
  await addDoc(collection(db, `${TENANT}/bookings`), {
    bookingId: blockId,
    tenantId: 'whitecross',
    barberId: barber,
    status: 'BLOCKED',
    startTime: Timestamp.fromDate(start),
    endTime: Timestamp.fromDate(end),
    note: note || '',
    source: 'block',
    createdAt: Timestamp.fromDate(new Date()),
  });
  return blockId;
}

// ── EDIT BOOKING ──────────────────────────────────────────────────────────
export async function editBooking({ bookingId, name, email, phone, date, time, service, barber }) {
  const q = query(collection(db, `${TENANT}/bookings`), where('bookingId', '==', bookingId));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('Booking not found');
  const months = { January:0, February:1, March:2, April:3, May:4, June:5, July:6, August:7, September:8, October:9, November:10, December:11 };
  const parts = date.split(' ');
  const timeMatch = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  let h = parseInt(timeMatch[1]), m = parseInt(timeMatch[2]);
  const ap = timeMatch[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  const startTime = new Date(parseInt(parts[2]), months[parts[1]], parseInt(parts[0]), h, m, 0);
  const durationMap = {
    "i-cut-royal":60,"i-cut-deluxe":50,"full-skinfade-beard-luxury":40,"full-experience":30,
    "senior-full-experience":30,"skin-fade":30,"scissor-cut":30,"classic-sbs":20,
    "hot-towel-shave":15,"clipper-cut":15,"senior-haircut":20,"young-gents":20,
    "young-gents-skin-fade":25,"full-facial":10,"beard-dyeing":20,"face-mask":10,
    "face-steam":10,"threading":5,"waxing":10,"shape-up-clean-up":15,"wash-hot-towel":10
  };
  const duration = durationMap[service] || 30;
  const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
  await updateDoc(snap.docs[0].ref, {
    clientName: name,
    clientEmail: email || '',
    clientPhone: phone || '',
    barberId: barber,
    serviceId: service,
    startTime: Timestamp.fromDate(startTime),
    endTime: Timestamp.fromDate(endTime),
    updatedAt: Timestamp.fromDate(new Date()),
  });
}

// ── DELETE BOOKING ─────────────────────────────────────────────────────────
export async function deleteBooking(bookingId) {
  const q = query(collection(db, `${TENANT}/bookings`), where('bookingId', '==', bookingId));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('Booking not found');
  await deleteDoc(snap.docs[0].ref);
}
export async function seedBarbers() {
  const barbers = [
    { id: 'alex', name: 'Alex', color: '#d4af37', active: true, order: 1 },
    { id: 'arda', name: 'Arda', color: '#4caf50', active: true, order: 2 },
  ];
  for (const barber of barbers) {
    await setDoc(doc(db, 'tenants/whitecross/barbers', barber.id), barber);
  }
}