#!/usr/bin/env node
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyA16eMVtA4ZOIu3ixCg8y8RUh-EAjMev3A',
  authDomain: 'havuz-44f70.firebaseapp.com',
  projectId: 'havuz-44f70',
  storageBucket: 'havuz-44f70.firebasestorage.app',
  messagingSenderId: '1050766582653',
  appId: '1:1050766582653:web:7ddaa5acb3bec5ef122214',
});

const db = getFirestore(app);
const TENANT = 'whitecross';

const paymentTypeKeys = ['paymentType', 'paymentMethod', 'paidAmount', 'price', 'tip', 'discount', 'status', 'source', 'barberName', 'barberId'];

function normalizeSource(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'walk_in' || s === 'walk-in' || s === 'walkin' || s === 'historical') return s;
  return s || '(empty)';
}

function toNumber(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/[£,]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function printTopMap(title, mapObj, limit = 15) {
  const rows = Object.entries(mapObj).sort((a, b) => b[1] - a[1]).slice(0, limit);
  console.log(`\n${title}`);
  rows.forEach(([k, v]) => console.log(`- ${k}: ${v}`));
}

async function run() {
  const snap = await getDocs(collection(db, `tenants/${TENANT}/bookings`));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const fieldPresence = {};
  const sourceCounts = {};
  const statusCounts = {};
  const paymentTypeCounts = {};
  const paymentMethodCounts = {};
  const walkinByBarber = {};

  let walkinCount = 0;
  let checkedOutCount = 0;
  let paidAmountPositive = 0;
  let missingBarberName = 0;
  let missingPaymentSignals = 0;

  for (const row of docs) {
    const keys = Object.keys(row || {});
    for (const k of keys) fieldPresence[k] = (fieldPresence[k] || 0) + 1;

    const source = normalizeSource(row.source);
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;

    const status = String(row.status || '(empty)');
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    const pType = String(row.paymentType || '(empty)');
    const pMethod = String(row.paymentMethod || '(empty)');
    paymentTypeCounts[pType] = (paymentTypeCounts[pType] || 0) + 1;
    paymentMethodCounts[pMethod] = (paymentMethodCounts[pMethod] || 0) + 1;

    if (!row.barberName) missingBarberName += 1;

    const isWalkin = source === 'walk_in' || source === 'walk-in' || source === 'walkin' || source === 'historical';
    if (isWalkin) {
      walkinCount += 1;
      const bn = String(row.barberName || row.barberId || '(unknown)');
      walkinByBarber[bn] = (walkinByBarber[bn] || 0) + 1;
    }

    if (String(row.status || '').toUpperCase() === 'CHECKED_OUT') checkedOutCount += 1;
    if (toNumber(row.paidAmount) > 0) paidAmountPositive += 1;

    const hasPaymentSignal = toNumber(row.paidAmount) > 0 || toNumber(row.price) > 0 || !!row.paymentType || !!row.paymentMethod;
    if (!hasPaymentSignal) missingPaymentSignals += 1;
  }

  console.log('BOOKINGS COLUMN ANALYSIS');
  console.log(`- Total bookings: ${docs.length}`);
  console.log(`- Walk-in/Historical bookings: ${walkinCount}`);
  console.log(`- CHECKED_OUT bookings: ${checkedOutCount}`);
  console.log(`- paidAmount > 0: ${paidAmountPositive}`);
  console.log(`- Missing barberName: ${missingBarberName}`);
  console.log(`- Missing payment signals: ${missingPaymentSignals}`);

  printTopMap('Source distribution', sourceCounts, 20);
  printTopMap('Status distribution', statusCounts, 20);
  printTopMap('PaymentType distribution', paymentTypeCounts, 20);
  printTopMap('PaymentMethod distribution', paymentMethodCounts, 20);
  printTopMap('Walk-in count by barber', walkinByBarber, 20);

  console.log('\nField coverage (%) for payment-related keys');
  paymentTypeKeys.forEach(k => {
    const count = fieldPresence[k] || 0;
    const pct = docs.length ? ((count / docs.length) * 100).toFixed(1) : '0.0';
    console.log(`- ${k}: ${count}/${docs.length} (${pct}%)`);
  });

  const topFields = Object.entries(fieldPresence).sort((a, b) => b[1] - a[1]).slice(0, 30);
  console.log('\nTop fields by presence');
  topFields.forEach(([k, v]) => {
    const pct = docs.length ? ((v / docs.length) * 100).toFixed(1) : '0.0';
    console.log(`- ${k}: ${v} (${pct}%)`);
  });
}

run().catch(err => {
  console.error('Analysis failed:', err);
  process.exit(1);
});
