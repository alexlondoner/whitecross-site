
import { initializeApp }           from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut as fbSignOut }
                                    from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js';
import { getFirestore, collection, query, where, getDocs, addDoc, updateDoc, setDoc, doc, getDoc, orderBy, limit, startAfter, Timestamp, increment, onSnapshot }
                                    from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js';
import { getMessaging, getToken, onMessage }
                                    from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-messaging.js';

const app  = initializeApp({ apiKey:"AIzaSyA16eMVtA4ZOIu3ixCg8y8RUh-EAjMev3A", authDomain:"havuz-44f70.firebaseapp.com", projectId:"havuz-44f70", storageBucket:"havuz-44f70.firebasestorage.app", messagingSenderId:"1050766582653", appId:"1:1050766582653:web:7ddaa5acb3bec5ef122214" });
const auth      = getAuth(app);
const db        = getFirestore(app);
const T = 'tenants/whitecross';
const messaging = getMessaging(app);
const VAPID_KEY = 'BBBa1a0DusYI4jsDg5MC3-TFlju-_7qZhPuBaOPO0EKnaMayantmLRWgWhL3vdhFKjuvlrTrYgzb5D5wJIoYHDA';

// ── STATE ──────────────────────────────────────────────────────────────────
let currentUser = null, userRole = 'staff', barberName = '', staffName = '';
let allBarbers = [], allServices = [], allClients = [], allProducts = [];
let selectedDate = new Date(), activeDateFilter = 'all';
let currentBooking = null, coMethod = 'CASH', coTip = 0, coCustomTip = '', coTipMethod = '';
let wiBarberSel = '', wiqsBarberSel = '', btBarberSel = '', btDuration = 60;
let wiDateKey = '';
let coProducts = {}, coAddons = {}, coServiceOverride = null;
let wiSelectedClient = null, wiSelectedTime = '';
let wiqsSelectedClient = null, wiqsProducts = {}, wiqsAddons = {};
let depBookingRef = null, depMethod = 'CASH';
let _clientsLastDoc = null, _clientsAllLoaded = false;
let shopSettings = null;
let notifCount = 0, notifList = [], _notifKnownIds = new Set(), _notifPendingIds = new Set();

// ── HELPERS ─────────────────────────────────────────────────────────────────
const pp  = v => parseFloat(String(v||0).replace(/[£,]/g,''))||0;
const ini = n => (n||'?').split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2);
const fmtDate = d => {
  const n=new Date();
  const isT=d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate();
  if(isT) return 'Today · '+d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
  return d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'});
};
const toKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const COLORS = {Alex:'#c9a84c',Arda:'#4a8fbf',Kadim:'#4caf50',Manoj:'#ff9800'};
const bColor = n => COLORS[n] || '#888';
const STATUS_CLASS = {CONFIRMED:'s-confirmed',PENDING:'s-pending',CHECKED_OUT:'s-checked_out',CANCELLED:'s-cancelled',BLOCKED:'s-blocked',NO_SHOW:'s-no_show'};
const sClass = s => STATUS_CLASS[(s||'').toUpperCase()] || 's-confirmed';
const sLabel = s => s==='CHECKED_OUT'?'PAID':(s||'').toUpperCase();

function renderBarberAvatars(containerId, selected, selectFn){
  const el=document.getElementById(containerId); if(!el) return;
  el.innerHTML=allBarbers.map(b=>{
    const ini=b.name.split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2);
    const color=bColor(b.name);
    const isOn=b.name===selected;
    return `<div class="barber-av${isOn?' active':''}" onclick="${selectFn}('${b.name.replace(/'/g,"\\'")}')">
      <div class="barber-circle" style="background:${color}">${ini}</div>
      <div class="barber-av-name">${b.name.split(' ')[0]}</div>
    </div>`;
  }).join('');
}
window.selectWiBarber=function(name){ wiBarberSel=name; renderBarberAvatars('wi-barber-row',wiBarberSel,'selectWiBarber'); onWiParamChange(); };
window.selectWiqsBarber=function(name){ wiqsBarberSel=name; renderBarberAvatars('wiqs-barber-row',wiqsBarberSel,'selectWiqsBarber'); };
window.selectBtBarber=function(name){ btBarberSel=name; renderBarberAvatars('bt-barber-row',btBarberSel,'selectBtBarber'); onBtParamChange(); };
window.selectBtDuration=function(dur){
  btDuration=dur;
  document.querySelectorAll('#bt-dur-row .dur-btn').forEach((btn,i)=>{
    btn.classList.toggle('active',[30,60,90,120][i]===dur);
  });
  onBtParamChange();
};

function toast(msg, type=''){
  const t=document.getElementById('toast');
  t.textContent=msg; t.className='toast show '+(type||'');
  setTimeout(()=>t.className='toast',2600);
}
function canSeeAll(){ return userRole==='owner'||userRole==='admin'; }

// ── SHEETS ──────────────────────────────────────────────────────────────────
window.closeSheet=function(key){
  document.getElementById(key+'-overlay').classList.remove('open');
  document.getElementById(key+'-sheet').classList.remove('open');
};
window.openSheet=function(key){
  document.getElementById(key+'-overlay').classList.add('open');
  document.getElementById(key+'-sheet').classList.add('open');
  if(key==='bt') setTimeout(loadBtSlots,100);
  if(key==='wiqs'){
    ['wiqs-name','wiqs-phone','wiqs-email','wiqs-notes'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('wiqs-contact').style.display='none';
    document.getElementById('wiqs-suggest').innerHTML='';
    document.getElementById('wiqs-selected').style.display='none';
    wiqsSelectedClient=null; wiqsProducts={}; wiqsAddons={};
    renderWiqsExtras();
  }
};

// ── AUTH ─────────────────────────────────────────────────────────────────────
window.handleLogin=async function(e){
  e.preventDefault();
  const btn=document.getElementById('login-btn'), err=document.getElementById('login-err');
  btn.textContent='Signing in…'; btn.disabled=true; err.textContent='';
  try{
    await signInWithEmailAndPassword(auth, document.getElementById('login-email').value.trim(), document.getElementById('login-pass').value);
  }catch(ex){
    err.textContent='Invalid email or password';
    btn.textContent='Sign In'; btn.disabled=false;
  }
};
window.signOut=async()=>{ await fbSignOut(auth); };

let _avatarTimer=null;
window.handleAvatarTap=function(el){
  _avatarTimer=setTimeout(()=>{ _avatarTimer=null; if(confirm('Sign out?')) window.signOut(); },600);
};
document.addEventListener('touchend',()=>{ if(_avatarTimer){ clearTimeout(_avatarTimer); _avatarTimer=null; } },true);

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────
let _audioCtx=null;
function getAudioCtx(){
  if(!_audioCtx) _audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  if(_audioCtx.state==='suspended') _audioCtx.resume();
  return _audioCtx;
}
document.addEventListener('touchstart',()=>{ try{ getAudioCtx(); }catch(_){} },{once:true,passive:true});

function playNotifSound(){
  try{
    const ctx=getAudioCtx();
    [[880,0],[1108,0.13],[1318,0.26]].forEach(([freq,delay])=>{
      const osc=ctx.createOscillator(), gain=ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type='sine'; osc.frequency.value=freq;
      const t=ctx.currentTime+delay;
      gain.gain.setValueAtTime(0,t);
      gain.gain.linearRampToValueAtTime(0.2,t+0.04);
      gain.gain.exponentialRampToValueAtTime(0.001,t+0.5);
      osc.start(t); osc.stop(t+0.55);
    });
  }catch(_){}
}

function updateNotifBadge(){
  const badge=document.getElementById('notif-badge');
  if(!badge) return;
  badge.style.display = notifCount>0 ? 'block' : 'none';
  badge.textContent = notifCount>9 ? '9+' : notifCount;
}

let _notifUnsubs=[];

function _fireNotif(docId, data){
  if(_notifKnownIds.has(docId)) return;
  _notifKnownIds.add(docId);
  if(['CANCELLED','BLOCKED'].includes((data.status||'').toUpperCase())) return;
  const name=data.clientName||data.client||'New client';
  const time=data.time||(data.startTime?.toDate?new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false}).format(data.startTime.toDate()):'');
  notifList.unshift({id:docId,name,time,barber:data.barberName||data.barber||data.barberId||'',service:data.service||data.serviceName||''});
  notifCount++;
  updateNotifBadge();
  playNotifSound();
}

async function initPush(){
  if(!('Notification' in window)||!('serviceWorker' in navigator)) return;
  try{
    const permission=await Notification.requestPermission();
    if(permission!=='granted') return;
    const reg=await navigator.serviceWorker.ready;
    const token=await getToken(messaging,{vapidKey:VAPID_KEY,serviceWorkerRegistration:reg});
    if(token&&currentUser){
      await setDoc(doc(db,`${T}/fcmTokens`,token),{token,uid:currentUser.uid,updatedAt:Timestamp.fromDate(new Date())});
    }
    onMessage(messaging,()=>{ /* foreground: Firestore onSnapshot handles the in-app notification */ });
  }catch(e){ console.warn('Push init:',e); }
}

window._testNotif=function(){
  const id='__test__'+Date.now();
  _notifKnownIds.delete(id);
  _fireNotif(id,{clientName:'Test Client',time:'12:00',barberName:'Alex',service:'Haircut',status:'CONFIRMED'});
};

function startNotifListener(){
  _notifUnsubs.forEach(u=>u()); _notifUnsubs=[]; _notifKnownIds.clear(); _notifPendingIds.clear();
  const now=new Date();
  const todayStart=new Date(now); todayStart.setHours(0,0,0,0);
  const todayEnd=new Date(now); todayEnd.setHours(23,59,59,999);

  function handleChanges(snap){
    snap.docChanges().forEach(ch=>{
      const id=ch.doc.id; const data=ch.doc.data();
      const st=(data.status||'').toUpperCase();
      if(ch.type==='added'){
        if(st==='PENDING'){ _notifPendingIds.add(id); return; } // web booking — wait for Stripe confirm
        _fireNotif(id,data);
      } else if(ch.type==='modified' && st==='CONFIRMED' && _notifPendingIds.has(id)){
        _notifPendingIds.delete(id); _fireNotif(id,data); // payment confirmed
      }
    });
  }

  function makeL(q){
    let seeded=false;
    return onSnapshot(q,
      snap=>{
        if(!seeded){
          snap.docs.forEach(d=>{
            if((d.data().status||'').toUpperCase()==='PENDING') _notifPendingIds.add(d.id);
            else _notifKnownIds.add(d.id);
          });
          seeded=true; return;
        }
        handleChanges(snap);
      },
      err=>{ toast('Notif: '+err.code,'error'); }
    );
  }

  // Today's appointments (walk-ins + same-day web bookings)
  try{ _notifUnsubs.push(makeL(query(collection(db,`${T}/bookings`),where('startTime','>=',Timestamp.fromDate(todayStart)),where('startTime','<=',Timestamp.fromDate(todayEnd))))); }catch(e){}
  // Website bookings created today for any date (script.js sets pendingCreatedAt)
  try{ _notifUnsubs.push(makeL(query(collection(db,`${T}/bookings`),where('pendingCreatedAt','>=',Timestamp.fromDate(todayStart))))); }catch(e){}
  // Mobile/Fresha bookings created today (app.js sets createdAt)
  try{ _notifUnsubs.push(makeL(query(collection(db,`${T}/bookings`),where('createdAt','>=',Timestamp.fromDate(todayStart))))); }catch(e){}
}

window.openNotifPanel=function(){
  notifCount=0; updateNotifBadge();
  const body=document.getElementById('notif-body');
  body.innerHTML=(notifList.length===0
    ?`<div style="padding:24px;text-align:center;color:var(--muted);font-size:0.88rem;">No new bookings yet</div>`
    :notifList.map(n=>`<div style="padding:14px 20px;border-bottom:1px solid var(--border);"><div style="font-weight:700;font-size:0.9rem;">${n.name}</div><div style="font-size:0.78rem;color:var(--muted);">${n.time}${n.barber?' · '+n.barber:''}${n.service?' · '+n.service:''}</div></div>`).join('')
  )+`<div style="padding:12px 20px;border-top:1px solid var(--border);"><button onclick="_testNotif()" style="width:100%;padding:10px;background:var(--card2);border:1px solid var(--border);border-radius:8px;color:var(--muted);font-size:0.78rem;cursor:pointer;font-family:var(--font-ui)">Test sound & notification</button></div>`;
  document.getElementById('notif-overlay').classList.add('open');
  document.getElementById('notif-sheet').classList.add('open');
};
window.closeNotifPanel=function(){
  document.getElementById('notif-overlay').classList.remove('open');
  document.getElementById('notif-sheet').classList.remove('open');
};

onAuthStateChanged(auth, async user=>{
  if(user){
    currentUser=user;
    document.getElementById('screen-login').classList.remove('active');
    const app=document.getElementById('app');
    app.style.display='flex'; app.style.flexDirection='column'; app.style.flex='1'; app.style.overflow='hidden';
    await loadMeta();
    renderDateUI();
    loadBookings();
    loadClients();
    startNotifListener();
    initPush();
    const _deepId=new URLSearchParams(location.search).get('bookingId');
    if(_deepId){ history.replaceState(null,'','/'); openBookingById(_deepId); }
  } else {
    currentUser=null;
    _notifUnsubs.forEach(u=>u()); _notifUnsubs=[];
    document.getElementById('screen-login').classList.add('active');
    document.getElementById('app').style.display='none';
  }
});

// ── META ─────────────────────────────────────────────────────────────────────
async function loadMeta(){
  try{
    const [bSnap,sSnap,settSnap,pSnap]=await Promise.all([
      getDocs(collection(db,`${T}/barbers`)),
      getDocs(collection(db,`${T}/services`)),
      getDoc(doc(db,`${T}/settings/settings`)),
      getDocs(collection(db,`${T}/products`)),
    ]);
    if(settSnap.exists()) shopSettings=settSnap.data();
    allBarbers=bSnap.docs.map(d=>({id:d.id,...d.data()})).filter(b=>b.active!==false).sort((a,b)=>(a.order||99)-(b.order||99));
    allServices=sSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.order||99)-(b.order||99));
    allProducts=pSnap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.active!==false).sort((a,b)=>(a.order||99)-(b.order||99));

    const staffDoc=await getDoc(doc(db,`${T}/staff`,currentUser.uid));
    if(staffDoc.exists()){
      const sd=staffDoc.data();
      staffName=sd.name||''; userRole=sd.role||'staff';
      const matched=allBarbers.find(b=>(b.name||'').toLowerCase()===(staffName||'').toLowerCase());
      barberName=matched?matched.name:staffName;
    }

    document.getElementById('user-avatar').textContent=ini(barberName||staffName||currentUser.email);

    // Build barber filter pills
    const filterRow=document.getElementById('barber-filter-row');
    if(filterRow&&canSeeAll()){
      filterRow.innerHTML=`<button class="filter-pill active" data-barber="all" onclick="setBarberFilter('all',this)">All</button>`
        +allBarbers.map(b=>`<button class="filter-pill" data-barber="${b.name}" onclick="setBarberFilter('${b.name}',this)" style="--pill-color:${bColor(b.name)}">${b.name}</button>`).join('');
    }

    const defaultBarber=barberName||allBarbers[0]?.name||'';
    wiBarberSel=defaultBarber; wiqsBarberSel=defaultBarber; btBarberSel=defaultBarber;
    renderBarberAvatars('wi-barber-row',wiBarberSel,'selectWiBarber');
    renderBarberAvatars('wiqs-barber-row',wiqsBarberSel,'selectWiqsBarber');
    renderBarberAvatars('bt-barber-row',btBarberSel,'selectBtBarber');

    const ss=document.getElementById('wi-service');
    ss.innerHTML=allServices.map(s=>`<option value="${s.id}">${s.name} · £${s.price}${s.duration?' ('+s.duration+'min)':''}</option>`).join('');

    ['wiqs-service'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=allServices.map(s=>`<option value="${s.id}">${s.name} · £${s.price}</option>`).join(''); });

    const now=new Date();
    wiDateKey=toKey(now);
    document.getElementById('wi-date').value=wiDateKey;
    document.getElementById('bt-date').value=toKey(now);
    renderWiDatePills();
    updateWiModeBanner();
  }catch(e){ console.error('loadMeta',e); }
}

// ── BARBER FILTER ────────────────────────────────────────────────────────────
window.setBarberFilter=function(barber, btn){
  activeDateFilter=barber;
  document.querySelectorAll('#barber-filter-row .filter-pill').forEach(p=>p.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderBookingList();
};

function renderBookingList(){
  const bks=window._bookings||[];

  // Rebuild filter pills to only show barbers working on the selected date
  if(canSeeAll()){
    const _DAYS2=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const _dn=_DAYS2[selectedDate.getDay()];
    const _iw=b=>{ if(Array.isArray(b.workingDays)&&b.workingDays.length) return b.workingDays.includes(_dn); if(b.dayHours&&b.dayHours[_dn]!=null) return !b.dayHours[_dn].closed; return true; };
    const workingBs=allBarbers.filter(_iw);
    if(activeDateFilter!=='all'&&!workingBs.some(b=>b.name.toLowerCase()===activeDateFilter.toLowerCase())) activeDateFilter='all';
    const filterRow=document.getElementById('barber-filter-row');
    if(filterRow) filterRow.innerHTML=
      `<button class="filter-pill ${activeDateFilter==='all'?'active':''}" data-barber="all" onclick="setBarberFilter('all',this)">All</button>`
      +workingBs.map(b=>`<button class="filter-pill ${activeDateFilter===b.name?'active':''}" data-barber="${b.name}" onclick="setBarberFilter('${b.name}',this)" style="--pill-color:${bColor(b.name)}">${b.name}</button>`).join('');
  }

  const filtered = activeDateFilter==='all' ? bks : bks.filter(b=>(b.barberName||'').toLowerCase()===activeDateFilter.toLowerCase());
  const list=document.getElementById('bookings-list');
  list.style.padding='0'; list.style.overflowY='hidden';
  list.innerHTML=renderCalendar(filtered);
  scrollCalToNow();
}

function scrollCalToNow(){
  const outer=document.getElementById('cal-outer');
  if(!outer) return;
  const SLOT_H=54;
  const dayH=getDayHours(selectedDate);
  const openMins=dayH.closed?9*60:t2m(dayH.open||'09:00');
  const now=new Date();
  const isToday=selectedDate.toDateString()===now.toDateString();
  if(isToday){
    const nowMins=now.getHours()*60+now.getMinutes();
    outer.scrollTop=Math.max(0,(nowMins-openMins)/30*SLOT_H-120);
  } else {
    const bks=window._bookings||[];
    const first=bks.find(b=>!['CANCELLED'].includes((b.status||'').toUpperCase()));
    if(first&&first.time) outer.scrollTop=Math.max(0,(t2m(first.time)-openMins)/30*SLOT_H-40);
  }
}

// ── NEW SCREEN TYPE ──────────────────────────────────────────────────────────
window.setNewType=function(type){
  ['booking','walkin','block'].forEach(t=>{ const btn=document.getElementById('type-btn-'+t); if(btn) btn.classList.toggle('active',t===type); });
};

// ── WALK-IN QUICK ─────────────────────────────────────────────────────────
window.onWiqsNameInput=function(val){
  document.getElementById('wiqs-contact').style.display=(val.trim()&&!wiqsSelectedClient)?'block':'none';
  const sug=document.getElementById('wiqs-suggest');
  if(!val.trim()||wiqsSelectedClient){ sug.innerHTML=''; return; }
  const lq=val.toLowerCase();
  const found=allClients.filter(c=>(c.name||'').toLowerCase().includes(lq)||(c.phone||'').includes(val)||(c.email||'').toLowerCase().includes(lq)).slice(0,5);
  if(!found.length){ sug.innerHTML=''; return; }
  sug.innerHTML=found.map(c=>`<div onclick="selectWiqsClient(${allClients.indexOf(c)})" style="padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px;margin-bottom:4px;cursor:pointer;display:flex;align-items:center;gap:10px;-webkit-tap-highlight-color:transparent"><div style="width:32px;height:32px;border-radius:50%;background:${bColor(c.lastBarber)};display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:#0a0705;flex-shrink:0">${ini(c.name)}</div><div><div style="font-size:0.85rem;font-weight:600;color:var(--text)">${c.name}</div><div style="font-size:0.68rem;color:var(--muted)">${c.phone||c.email||''}</div></div></div>`).join('');
};

window.selectWiqsClient=function(i){
  const c=allClients[i]; if(!c) return;
  wiqsSelectedClient=c;
  document.getElementById('wiqs-suggest').innerHTML='';
  document.getElementById('wiqs-name').value='';
  const sel=document.getElementById('wiqs-selected');
  sel.style.display='flex';
  sel.innerHTML=`<span>${c.name}${c.phone?' · '+c.phone:''}</span><button onclick="clearWiqsClient()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:0.9rem;padding:0;line-height:1">✕</button>`;
  document.getElementById('wiqs-phone').value=c.phone||'';
  document.getElementById('wiqs-email').value=c.email||'';
  document.getElementById('wiqs-contact').style.display='none';
};
window.clearWiqsClient=function(){
  wiqsSelectedClient=null;
  document.getElementById('wiqs-selected').style.display='none';
  document.getElementById('wiqs-phone').value='';
  document.getElementById('wiqs-email').value='';
};

function renderWiqsExtras(){
  const el=document.getElementById('wiqs-extras'); if(!el) return;
  const extras=allServices.filter(s=>s.category==='Extras');
  if(!extras.length&&!allProducts.length){ el.innerHTML=''; return; }
  const stepper=(type,id,name,price,qty)=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05)"><div style="flex:1;min-width:0"><div style="font-size:0.78rem;font-weight:600;color:var(--text)">${name}</div><div style="font-size:0.65rem;color:var(--muted)">£${parseFloat(price).toFixed(2)}</div></div><div style="display:flex;align-items:center;gap:10px;flex-shrink:0;margin-left:10px"><button onclick="wiqsAdj('${type}','${id}',-1)" style="width:28px;height:28px;border-radius:50%;border:1.5px solid var(--border);background:transparent;color:var(--text);font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">−</button><span style="font-size:0.85rem;font-weight:700;color:${qty>0?'var(--gold)':'var(--muted)'};min-width:16px;text-align:center">${qty}</span><button onclick="wiqsAdj('${type}','${id}',1)" style="width:28px;height:28px;border-radius:50%;border:1.5px solid var(--border);background:transparent;color:var(--text);font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">+</button></div></div>`;
  el.innerHTML=`${extras.length?`<div class="form-group" style="margin-bottom:6px"><label class="form-lbl">Add-ons</label>${extras.map(s=>stepper('addon',s.id,s.name,s.price,wiqsAddons[s.id]||0)).join('')}</div>`:''}${allProducts.length?`<div class="form-group" style="margin-bottom:6px"><label class="form-lbl">Products</label>${allProducts.map(p=>stepper('product',p.id,p.name,p.price,wiqsProducts[p.id]||0)).join('')}</div>`:''}`;
}
window.wiqsAdj=function(type,id,d){
  if(type==='product'){ wiqsProducts[id]=Math.max(0,(wiqsProducts[id]||0)+d); }
  else { wiqsAddons[id]=Math.max(0,(wiqsAddons[id]||0)+d); }
  renderWiqsExtras();
};

window.createWalkInQuick=async function(){
  const typedName=(document.getElementById('wiqs-name').value||'').trim();
  const clientName=wiqsSelectedClient?.name||typedName||'Walk-in';
  const phone=wiqsSelectedClient?.phone||(document.getElementById('wiqs-phone').value||'').trim();
  const email=wiqsSelectedClient?.email||(document.getElementById('wiqs-email').value||'').trim();
  const barber=wiqsBarberSel;
  const svcId=document.getElementById('wiqs-service').value;
  const note=(document.getElementById('wiqs-notes').value||'').trim();
  const svc=allServices.find(s=>s.id===svcId)||{};
  const extras=allServices.filter(s=>s.category==='Extras');
  const now=new Date();
  const time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const bookingId='walkin-'+Date.now();
  const initSoldAddOns=Object.entries(wiqsAddons).filter(([,q])=>q>0).map(([id,qty])=>{ const s=extras.find(x=>x.id===id); return {productId:id,name:s?.name||'',price:parseFloat(s?.price)||0,qty}; });
  const initSoldProducts=Object.entries(wiqsProducts).filter(([,q])=>q>0).map(([id,qty])=>{ const p=allProducts.find(x=>x.id===id); return {productId:id,name:p?.name||'',price:parseFloat(p?.price)||0,qty}; });
  try{
    const newRef=await addDoc(collection(db,`${T}/bookings`),{bookingId,clientName,clientPhone:phone,clientEmail:email,barberName:barber,serviceId:svcId,service:svcId,price:svc.price||0,time,date:now.toLocaleDateString('en-GB'),startTime:Timestamp.fromDate(now),endTime:Timestamp.fromDate(new Date(now.getTime()+(svc.duration||30)*60000)),status:'CONFIRMED',source:'Walk-in',note,soldAddOns:initSoldAddOns,soldProducts:initSoldProducts,createdAt:Timestamp.fromDate(now)});
    currentBooking={_ref:newRef,bookingId,clientName,clientPhone:phone,clientEmail:email,barberName:barber,serviceId:svcId,service:svcId,price:svc.price||0,time,source:'Walk-in',note,soldAddOns:initSoldAddOns,soldProducts:initSoldProducts};
    coProducts={...wiqsProducts}; coAddons={...wiqsAddons};
    ['wiqs-name','wiqs-phone','wiqs-email','wiqs-notes'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('wiqs-contact').style.display='none';
    document.getElementById('wiqs-suggest').innerHTML='';
    document.getElementById('wiqs-selected').style.display='none';
    wiqsSelectedClient=null;
    closeSheet('wiqs');
    toast('Walk-in created','success');
    setTab('today'); loadBookings(true);
    setTimeout(openCheckout,350);
  }catch(ex){ toast('Error: '+ex.message,'error'); }
};

// ── BLOCK TIME ────────────────────────────────────────────────────────────
let btSelectedTime='';
window.onBtParamChange=function(){
  btSelectedTime=''; document.getElementById('bt-time').value='';
  const btn=document.getElementById('bt-submit'); btn.disabled=true; btn.style.opacity='0.5'; btn.textContent='Select a time first';
  loadBtSlots();
};
window.selectBtSlot=function(mins,label){
  btSelectedTime=label; document.getElementById('bt-time').value=label;
  const btn=document.getElementById('bt-submit'); btn.disabled=false; btn.style.opacity='1'; btn.textContent=`Block ${label} →`;
  document.querySelectorAll('#bt-slot-grid .slot-btn').forEach(b=>{ b.classList.toggle('sel',b.dataset.mins==mins); });
};

async function loadBtSlots(){
  const grid=document.getElementById('bt-slot-grid');
  const barber=btBarberSel;
  const dateVal=document.getElementById('bt-date').value;
  const duration=btDuration;
  if(!barber||!dateVal){ grid.innerHTML='<div style="color:var(--muted);font-size:0.78rem;padding:4px 0">Select barber and date first</div>'; return; }
  const[yr,mo,dy]=dateVal.split('-').map(Number);
  const selDate=new Date(yr,mo-1,dy);
  if(!isBarberWorking(barber,selDate)){ grid.innerHTML=`<div class="closed-msg">${barber} is not working this day</div>`; return; }
  const dayHours=getDayHours(selDate);
  if(dayHours.closed){ grid.innerHTML=`<div class="closed-msg">Shop closed</div>`; return; }
  grid.innerHTML='<div class="loader" style="padding:16px 0"><div class="spinner"></div></div>';
  const openMins=t2m(dayHours.open), closeMins=t2m(dayHours.close);
  try{
    const allBks=await _fetchOrCacheSlotBks(dateVal);
    const now=new Date(), isToday=dateVal===toKey(now), nowMins=now.getHours()*60+now.getMinutes();
    const busy=[];
    allBks.forEach(b=>{ if((b.barberName||'').toLowerCase()!==barber.toLowerCase()) return; if(['CANCELLED'].includes((b.status||'').toUpperCase())) return; let sm; if(b.startTime?.toDate){const t=b.startTime.toDate();sm=t.getHours()*60+t.getMinutes();}else if(b.time){sm=t2m(b.time);}else return; const bDur=(b.status==='BLOCKED'?duration:(allServices.find(s=>s.id===(b.serviceId||b.service))||{}).duration||30); busy.push([sm,sm+bDur]); });
    const slots=[];
    for(let m=openMins;m+duration<=closeMins;m+=15){ const isPast=isToday&&m<nowMins; const isBusy=busy.some(([bs,be])=>m<be&&(m+duration)>bs); slots.push({mins:m,label:m2t(m),past:isPast,busy:isBusy}); }
    document.getElementById('bt-time-lbl').textContent=`Available Times — ${duration}min block`;
    grid.innerHTML=slots.map(s=>{ const cls=s.past?'slot-btn past':s.busy?'slot-btn busy':'slot-btn'; const click=s.past||s.busy?'':` data-mins="${s.mins}" onclick="selectBtSlot(${s.mins},'${s.label}')"`;  return `<button class="${cls}"${click}>${s.label}</button>`; }).join('');
  }catch(e){ grid.innerHTML=`<div style="color:var(--red);font-size:0.78rem">${e.message}</div>`; }
}

window.createBlockTime=async function(){
  const barber=btBarberSel;
  const time=document.getElementById('bt-time').value;
  const dateVal=document.getElementById('bt-date').value;
  const duration=btDuration;
  const note=document.getElementById('bt-note').value.trim();
  if(!time){ toast('Select a time slot','error'); return; }
  const[yr,mo,dy]=dateVal.split('-').map(Number);
  const[h,m]=time.split(':').map(Number);
  const start=new Date(yr,mo-1,dy,h,m,0);
  try{
    await addDoc(collection(db,`${T}/bookings`),{bookingId:'block-'+Date.now(),barberName:barber,time,date:start.toLocaleDateString('en-GB'),startTime:Timestamp.fromDate(start),endTime:Timestamp.fromDate(new Date(start.getTime()+duration*60000)),status:'BLOCKED',source:'Manual',note:note||'Blocked',createdAt:Timestamp.fromDate(new Date())});
    document.getElementById('bt-note').value=''; document.getElementById('bt-time').value=''; btSelectedTime='';
    const btn=document.getElementById('bt-submit'); btn.disabled=true; btn.style.opacity='0.5'; btn.textContent='Select a time first';
    closeSheet('bt'); toast('Time blocked','success'); loadBookings(true); loadBtSlots();
  }catch(ex){ toast('Error: '+ex.message,'error'); }
};

// ── SLOT PICKER ──────────────────────────────────────────────────────────────
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const t2m=t=>{ if(!t) return 9*60; const ampm=t.match(/(\d+):(\d+)\s*(AM|PM)/i); if(ampm){ let h=parseInt(ampm[1]),m=parseInt(ampm[2]); const ap=ampm[3].toUpperCase(); if(ap==='PM'&&h!==12)h+=12; if(ap==='AM'&&h===12)h=0; return h*60+m; } const[h,m]=t.split(':').map(Number); return h*60+(m||0); };
const m2t=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

function getDayHours(date){
  const day=DAYS[date.getDay()];
  const base=(shopSettings?.hours||{})[day]||{open:'09:00',close:'19:00',closed:false};
  const dk=toKey(date);
  const sp=(shopSettings?.specialHours||[]).find(s=>s.date===dk);
  if(sp) return {open:sp.open||base.open,close:sp.close||base.close,closed:!!sp.closed,note:sp.note||''};
  return base;
}
function isBarberWorking(name, date){
  const b=allBarbers.find(x=>x.name.toLowerCase()===name.toLowerCase());
  if(!b) return true;
  const dayName=DAYS[date.getDay()];
  if(Array.isArray(b.workingDays)&&b.workingDays.length) return b.workingDays.includes(dayName);
  if(b.dayHours&&b.dayHours[dayName]!=null) return !b.dayHours[dayName].closed;
  return true;
}

async function _fetchOrCacheSlotBks(dateVal){
  if(_bkCache.has(dateVal)) return _bkCache.get(dateVal);
  const[yr,mo,dy]=dateVal.split('-').map(Number);
  const s0=new Date(yr,mo-1,dy,0,0,0), s1=new Date(yr,mo-1,dy,23,59,59);
  const snap=await getDocs(query(collection(db,`${T}/bookings`),where('startTime','>=',Timestamp.fromDate(s0)),where('startTime','<=',Timestamp.fromDate(s1))));
  const bks=snap.docs.map(d=>({_id:d.id,_ref:d.ref,...d.data()}));
  _bkCache.set(dateVal,bks);
  return bks;
}

window.onWiParamChange=function(){
  wiSelectedTime=''; document.getElementById('wi-time').value='';
  const btn=document.getElementById('wi-submit');
  const todayKey=toKey(new Date()); const isToday=!wiDateKey||wiDateKey===todayKey;
  btn.disabled=true; btn.style.opacity='0.5';
  btn.textContent=isToday?'⚡ Select a time first':'📅 Select a time first';
  btn.style.background=isToday?'':'transparent';
  btn.style.border=isToday?'':'1.5px solid var(--border)';
  btn.style.color=isToday?'':'var(--muted)';
  btn.style.boxShadow=isToday?'':'none';
  loadWiSlots();
};
window.selectWiSlot=function(mins,label){
  wiSelectedTime=label; document.getElementById('wi-time').value=label;
  const btn=document.getElementById('wi-submit');
  btn.disabled=false; btn.style.opacity='1';
  const todayKey=toKey(new Date()); const isToday=!wiDateKey||wiDateKey===todayKey;
  if(isToday){
    btn.textContent=`⚡ Book ${label} → Checkout`;
    btn.style.background=''; btn.style.border=''; btn.style.color=''; btn.style.boxShadow='';
  } else {
    const[yr,mo,dy]=wiDateKey.split('-').map(Number);
    const d=new Date(yr,mo-1,dy);
    const dayLabel=d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
    btn.textContent=`📅 Book ${label} for ${dayLabel}`;
    btn.style.background='transparent'; btn.style.border='1.5px solid var(--gold)';
    btn.style.color='var(--gold)'; btn.style.boxShadow='none';
  }
  document.querySelectorAll('.slot-btn').forEach(b=>{ if(b.dataset.mins==mins) b.classList.add('sel'); else b.classList.remove('sel'); });
};

function renderWiDatePills(){
  const pills=document.getElementById('wi-date-pills'); if(!pills) return;
  const today=new Date(); const todayKey=toKey(today);
  if(!wiDateKey) wiDateKey=todayKey;
  const tomorrow=new Date(today); tomorrow.setDate(today.getDate()+1);
  const tomorrowKey=toKey(tomorrow);
  const isPicked=wiDateKey!==todayKey&&wiDateKey!==tomorrowKey;
  const pickedLabel=isPicked
    ? (()=>{ const[yr,mo,dy]=wiDateKey.split('-').map(Number); return new Date(yr,mo-1,dy).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}); })()
    : 'Select Manually';
  pills.innerHTML=
    `<div class="dp${wiDateKey===todayKey?' on':''}" onclick="selectWiDatePill('${todayKey}')">Today</div>`+
    `<div class="dp${wiDateKey===tomorrowKey?' on':''}" onclick="selectWiDatePill('${tomorrowKey}')">Tomorrow</div>`+
    `<label class="dp${isPicked?' on':''}" style="position:relative;overflow:hidden;cursor:pointer">${pickedLabel}<input type="date" id="wi-pick-input" value="${wiDateKey}" min="${todayKey}" onchange="if(this.value)selectWiDatePill(this.value)" style="position:absolute;inset:0;opacity:0;cursor:pointer;font-size:16px;width:100%;height:100%;"></label>`;
}
window.selectWiDatePill=function(k){
  wiDateKey=k; document.getElementById('wi-date').value=k;
  renderWiDatePills(); updateWiModeBanner(); onWiParamChange();
};
function updateWiModeBanner(){
  const banner=document.getElementById('wi-mode-banner'); if(!banner) return;
  const todayKey=toKey(new Date()); const isToday=!wiDateKey||wiDateKey===todayKey;
  if(isToday){
    banner.className='mode-banner today';
    banner.innerHTML='<div class="mode-dot"></div><span>Today · will go straight to checkout</span>';
  } else {
    const[yr,mo,dy]=wiDateKey.split('-').map(Number);
    const d=new Date(yr,mo-1,dy);
    const label=d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
    banner.className='mode-banner future';
    banner.innerHTML=`<div class="mode-dot"></div><span>${label} · will save as booking</span>`;
  }
}

async function loadWiSlots(){
  const grid=document.getElementById('wi-slot-grid');
  const barber=wiBarberSel;
  const svcId=document.getElementById('wi-service').value;
  const dateVal=wiDateKey||toKey(new Date());
  if(!barber||!svcId||!dateVal){ grid.innerHTML='<div style="color:var(--muted);font-size:0.78rem;padding:4px 0">Select barber, service and date first</div>'; return; }
  const[yr,mo,dy]=dateVal.split('-').map(Number);
  const selDate=new Date(yr,mo-1,dy);
  if(!isBarberWorking(barber,selDate)){ grid.innerHTML=`<div class="closed-msg">${barber} is not working this day</div>`; return; }
  const dayHours=getDayHours(selDate);
  if(dayHours.closed){ grid.innerHTML=`<div class="closed-msg">Shop closed${dayHours.note?' · '+dayHours.note:''}</div>`; return; }
  grid.innerHTML='<div class="loader" style="padding:16px 0"><div class="spinner"></div></div>';
  const svc=allServices.find(s=>s.id===svcId)||{};
  const duration=svc.duration||30;
  const openMins=t2m(dayHours.open), closeMins=t2m(dayHours.close);
  try{
    const allBks=await _fetchOrCacheSlotBks(dateVal);
    const now=new Date(), isToday=dateVal===toKey(now), nowMins=now.getHours()*60+now.getMinutes();
    const busy=[];
    allBks.forEach(b=>{ if((b.barberName||'').toLowerCase()!==barber.toLowerCase()) return; if(['CANCELLED'].includes((b.status||'').toUpperCase())) return; let sm; if(b.startTime?.toDate){const t=b.startTime.toDate();sm=t.getHours()*60+t.getMinutes();}else if(b.time){sm=t2m(b.time);}else return; const bDur=(allServices.find(s=>s.id===(b.serviceId||b.service))||{}).duration||30; busy.push([sm,sm+bDur]); });
    const slots=[];
    for(let m=openMins;m+duration<=closeMins;m+=15){ const isPast=isToday&&m<nowMins; const isBusy=busy.some(([bs,be])=>m<be&&(m+duration)>bs); slots.push({mins:m,label:m2t(m),past:isPast,busy:isBusy}); }
    if(!slots.length){ grid.innerHTML='<div style="color:var(--muted);font-size:0.78rem;padding:4px 0">No slots available</div>'; return; }
    const avail=slots.filter(s=>!s.past&&!s.busy).length;
    document.getElementById('wi-time-lbl').textContent=`Available Times — ${duration}min · ${avail} free`;
    grid.innerHTML=slots.map(s=>{ const cls=s.past?'slot-btn past':s.busy?'slot-btn busy':'slot-btn'; const click=s.past||s.busy?'':` data-mins="${s.mins}" onclick="selectWiSlot(${s.mins},'${s.label}')"`;  return `<button class="${cls}"${click}>${s.label}</button>`; }).join('');
  }catch(e){ grid.innerHTML=`<div style="color:var(--red);font-size:0.78rem">${e.message}</div>`; }
}

// ── BOOKINGS ─────────────────────────────────────────────────────────────────
function renderDateUI(){
  document.getElementById('topbar-date').textContent=fmtDate(selectedDate).toUpperCase();
  document.getElementById('date-label').textContent=fmtDate(selectedDate);
}

window.loadBookings=loadBookings;
window.changeDay=function(d){ selectedDate=new Date(selectedDate); selectedDate.setDate(selectedDate.getDate()+d); window._bookingDate=null; renderDateUI(); loadBookings(); };
window.goToday=function(){ selectedDate=new Date(); window._bookingDate=null; renderDateUI(); loadBookings(); };

const _bkCache=new Map();
function _invalidateCache(dateKey){ if(dateKey) _bkCache.delete(dateKey); else _bkCache.clear(); }

async function _fetchBookingsForDate(date){
  const s0=new Date(date); s0.setHours(0,0,0,0);
  const s1=new Date(date); s1.setHours(23,59,59,999);
  const _m=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dateStr1=date.toLocaleDateString('en-GB');
  const dateStr2=date.getDate()+' '+_m[date.getMonth()]+' '+date.getFullYear();
  const [snap1, s2, s3] = await Promise.all([
    getDocs(query(collection(db,`${T}/bookings`),where('startTime','>=',Timestamp.fromDate(s0)),where('startTime','<=',Timestamp.fromDate(s1)))),
    getDocs(query(collection(db,`${T}/bookings`),where('date','==',dateStr1))),
    getDocs(query(collection(db,`${T}/bookings`),where('date','==',dateStr2))),
  ]);
  const _seen=new Set(snap1.docs.map(d=>d.id));
  const allDocs=[...snap1.docs,...s2.docs.filter(d=>!_seen.has(d.id)),...s3.docs.filter(d=>!_seen.has(d.id)&&!s2.docs.some(x=>x.id===d.id))];
  return allDocs.map(d=>({_id:d.id,_ref:d.ref,...d.data()}));
}

function _prefetchAdjacent(){
  [-1,1].forEach(offset=>{
    const d=new Date(selectedDate); d.setDate(d.getDate()+offset);
    const k=toKey(d);
    if(!_bkCache.has(k)) _fetchBookingsForDate(d).then(bks=>_bkCache.set(k,bks)).catch(()=>{});
  });
}

async function loadBookings(force=false){
  const key=toKey(selectedDate);
  if(!force && _bkCache.has(key)){
    let bks=_bkCache.get(key);
    if(!canSeeAll()&&barberName) bks=bks.filter(b=>(b.barberName||b.barberId||'').toLowerCase()===barberName.toLowerCase());
    bks=[...bks].sort((a,b)=>(a.time||'').localeCompare(b.time||''));
    window._bookings=bks; window._bookingDate=key;
    renderBookingList();
    _prefetchAdjacent();
    return;
  }
  if(force) _bkCache.clear();
  const list=document.getElementById('bookings-list');
  list.style.padding='0'; list.style.overflowY='hidden';
  list.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:48px;"><div class="spinner"></div></div>';
  try{
    const raw=await _fetchBookingsForDate(selectedDate);
    _bkCache.set(key,raw);
    let bks=raw;
    if(!canSeeAll()&&barberName) bks=bks.filter(b=>(b.barberName||b.barberId||'').toLowerCase()===barberName.toLowerCase());
    bks=[...bks].sort((a,b)=>(a.time||'').localeCompare(b.time||''));
    window._bookings=bks; window._bookingDate=key;
    renderBookingList();
    _prefetchAdjacent();
  }catch(ex){
    list.style.padding='14px'; list.style.overflowY='auto';
    list.innerHTML=`<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">${ex.message}</div></div>`;
  }
}

function renderCalendar(bks){
  const SLOT_H=54;
  const dayH=getDayHours(selectedDate);
  const openMins=dayH.closed?9*60:t2m(dayH.open||'09:00');
  const closeMins=dayH.closed?20*60:t2m(dayH.close||'21:00');
  const _DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const _dayName=_DAYS[selectedDate.getDay()];
  const _isWorking=b=>{ if(Array.isArray(b.workingDays)&&b.workingDays.length) return b.workingDays.includes(_dayName); if(b.dayHours&&b.dayHours[_dayName]!=null) return !b.dayHours[_dayName].closed; return true; };
  const cols=(canSeeAll()?allBarbers:allBarbers.filter(b=>b.name.toLowerCase()===barberName.toLowerCase())).filter(_isWorking).filter(b=>activeDateFilter==='all'||b.name.toLowerCase()===activeDateFilter.toLowerCase());
  const slots=[];
  for(let m=openMins;m<closeMins;m+=30) slots.push(m);
  const totalH=slots.length*SLOT_H;
  const now=new Date();
  const isToday=selectedDate.toDateString()===now.toDateString();
  const nowMins=now.getHours()*60+now.getMinutes();
  const nowTop=isToday&&nowMins>=openMins&&nowMins<=closeMins?((nowMins-openMins)/30*SLOT_H):null;

  const bPos=b=>{ let sm=openMins; if(b.time){sm=t2m(b.time);}else if(b.startTime?.toDate){const d=b.startTime.toDate();const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false});const[hh,mm]=fmt.format(d).split(':');sm=parseInt(hh)*60+parseInt(mm);} const dur=(allServices.find(s=>s.id===(b.serviceId||b.service))||{}).duration||30; const top=Math.max(0,(sm-openMins)/30*SLOT_H); const height=Math.max(SLOT_H-4,dur/30*SLOT_H-3); return{top,height,dur}; };

  const colData=cols.map(col=>{
    const colBks=bks.filter(b=>(b.barberName||b.barber||b.barberId||'').toLowerCase()===col.name.toLowerCase());
    const items=colBks.map(b=>({b,...bPos(b)}));
    items.sort((a,b)=>a.top-b.top);
    const laneEnds=[];
    items.forEach(item=>{ let l=0; while(l<laneEnds.length&&laneEnds[l]>item.top+1)l++; item.lane=l; laneEnds[l]=item.top+item.height; });
    items.forEach(item=>{ let maxLane=item.lane; items.forEach(other=>{ if(other!==item&&item.top<other.top+other.height&&item.top+item.height>other.top){ maxLane=Math.max(maxLane,other.lane); } }); item.totalLanes=maxLane+1; });
    return{col,colBks,items};
  });

  // Revenue strip data
  const checkedOut=bks.filter(b=>(b.status||'').toUpperCase()==='CHECKED_OUT');
  const revenue=checkedOut.reduce((s,b)=>s+pp(b.paidAmount||b.price),0);
  const remaining=bks.filter(b=>!['CHECKED_OUT','CANCELLED','BLOCKED'].includes((b.status||'').toUpperCase())).length;

  const headHtml=`<div class="cal-sticky-head"><div class="cal-corner"></div>${colData.map(({col,colBks})=>`<div class="cal-barber-hd" style="color:${bColor(col.name)}">${col.name}<span class="cal-apts-badge">${colBks.length} apt${colBks.length===1?'':'s'}</span></div>`).join('')}</div>`;
  const timeHtml=slots.map(m=>{ const onHour=m%60===0; return `<div class="cal-time-lbl${onHour?'':' half'}">${onHour?m2t(m):''}</div>`; }).join('');
  const rowsHtml=slots.map(m=>`<div class="cal-row${m%60===0?' on-hour':''}"></div>`).join('');

  const colsHtml=colData.map(({col,items})=>{
    const events=items.map(item=>{
      const{b,top,height,lane,totalLanes}=item;
      const st=(b.status||'').toUpperCase();
      const idx=window._bookings.indexOf(b);
      const color=st==='BLOCKED'?'#6b5f43':bColor(col.name);
      const bg=st==='CHECKED_OUT'?`${color}14`:st==='CANCELLED'?`${color}0a`:st==='BLOCKED'?'rgba(42,34,24,0.9)':`${color}1a`;
      const border=st==='CANCELLED'?`${color}44`:color;
      const opacity=st==='CANCELLED'?'0.45':'1';
      const label=st==='BLOCKED'?(b.note||'Block'):(b.clientName||'Walk-in');
      const svcName=(allServices.find(s=>s.id===(b.serviceId||b.service))||{}).name||b.serviceName||b.serviceId||b.service||'';
      const showSvc=height>42&&svcName;
      const timeStr=b.time||'';
      const lw=100/totalLanes; const ll=lane*lw;
      return `<div class="cal-event" onclick="openBooking(${idx})" style="top:${top}px;height:${height}px;left:calc(${ll.toFixed(1)}%+2px);width:calc(${lw.toFixed(1)}%-4px);background:${bg};border-left-color:${border};opacity:${opacity}"><div class="cal-event-name" style="color:${color}">${label}</div>${showSvc?`<div class="cal-event-sub" style="color:${color}">${svcName}${timeStr?' · '+timeStr:''}</div>`:''}</div>`;
    }).join('');
    return `<div class="cal-col">${rowsHtml}${events}</div>`;
  }).join('');

  const nowHtml=nowTop!==null?`<div class="cal-now-line" style="top:${nowTop}px"><div class="cal-now-dot"></div></div>`:'';

  const revenueHtml=`<div class="revenue-strip"><div class="rev-item"><div class="rev-lbl">Revenue</div><div class="rev-val">£${revenue.toFixed(0)}</div></div><div class="rev-item"><div class="rev-lbl">Checked Out</div><div class="rev-val green">${checkedOut.length}</div></div><div class="rev-item"><div class="rev-lbl">Remaining</div><div class="rev-val normal">${remaining}</div></div></div>`;

  return `<div class="cal-outer" id="cal-outer">${headHtml}<div class="cal-body-wrap"><div class="cal-time-col" style="height:${totalH}px">${timeHtml}</div><div class="cal-cols" style="height:${totalH}px">${nowHtml}${colsHtml}</div></div></div>${revenueHtml}`;
}

// ── BOOKING DETAIL ───────────────────────────────────────────────────────────
window.openBooking=function(i){
  const b=window._bookings[i]; if(!b) return;
  currentBooking=b;
  const color=bColor(b.barberName||b.barber);
  const name=b.clientName||b.name||'Walk-in';
  const svc=(allServices.find(s=>s.id===(b.serviceId||b.service))||{}).name||b.serviceName||b.serviceId||b.service||'—';
  const price=pp(b.price||b.paidAmount);
  const st=(b.status||'').toUpperCase();
  document.getElementById('bk-title').innerHTML=`<span style="color:${color}">●</span> ${name}`;
  const fmtTs=ts=>{ if(!ts) return null; const d=ts?.toDate?ts.toDate():(ts instanceof Date?ts:null); if(!d) return null; return d.toLocaleTimeString('en-GB',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Europe/London'}).toUpperCase(); };
  const coTime=fmtTs(b.checkedOutAt);
  const dep=pp(b.platformDepositAmount);
  const remaining=dep>0?Math.max(0,price-dep):0;
  const addOns=(b.soldAddOns||[]).filter(x=>x.qty>0);
  const products=(b.soldProducts||[]).filter(x=>x.qty>0);
  const discount=pp(b.discount); const tip=pp(b.tip); const paidAmount=pp(b.paidAmount); const servicePrice=pp(b.price);
  const addOnsTotal=addOns.reduce((s,x)=>(parseFloat(x.price)||0)*x.qty+s,0);
  const productsTotal=products.reduce((s,x)=>(parseFloat(x.price)||0)*x.qty+s,0);
  document.getElementById('bk-body').innerHTML=`
    <div class="detail-row"><span class="detail-label">Arrived</span><span class="detail-val">${b.time||'—'}</span></div>
    ${coTime?`<div class="detail-row"><span class="detail-label">Checked out</span><span class="detail-val" style="color:var(--green)">${coTime}</span></div>`:''}
    <div class="detail-row"><span class="detail-label">Service</span><span class="detail-val">${svc}</span></div>
    <div class="detail-row"><span class="detail-label">Barber</span><span class="detail-val" style="color:${color}">${b.barberName||b.barber||b.barberId||'—'}</span></div>
    <div class="detail-row"><span class="detail-label">Status</span><div class="status-pill ${sClass(st)}">${sLabel(st)}</div></div>
    ${b.clientPhone?`<div class="detail-row"><span class="detail-label">Phone</span><a href="tel:${b.clientPhone}" class="detail-val" style="color:var(--gold)">${b.clientPhone}</a></div>`:''}
    ${b.clientEmail?`<div class="detail-row"><span class="detail-label">Email</span><span class="detail-val" style="font-size:0.75rem">${b.clientEmail}</span></div>`:''}
    ${b.source?`<div class="detail-row"><span class="detail-label">Source</span><span class="detail-val">${b.source}</span></div>`:''}
    ${st==='CHECKED_OUT'?`<div style="margin-top:14px;padding:14px;background:var(--card);border:1px solid var(--border);border-radius:14px"><div class="section-lbl" style="margin-bottom:10px">Payment breakdown</div>${servicePrice>0?`<div class="co-row"><span>Service</span><span>£${servicePrice.toFixed(2)}</span></div>`:''}${addOns.map(x=>`<div class="co-row"><span>${x.name}${x.qty>1?' ×'+x.qty:''}</span><span>£${((parseFloat(x.price)||0)*x.qty).toFixed(2)}</span></div>`).join('')}${products.map(x=>`<div class="co-row"><span>${x.name}${x.qty>1?' ×'+x.qty:''}</span><span>£${((parseFloat(x.price)||0)*x.qty).toFixed(2)}</span></div>`).join('')}${dep>0?`<div class="co-row"><span>Deposit</span><span style="color:var(--green)">-£${dep.toFixed(2)}</span></div>`:''}${discount>0?`<div class="co-row"><span>Discount</span><span style="color:var(--green)">-£${discount.toFixed(2)}</span></div>`:''}${tip>0?`<div class="co-row"><span>Tip</span><span>£${tip.toFixed(2)}</span></div>`:''}<div class="co-row final"><span>TOTAL · ${b.paymentMethod||''}</span><span>£${paidAmount.toFixed(2)}</span></div></div>`:`${b.source!=='Fresha'&&dep>0?`<div class="detail-row"><span class="detail-label">Deposit</span><span class="detail-val" style="color:var(--green)">£${dep.toFixed(2)}${b.depositPaymentMethod?' · '+b.depositPaymentMethod:''}</span></div><div class="detail-row"><span class="detail-label">Remaining</span><span class="detail-val" style="color:var(--orange)">£${remaining.toFixed(2)}</span></div>`:''}<div class="detail-row"><span class="detail-label">Price</span><span class="detail-val" style="color:var(--gold)">${price>0?'£'+price.toFixed(2):'—'}</span></div>`}
    ${b.note?`<div style="margin-top:12px;padding:12px;background:var(--card2);border-radius:10px;font-size:0.8rem;color:var(--muted);line-height:1.5">${b.note}</div>`:''}`;
  const acts=document.getElementById('bk-actions');
  acts.innerHTML=st!=='CHECKED_OUT'
    ?`<button class="btn-ghost" onclick="closeSheet('bk')">Close</button><button class="btn-gold" style="flex:2" onclick="closeSheet('bk');setTimeout(openCheckout,250)">Checkout →</button>`
    :`<button class="btn-ghost" onclick="closeSheet('bk')">Close</button>`;
  openSheet('bk');
  if(b.startTime&&b.barberName&&st!=='CHECKED_OUT') loadDetailSlots(b);
};

async function loadDetailSlots(b){
  const body=document.getElementById('bk-body');
  const ph=document.createElement('div');
  ph.style.cssText='margin-top:16px;padding-top:14px;border-top:1px solid var(--border)';
  ph.innerHTML=`<div class="section-lbl" style="margin-bottom:8px">${(b.barberName||'').toUpperCase()}'S DAY</div><div class="loader" style="padding:10px 0"><div class="spinner"></div></div>`;
  body.appendChild(ph);
  try{
    const st=b.startTime?.toDate?b.startTime.toDate():new Date();
    const yr=st.getFullYear(),mo=st.getMonth(),dy=st.getDate();
    const selDate=new Date(yr,mo,dy);
    const dayHours=getDayHours(selDate);
    if(dayHours.closed){ph.querySelector('.loader').innerHTML='<span style="color:var(--muted);font-size:0.75rem">Shop closed</span>';return;}
    const s0=new Date(yr,mo,dy,0,0,0),s1=new Date(yr,mo,dy,23,59,59);
    const snap=await getDocs(query(collection(db,`${T}/bookings`),where('startTime','>=',Timestamp.fromDate(s0)),where('startTime','<=',Timestamp.fromDate(s1))));
    const bookingMins=st.getHours()*60+st.getMinutes();
    const openMins=t2m(dayHours.open),closeMins=t2m(dayHours.close);
    const busy=[];
    snap.docs.forEach(d=>{ const bk=d.data(); if((bk.barberName||'').toLowerCase()!==(b.barberName||'').toLowerCase()) return; if(['CANCELLED'].includes((bk.status||'').toUpperCase())) return; let sm; if(bk.startTime?.toDate){const t=bk.startTime.toDate();sm=t.getHours()*60+t.getMinutes();}else if(bk.time){sm=t2m(bk.time);}else return; const bDur=(allServices.find(s=>s.id===(bk.serviceId||bk.service))||{}).duration||30; busy.push([sm,sm+bDur,bk.clientName||bk.name||'']); });
    const rows=[]; for(let m=openMins;m<closeMins;m+=30){ const hit=busy.find(([bs,be])=>m>=bs&&m<be); const isCurrent=m===bookingMins; rows.push({m,hit,isCurrent}); }
    const now2=new Date(),isToday=selDate.toDateString()===now2.toDateString(),nowMins=now2.getHours()*60+now2.getMinutes();
    ph.innerHTML=`<div class="section-lbl" style="margin-bottom:8px">${(b.barberName||'').toUpperCase()}'S DAY</div><div style="display:flex;flex-wrap:wrap;gap:5px">`+rows.map(r=>{ const isPast=isToday&&r.m<nowMins; let bg,txt,border; if(r.isCurrent){bg='var(--gold-dim)';txt='var(--gold)';border='var(--gold2)';}else if(r.hit){bg='rgba(155,58,58,0.08)';txt='var(--muted)';border='rgba(155,58,58,0.2)';}else{bg=isPast?'transparent':'rgba(61,139,94,0.08)';txt=isPast?'var(--muted2)':'var(--green)';border=isPast?'var(--border)':'rgba(61,139,94,0.3)';} return `<div style="padding:5px 8px;border-radius:7px;font-size:0.68rem;font-weight:700;background:${bg};color:${txt};border:1px solid ${border};min-width:46px;text-align:center">${r.hit&&!r.isCurrent?'✕':m2t(r.m)}</div>`; }).join('')+`</div>`;
  }catch(e){ /* silent */ }
}

// ── CHECKOUT ─────────────────────────────────────────────────────────────────
window.openCheckout=function(){
  coMethod='CASH'; coTip=0; coCustomTip=''; coTipMethod='';
  coProducts={}; coAddons={}; coServiceOverride=null;
  const b=currentBooking;
  const strip=document.getElementById('co-client-strip');
  if(strip&&b){
    const name=b.clientName||'Walk-in';
    const ini=name.split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2);
    const color=bColor(b.barberName||b.barber||'');
    const svc=(allServices.find(s=>s.id===(b.serviceId||b.service))||{}).name||b.serviceName||b.serviceId||b.service||'';
    const meta=[svc,b.barberName||b.barber,b.time].filter(Boolean).join(' · ');
    // look up pts
    let ptsHtml='';
    try{
      const cr=collection(db,`${T}/clients`);
      const phone=b.clientPhone||'',email=b.clientEmail||'';
      const lookup=phone
        ?getDocs(query(cr,where('phone','==',phone)))
        :email?getDocs(query(cr,where('email','==',email))):null;
      if(lookup) lookup.then(s=>{ if(!s.empty){ const pts=s.docs[0].data().loyaltyPoints||0; if(pts>0){ const badge=strip.querySelector('.co-pts-badge'); if(badge) badge.textContent='⭐ '+pts+' pts'; } } }).catch(()=>{});
    }catch(e){}
    strip.innerHTML=`<div class="co-av" style="background:${color}">${ini}</div><div style="flex:1;min-width:0"><div class="co-client-name">${name}</div><div class="co-client-meta">${meta}</div></div><div class="co-pts-badge" style="display:none"></div>`;
    // trigger pts lookup to show badge
    const phone=b.clientPhone||'',email=b.clientEmail||'';
    if(phone||email){
      const cr=collection(db,`${T}/clients`);
      const q2=phone?query(cr,where('phone','==',phone)):query(cr,where('email','==',email));
      getDocs(q2).then(s=>{ if(!s.empty){ const pts=s.docs[0].data().loyaltyPoints||0; if(pts>0){ const badge=strip.querySelector('.co-pts-badge'); if(badge){badge.textContent='⭐ '+pts+' pts';badge.style.display='';} } } }).catch(()=>{});
    }
  }
  renderCo(); openSheet('co');
};
function coItemTotal(map,list){ return Object.entries(map).reduce((s,[id,q])=>{ const it=list.find(x=>x.id===id); return s+(parseFloat(it?.price)||0)*q; },0); }
function renderCoStepper(id,type,name,price,qty){
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)"><div style="flex:1;min-width:0"><div style="font-size:0.78rem;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div><div style="font-size:0.65rem;color:var(--muted)">£${parseFloat(price).toFixed(2)} each</div></div><div style="display:flex;align-items:center;gap:10px;flex-shrink:0;margin-left:10px"><button onclick="coAdj('${type}','${id}',-1)" style="width:28px;height:28px;border-radius:50%;border:1.5px solid var(--border);background:transparent;color:var(--text);font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">−</button><span style="font-size:0.85rem;font-weight:700;color:${qty>0?'var(--gold)':'var(--muted)'};min-width:16px;text-align:center">${qty}</span><button onclick="coAdj('${type}','${id}',1)" style="width:28px;height:28px;border-radius:50%;border:1.5px solid var(--border);background:transparent;color:var(--text);font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">+</button></div></div>`;
}
function renderCo(){
  if(!currentBooking) return;
  const b=currentBooking;
  const svcObj=coServiceOverride||(allServices.find(s=>s.id===(b.serviceId||b.service))||null);
  const basePrice=coServiceOverride?pp(coServiceOverride.price):pp(b.price||b.paidAmount);
  const deposit=pp(b.platformDepositAmount);
  const extras=allServices.filter(s=>s.category==='Extras');
  const mainServices=allServices.filter(s=>s.category!=='Extras');
  const productsTotal=coItemTotal(coProducts,allProducts);
  const addonsTotal=coItemTotal(coAddons,extras);
  const subtotal=Math.max(0,basePrice-deposit);
  const total=subtotal+coTip+productsTotal+addonsTotal;
  const curSvcId=coServiceOverride?.id||b.serviceId||b.service||'';
  const svcOpts=mainServices.map(s=>`<option value="${s.id}" ${s.id===curSvcId?'selected':''}>${s.name} · £${parseFloat(s.price).toFixed(2)}</option>`).join('');
  document.getElementById('co-body').innerHTML=`
    <div class="co-total-card">
      <div class="co-row" style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)">
        <span style="font-size:0.6rem;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:var(--muted)">Service</span>
        <select onchange="setCoServiceOverride(this.value)" style="background:transparent;border:none;color:${coServiceOverride?'var(--gold)':'var(--text)'};font-size:0.82rem;font-weight:600;font-family:var(--font-ui);text-align:right;max-width:60%;outline:none;cursor:pointer">
          <option value="">— original —</option>${svcOpts}
        </select>
      </div>
      ${basePrice>0?`<div class="co-row"><span>Price</span><span>£${basePrice.toFixed(2)}${coServiceOverride?` <span style="font-size:0.6rem;color:var(--green)">▲ overridden</span>`:''}</span></div>`:''}
      ${deposit>0?`<div class="co-row"><span>Deposit paid</span><span style="color:var(--green)">−£${deposit.toFixed(2)}</span></div>`:''}
      ${addonsTotal>0?`<div class="co-row"><span>Add-ons</span><span>£${addonsTotal.toFixed(2)}</span></div>`:''}
      ${productsTotal>0?`<div class="co-row"><span>Products</span><span>£${productsTotal.toFixed(2)}</span></div>`:''}
      ${coTip>0?`<div class="co-row"><span>Tip</span><span>£${coTip.toFixed(2)}</span></div>`:''}
      <div class="co-row final"><span>TOTAL</span><span>£${total.toFixed(2)}</span></div>
    </div>
    <div class="co-section"><div class="section-lbl">Payment method</div><div class="method-grid">${[['CASH','💷','Cash'],['CARD','💳','Card'],['MONZO','📱','Monzo'],['VOUCHER','🎟','Voucher']].map(([id,ic,lb])=>`<button class="method-btn ${coMethod===id?'active':''}" onclick="setCoMethod('${id}')"><span class="method-icon">${ic}</span><span>${lb}</span></button>`).join('')}</div></div>
    <div class="co-section"><div class="section-lbl">Tip</div><div class="tip-row">${[0,2,5,10].map(t=>`<button class="tip-btn ${coTip===t&&!coCustomTip?'active':''}" onclick="setCoTip(${t})">${t===0?'None':'£'+t}</button>`).join('')}</div><input class="custom-tip" type="number" placeholder="Custom tip £" value="${coCustomTip}" oninput="setCoCustomTip(this.value)" step="0.50" min="0" />${coTip>0?`<div style="margin-top:10px;padding:12px;background:var(--card);border:1px solid var(--border);border-radius:12px;"><div class="section-lbl" style="margin-bottom:8px">Tip paid by</div><div style="display:flex;gap:8px">${[['','Same'],['CASH','💷 Cash'],['CARD','💳 Card']].map(([v,l])=>`<button onclick="setCoTipMethod('${v}')" style="flex:1;padding:9px 4px;border-radius:10px;border:1.5px solid ${coTipMethod===v?'var(--gold2)':'var(--border)'};background:${coTipMethod===v?'var(--gold-dim)':'transparent'};color:${coTipMethod===v?'var(--gold)':'var(--muted)'};font-size:0.75rem;font-weight:600;cursor:pointer;font-family:var(--font-ui)">${l}</button>`).join('')}</div></div>`:''}</div>
    ${extras.length>0?`<div class="co-section">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <div class="section-lbl" style="margin-bottom:0">Add-ons${Object.values(coAddons).some(q=>q>0)?` <span style="color:var(--gold);font-size:0.65rem">(${Object.values(coAddons).filter(q=>q>0).length})</span>`:''}
    </div>
    <button onclick="toggleCoSection('addons')" id="co-addons-toggle" style="padding:4px 10px;border-radius:99px;border:1px solid var(--border2);background:var(--card);color:var(--gold);font-size:0.68rem;font-weight:600;cursor:pointer;font-family:var(--font-ui)">+ Add</button>
  </div>
  <div id="co-addons-list" style="display:none">${extras.map(s=>renderCoStepper(s.id,'addon',s.name,s.price,coAddons[s.id]||0)).join('')}</div>
</div>`:''}
    ${allProducts.length>0?`<div class="co-section">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <div class="section-lbl" style="margin-bottom:0">Products${Object.values(coProducts).some(q=>q>0)?` <span style="color:var(--gold);font-size:0.65rem">(${Object.values(coProducts).filter(q=>q>0).length})</span>`:''}
    </div>
    <button onclick="toggleCoSection('products')" id="co-products-toggle" style="padding:4px 10px;border-radius:99px;border:1px solid var(--border2);background:var(--card);color:var(--gold);font-size:0.68rem;font-weight:600;cursor:pointer;font-family:var(--font-ui)">+ Add</button>
  </div>
  <div id="co-products-list" style="display:none">${allProducts.map(p=>renderCoStepper(p.id,'product',p.name,p.price,coProducts[p.id]||0)).join('')}</div>
</div>`:''}
    <div class="co-section"><div class="section-lbl">Note</div><textarea class="textarea" id="co-note" placeholder="Any notes for this visit…" rows="2">${b.note||''}</textarea></div>
    <button class="co-confirm-btn" onclick="confirmCheckout()">CONFIRM £${total.toFixed(2)} · ${coMethod}</button>
    <div style="height:20px"></div>`;
}
window.toggleCoSection=function(type){
  const listEl=document.getElementById('co-'+type+'-list');
  const btn=document.getElementById('co-'+type+'-toggle');
  if(!listEl||!btn) return;
  const isOpen=listEl.style.display!=='none';
  listEl.style.display=isOpen?'none':'block';
  btn.textContent=isOpen?'+ Add':'✕ Close';
};
window.coAdj=function(type,id,d){ if(type==='product'){coProducts[id]=Math.max(0,(coProducts[id]||0)+d);}else{coAddons[id]=Math.max(0,(coAddons[id]||0)+d);} renderCo(); };
window.setCoServiceOverride=function(svcId){
  if(!svcId){ coServiceOverride=null; renderCo(); return; }
  const svc=allServices.find(s=>s.id===svcId); if(!svc) return;
  const origId=currentBooking?.serviceId||currentBooking?.service||'';
  coServiceOverride=(svcId===origId)?null:{id:svc.id,name:svc.name,price:parseFloat(svc.price)||0};
  renderCo();
};
window.setCoMethod=m=>{ coMethod=m; renderCo(); };
window.setCoTip=t=>{ coTip=t; coCustomTip=''; if(t===0) coTipMethod=''; renderCo(); };
window.setCoCustomTip=v=>{ coCustomTip=v; coTip=parseFloat(v)||0; renderCo(); };
window.setCoTipMethod=v=>{ coTipMethod=v; renderCo(); };

window.confirmCheckout=async function(){
  if(!currentBooking) return;
  const b=currentBooking;
  const basePrice=coServiceOverride?pp(coServiceOverride.price):pp(b.price||b.paidAmount);
  const deposit=pp(b.platformDepositAmount);
  const extras=allServices.filter(s=>s.category==='Extras');
  const productsTotal=coItemTotal(coProducts,allProducts); const addonsTotal=coItemTotal(coAddons,extras);
  const billable=Math.max(0,basePrice-deposit)+productsTotal+addonsTotal;
  const total=billable+coTip;
  const note=(document.getElementById('co-note')||{}).value||'';
  const soldProducts=Object.entries(coProducts).filter(([,q])=>q>0).map(([id,qty])=>{ const p=allProducts.find(x=>x.id===id); return {productId:id,name:p?.name||'',price:parseFloat(p?.price)||0,qty}; });
  const soldAddOns=Object.entries(coAddons).filter(([,q])=>q>0).map(([id,qty])=>{ const s=extras.find(x=>x.id===id); return {productId:id,name:s?.name||'',price:parseFloat(s?.price)||0,qty}; });
  const phone=b.clientPhone||'', email=b.clientEmail||'';
  let clientDocRef=null, isMember=false;
  try{
    if(phone||email){
      const cr=collection(db,`${T}/clients`);
      if(phone){ const s=await getDocs(query(cr,where('phone','==',phone))); if(!s.empty){clientDocRef=s.docs[0].ref;isMember=s.docs[0].data().isMember||false;} }
      if(!clientDocRef&&email){ const s=await getDocs(query(cr,where('email','==',email))); if(!s.empty){clientDocRef=s.docs[0].ref;isMember=s.docs[0].data().isMember||false;} }
    }
  }catch(e){}
  const pointsEarned=isMember?0:Math.floor(billable);
  const sendLoyalty=!['Booksy','Fresha','Treatwell'].includes(b.source);
  const btn=document.querySelector('#co-body .co-confirm-btn');
  const prog=document.getElementById('co-progress');
  if(btn){btn.disabled=true;btn.textContent='Saving…';}
  if(prog){prog.style.transition='none';prog.style.width='0';requestAnimationFrame(()=>{prog.style.transition='width 1.4s cubic-bezier(0.4,0,0.2,1)';prog.style.width='72%';});}
  document.getElementById('co-overlay').onclick=null;
  try{
    let ref=b._ref;
    if(!ref){ const snap=await getDocs(query(collection(db,`${T}/bookings`),where('bookingId','==',b.bookingId))); if(snap.empty){toast('Booking not found','error');return;} ref=snap.docs[0].ref; }
    const coUpdate={status:'CHECKED_OUT',paymentMethod:coMethod,paidAmount:total,tip:coTip,tipPaymentMethod:coTip>0?(coTipMethod||coMethod):'',soldProducts,soldAddOns,note,checkedOutAt:Timestamp.fromDate(new Date()),sendLoyaltyEmail:sendLoyalty,loyaltyPointsEarned:pointsEarned,loyaltyPointsRedeemed:0};
    if(coServiceOverride){ coUpdate.serviceId=coServiceOverride.id; coUpdate.service=coServiceOverride.id; coUpdate.serviceName=coServiceOverride.name; coUpdate.price=coServiceOverride.price; }
    await updateDoc(ref,coUpdate);
    try{
      if(!isMember&&pointsEarned>0){
        if(clientDocRef){await updateDoc(clientDocRef,{loyaltyPoints:increment(pointsEarned),lastVisit:Timestamp.fromDate(new Date()),lastBarber:b.barberName||'',lastService:b.serviceId||b.service||''});}
        else if(phone||email){await addDoc(collection(db,`${T}/clients`),{name:b.clientName||'',phone,email,loyaltyPoints:pointsEarned,createdAt:Timestamp.fromDate(new Date())});}
      }
    }catch(e){}
    if(prog){prog.style.transition='width 0.25s ease';prog.style.width='100%';}
    const methodLabel={'CASH':'💷 Cash','CARD':'💳 Card','MONZO':'📱 Monzo','VOUCHER':'🎟 Voucher'}[coMethod]||coMethod;
    const ptsLine=pointsEarned>0?`<div class="co-success-pts">+${pointsEarned} pts earned</div>`:'';
    document.getElementById('co-body').innerHTML=`<div class="co-success"><div class="co-success-ring"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="co-success-amt">£${total.toFixed(2)}</div><div class="co-success-meta">${b.clientName||'Walk-in'} · ${methodLabel}</div>${ptsLine}</div>`;
    loadBookings(true);
    setTimeout(()=>{
      closeSheet('co');
      document.getElementById('co-overlay').onclick=()=>closeSheet('co');
      if(prog){prog.style.transition='none';prog.style.width='0';}
      if(coMethod==='CARD'){
        const amtStr=total.toFixed(2);
        navigator.clipboard.writeText(amtStr).catch(()=>{});
        toast(`£${amtStr} copied · Opening Monzo…`,'success');
        setTimeout(()=>{ window.location.href='monzo://'; },600);
      }
    },1600);
  }catch(ex){
    if(prog)prog.style.width='0';
    if(btn){btn.disabled=false;btn.textContent=`Confirm £${total.toFixed(2)} · ${coMethod}`;}
    document.getElementById('co-overlay').onclick=()=>closeSheet('co');
    toast('Error: '+ex.message,'error');
  }
};

// ── CLIENTS ──────────────────────────────────────────────────────────────────
const CLIENTS_PAGE = 30;
async function loadClients(){
  _clientsLastDoc = null; _clientsAllLoaded = false; allClients = [];
  try{
    const snap=await getDocs(query(collection(db,`${T}/clients`),orderBy('name'),limit(CLIENTS_PAGE)));
    allClients=snap.docs.map(d=>({id:d.id,...d.data()}));
    _clientsLastDoc=snap.docs[snap.docs.length-1]||null;
    _clientsAllLoaded=snap.docs.length<CLIENTS_PAGE;
    renderClients(allClients);
    document.getElementById('clients-count').textContent=allClients.length+(_clientsAllLoaded?'':'+') +' CLIENTS';
  }catch(e){ console.error('loadClients',e); }
}
async function loadMoreClients(){
  if(_clientsAllLoaded||!_clientsLastDoc) return;
  const btn=document.getElementById('load-more-clients');
  if(btn){ btn.disabled=true; btn.textContent='Loading…'; }
  try{
    const snap=await getDocs(query(collection(db,`${T}/clients`),orderBy('name'),startAfter(_clientsLastDoc),limit(CLIENTS_PAGE)));
    const more=snap.docs.map(d=>({id:d.id,...d.data()}));
    allClients=[...allClients,...more];
    _clientsLastDoc=snap.docs[snap.docs.length-1]||_clientsLastDoc;
    _clientsAllLoaded=snap.docs.length<CLIENTS_PAGE;
    renderClients(allClients);
    document.getElementById('clients-count').textContent=allClients.length+(_clientsAllLoaded?'':'+') +' CLIENTS';
  }catch(e){ console.error('loadMoreClients',e); if(btn){btn.disabled=false;btn.textContent='Load more';} }
}
window.loadMoreClients=loadMoreClients;
function renderClients(list){
  window._clientList=list;
  const el=document.getElementById('clients-list');
  if(!list.length){ el.innerHTML='<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">No clients found</div></div>'; return; }
  const cards=list.map((c,i)=>{
    const name=c.name||'—'; const pts=c.loyaltyPoints||0; const visits=c.totalVisits||c.visits||0; const bg=bColor(c.lastBarber||'');
    return `<div class="client-card" onclick="openClient(${i})"><div class="client-av" style="background:${bg}">${ini(name)}</div><div style="flex:1;min-width:0"><div class="client-name">${name}</div><div class="client-meta">${[c.phone,visits?visits+' visits':''].filter(Boolean).join(' · ')}</div></div>${c.isMember?'<span class="chip chip-purple">◆</span>':''}${pts>0?`<span class="pts-badge">⭐ ${pts}</span>`:''}</div>`;
  }).join('');
  const loadMoreBtn=_clientsAllLoaded?'':'<div style="padding:14px 0;text-align:center"><button id="load-more-clients" onclick="loadMoreClients()" style="padding:10px 24px;border-radius:99px;border:1.5px solid var(--border);background:var(--card);color:var(--muted);font-size:0.78rem;font-weight:700;cursor:pointer;">Load more</button></div>';
  el.innerHTML=cards+loadMoreBtn;
}
window.searchClients=function(q){ if(!q.trim()){renderClients(allClients);return;} const lq=q.toLowerCase(); renderClients(allClients.filter(c=>(c.name||'').toLowerCase().includes(lq)||(c.phone||'').includes(q)||(c.email||'').toLowerCase().includes(lq))); };
let _clViewClient=null, _clPtsDelta=0;
function renderClSheet(){
  const c=_clViewClient; if(!c) return;
  const basePts=c.loyaltyPoints||0;
  const newPts=Math.max(0,basePts+_clPtsDelta);
  const visits=c.totalVisits||c.visits||0; const spent=c.totalSpent||0;
  document.getElementById('cl-title').textContent=c.name||'Client';
  const presets=[-20,-10,-5,5,10,20,50];
  document.getElementById('cl-body').innerHTML=`
    <div style="text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)">
      <div style="width:64px;height:64px;border-radius:50%;background:${bColor(c.lastBarber)};display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:700;color:#0a0705;margin:0 auto 10px">${ini(c.name)}</div>
      <div style="font-size:1rem;font-weight:700;color:var(--text)">${c.name||'—'}</div>
      <div style="display:flex;gap:6px;justify-content:center;margin-top:8px;flex-wrap:wrap">
        ${c.isMember?'<span class="chip chip-purple">◆ MEMBER</span>':''}
        ${newPts>0?`<span class="chip chip-gold">⭐ ${newPts} pts${_clPtsDelta!==0?` <span style="opacity:0.7;font-size:0.85em">(${_clPtsDelta>0?'+':''}${_clPtsDelta})</span>`:''}</span>`:''}
        ${visits>0?`<span class="chip" style="background:var(--card2);color:var(--muted)">${visits} visits</span>`:''}
      </div>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:16px">
      <div style="font-size:0.58rem;color:var(--muted);letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-bottom:10px">Adjust Points</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        ${presets.map(d=>`<button onclick="adjClPts(${d})" style="flex:1;min-width:44px;padding:8px 4px;border-radius:8px;border:1.5px solid ${d<0?'rgba(155,58,58,0.3)':'rgba(61,139,94,0.3)'};background:${d<0?'rgba(155,58,58,0.07)':'rgba(61,139,94,0.07)'};color:${d<0?'var(--red)':'var(--green)'};font-size:0.75rem;font-weight:700;cursor:pointer;font-family:var(--font-ui)">${d>0?'+':''}${d}</button>`).join('')}
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <input id="cl-pts-custom" type="number" placeholder="Custom (e.g. +15 or -8)" style="flex:1;padding:10px 12px;background:var(--bg);border:1.5px solid var(--border);border-radius:10px;color:var(--text);font-size:0.9rem;outline:none;font-family:var(--font-ui)" onkeydown="if(event.key==='Enter')applyClCustomPts()" />
        <button onclick="applyClCustomPts()" style="padding:10px 14px;border-radius:10px;background:var(--gold-dim);border:1.5px solid var(--gold2);color:var(--gold);font-size:0.78rem;font-weight:700;cursor:pointer;font-family:var(--font-ui);white-space:nowrap">Apply</button>
      </div>
      ${_clPtsDelta!==0?`<div style="margin-top:10px;padding:10px 12px;background:rgba(201,168,76,0.08);border:1px solid var(--gold2);border-radius:10px;font-size:0.78rem;color:var(--gold);font-weight:600">${basePts} pts ${_clPtsDelta>0?'→ +'+_clPtsDelta+' →':'→ '+_clPtsDelta+' →'} <strong>${newPts} pts</strong></div>`:''}
    </div>
    ${c.phone?`<div class="detail-row"><span class="detail-label">Phone</span><a href="tel:${c.phone}" class="detail-val" style="color:var(--gold)">${c.phone}</a></div>`:''}
    ${c.email?`<div class="detail-row"><span class="detail-label">Email</span><span class="detail-val" style="font-size:0.75rem">${c.email}</span></div>`:''}
    <div class="detail-row"><span class="detail-label">Total Spent</span><span class="detail-val" style="color:var(--gold)">${spent>0?'£'+spent.toFixed(2):'—'}</span></div>
    ${c.lastBarber?`<div class="detail-row"><span class="detail-label">Last Barber</span><span class="detail-val" style="color:${bColor(c.lastBarber)}">${c.lastBarber}</span></div>`:''}
    ${c.lastService?`<div class="detail-row"><span class="detail-label">Last Service</span><span class="detail-val">${c.lastService}</span></div>`:''}
    ${c.birthday?`<div class="detail-row"><span class="detail-label">Birthday</span><span class="detail-val">${c.birthday}</span></div>`:''}
    ${c.notes?`<div style="margin-top:14px;padding:12px;background:var(--card2);border-radius:10px;font-size:0.8rem;color:var(--muted);line-height:1.5">${c.notes}</div>`:''}`;
  const acts=document.getElementById('cl-actions');
  acts.innerHTML=_clPtsDelta!==0
    ?`<button class="btn-ghost" onclick="_clPtsDelta=0;renderClSheet()">Reset</button><button class="btn-gold" style="flex:2" onclick="saveClPoints()">Save ${_clPtsDelta>0?'+':''}${_clPtsDelta} pts →</button>`
    :`<button class="btn-ghost" onclick="closeSheet('cl')">Close</button>`;
}
window.adjClPts=function(d){ _clPtsDelta=Math.max(-(_clViewClient?.loyaltyPoints||0), _clPtsDelta+d); renderClSheet(); };
window.applyClCustomPts=function(){
  const inp=document.getElementById('cl-pts-custom'); if(!inp) return;
  const v=parseInt(inp.value)||0; if(!v){ inp.value=''; return; }
  _clPtsDelta=Math.max(-(_clViewClient?.loyaltyPoints||0), _clPtsDelta+v);
  inp.value=''; renderClSheet();
};
window.saveClPoints=async function(){
  if(!_clViewClient||_clPtsDelta===0){ closeSheet('cl'); return; }
  const btn=document.querySelector('#cl-actions .btn-gold'); if(btn){ btn.disabled=true; btn.textContent='Saving…'; }
  try{
    await updateDoc(doc(db,`${T}/clients`,_clViewClient.id),{loyaltyPoints:increment(_clPtsDelta)});
    _clViewClient.loyaltyPoints=Math.max(0,(_clViewClient.loyaltyPoints||0)+_clPtsDelta);
    const ci=allClients.findIndex(c=>c.id===_clViewClient.id); if(ci>=0) allClients[ci].loyaltyPoints=_clViewClient.loyaltyPoints;
    _clPtsDelta=0;
    toast('Points updated','success');
    renderClSheet();
  }catch(e){ toast('Error: '+e.message,'error'); if(btn){ btn.disabled=false; btn.textContent=`Save ${_clPtsDelta>0?'+':''}${_clPtsDelta} pts →`; } }
};
window.openClient=function(i){
  const c=window._clientList[i]; if(!c) return;
  _clViewClient=c; _clPtsDelta=0;
  renderClSheet(); openSheet('cl');
};
window.openAddClient=function(){ ['ac-name','ac-phone','ac-email','ac-notes'].forEach(id=>document.getElementById(id).value=''); openSheet('ac'); };
window.saveNewClient=async function(){
  const name=(document.getElementById('ac-name').value||'').trim();
  if(!name){toast('Name is required','error');return;}
  try{
    const docRef=await addDoc(collection(db,`${T}/clients`),{name,phone:document.getElementById('ac-phone').value.trim(),email:document.getElementById('ac-email').value.trim(),notes:document.getElementById('ac-notes').value.trim(),loyaltyPoints:0,visits:0,totalSpent:0,createdAt:Timestamp.fromDate(new Date())});
    allClients.unshift({id:docRef.id,name,phone:document.getElementById('ac-phone').value.trim(),email:document.getElementById('ac-email').value.trim()});
    closeSheet('ac'); renderClients(allClients);
    document.getElementById('clients-count').textContent=allClients.length+' CLIENTS';
    toast('Client added','success');
  }catch(ex){toast('Error: '+ex.message,'error');}
};

// ── NEW BOOKING ──────────────────────────────────────────────────────────────
window.searchWiClient=function(q){
  const res=document.getElementById('wi-client-results'); if(!q.trim()){res.innerHTML='';return;}
  const lq=q.toLowerCase();
  const found=allClients.filter(c=>(c.name||'').toLowerCase().includes(lq)||(c.phone||'').includes(q)).slice(0,5);
  if(!found.length){res.innerHTML='';return;}
  res.innerHTML=found.map((c,i)=>`<div onclick="selectWiClient(${allClients.indexOf(c)})" style="padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px;margin-bottom:4px;cursor:pointer;display:flex;align-items:center;gap:10px;-webkit-tap-highlight-color:transparent"><div style="width:32px;height:32px;border-radius:50%;background:${bColor(c.lastBarber)};display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:#0a0705;flex-shrink:0">${ini(c.name)}</div><div><div style="font-size:0.85rem;font-weight:600;color:var(--text)">${c.name}</div><div style="font-size:0.68rem;color:var(--muted)">${c.phone||c.email||''}</div></div></div>`).join('');
};
window.selectWiClient=function(i){
  const c=allClients[i]; if(!c) return;
  wiSelectedClient=c;
  document.getElementById('wi-client-results').innerHTML='';
  document.getElementById('wi-client-search').value='';
  const _emEl=document.getElementById('wi-email'); if(_emEl&&c.email) _emEl.value=c.email;
  const sel=document.getElementById('wi-selected-client');
  sel.style.display='flex';
  sel.innerHTML=`<span style="flex:1">${c.name}${c.phone?' · '+c.phone:''}</span><span id="wi-pts-badge" style="display:none;font-size:0.65rem;font-weight:700;color:var(--gold);background:var(--gold-dim);border:1px solid var(--gold2);padding:2px 8px;border-radius:99px;margin-right:6px;white-space:nowrap"></span><button onclick="clearWiClient()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:0.9rem;flex-shrink:0;">✕</button>`;
  if(c.phone||c.email){
    const _cr=collection(db,`${T}/clients`);
    const _q=c.phone?query(_cr,where('phone','==',c.phone)):query(_cr,where('email','==',c.email));
    getDocs(_q).then(s=>{ if(!s.empty){ const pts=s.docs[0].data().loyaltyPoints||0; if(pts>0){ const bdg=document.getElementById('wi-pts-badge'); if(bdg){bdg.textContent='⭐ '+pts;bdg.style.display='inline';} } } }).catch(()=>{});
  }
};
window.clearWiClient=function(){ wiSelectedClient=null; document.getElementById('wi-selected-client').style.display='none'; const _em2=document.getElementById('wi-email'); if(_em2) _em2.value=''; };

window.createWalkIn=async function(){
  const clientInput=(document.getElementById('wi-client-search').value||'').trim();
  const clientName=wiSelectedClient?wiSelectedClient.name:(clientInput||'Walk-in');
  const clientPhone=wiSelectedClient?wiSelectedClient.phone:'';
  const emailInput=(document.getElementById('wi-email')?.value||'').trim();
  const clientEmail=emailInput||(wiSelectedClient?wiSelectedClient.email:'');
  const barber=wiBarberSel;
  const svcId=document.getElementById('wi-service').value;
  const time=document.getElementById('wi-time').value;
  const note=document.getElementById('wi-notes').value.trim();
  const svc=allServices.find(s=>s.id===svcId)||{};
  const[h,m]=(time||'00:00').split(':').map(Number);
  const todayKey=toKey(new Date()); const dateVal=wiDateKey||todayKey;
  const isToday=dateVal===todayKey;
  const[yr,mo,dy]=dateVal.split('-').map(Number);
  const start=new Date(yr,mo-1,dy,h,m,0);
  const bookingId='walkin-'+Date.now();
  try{
    const newRef=await addDoc(collection(db,`${T}/bookings`),{bookingId,clientName,clientPhone,clientEmail,barberName:barber,serviceId:svcId,service:svcId,price:svc.price||0,time,date:start.toLocaleDateString('en-GB'),startTime:Timestamp.fromDate(start),endTime:Timestamp.fromDate(new Date(start.getTime()+(svc.duration||30)*60000)),status:'CONFIRMED',source:'Walk-in',note,createdAt:Timestamp.fromDate(new Date())});
    currentBooking={_ref:newRef,bookingId,clientName,clientPhone,clientEmail,barberName:barber,serviceId:svcId,service:svcId,price:svc.price||0,time,source:'Walk-in',note};
    wiSelectedClient=null;
    document.getElementById('wi-selected-client').style.display='none';
    document.getElementById('wi-client-search').value='';
    const _wiem=document.getElementById('wi-email'); if(_wiem) _wiem.value='';
    document.getElementById('wi-notes').value='';
    wiDateKey=toKey(new Date()); document.getElementById('wi-date').value=wiDateKey;
    document.getElementById('wi-time').value=''; wiSelectedTime='';
    const btn=document.getElementById('wi-submit'); btn.disabled=true; btn.style.opacity='0.5'; btn.textContent='Select a time first';
    loadWiSlots();
    if(isToday){ toast('Booking created','success'); setTab('today'); loadBookings(true); setTimeout(openCheckout,400); }
    else{
      toast('Booking created','success'); setTab('today'); loadBookings(true);
      depBookingRef=newRef; depMethod='CASH';
      document.getElementById('dep-amount').value='';
      ['dep-cash','dep-card','dep-monzo'].forEach(id=>document.getElementById(id).classList.remove('active'));
      document.getElementById('dep-cash').classList.add('active');
      setTimeout(()=>openSheet('dep'),350);
    }
  }catch(ex){toast('Error: '+ex.message,'error');}
};

// ── DEPOSIT ──────────────────────────────────────────────────────────────────
window.setDepMethod=function(m){ depMethod=m; ['dep-cash','dep-card','dep-monzo'].forEach(id=>document.getElementById(id).classList.remove('active')); const map={CASH:'dep-cash',CARD:'dep-card',MONZO:'dep-monzo'}; if(map[m]) document.getElementById(map[m]).classList.add('active'); };
window.skipDeposit=function(){ closeSheet('dep'); depBookingRef=null; };
window.saveDeposit=async function(){
  const amount=parseFloat(document.getElementById('dep-amount').value)||0;
  if(!amount||!depBookingRef){closeSheet('dep');depBookingRef=null;return;}
  try{ await updateDoc(depBookingRef,{platformDepositAmount:amount,depositPaymentMethod:depMethod}); toast(`£${amount.toFixed(2)} deposit saved`,'success'); }catch(e){toast('Error saving deposit','error');}
  closeSheet('dep'); depBookingRef=null;
};

// ── NAV & SWIPE ──────────────────────────────────────────────────────────────
(function(){
  let _sx=0,_sy=0;
  const el=document.getElementById('bookings-list');
  el.addEventListener('touchstart',e=>{ const t=e.touches[0]; _sx=t.clientX; _sy=t.clientY; },{passive:true});
  el.addEventListener('touchend',e=>{ const t=e.changedTouches[0]; const dx=t.clientX-_sx; const dy=t.clientY-_sy; if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.8){ if(dx<0) window.changeDay(1); else window.changeDay(-1); } },{passive:true});
})();

window.setTab=function(tab){
  ['today','clients','new'].forEach(t=>{
    document.getElementById('screen-'+t).classList.toggle('active',t===tab);
    document.getElementById('nav-'+t).classList.toggle('active',t===tab);
  });
  if(tab==='new'){ renderWiDatePills(); updateWiModeBanner(); loadWiSlots(); }
};

// ── DEEP LINK / NOTIFICATION TAP ─────────────────────────────────────────────
async function openBookingById(bookingId){
  try{
    const snap=await getDoc(doc(db,`${T}/bookings`,bookingId));
    if(!snap.exists()){ toast('Booking not found','error'); return; }
    const b={_id:snap.id,_ref:snap.ref,...snap.data()};
    if(b.startTime?.toDate) selectedDate=b.startTime.toDate();
    renderDateUI();
    window.setTab('today');
    window._bookings=[b,...(window._bookings||[]).filter(x=>x._id!==bookingId)];
    loadBookings(true);
    window.openBooking(0);
  }catch(e){ toast('Error opening booking','error'); console.error(e); }
}
window.openBookingById=openBookingById;

// SW message: app was already open when notification arrived
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message',e=>{
    if(e.data?.type==='OPEN_BOOKING'&&e.data.bookingId&&currentUser) openBookingById(e.data.bookingId);
  });
}
