import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, Timestamp } from 'firebase/firestore';
import { createRequire } from 'module';
import { createReadStream } from 'fs';
import { readFileSync } from 'fs';

const firebaseConfig = {
  apiKey: "AIzaSyA16eMVtA4ZOIu3ixCg8y8RUh-EAjMev3A",
  authDomain: "havuz-44f70.firebaseapp.com",
  projectId: "havuz-44f70",
  storageBucket: "havuz-44f70.firebasestorage.app",
  messagingSenderId: "1050766582653",
  appId: "1:1050766582653:web:7ddaa5acb3bec5ef122214"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── Service price map (closest match) ──────────────────────────────────────
const SERVICES = [
  { id: 'i-cut-royal',               name: 'I CUT Royal',                      price: 65, duration: 60 },
  { id: 'i-cut-deluxe',              name: 'I CUT Deluxe',                      price: 55, duration: 50 },
  { id: 'full-skinfade-beard-luxury', name: 'Full Skin Fade & Beard Luxury',    price: 48, duration: 40 },
  { id: 'full-experience',           name: 'The Full Experience',               price: 40, duration: 30 },
  { id: 'senior-full-experience',    name: 'Senior Full Experience (65+)',      price: 35, duration: 30 },
  { id: 'skin-fade',                 name: 'Skin Fade Cut',                     price: 32, duration: 30 },
  { id: 'scissor-cut',               name: 'Scissor Cut',                       price: 30, duration: 30 },
  { id: 'classic-sbs',               name: 'Classic Short Back & Sides',        price: 28, duration: 20 },
  { id: 'young-gents-skin-fade',     name: 'Young Gents Skin Fade (4-12)',      price: 24, duration: 25 },
  { id: 'senior-haircut',            name: 'Senior Haircut (65+)',              price: 23, duration: 20 },
  { id: 'hot-towel-shave',           name: 'Hot Towel Shave',                   price: 22, duration: 15 },
  { id: 'clipper-cut',               name: 'Clipper Cut',                       price: 22, duration: 15 },
  { id: 'young-gents',               name: 'Young Gents (0-12)',                price: 20, duration: 20 },
  { id: 'shape-up-clean-up',         name: 'Shape Up & Clean Up',               price: 20, duration: 15 },
  { id: 'full-facial',               name: 'Full Facial Treatment',             price: 24, duration: 20 },
  { id: 'face-mask',                 name: 'Face Mask',                         price: 12, duration: 15 },
  { id: 'threading',                 name: 'Threading',                         price: 10, duration: 10 },
  { id: 'waxing',                    name: 'Waxing (Nose & Ears)',               price: 10, duration: 10 },
  { id: 'wash-hot-towel',            name: 'Wash, Style & Hot Towel',           price: 10, duration: 10 },
];

function closestService(amount) {
  let best = SERVICES[0];
  let bestDiff = Math.abs(SERVICES[0].price - amount);
  for (const s of SERVICES) {
    const diff = Math.abs(s.price - amount);
    if (diff < bestDiff) { best = s; bestDiff = diff; }
  }
  return best;
}

// ── Parse XLSX ─────────────────────────────────────────────────────────────
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';

function parseXlsx(filePath) {
  const zip = new AdmZip(filePath);

  // shared strings
  const ssXml = zip.readAsText('xl/sharedStrings.xml');
  const ssDoc = new DOMParser().parseFromString(ssXml, 'text/xml');
  const siNodes = ssDoc.getElementsByTagName('si');
  const strings = [];
  for (let i = 0; i < siNodes.length; i++) {
    let text = '';
    const tNodes = siNodes[i].getElementsByTagName('t');
    for (let j = 0; j < tNodes.length; j++) text += tNodes[j].textContent || '';
    strings.push(text);
  }

  function parseSheet(sheetName, colMap) {
    const entry = zip.getEntry(`xl/worksheets/${sheetName}.xml`);
    if (!entry) return [];
    const xml = zip.readAsText(`xl/worksheets/${sheetName}.xml`);
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const rows = doc.getElementsByTagName('row');
    const transactions = [];

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const cells = {};
      const cNodes = row.getElementsByTagName('c');
      for (let ci = 0; ci < cNodes.length; ci++) {
        const c = cNodes[ci];
        const ref = c.getAttribute('r');
        const col = ref.replace(/[0-9]/g, '');
        const t = c.getAttribute('t') || '';
        const vNode = c.getElementsByTagName('v')[0];
        const fNode = c.getElementsByTagName('f')[0];
        let val = vNode ? vNode.textContent : '';
        if (t === 's' && val) val = strings[parseInt(val)];
        const formula = fNode ? fNode.textContent : null;
        cells[col] = { val, formula };
      }

      const dateCell = cells['A'];
      if (!dateCell || !dateCell.val || isNaN(parseFloat(dateCell.val))) continue;
      const serial = parseFloat(dateCell.val);
      const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
      // Fix timezone offset
      const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);

      for (const [col, { barber, method }] of Object.entries(colMap)) {
        const cell = cells[col];
        if (!cell) continue;
        const amounts = [];
        if (cell.formula && cell.formula.includes('+')) {
          for (const part of cell.formula.replace(/\s/g, '').split('+')) {
            const n = parseInt(part);
            if (!isNaN(n) && n > 0) amounts.push(n);
          }
        } else if (cell.val) {
          const n = parseInt(parseFloat(cell.val));
          if (!isNaN(n) && n > 0) amounts.push(n);
        }
        for (const amt of amounts) {
          transactions.push({ date: utcDate, barber, method, amount: amt });
        }
      }
    }
    return transactions;
  }

  // SUBAT: B=Alex Cash, C=Alex Monzo, D=Alex Card, E=Arda Cash, F=Arda Monzo, G=Arda Card, H=Kadim Cash, I=Kadim Monzo, J=Kadim Card
  const subatCols = {
    B: { barber: 'Alex',  method: 'CASH'  },
    C: { barber: 'Alex',  method: 'MONZO' },
    D: { barber: 'Alex',  method: 'CARD'  },
    E: { barber: 'Arda',  method: 'CASH'  },
    F: { barber: 'Arda',  method: 'MONZO' },
    G: { barber: 'Arda',  method: 'CARD'  },
    H: { barber: 'Kadim', method: 'CASH'  },
    I: { barber: 'Kadim', method: 'MONZO' },
    J: { barber: 'Kadim', method: 'CARD'  },
  };

  // MART: same but J=Manoj Cash, K=Manoj Card (no Kadim Card column)
  const martCols = {
    B: { barber: 'Alex',  method: 'CASH'  },
    C: { barber: 'Alex',  method: 'MONZO' },
    D: { barber: 'Alex',  method: 'CARD'  },
    E: { barber: 'Arda',  method: 'CASH'  },
    F: { barber: 'Arda',  method: 'MONZO' },
    G: { barber: 'Arda',  method: 'CARD'  },
    H: { barber: 'Kadim', method: 'CASH'  },
    I: { barber: 'Kadim', method: 'MONZO' },
    J: { barber: 'Manoj', method: 'CASH'  },
    K: { barber: 'Manoj', method: 'CARD'  },
  };

  const subat = parseSheet('sheet1', subatCols);
  const mart  = parseSheet('sheet2', martCols);
  return [...subat, ...mart];
}

// ── Assign sequential times per barber per day ─────────────────────────────
function assignTimes(transactions) {
  // Group by date+barber
  const groups = {};
  for (const tx of transactions) {
    const key = tx.date.toISOString().slice(0, 10) + '_' + tx.barber;
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }

  const result = [];
  for (const [key, txs] of Object.entries(groups)) {
    let startHour = 9, startMin = 0;
    for (const tx of txs) {
      const svc = closestService(tx.amount);
      const startTime = new Date(tx.date);
      startTime.setHours(startHour, startMin, 0, 0);
      const endTime = new Date(startTime.getTime() + svc.duration * 60 * 1000);

      // Advance next slot
      startMin += svc.duration + 5; // 5 min gap
      while (startMin >= 60) { startHour++; startMin -= 60; }
      if (startHour >= 20) { startHour = 9; startMin = 0; } // wrap safety

      result.push({ ...tx, startTime, endTime, service: svc });
    }
  }
  return result;
}

// ── Import to Firestore ────────────────────────────────────────────────────
async function run() {
  const XLSX_PATH = '/Users/alish/Downloads/MUHASEBE.xlsx';

  console.log('Parsing Excel...');
  const raw = parseXlsx(XLSX_PATH);
  console.log(`Found ${raw.length} transactions`);

  const transactions = assignTimes(raw);

  // Summary preview
  const byBarber = {};
  for (const tx of transactions) {
    if (!byBarber[tx.barber]) byBarber[tx.barber] = { count: 0, total: 0 };
    byBarber[tx.barber].count++;
    byBarber[tx.barber].total += tx.amount;
  }
  console.log('\nSummary:');
  for (const [b, d] of Object.entries(byBarber)) {
    console.log(`  ${b}: ${d.count} transactions, £${d.total}`);
  }
  console.log(`\nWriting ${transactions.length} bookings to Firestore...`);

  let written = 0;
  for (const tx of transactions) {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const d = tx.startTime;
    const dateStr = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const h = d.getHours(), m = d.getMinutes();
    const h12 = h % 12 || 12;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const timeStr = `${h12}:${m === 0 ? '00' : String(m).padStart(2,'0')} ${ampm}`;

    const barberLower = tx.barber.toLowerCase();

    await addDoc(collection(db, 'tenants/whitecross/bookings'), {
      bookingId:    'HIST-' + tx.startTime.getTime() + '-' + Math.random().toString(36).slice(2,6),
      tenantId:     'whitecross',
      clientName:   'Walk-in',
      clientEmail:  '',
      clientPhone:  '',
      barberId:     barberLower,
      barberName:   tx.barber,
      serviceId:    tx.service.id,
      date:         dateStr,
      time:         timeStr,
      startTime:    Timestamp.fromDate(tx.startTime),
      endTime:      Timestamp.fromDate(tx.endTime),
      status:       'CHECKED_OUT',
      paidAmount:   tx.amount,
      paymentMethod: tx.method,
      paymentType:  tx.method,
      price:        tx.amount,
      source:       'Historical',
      createdAt:    Timestamp.fromDate(new Date()),
    });

    written++;
    if (written % 20 === 0) console.log(`  ${written}/${transactions.length} written...`);
  }

  console.log(`\nDone! ${written} historical bookings imported.`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
