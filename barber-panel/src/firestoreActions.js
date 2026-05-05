import { db } from './firebase';
import { collection, doc, getDoc, query, where, getDocs, addDoc, updateDoc, deleteDoc, setDoc, Timestamp, orderBy } from 'firebase/firestore';

const TENANT = 'tenants/whitecross';

// ── CHECKOUT ──────────────────────────────────────────────────────────────
export async function checkoutBooking({ bookingId, paymentMethod, total, discount, tip, note, splitSecond, splitAmount, soldProducts, serviceCharge }) {
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
    serviceCharge: serviceCharge || 0,
    soldProducts: Array.isArray(soldProducts)
      ? soldProducts
          .filter((p) => p && p.qty > 0)
          .map((p) => ({
            productId: p.productId || p.id || '',
            name: p.name || '',
            price: parseFloat(p.price) || 0,
            qty: parseInt(p.qty, 10) || 0,
          }))
      : [],
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
export async function createWalkIn({ name, email, phone, date, time, service, barber, price, paymentType, source, duration: durationParam, soldProducts }) {
  const bookingId = 'WCB-' + Date.now();
  const months = { January:0, February:1, March:2, April:3, May:4, June:5, July:6, August:7, September:8, October:9, November:10, December:11 };
  const parts = date.split(' ');
  const timeMatch = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  let h = parseInt(timeMatch[1]), m = parseInt(timeMatch[2]);
  const ap = timeMatch[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  const startTime = new Date(parseInt(parts[2]), months[parts[1]], parseInt(parts[0]), h, m, 0);
  const duration = durationParam || 30;
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
    price: price || 0,
    paidAmount: '',
    soldProducts: Array.isArray(soldProducts)
      ? soldProducts
          .filter((p) => p && p.qty > 0)
          .map((p) => ({
            productId: p.productId || p.id || '',
            name: p.name || '',
            price: parseFloat(p.price) || 0,
            qty: parseInt(p.qty, 10) || 0,
          }))
      : [],
    source: source || 'Walk-in',
    createdAt: Timestamp.fromDate(new Date()),
  });
  return bookingId;
}

export async function createProductSale({ clientName, clientEmail, clientPhone, barber, soldProducts, paymentMethod, note }) {
  const bookingId = 'SALE-' + Date.now();
  const now = new Date();
  const validProducts = (Array.isArray(soldProducts) ? soldProducts : [])
    .filter((p) => p && p.qty > 0)
    .map((p) => ({
      productId: p.productId || p.id || '',
      name: p.name || '',
      price: parseFloat(p.price) || 0,
      qty: parseInt(p.qty, 10) || 0,
    }));

  const total = validProducts.reduce((sum, p) => sum + (parseFloat(p.price) || 0) * (parseInt(p.qty, 10) || 0), 0);

  await addDoc(collection(db, `${TENANT}/bookings`), {
    bookingId,
    tenantId: 'whitecross',
    clientName: clientName || 'Walk-in',
    clientEmail: clientEmail || '',
    clientPhone: clientPhone || '',
    barberId: barber || '',
    serviceId: '',
    startTime: Timestamp.fromDate(now),
    endTime: Timestamp.fromDate(now),
    status: 'CHECKED_OUT',
    paymentMethod: paymentMethod || 'CASH',
    paymentType: paymentMethod || 'CASH',
    price: 0,
    paidAmount: total,
    discount: 0,
    tip: 0,
    soldProducts: validProducts,
    note: note || '',
    source: 'Product Sale',
    checkedOutAt: Timestamp.fromDate(now),
    createdAt: Timestamp.fromDate(now),
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
export async function editBooking({ bookingId, name, email, phone, date, time, service, barber, price, duration: durationParam }) {
  // Try field query first; imported bookings may not have bookingId field — fall back to direct doc ref
  let docRef;
  let currentData = null;
  const q = query(collection(db, `${TENANT}/bookings`), where('bookingId', '==', bookingId));
  const snap = await getDocs(q);
  if (!snap.empty) {
    docRef = snap.docs[0].ref;
    currentData = snap.docs[0].data();
  } else {
    docRef = doc(db, `${TENANT}/bookings`, bookingId);
    const directSnap = await getDoc(docRef);
    if (!directSnap.exists()) throw new Error('Booking not found');
    currentData = directSnap.data();
  }
  const months = { January:0, February:1, March:2, April:3, May:4, June:5, July:6, August:7, September:8, October:9, November:10, December:11 };
  const parts = date.split(' ');
  const timeMatch = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  let h = parseInt(timeMatch[1]), m = parseInt(timeMatch[2]);
  const ap = timeMatch[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  const startTime = new Date(parseInt(parts[2]), months[parts[1]], parseInt(parts[0]), h, m, 0);
  const duration = durationParam || 30;
  const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
  const currentStatus = String(currentData?.status || '').toUpperCase();
  const updatePayload = {
    clientName: name,
    clientEmail: email || '',
    clientPhone: phone || '',
    barberId: barber,
    barberName: barber,
    serviceId: service,
    price: price ?? 0,
    startTime: Timestamp.fromDate(startTime),
    endTime: Timestamp.fromDate(endTime),
    updatedAt: Timestamp.fromDate(new Date()),
  };

  // Keep amount fields in sync with edited service price for all statuses.
  if (currentStatus === 'CHECKED_OUT' || currentStatus === 'UNPAID') {
    updatePayload.paidAmount = price ?? 0;
    updatePayload.discount = 0;
    updatePayload.tip = 0;
    updatePayload.splitSecond = '';
    updatePayload.splitAmount = 0;
  } else {
    updatePayload.paidAmount = '';
    updatePayload.discount = 0;
    updatePayload.tip = 0;
    updatePayload.splitSecond = '';
    updatePayload.splitAmount = 0;
  }

  await updateDoc(docRef, updatePayload);
}

// ── DELETE BOOKING ─────────────────────────────────────────────────────────
export async function deleteBooking(bookingId) {
  if (!bookingId) throw new Error('Booking id is required');

  // 1) Try direct document id delete first.
  const directRef = doc(db, `${TENANT}/bookings`, String(bookingId));
  const directSnap = await getDoc(directRef);
  if (directSnap.exists()) {
    await deleteDoc(directRef);
    return;
  }

  // 2) Fallback to records that store bookingId as a field.
  const q = query(collection(db, `${TENANT}/bookings`), where('bookingId', '==', bookingId));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('Booking not found');
  await deleteDoc(snap.docs[0].ref);
}

// ── CANCEL BOOKING ─────────────────────────────────────────────────────────
export async function cancelBooking(bookingId) {
  const q = query(collection(db, `${TENANT}/bookings`), where('bookingId', '==', bookingId));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('Booking not found');
  await updateDoc(snap.docs[0].ref, { status: 'CANCELLED', cancelledAt: Timestamp.fromDate(new Date()) });
}

// ── NO SHOW ────────────────────────────────────────────────────────────────
export async function markNoShow(bookingId) {
  const q = query(collection(db, `${TENANT}/bookings`), where('bookingId', '==', bookingId));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('Booking not found');
  await updateDoc(snap.docs[0].ref, { status: 'NO_SHOW', noShowAt: Timestamp.fromDate(new Date()) });
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

// ── PRODUCTS ───────────────────────────────────────────────────────────────
export async function getProducts() {
  const snap = await getDocs(query(collection(db, `${TENANT}/products`), orderBy('order', 'asc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addProduct({ name, price, description, imageUrl, category, inStock, active, order }) {
  const ref = await addDoc(collection(db, `${TENANT}/products`), {
    name, price: parseFloat(price) || 0, description: description || '',
    imageUrl: imageUrl || '', category: category || 'Other',
    inStock: inStock !== false, active: active !== false,
    order: parseInt(order) || 0,
    createdAt: Timestamp.fromDate(new Date()),
    updatedAt: Timestamp.fromDate(new Date()),
  });
  return ref.id;
}

export async function updateProduct(productId, data) {
  await updateDoc(doc(db, `${TENANT}/products`, productId), {
    ...data,
    price: parseFloat(data.price) || 0,
    order: parseInt(data.order) || 0,
    updatedAt: Timestamp.fromDate(new Date()),
  });
}

export async function deleteProduct(productId) {
  await deleteDoc(doc(db, `${TENANT}/products`, productId));
}

export async function toggleProductField(productId, field, value) {
  await updateDoc(doc(db, `${TENANT}/products`, productId), {
    [field]: value,
    updatedAt: Timestamp.fromDate(new Date()),
  });
}