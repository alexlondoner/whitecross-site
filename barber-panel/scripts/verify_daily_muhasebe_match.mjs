#!/usr/bin/env node
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const XLSX = '/Users/alish/Downloads/MUHASEBE (2).xlsx';

const app = initializeApp({
  apiKey: 'AIzaSyA16eMVtA4ZOIu3ixCg8y8RUh-EAjMev3A',
  authDomain: 'havuz-44f70.firebaseapp.com',
  projectId: 'havuz-44f70',
  storageBucket: 'havuz-44f70.firebasestorage.app',
  messagingSenderId: '1050766582653',
  appId: '1:1050766582653:web:7ddaa5acb3bec5ef122214',
});
const db = getFirestore(app);

function dateKeyFromExcelSerial(n) {
  const utc = new Date(Math.round((parseFloat(n) - 25569) * 86400 * 1000));
  utc.setTime(utc.getTime() + utc.getTimezoneOffset() * 60000);
  const y = utc.getFullYear();
  const m = String(utc.getMonth() + 1).padStart(2, '0');
  const d = String(utc.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseXlsxDaily() {
  const zip = new AdmZip(XLSX);
  const ssDoc = new DOMParser().parseFromString(zip.readAsText('xl/sharedStrings.xml'), 'text/xml');
  const sis = ssDoc.getElementsByTagName('si');
  const shared = [];
  for (let i = 0; i < sis.length; i++) {
    const ts = sis[i].getElementsByTagName('t');
    let t = '';
    for (let j = 0; j < ts.length; j++) t += ts[j].textContent || '';
    shared.push(t);
  }

  const configs = [
    {
      file: 'sheet7.xml',
      cols: {
        B: { barber: 'Alex', method: 'CASH' }, C: { barber: 'Alex', method: 'CARD' }, D: { barber: 'Alex', method: 'CARD' },
        E: { barber: 'Arda', method: 'CASH' }, F: { barber: 'Arda', method: 'CARD' }, G: { barber: 'Arda', method: 'CARD' },
        H: { barber: 'Kadim', method: 'CASH' }, I: { barber: 'Kadim', method: 'CARD' }, J: { barber: 'Kadim', method: 'CARD' },
      },
    },
    {
      file: 'sheet8.xml',
      cols: {
        B: { barber: 'Alex', method: 'CASH' }, C: { barber: 'Alex', method: 'CARD' }, D: { barber: 'Alex', method: 'CARD' },
        E: { barber: 'Arda', method: 'CASH' }, F: { barber: 'Arda', method: 'CARD' }, G: { barber: 'Arda', method: 'CARD' },
        H: { barber: 'Kadim', method: 'CASH' }, I: { barber: 'Kadim', method: 'CARD' },
        J: { barber: 'Manoj', method: 'CASH' }, K: { barber: 'Manoj', method: 'CARD' },
      },
    },
    {
      file: 'sheet9.xml',
      cols: {
        B: { barber: 'Alex', method: 'CASH' }, C: { barber: 'Alex', method: 'CARD' },
        D: { barber: 'Arda', method: 'CASH' }, E: { barber: 'Arda', method: 'CARD' },
        F: { barber: 'Kadim', method: 'CASH' }, G: { barber: 'Kadim', method: 'CARD' },
        H: { barber: 'Manoj', method: 'CASH' }, I: { barber: 'Manoj', method: 'CARD' },
      },
    },
    {
      file: 'sheet1.xml',
      cols: {
        B: { barber: 'Alex', method: 'CASH' }, C: { barber: 'Alex', method: 'CARD' },
        D: { barber: 'Arda', method: 'CASH' }, E: { barber: 'Arda', method: 'CARD' },
        F: { barber: 'Kadim', method: 'CASH' }, G: { barber: 'Kadim', method: 'CARD' },
        H: { barber: 'Manoj', method: 'CASH' }, I: { barber: 'Manoj', method: 'CARD' },
      },
    },
  ];

  const totals = {};
  function add(dateKey, barber, cash, card) {
    const key = `${dateKey}|${barber}`;
    if (!totals[key]) totals[key] = { date: dateKey, barber, cash: 0, card: 0 };
    totals[key].cash += cash;
    totals[key].card += card;
  }

  for (const cfg of configs) {
    const xml = zip.readAsText(`xl/worksheets/${cfg.file}`);
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const rows = doc.getElementsByTagName('row');
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const cells = {};
      const cs = row.getElementsByTagName('c');
      for (let ci = 0; ci < cs.length; ci++) {
        const c = cs[ci];
        const ref = c.getAttribute('r') || '';
        const col = ref.replace(/[0-9]/g, '');
        const t = c.getAttribute('t') || '';
        const vn = c.getElementsByTagName('v')[0];
        const fn = c.getElementsByTagName('f')[0];
        let val = vn ? vn.textContent : '';
        if (t === 's' && val) val = shared[parseInt(val, 10)] || '';
        cells[col] = { val, f: fn ? fn.textContent : null };
      }

      const dval = cells.A?.val;
      if (!dval || Number.isNaN(parseFloat(dval))) continue;
      const dateKey = dateKeyFromExcelSerial(dval);

      for (const [col, meta] of Object.entries(cfg.cols)) {
        const cell = cells[col];
        if (!cell) continue;
        const amounts = [];
        if (cell.f && cell.f.includes('+')) {
          for (const p of cell.f.replace(/\s/g, '').split('+')) {
            const n = parseInt(p, 10);
            if (!Number.isNaN(n) && n > 0) amounts.push(n);
          }
        } else if (cell.val) {
          const n = parseInt(parseFloat(cell.val), 10);
          if (!Number.isNaN(n) && n > 0) amounts.push(n);
        }
        for (const amt of amounts) {
          if (meta.method === 'CASH') add(dateKey, meta.barber, amt, 0);
          else add(dateKey, meta.barber, 0, amt);
        }
      }
    }
  }

  return Object.values(totals);
}

function normBarber(name) {
  const n = String(name || '').trim().toLowerCase();
  if (n.includes('alex')) return 'Alex';
  if (n.includes('arda')) return 'Arda';
  if (n.includes('kadim')) return 'Kadim';
  if (n.includes('manoj')) return 'Manoj';
  return String(name || '').trim() || '(unknown)';
}

function toMoney(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/[£,]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

async function firestoreDaily() {
  const snap = await getDocs(collection(db, 'tenants/whitecross/bookings'));
  const totals = {};
  const isWalkInSource = (s) => {
    const x = String(s || '').trim().toLowerCase();
    return x === 'historical' || x === 'walk_in' || x === 'walk-in' || x === 'walkin';
  };
  const isCash = (b) => {
    const m = String(b.paymentMethod || '').trim().toLowerCase();
    if (m === 'cash') return true;
    if (m) return false;
    return String(b.paymentType || '').trim().toUpperCase() === 'CASH';
  };
  const revenue = (b) => {
    const paid = toMoney(b.paidAmount);
    const price = toMoney(b.price);
    if (String(b.status || '').toUpperCase() === 'CHECKED_OUT' && paid > 0) return paid;
    if (price > 0) return price;
    return paid;
  };

  for (const d of snap.docs) {
    const b = d.data() || {};
    if (String(b.status || '').toUpperCase() === 'CANCELLED') continue;
    if (!isWalkInSource(b.source)) continue;
    const dt = b.startTime?.toDate ? b.startTime.toDate() : null;
    if (!dt || Number.isNaN(dt.getTime())) continue;
    const dateKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const barber = normBarber(b.barberName || b.barberId);
    const key = `${dateKey}|${barber}`;
    if (!totals[key]) totals[key] = { date: dateKey, barber, cash: 0, card: 0 };
    const rev = revenue(b);
    if (isCash(b)) totals[key].cash += rev;
    else totals[key].card += rev;
  }
  return Object.values(totals);
}

function round0(n) { return Math.round((n || 0) * 100) / 100; }

(async function run() {
  const xRows = parseXlsxDaily();
  const fRows = await firestoreDaily();

  const xMap = new Map(xRows.map(r => [`${r.date}|${r.barber}`, r]));
  const fMap = new Map(fRows.map(r => [`${r.date}|${r.barber}`, r]));
  const keys = Array.from(new Set([...xMap.keys(), ...fMap.keys()])).sort();

  const mismatches = [];
  let exact = 0;

  for (const key of keys) {
    const x = xMap.get(key) || { cash: 0, card: 0, date: key.split('|')[0], barber: key.split('|')[1] };
    const f = fMap.get(key) || { cash: 0, card: 0, date: key.split('|')[0], barber: key.split('|')[1] };

    const dc = round0(f.cash - x.cash);
    const dd = round0(f.card - x.card);
    const dt = round0((f.cash + f.card) - (x.cash + x.card));

    if (Math.abs(dc) < 0.01 && Math.abs(dd) < 0.01) exact += 1;
    else mismatches.push({ date: x.date, barber: x.barber, excelCash: round0(x.cash), fsCash: round0(f.cash), excelCard: round0(x.card), fsCard: round0(f.card), diffCash: dc, diffCard: dd, diffTotal: dt });
  }

  console.log('DAILY MATCH REPORT (MUHASEBE vs FIRESTORE WALK-IN/HISTORICAL)');
  console.log(`- Excel day-barber rows: ${xRows.length}`);
  console.log(`- Firestore day-barber rows: ${fRows.length}`);
  console.log(`- Exact matched rows: ${exact}`);
  console.log(`- Mismatch rows: ${mismatches.length}`);

  if (mismatches.length) {
    console.log('\nTop mismatch rows (max 60):');
    mismatches.slice(0, 60).forEach(m => {
      console.log(`${m.date} | ${m.barber} | cash excel/fs: ${m.excelCash}/${m.fsCash} (diff ${m.diffCash}) | card excel/fs: ${m.excelCard}/${m.fsCard} (diff ${m.diffCard}) | total diff ${m.diffTotal}`);
    });
  }
})();
