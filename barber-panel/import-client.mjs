import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, deleteDoc, query, where, writeBatch, doc, Timestamp } from 'firebase/firestore';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';

const app = initializeApp({
  apiKey:"AIzaSyA16eMVtA4ZOIu3ixCg8y8RUh-EAjMev3A",projectId:"havuz-44f70",
  authDomain:"havuz-44f70.firebaseapp.com",storageBucket:"havuz-44f70.firebasestorage.app",
  messagingSenderId:"1050766582653",appId:"1:1050766582653:web:7ddaa5acb3bec5ef122214"
});
const db = getFirestore(app);
const TENANT='tenants/whitecross';
const XLSX='/Users/alish/Downloads/MUHASEBE (2).xlsx';

const SVCS=[{id:'i-cut-royal',price:65,dur:60},{id:'i-cut-deluxe',price:55,dur:50},{id:'full-skinfade-beard-luxury',price:48,dur:40},{id:'full-experience',price:40,dur:30},{id:'senior-full-experience',price:35,dur:30},{id:'skin-fade',price:32,dur:30},{id:'scissor-cut',price:30,dur:30},{id:'classic-sbs',price:28,dur:20},{id:'young-gents-skin-fade',price:24,dur:25},{id:'senior-haircut',price:23,dur:20},{id:'hot-towel-shave',price:22,dur:15},{id:'clipper-cut',price:22,dur:15},{id:'young-gents',price:20,dur:20},{id:'shape-up-clean-up',price:20,dur:15},{id:'face-mask',price:12,dur:15},{id:'threading',price:10,dur:10},{id:'waxing',price:10,dur:10},{id:'wash-hot-towel',price:10,dur:10}];
const cs=a=>SVCS.reduce((b,s)=>Math.abs(s.price-a)<Math.abs(b.price-a)?s:b);

function parseXlsx(){
  const zip=new AdmZip(XLSX);
  const ssDoc=new DOMParser().parseFromString(zip.readAsText('xl/sharedStrings.xml'),'text/xml');
  const sis=ssDoc.getElementsByTagName('si');const str=[];
  for(let i=0;i<sis.length;i++){let t='';const ts=sis[i].getElementsByTagName('t');for(let j=0;j<ts.length;j++)t+=ts[j].textContent||'';str.push(t);}
  function sheet(file,cols,ec,eb){
    const doc=new DOMParser().parseFromString(zip.readAsText(`xl/worksheets/${file}`),'text/xml');
    const rows=doc.getElementsByTagName('row');const txs=[],exps=[];
    for(let ri=0;ri<rows.length;ri++){
      const row=rows[ri];const cells={};
      const cs2=row.getElementsByTagName('c');
      for(let ci=0;ci<cs2.length;ci++){const c=cs2[ci];const ref=c.getAttribute('r');const col=ref.replace(/[0-9]/g,'');const t=c.getAttribute('t')||'';const vn=c.getElementsByTagName('v')[0];const fn=c.getElementsByTagName('f')[0];let val=vn?vn.textContent:'';if(t==='s'&&val)val=str[parseInt(val)]||'';cells[col]={val,f:fn?fn.textContent:null};}
      const dv=cells['A']?.val;if(!dv||isNaN(parseFloat(dv)))continue;
      const utc=new Date(Math.round((parseFloat(dv)-25569)*86400*1000));utc.setTime(utc.getTime()+utc.getTimezoneOffset()*60000);
      for(const[col,{barber,method}]of Object.entries(cols)){const cell=cells[col];if(!cell)continue;const amounts=[];if(cell.f&&cell.f.includes('+')){for(const p of cell.f.replace(/\s/g,'').split('+')){const n=parseInt(p);if(!isNaN(n)&&n>0)amounts.push(n);}}else if(cell.val){const n=parseInt(parseFloat(cell.val));if(!isNaN(n)&&n>0)amounts.push(n);}for(const amt of amounts)txs.push({date:utc,barber,method,amount:amt});}
      for(const[col,et]of[[ec,'CASH'],[eb,'BANK']]){if(!col)continue;const ev=cells[col]?.val;if(ev){const n=parseFloat(ev);if(!isNaN(n)&&n>0)exps.push({date:utc,type:et,amount:n});}}
    }
    return{txs,exps};
  }
  const sc={B:{barber:'Alex',method:'CASH'},C:{barber:'Alex',method:'MONZO'},D:{barber:'Alex',method:'CARD'},E:{barber:'Arda',method:'CASH'},F:{barber:'Arda',method:'MONZO'},G:{barber:'Arda',method:'CARD'},H:{barber:'Kadim',method:'CASH'},I:{barber:'Kadim',method:'MONZO'},J:{barber:'Kadim',method:'CARD'}};
  const mc={B:{barber:'Alex',method:'CASH'},C:{barber:'Alex',method:'MONZO'},D:{barber:'Alex',method:'CARD'},E:{barber:'Arda',method:'CASH'},F:{barber:'Arda',method:'MONZO'},G:{barber:'Arda',method:'CARD'},H:{barber:'Kadim',method:'CASH'},I:{barber:'Kadim',method:'MONZO'},J:{barber:'Manoj',method:'CASH'},K:{barber:'Manoj',method:'CARD'}};
  const nc={B:{barber:'Alex',method:'CASH'},C:{barber:'Alex',method:'CARD'},D:{barber:'Arda',method:'CASH'},E:{barber:'Arda',method:'CARD'},F:{barber:'Kadim',method:'CASH'},G:{barber:'Kadim',method:'CARD'},H:{barber:'Manoj',method:'CASH'},I:{barber:'Manoj',method:'CARD'}};
  const s=sheet('sheet7.xml',sc,'K','L'),m=sheet('sheet8.xml',mc,'L','M'),n=sheet('sheet9.xml',nc,'J','K'),y=sheet('sheet1.xml',nc,'J','K');
  return{txs:[...s.txs,...m.txs,...n.txs,...y.txs],exps:[...s.exps,...m.exps,...n.exps,...y.exps]};
}

function assignTimes(txs){
  const g={};for(const tx of txs){const k=tx.date.toISOString().slice(0,10)+'_'+tx.barber;if(!g[k])g[k]=[];g[k].push(tx);}
  const r=[];for(const txs2 of Object.values(g)){let h=9,m=0;for(const tx of txs2){const svc=cs(tx.amount);const st=new Date(tx.date);st.setHours(h,m,0,0);const et=new Date(st.getTime()+svc.dur*60000);m+=svc.dur+5;while(m>=60){h++;m-=60;}if(h>=20){h=9;m=0;}r.push({...tx,st,et,svc});}}
  return r;
}

const MN=['January','February','March','April','May','June','July','August','September','October','November','December'];
const ds=d=>`${d.getDate()} ${MN[d.getMonth()]} ${d.getFullYear()}`;
const ts=d=>{const h=d.getHours(),m=d.getMinutes(),h12=h%12||12,ap=h>=12?'PM':'AM';return `${h12}:${m===0?'00':String(m).padStart(2,'0')} ${ap}`;};

const ADV=[{date:'2026-02-15',barber:'Arda',amount:150,note:''},{date:'2026-02-18',barber:'Arda',amount:50,note:''},{date:'2026-02-20',barber:'Arda',amount:600,note:''},{date:'2026-02-22',barber:'Arda',amount:700,note:''},{date:'2026-02-25',barber:'Alex',amount:7,note:''},{date:'2026-02-27',barber:'Alex',amount:10,note:''},{date:'2026-02-28',barber:'Alex',amount:500,note:'TuncDan Enjeksiyon'},{date:'2026-03-04',barber:'Alex',amount:500,note:''},{date:'2026-03-06',barber:'Alex',amount:230,note:''},{date:'2026-03-06',barber:'Arda',amount:60,note:''},{date:'2026-03-06',barber:'Arda',amount:15,note:''},{date:'2026-03-08',barber:'Alex',amount:10,note:''},{date:'2026-03-11',barber:'Alex',amount:10,note:''},{date:'2026-03-12',barber:'Arda',amount:500,note:''},{date:'2026-03-17',barber:'Alex',amount:350,note:''},{date:'2026-03-18',barber:'Arda',amount:50,note:''},{date:'2026-03-21',barber:'Arda',amount:190,note:''},{date:'2026-03-27',barber:'Arda',amount:5,note:''},{date:'2026-03-27',barber:'Alex',amount:19,note:''},{date:'2026-03-27',barber:'Arda',amount:180,note:''}];

async function clearBySource(colPath,src){
  const col=collection(db,colPath);let total=0;
  let snap=await getDocs(query(col,where('source','==',src)));
  while(!snap.empty){for(const d of snap.docs)await deleteDoc(d.ref);total+=snap.docs.length;console.log(`  deleted ${total}...`);snap=await getDocs(query(col,where('source','==',src)));}
  return total;
}
async function clearAll(colPath){
  const col=collection(db,colPath);let total=0;
  let snap=await getDocs(col);
  while(!snap.empty){for(const d of snap.docs)await deleteDoc(d.ref);total+=snap.docs.length;snap=await getDocs(col);}
  return total;
}

async function run(){
  console.log('1. Deleting old Historical bookings...');
  const d1=await clearBySource(`${TENANT}/bookings`,'Historical');
  console.log(`   Cleared ${d1}`);

  console.log('2. Parsing XLSX...');
  const{txs,exps}=parseXlsx();
  const transactions=assignTimes(txs);
  console.log(`   ${transactions.length} tx | ${exps.length} expenses`);

  console.log('3. Importing bookings...');
  const bCol=collection(db,`${TENANT}/bookings`);
  let tw=0;
  for(const tx of transactions){
    await addDoc(bCol,{bookingId:'HIST-'+tx.st.getTime()+'-'+Math.random().toString(36).slice(2,6),tenantId:'whitecross',clientName:'Walk-in',clientEmail:'',clientPhone:'',barberId:tx.barber.toLowerCase(),barberName:tx.barber,serviceId:tx.svc.id,date:ds(tx.st),time:ts(tx.st),startTime:Timestamp.fromDate(tx.st),endTime:Timestamp.fromDate(tx.et),status:'CHECKED_OUT',paidAmount:tx.amount,paymentMethod:tx.method,paymentType:tx.method,price:tx.amount,source:'Historical',createdAt:Timestamp.fromDate(new Date())});
    tw++;if(tw%50===0)console.log(`   ${tw}/${transactions.length}`);
  }
  console.log(`   Done: ${tw}`);

  console.log('4. Importing expenses...');
  await clearAll(`${TENANT}/expenses`);
  const eCol=collection(db,`${TENANT}/expenses`);
  for(const e of exps)await addDoc(eCol,{date:Timestamp.fromDate(e.date),type:e.type,amount:e.amount,note:'',source:'Historical',createdAt:Timestamp.fromDate(new Date())});
  console.log(`   ${exps.length} expenses`);

  console.log('5. Importing advances...');
  await clearAll(`${TENANT}/advances`);
  const aCol=collection(db,`${TENANT}/advances`);
  for(const a of ADV)await addDoc(aCol,{date:Timestamp.fromDate(new Date(a.date)),barber:a.barber,amount:a.amount,note:a.note,source:'Historical',createdAt:Timestamp.fromDate(new Date())});
  console.log(`   ${ADV.length} advances`);

  console.log('\nAll done!');process.exit(0);
}
run().catch(e=>{console.error(e);process.exit(1);});
