import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, deleteDoc, query, where, doc, Timestamp } from 'firebase/firestore';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';

const app = initializeApp({
  apiKey:"AIzaSyA16eMVtA4ZOIu3ixCg8y8RUh-EAjMev3A", projectId:"havuz-44f70",
  authDomain:"havuz-44f70.firebaseapp.com", storageBucket:"havuz-44f70.firebasestorage.app",
  messagingSenderId:"1050766582653", appId:"1:1050766582653:web:7ddaa5acb3bec5ef122214"
});
const db = getFirestore(app);
const TENANT = 'tenants/whitecross';
const XLSX = '/Users/alish/Downloads/MUHASEBE (2).xlsx';

const SVCS = [
  {id:'i-cut-royal',price:65,dur:60},{id:'i-cut-deluxe',price:55,dur:50},
  {id:'full-skinfade-beard-luxury',price:48,dur:40},{id:'full-experience',price:40,dur:30},
  {id:'senior-full-experience',price:35,dur:30},{id:'skin-fade',price:32,dur:30},
  {id:'scissor-cut',price:30,dur:30},{id:'classic-sbs',price:28,dur:20},
  {id:'young-gents-skin-fade',price:24,dur:25},{id:'senior-haircut',price:23,dur:20},
  {id:'hot-towel-shave',price:22,dur:15},{id:'clipper-cut',price:22,dur:15},
  {id:'young-gents',price:20,dur:20},{id:'shape-up-clean-up',price:20,dur:15},
  {id:'face-mask',price:12,dur:15},{id:'threading',price:10,dur:10},
  {id:'waxing',price:10,dur:10},{id:'wash-hot-towel',price:10,dur:10},
];
const closestSvc = a => SVCS.reduce((b,s) => Math.abs(s.price-a) < Math.abs(b.price-a) ? s : b);

function excelDateToJs(serial) {
  const utc = new Date(Math.round((parseFloat(serial) - 25569) * 86400 * 1000));
  utc.setTime(utc.getTime() + utc.getTimezoneOffset() * 60000);
  return utc;
}

function parseXlsx() {
  const zip = new AdmZip(XLSX);
  const ssDoc = new DOMParser().parseFromString(zip.readAsText('xl/sharedStrings.xml'), 'text/xml');
  const sis = ssDoc.getElementsByTagName('si');
  const str = [];
  for (let i = 0; i < sis.length; i++) {
    let t = ''; const ts = sis[i].getElementsByTagName('t');
    for (let j = 0; j < ts.length; j++) t += ts[j].textContent || '';
    str.push(t);
  }

  function readSheet(file) {
    const doc = new DOMParser().parseFromString(zip.readAsText(`xl/worksheets/${file}`), 'text/xml');
    const rows = doc.getElementsByTagName('row');
    const result = [];
    for (let ri = 0; ri < rows.length; ri++) {
      const cells = {}; const cs = rows[ri].getElementsByTagName('c');
      for (let ci = 0; ci < cs.length; ci++) {
        const c = cs[ci]; const ref = c.getAttribute('r'); const col = ref.replace(/[0-9]/g, '');
        const t = c.getAttribute('t') || ''; const vn = c.getElementsByTagName('v')[0]; const fn = c.getElementsByTagName('f')[0];
        let val = vn ? vn.textContent : ''; if (t === 's' && val) val = str[parseInt(val)] || '';
        cells[col] = { val, f: fn ? fn.textContent : null };
      }
      result.push(cells);
    }
    return result;
  }

  function parseTransactions(file, colMap, expCashCol, expBankCol) {
    const rows = readSheet(file); const txs = []; const exps = [];
    for (const row of rows) {
      const dv = row['A']?.val; if (!dv || isNaN(parseFloat(dv))) continue;
      const date = excelDateToJs(dv);
      for (const [col, { barber, method }] of Object.entries(colMap)) {
        const cell = row[col]; if (!cell) continue;
        const amounts = [];
        if (cell.f && cell.f.includes('+')) {
          for (const p of cell.f.replace(/\s/g,'').split('+')) { const n=parseInt(p); if(!isNaN(n)&&n>0) amounts.push(n); }
        } else if (cell.val) { const n = parseInt(parseFloat(cell.val)); if (!isNaN(n) && n > 0) amounts.push(n); }
        for (const amt of amounts) txs.push({ date, barber, method, amount: amt });
      }
      if (expCashCol) { const ev = row[expCashCol]?.val; if (ev) { const n=parseFloat(ev); if(!isNaN(n)&&n>0) exps.push({date,type:'CASH',amount:n}); } }
      if (expBankCol) { const ev = row[expBankCol]?.val; if (ev) { const n=parseFloat(ev); if(!isNaN(n)&&n>0) exps.push({date,type:'BANK',amount:n}); } }
    }
    return { txs, exps };
  }

  // SUBAT (sheet7): B=Alex Cash, C=Alex Monzo, D=Alex Card, E=Arda Cash, F=Arda Monzo, G=Arda Card, H=Kadim Cash, I=Kadim Monzo, J=Kadim Card | Exp: K=Cash, L=Bank
  const subatCols = { B:{barber:'Alex',method:'CASH'}, C:{barber:'Alex',method:'MONZO'}, D:{barber:'Alex',method:'CARD'}, E:{barber:'Arda',method:'CASH'}, F:{barber:'Arda',method:'MONZO'}, G:{barber:'Arda',method:'CARD'}, H:{barber:'Kadim',method:'CASH'}, I:{barber:'Kadim',method:'MONZO'}, J:{barber:'Kadim',method:'CARD'} };
  // MART (sheet8): same + J=Manoj Cash, K=Manoj Card | Exp: L=Cash, M=Bank
  const martCols  = { B:{barber:'Alex',method:'CASH'}, C:{barber:'Alex',method:'MONZO'}, D:{barber:'Alex',method:'CARD'}, E:{barber:'Arda',method:'CASH'}, F:{barber:'Arda',method:'MONZO'}, G:{barber:'Arda',method:'CARD'}, H:{barber:'Kadim',method:'CASH'}, I:{barber:'Kadim',method:'MONZO'}, J:{barber:'Manoj',method:'CASH'}, K:{barber:'Manoj',method:'CARD'} };
  // NISAN (sheet9) + MAYIS (sheet1): B=Alex Cash, C=Alex Card, D=Arda Cash, E=Arda Card, F=Kadim Cash, G=Kadim Card, H=Manoj Cash, I=Manoj Card | Exp: J=Cash, K=Bank
  const nisanCols = { B:{barber:'Alex',method:'CASH'}, C:{barber:'Alex',method:'CARD'}, D:{barber:'Arda',method:'CASH'}, E:{barber:'Arda',method:'CARD'}, F:{barber:'Kadim',method:'CASH'}, G:{barber:'Kadim',method:'CARD'}, H:{barber:'Manoj',method:'CASH'}, I:{barber:'Manoj',method:'CARD'} };

  const s = parseTransactions('sheet7.xml', subatCols, 'K', 'L');
  const m = parseTransactions('sheet8.xml', martCols,  'L', 'M');
  const n = parseTransactions('sheet9.xml', nisanCols, 'J', 'K');
  const y = parseTransactions('sheet1.xml', nisanCols, 'J', 'K');

  // ODEMELER (sheet2): A=date serial, B=barber name, C=amount
  const advances = [];
  const odemelerRows = readSheet('sheet2.xml');
  for (const row of odemelerRows) {
    const dv = row['A']?.val; if (!dv || isNaN(parseFloat(dv))) continue;
    const barber = String(row['B']?.val || '').trim(); if (!barber) continue;
    const amount = parseFloat(row['C']?.val || ''); if (!amount || amount <= 0) continue;
    advances.push({ date: excelDateToJs(dv), barber, amount });
  }

  return {
    txs: [...s.txs, ...m.txs, ...n.txs, ...y.txs],
    exps: [...s.exps, ...m.exps, ...n.exps, ...y.exps],
    advances,
  };
}

function assignTimes(txs) {
  const g = {};
  for (const tx of txs) { const k=tx.date.toISOString().slice(0,10)+'_'+tx.barber; if(!g[k]) g[k]=[]; g[k].push(tx); }
  const r = [];
  for (const txs2 of Object.values(g)) {
    let h=9,m=0;
    for (const tx of txs2) {
      const svc=closestSvc(tx.amount); const st=new Date(tx.date); st.setHours(h,m,0,0);
      const et=new Date(st.getTime()+svc.dur*60000); m+=svc.dur+5;
      while(m>=60){h++;m-=60;} if(h>=20){h=9;m=0;}
      r.push({...tx,st,et,svc});
    }
  }
  return r;
}

const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const dateStr = d => `${d.getDate()} ${MN[d.getMonth()]} ${d.getFullYear()}`;
const timeStr = d => { const h=d.getHours(),m=d.getMinutes(),h12=h%12||12,ap=h>=12?'PM':'AM'; return `${h12}:${m===0?'00':String(m).padStart(2,'0')} ${ap}`; };

async function clearBySource(colPath, src) {
  let total=0;
  let snap=await getDocs(query(collection(db,colPath),where('source','==',src)));
  while(!snap.empty){for(const d of snap.docs)await deleteDoc(d.ref);total+=snap.docs.length;snap=await getDocs(query(collection(db,colPath),where('source','==',src)));}
  return total;
}
async function clearAll(colPath) {
  let total=0;
  let snap=await getDocs(collection(db,colPath));
  while(!snap.empty){for(const d of snap.docs)await deleteDoc(d.ref);total+=snap.docs.length;snap=await getDocs(collection(db,colPath));}
  return total;
}

async function run() {
  console.log('1. Parsing XLSX...');
  const { txs, exps, advances } = parseXlsx();
  const transactions = assignTimes(txs);
  console.log(`   ${transactions.length} bookings | ${exps.length} expenses | ${advances.length} advances`);

  // Summary
  const byBarber={};
  for(const tx of txs){if(!byBarber[tx.barber])byBarber[tx.barber]={count:0,total:0};byBarber[tx.barber].count++;byBarber[tx.barber].total+=tx.amount;}
  console.log('\n   Revenue by barber:');
  for(const[b,d]of Object.entries(byBarber))console.log(`   ${b}: ${d.count} txs, £${d.total}`);

  console.log('\n2. Clearing old Historical bookings...');
  const d1=await clearBySource(`${TENANT}/bookings`,'Historical');
  console.log(`   Cleared ${d1}`);

  console.log('3. Importing bookings...');
  const bCol=collection(db,`${TENANT}/bookings`); let tw=0;
  for(const tx of transactions){
    await addDoc(bCol,{
      bookingId:'HIST-'+tx.st.getTime()+'-'+Math.random().toString(36).slice(2,6),
      tenantId:'whitecross',clientName:'Walk-in',clientEmail:'',clientPhone:'',
      barberId:tx.barber.toLowerCase(),barberName:tx.barber,
      serviceId:tx.svc.id,date:dateStr(tx.st),time:timeStr(tx.st),
      startTime:Timestamp.fromDate(tx.st),endTime:Timestamp.fromDate(tx.et),
      status:'CHECKED_OUT',paidAmount:tx.amount,paymentMethod:tx.method,paymentType:tx.method,
      price:tx.amount,source:'Historical',createdAt:Timestamp.fromDate(new Date()),
    });
    tw++; if(tw%50===0) console.log(`   ${tw}/${transactions.length}`);
  }
  console.log(`   Done: ${tw}`);

  console.log('4. Importing expenses...');
  await clearAll(`${TENANT}/expenses`);
  const eCol=collection(db,`${TENANT}/expenses`);
  for(const e of exps) await addDoc(eCol,{date:Timestamp.fromDate(e.date),type:e.type,amount:e.amount,note:'',source:'Historical',createdAt:Timestamp.fromDate(new Date())});
  console.log(`   ${exps.length} expenses`);

  console.log('5. Importing advances...');
  await clearAll(`${TENANT}/advances`);
  const aCol=collection(db,`${TENANT}/advances`);
  for(const a of advances) await addDoc(aCol,{date:Timestamp.fromDate(a.date),barber:a.barber,amount:a.amount,note:'',source:'Historical',createdAt:Timestamp.fromDate(new Date())});
  console.log(`   ${advances.length} advances`);

  console.log('\nAll done!'); process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
