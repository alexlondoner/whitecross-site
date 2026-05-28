
import { initializeApp }           from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut as fbSignOut }
                                    from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js';
import { getFirestore, collection, query, where, getDocs, addDoc, updateDoc, setDoc, deleteDoc, doc, getDoc, orderBy, limit, startAt, endAt, startAfter, Timestamp, increment, onSnapshot }
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
let wiDateKey = '', wiCurrentType = 'walkin';
let coProducts = {}, coAddons = {}, coServiceOverride = null;
let wiSelectedClient = null, wiSelectedTime = '';
let wiqsSelectedClient = null, wiqsProducts = {}, wiqsAddons = {};
let depBookingRef = null, depMethod = 'CASH';
let _clientsLastDoc = null, _clientsAllLoaded = false, _clFilter = 'all';
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
const _CL_PAL=['#c9a84c','#4a8fbf','#4caf50','#9b6b2a','#7c3aed','#2d6a9f','#bf7a4a','#9b3a3a','#3d8b5e','#5b6abf','#c97a4c','#4cbfbf'];
function clientColor(name){let h=0;for(let i=0;i<(name||'').length;i++)h=(name.charCodeAt(i)+((h<<5)-h))|0;return _CL_PAL[Math.abs(h)%_CL_PAL.length];}
// Handles both manual platformDepositAmount and web/Stripe paymentType='DEPOSIT'
function bookingDeposit(b){ const m=pp(b.platformDepositAmount); if(m>0) return m; const st=(b.status||'').toUpperCase(); return (b.paymentType==='DEPOSIT'&&st!=='CHECKED_OUT')?pp(b.paidAmount):0; }
const STATUS_CLASS = {CONFIRMED:'s-confirmed',PENDING:'s-pending',CHECKED_OUT:'s-checked_out',CANCELLED:'s-cancelled',BLOCKED:'s-blocked',NO_SHOW:'s-no_show'};
const sClass = s => STATUS_CLASS[(s||'').toUpperCase()] || 's-confirmed';
const sLabel = s => s==='CHECKED_OUT'?'PAID':(s||'').toUpperCase();

const _DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function _dayNameFromKey(key){
  if(!key) return _DAYS[new Date().getDay()];
  const[y,m,d]=key.split('-').map(Number);
  return _DAYS[new Date(y,m-1,d).getDay()];
}
function _isWorkingOn(b,dayName){
  if(Array.isArray(b.workingDays)&&b.workingDays.length) return b.workingDays.includes(dayName);
  if(b.dayHours&&b.dayHours[dayName]!=null) return !b.dayHours[dayName].closed;
  return true;
}
function renderBarberAvatars(containerId, selected, selectFn, filterDay){
  const el=document.getElementById(containerId); if(!el) return;
  const barbers=filterDay?allBarbers.filter(b=>_isWorkingOn(b,filterDay)):allBarbers;
  el.innerHTML=barbers.map(b=>{
    const ini=b.name.split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2);
    const color=bColor(b.name);
    const isOn=b.name===selected;
    return `<div class="barber-av${isOn?' active':''}" onclick="${selectFn}('${b.name.replace(/'/g,"\\'")}')">
      <div class="barber-circle" style="background:${color}">${ini}</div>
      <div class="barber-av-name">${b.name.split(' ')[0]}</div>
    </div>`;
  }).join('');
}
function _wiDay(){ return _dayNameFromKey(wiCurrentType==='walkin'?toKey(new Date()):(wiDateKey||toKey(new Date()))); }
function _btDay(){ const v=document.getElementById('bt-date')?.value; return v?_dayNameFromKey(v):_DAYS[new Date().getDay()]; }
window.selectWiBarber=function(name){ wiBarberSel=name; renderBarberAvatars('wi-barber-row',wiBarberSel,'selectWiBarber',_wiDay()); onWiParamChange(); };
window.selectWiqsBarber=function(name){ wiqsBarberSel=name; renderBarberAvatars('wiqs-barber-row',wiqsBarberSel,'selectWiqsBarber',_DAYS[new Date().getDay()]); };
window.selectBtBarber=function(name){ btBarberSel=name; renderBarberAvatars('bt-barber-row',btBarberSel,'selectBtBarber',_btDay()); onBtParamChange(); };
window.selectBtDuration=function(dur){
  btDuration=dur; // kept for slot-grid compat (unused in new UI)
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
  if(key==='bt'){
    // Pre-fill date=today, from=now rounded to :00/:30, to=+1hr
    const now=new Date();
    const dateEl=document.getElementById('bt-date');
    if(!dateEl.value) dateEl.value=toKey(now);
    const mins=now.getHours()*60+now.getMinutes();
    const roundedMins=Math.ceil(mins/30)*30;
    const fromEl=document.getElementById('bt-from');
    const toEl=document.getElementById('bt-to');
    if(!fromEl.value){ fromEl.value=m2t(Math.min(roundedMins,23*60)); toEl.value=m2t(Math.min(roundedMins+60,23*60+30)); }
    onBtTimeChange();
  }
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
      // Delete all stale tokens for this user before saving the new one
      const oldSnap=await getDocs(query(collection(db,`${T}/fcmTokens`),where('uid','==',currentUser.uid)));
      await Promise.all(oldSnap.docs.filter(d=>d.id!==token).map(d=>deleteDoc(d.ref)));
      await setDoc(doc(db,`${T}/fcmTokens`,token),{token,uid:currentUser.uid,barberName:barberName||'',role:userRole||'staff',updatedAt:Timestamp.fromDate(new Date())});
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
  if(window.dismissSplash) window.dismissSplash();
  if(user){
    currentUser=user;
    document.getElementById('screen-login').classList.remove('active');
    const app=document.getElementById('app');
    app.style.display='flex'; app.style.flexDirection='column'; app.style.flex='1'; app.style.overflow='hidden';
    await loadMeta();
    renderDateUI();
    loadBookings();
    startDayListener();
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

    const todayName=_DAYS[new Date().getDay()];
    const workingToday=allBarbers.filter(b=>_isWorkingOn(b,todayName));
    const isRealBarber=!!allBarbers.find(b=>b.name===barberName);
    const defaultBarber=isRealBarber?barberName:(workingToday[0]?.name||allBarbers[0]?.name||'');
    wiBarberSel=defaultBarber; wiqsBarberSel=defaultBarber; btBarberSel=defaultBarber;
    renderBarberAvatars('wi-barber-row',wiBarberSel,'selectWiBarber',todayName);
    renderBarberAvatars('wiqs-barber-row',wiqsBarberSel,'selectWiqsBarber',todayName);
    renderBarberAvatars('bt-barber-row',btBarberSel,'selectBtBarber',todayName);

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

  const filtered = activeDateFilter==='all' ? bks : bks.filter(b=>(b.barberName||b.barber||b.barberId||'').toLowerCase()===activeDateFilter.toLowerCase());
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
  wiCurrentType=type;
  ['booking','walkin','block'].forEach(t=>{ const btn=document.getElementById('type-btn-'+t); if(btn) btn.classList.toggle('active',t===type); });
  const dateGrp=document.getElementById('wi-date-group');
  const timeGrp=document.getElementById('wi-time-group');
  const wiTimeGrp=document.getElementById('wi-walkin-time-group');
  const banner=document.getElementById('wi-mode-banner');
  const btn=document.getElementById('wi-submit');
  if(type==='walkin'){
    if(dateGrp) dateGrp.style.display='none';
    if(timeGrp) timeGrp.style.display='none';
    if(wiTimeGrp) wiTimeGrp.style.display='';
    // Pre-fill time with now
    const nowInp=document.getElementById('wi-walkin-time');
    if(nowInp){ const n=new Date(); nowInp.value=m2t(n.getHours()*60+n.getMinutes()); }
    if(banner){ banner.className='mode-banner today'; banner.innerHTML='<div class="mode-dot"></div><span>Walk-in · straight to checkout</span>'; }
    btn.disabled=false; btn.style.opacity='1';
    btn.style.background=''; btn.style.border=''; btn.style.color=''; btn.style.boxShadow='';
    onWiWalkinTimeChange();
  } else {
    if(dateGrp) dateGrp.style.display='';
    if(timeGrp) timeGrp.style.display='';
    if(wiTimeGrp) wiTimeGrp.style.display='none';
    btn.disabled=true; btn.style.opacity='0.5';
    btn.textContent='Select a time first';
    btn.style.background=''; btn.style.border=''; btn.style.color=''; btn.style.boxShadow='';
    renderWiDatePills(); updateWiModeBanner(); onWiParamChange();
  }
};
window.submitWiForm=function(){
  if(wiCurrentType==='walkin') createWalkInNow();
  else createWalkIn();
};
window.onWiWalkinTimeChange=function(){
  const t=document.getElementById('wi-walkin-time')?.value;
  const btn=document.getElementById('wi-submit');
  if(!btn) return;
  btn.textContent=t?`⚡ Walk-in ${t} → Checkout`:'⚡ Walk-in → Checkout';
};
window.wiResetToNow=function(){
  const inp=document.getElementById('wi-walkin-time');
  if(!inp) return;
  const n=new Date(); inp.value=m2t(n.getHours()*60+n.getMinutes());
  onWiWalkinTimeChange();
};

// ── WALK-IN QUICK ─────────────────────────────────────────────────────────
window.onWiqsNameInput=function(val){
  document.getElementById('wiqs-contact').style.display=(val.trim()&&!wiqsSelectedClient)?'block':'none';
  const sug=document.getElementById('wiqs-suggest');
  if(!val.trim()||wiqsSelectedClient){ sug.innerHTML=''; return; }
  const lq=val.toLowerCase();
  const found=allClients.filter(c=>(c.name||'').toLowerCase().includes(lq)||(c.phone||'').includes(val)||(c.email||'').toLowerCase().includes(lq)).slice(0,5);
  if(!found.length){ sug.innerHTML=''; return; }
  sug.innerHTML=found.map(c=>`<div onclick="selectWiqsClient(${allClients.indexOf(c)})" style="padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px;margin-bottom:4px;cursor:pointer;display:flex;align-items:center;gap:10px;-webkit-tap-highlight-color:transparent"><div style="width:32px;height:32px;border-radius:50%;background:${clientColor(c.name)};display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:#0a0705;flex-shrink:0">${ini(c.name)}</div><div><div style="font-size:0.85rem;font-weight:600;color:var(--text)">${c.name}</div><div style="font-size:0.68rem;color:var(--muted)">${c.phone||c.email||''}</div></div></div>`).join('');
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
  if(!barber||!allBarbers.some(b=>b.name===barber)||!svcId){ toast('Select barber and service','error'); return; }
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
window.onBtTimeChange=function(){
  const from=document.getElementById('bt-from')?.value;
  const to=document.getElementById('bt-to')?.value;
  const btn=document.getElementById('bt-submit');
  if(!btn) return;
  const ok=from&&to&&from<to;
  btn.disabled=!ok; btn.style.opacity=ok?'1':'0.5';
  if(ok){ const dur=Math.round((t2m(to)-t2m(from))); btn.textContent=`🚫 Block ${from}–${to} (${dur>=60?Math.floor(dur/60)+'h'+(dur%60?dur%60+'m':''):(dur+'m')})`; }
  else btn.textContent='Block Time';
};

window.createBlockTime=async function(){
  const barber=btBarberSel;
  const dateVal=document.getElementById('bt-date').value;
  const from=document.getElementById('bt-from').value;
  const to=document.getElementById('bt-to').value;
  const note=document.getElementById('bt-note').value.trim();
  if(!barber||!dateVal||!from||!to||from>=to){ toast('Select barber, date and a valid time range','error'); return; }
  const[yr,mo,dy]=dateVal.split('-').map(Number);
  const[sh,sm2]=from.split(':').map(Number);
  const[eh,em]=to.split(':').map(Number);
  const start=new Date(yr,mo-1,dy,sh,sm2,0);
  const end=new Date(yr,mo-1,dy,eh,em,0);
  const btn=document.getElementById('bt-submit'); btn.disabled=true; btn.textContent='Blocking…';
  try{
    await addDoc(collection(db,`${T}/bookings`),{bookingId:'block-'+Date.now(),barberName:barber,time:from,date:start.toLocaleDateString('en-GB'),startTime:Timestamp.fromDate(start),endTime:Timestamp.fromDate(end),status:'BLOCKED',source:'Manual',note:note||'Blocked',createdAt:Timestamp.fromDate(new Date())});
    document.getElementById('bt-note').value='';
    document.getElementById('bt-from').value='';
    document.getElementById('bt-to').value='';
    closeSheet('bt'); toast('Time blocked','success'); loadBookings(true); _bkCache.delete(dateVal);
  }catch(ex){ toast('Error: '+ex.message,'error'); }
  btn.disabled=false; btn.style.opacity='1'; btn.textContent='Block Time';
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
  if(wiCurrentType==='walkin') return;
  wiSelectedTime=''; document.getElementById('wi-time').value='';
  const day=_wiDay();
  const workingOnDay=allBarbers.filter(b=>_isWorkingOn(b,day));
  if(wiBarberSel&&!workingOnDay.find(b=>b.name===wiBarberSel)) wiBarberSel=workingOnDay[0]?.name||'';
  renderBarberAvatars('wi-barber-row',wiBarberSel,'selectWiBarber',day);
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
    allBks.forEach(b=>{ if((b.barberName||'').toLowerCase()!==barber.toLowerCase()) return; if(['CANCELLED'].includes((b.status||'').toUpperCase())) return; let sm; if(b.startTime?.toDate){const t=b.startTime.toDate();sm=t.getHours()*60+t.getMinutes();}else if(b.time){sm=t2m(b.time);}else return; let bDur; if((b.status||'').toUpperCase()==='BLOCKED'&&b.endTime?.toDate&&b.startTime?.toDate){const et=b.endTime.toDate(),st2=b.startTime.toDate();bDur=Math.round((et-st2)/60000);}else{bDur=(allServices.find(s=>s.id===(b.serviceId||b.service))||{}).duration||30;} busy.push([sm,sm+bDur]); });
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
window.changeDay=function(d){ selectedDate=new Date(selectedDate); selectedDate.setDate(selectedDate.getDate()+d); window._bookingDate=null; renderDateUI(); loadBookings(); startDayListener(); };
window.goToday=function(){ selectedDate=new Date(); window._bookingDate=null; renderDateUI(); loadBookings(); startDayListener(); };

let _dayListenerUnsub=null;
function startDayListener(){
  if(_dayListenerUnsub){ _dayListenerUnsub(); _dayListenerUnsub=null; }
  const s0=new Date(selectedDate); s0.setHours(0,0,0,0);
  const s1=new Date(selectedDate); s1.setHours(23,59,59,999);
  let _first=true, _debounce=null;
  _dayListenerUnsub=onSnapshot(
    query(collection(db,`${T}/bookings`),where('startTime','>=',Timestamp.fromDate(s0)),where('startTime','<=',Timestamp.fromDate(s1))),
    ()=>{ if(_first){_first=false;return;} clearTimeout(_debounce); _debounce=setTimeout(()=>{ _invalidateCache(toKey(selectedDate)); loadBookings(true); },800); },
    ()=>{}
  );
}

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

const SOURCE_COLORS={'Walk-in':'#c9a84c','Fresha':'#4caf50','Booksy':'#2196f3','Treatwell':'#9c27b0','Website':'#64b5f6','Manual':'#8d6e63','Product Sale':'#ff9800'};
const _srcColor=s=>SOURCE_COLORS[s]||'#6b5f43';

function renderCalendar(bks){
  const SLOT_H=54;
  const dayH=getDayHours(selectedDate);
  const openMins=dayH.closed?9*60:t2m(dayH.open||'09:00');
  const closeMins=dayH.closed?20*60:t2m(dayH.close||'21:00');
  const _dayName=_DAYS[selectedDate.getDay()];
  const _isWorking=b=>_isWorkingOn(b,_dayName);
  const cols=(canSeeAll()?allBarbers:allBarbers.filter(b=>b.name.toLowerCase()===barberName.toLowerCase())).filter(_isWorking).filter(b=>activeDateFilter==='all'||b.name.toLowerCase()===activeDateFilter.toLowerCase());
  const slots=[];
  for(let m=openMins;m<closeMins;m+=30) slots.push(m);
  const totalH=slots.length*SLOT_H;
  const now=new Date();
  const isToday=selectedDate.toDateString()===now.toDateString();
  const nowMins=now.getHours()*60+now.getMinutes();
  const nowTop=isToday&&nowMins>=openMins&&nowMins<=closeMins?((nowMins-openMins)/30*SLOT_H):null;

  const bPos=b=>{ let sm=openMins; if(b.time){sm=t2m(b.time);}else if(b.startTime?.toDate){const d=b.startTime.toDate();const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false});const[hh,mm]=fmt.format(d).split(':');sm=parseInt(hh)*60+parseInt(mm);} let dur; if((b.status||'').toUpperCase()==='BLOCKED'&&b.endTime?.toDate&&b.startTime?.toDate){const et=b.endTime.toDate(),st2=b.startTime.toDate();dur=Math.round((et-st2)/60000);}else{dur=(allServices.find(s=>s.id===(b.serviceId||b.service))||{}).duration||30;} const top=Math.max(0,(sm-openMins)/30*SLOT_H); const height=Math.max(SLOT_H-4,dur/30*SLOT_H-3); return{top,height,dur}; };

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

  const headHtml=`<div class="cal-sticky-head"><div class="cal-corner"></div>${colData.map(({col,colBks})=>{
    const color=bColor(col.name);
    const done=colBks.filter(b=>(b.status||'').toUpperCase()==='CHECKED_OUT').length;
    const left=colBks.filter(b=>['CONFIRMED','PENDING'].includes((b.status||'').toUpperCase())).length;
    const doneHtml=done>0?`<span class="cbms-done">✓ ${done}</span>`:'';
    const leftHtml=left>0?`<span class="cbms-left" style="color:${color}">${left} left</span>`:done>0?`<span class="cbms-done">all done</span>`:'';
    return `<div class="cal-barber-hd" style="color:${color}"><span>${col.name}</span>${(doneHtml||leftHtml)?`<div class="cal-barber-mini-stats">${doneHtml}${leftHtml}</div>`:''}</div>`;
  }).join('')}</div>`;
  const timeHtml=slots.map(m=>{ const onHour=m%60===0; return `<div class="cal-time-lbl${onHour?'':' half'}">${onHour?m2t(m):''}</div>`; }).join('');
  const rowsHtml=slots.map(m=>`<div class="cal-row${m%60===0?' on-hour':''}"></div>`).join('');

  const colsHtml=colData.map(({col,items})=>{
    const events=items.map(item=>{
      const{b,top,height,lane,totalLanes}=item;
      const st=(b.status||'').toUpperCase();
      const idx=window._bookings.indexOf(b);
      const color=st==='BLOCKED'?'#6b5f43':bColor(col.name);
      const bg=st==='CANCELLED'?`${color}0a`:st==='BLOCKED'?'rgba(42,34,24,0.9)':`${color}1a`;
      const border=st==='CANCELLED'?`${color}44`:color;
      const opacity=st==='CANCELLED'?'0.45':'1';
      const label=st==='BLOCKED'?(b.note||'Block'):(b.clientName||'Walk-in');
      const paidBadge=st==='CHECKED_OUT'?`<span style="font-size:0.5rem;background:${color}33;color:${color};border-radius:3px;padding:0 3px;margin-left:3px;vertical-align:middle">✓ PAID</span>`:'';
      const svcName=(allServices.find(s=>s.id===(b.serviceId||b.service))||{}).name||b.serviceName||b.serviceId||b.service||'';
      const showSvc=height>42&&svcName;
      const timeStr=b.time||'';
      const src=b.source||'';
      const showSrc=height>56&&src&&st!=='BLOCKED';
      const srcColor=_srcColor(src);
      const lw=100/totalLanes; const ll=lane*lw;
      return `<div class="cal-event" onclick="openBooking(${idx})" style="top:${top}px;height:${height}px;left:calc(${ll.toFixed(1)}%+2px);width:calc(${lw.toFixed(1)}%-4px);background:${bg};border-left-color:${border};opacity:${opacity}"><div class="cal-event-name" style="color:${color}">${label}${paidBadge}</div>${showSvc?`<div class="cal-event-sub" style="color:${color}">${svcName}${timeStr?' · '+timeStr:''}</div>`:''}${showSrc?`<div class="cal-event-sub" style="color:${srcColor};opacity:0.85">${src}</div>`:''}</div>`;
    }).join('');
    return `<div class="cal-col">${rowsHtml}${events}</div>`;
  }).join('');

  const nowHtml=nowTop!==null?`<div class="cal-now-line" style="top:${nowTop}px"><div class="cal-now-dot"></div></div>`:'';

  const revenueHtml=`<div class="revenue-strip"><div class="rev-item"><div class="rev-lbl">Revenue</div><div class="rev-val">£${revenue.toFixed(0)}</div></div><div class="rev-item"><div class="rev-lbl">Checked Out</div><div class="rev-val green">${checkedOut.length}</div></div><div class="rev-item"><div class="rev-lbl">Remaining</div><div class="rev-val normal">${remaining}</div></div></div>`;

  const activeBks=bks.filter(b=>!['CANCELLED','BLOCKED'].includes((b.status||'').toUpperCase()));
  const srcMap={};
  activeBks.forEach(b=>{ const s=b.source||'Walk-in'; srcMap[s]=(srcMap[s]||0)+1; });
  const srcEntries=Object.entries(srcMap).sort((a,b)=>b[1]-a[1]);
  const sourceHtml=srcEntries.length?`<div class="source-strip">${srcEntries.map(([name,cnt])=>`<span class="src-chip" style="color:${_srcColor(name)};border-color:${_srcColor(name)}44;background:${_srcColor(name)}15"><span class="src-chip-dot" style="background:${_srcColor(name)}"></span>${name}<strong>${cnt}</strong></span>`).join('')}</div>`:'';

  return `<div class="cal-outer" id="cal-outer">${headHtml}<div class="cal-body-wrap"><div class="cal-time-col" style="height:${totalH}px">${timeHtml}</div><div class="cal-cols" style="height:${totalH}px">${nowHtml}${colsHtml}</div></div></div>${revenueHtml}${sourceHtml}`;
}

// ── BOOKING DETAIL ───────────────────────────────────────────────────────────
window.openBooking=function(i){
  const b=window._bookings[i]; if(!b) return;
  currentBooking=b;
  const name=b.clientName||b.name||'Walk-in';
  const svcObj=allServices.find(s=>s.id===(b.serviceId||b.service))||{};
  const svc=svcObj.name||b.serviceName||b.serviceId||b.service||'—';
  const dur=svcObj.duration;
  const st=(b.status||'').toUpperCase();
  const isPaid=st==='CHECKED_OUT';
  const barber=b.barberName||b.barber||b.barberId||'—';
  const color=bColor(barber);
  const fmtTs=ts=>{ if(!ts) return null; const d=ts?.toDate?ts.toDate():(ts instanceof Date?ts:null); if(!d) return null; return d.toLocaleTimeString('en-GB',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Europe/London'}); };
  const startT=fmtTs(b.startTime)||b.time||'—';
  const endT=fmtTs(b.endTime);
  const timeStr=endT?`${startT} → ${endT}`:startT;
  const chipStyle=isPaid?'background:rgba(61,139,94,0.14);color:var(--green)':st==='PENDING'?'background:rgba(155,58,58,0.14);color:var(--red)':'background:rgba(201,168,76,0.12);color:var(--gold)';
  const chipLabel=isPaid?'PAID':st==='CONFIRMED'?'CONFIRMED':st;

  // HERO
  document.getElementById('bk-hero').innerHTML=`<div class="bk-hero"><div class="bk-hero-top"><div><div class="bk-hero-name">${name}</div><div class="bk-hero-svc">${svc}${dur?' · '+dur+'min':''}</div></div><button class="sheet-close" onclick="closeSheet('bk')">✕</button></div><div class="bk-hero-chips"><span class="bk-status-chip" style="${chipStyle}">${chipLabel}</span><span class="bk-time-chip">🕘 ${timeStr}</span><span class="bk-barber-chip" style="color:${color};border-color:${color}40">${barber}</span></div></div>`;

  // QUICK ACTIONS
  const phone=b.clientPhone||'';
  const waNum=phone.replace(/\D/g,'').replace(/^0/,'44');
  const callBtn=phone?`<a href="tel:${phone}" class="bk-qa-btn" style="border-color:rgba(45,106,159,0.3);background:rgba(45,106,159,0.06)"><span class="bk-qa-icon">📞</span><span class="bk-qa-lbl" style="color:var(--blue)">Call</span></a>`:`<div class="bk-qa-btn" style="opacity:0.35"><span class="bk-qa-icon">📞</span><span class="bk-qa-lbl">Call</span></div>`;
  const waBtn=phone?`<a href="https://wa.me/${waNum}" target="_blank" class="bk-qa-btn" style="border-color:rgba(61,139,94,0.3);background:rgba(61,139,94,0.06)"><span class="bk-qa-icon">💬</span><span class="bk-qa-lbl" style="color:var(--green)">WhatsApp</span></a>`:`<div class="bk-qa-btn" style="opacity:0.35"><span class="bk-qa-icon">💬</span><span class="bk-qa-lbl">WhatsApp</span></div>`;
  const thirdBtn=isPaid?`<div class="bk-qa-btn"><span class="bk-qa-icon">📅</span><span class="bk-qa-lbl">Next Visit</span></div>`:`<div class="bk-qa-btn" onclick="_bkReschedule()"><span class="bk-qa-icon">📅</span><span class="bk-qa-lbl">Reschedule</span></div>`;
  const fourthBtn=isPaid?`<div class="bk-qa-btn" style="border-color:rgba(201,168,76,0.2);background:rgba(201,168,76,0.04)" onclick="_bkReceipt()"><span class="bk-qa-icon">🧾</span><span class="bk-qa-lbl" style="color:var(--gold)">Receipt</span></div>`:`<div class="bk-qa-btn" style="border-color:rgba(155,58,58,0.25);background:rgba(155,58,58,0.05)" onclick="_bkNoShow()"><span class="bk-qa-icon">👻</span><span class="bk-qa-lbl" style="color:var(--red)">No Show</span></div>`;
  document.getElementById('bk-qa').innerHTML=`<div class="bk-qa">${callBtn}${waBtn}${thirdBtn}${fourthBtn}</div>`;

  // BODY
  const price=pp(b.price||b.paidAmount);
  const dep=bookingDeposit(b);
  const remaining=dep>0?Math.max(0,price-dep):0;
  const discount=pp(b.discount); const tip=pp(b.tip); const paidAmount=pp(b.paidAmount);
  const addOns=(b.soldAddOns||[]).filter(x=>x.qty>0);
  const products=(b.soldProducts||[]).filter(x=>x.qty>0);

  let body=`<div id="bk-stats-row" class="bk-stats"><div class="bk-stat"><div class="bk-stat-val">—</div><div class="bk-stat-lbl">Visits</div></div><div class="bk-stat"><div class="bk-stat-val">—</div><div class="bk-stat-lbl">Total Spent</div></div><div class="bk-stat"><div class="bk-stat-val">—</div><div class="bk-stat-lbl">Points</div></div></div>`;

  if(isPaid){
    body+=`<div class="bk-sec"><div class="bk-sec-t">Payment</div><div class="bk-pay">${price>0?`<div class="bk-pr"><span>${svc}</span><span>£${price.toFixed(2)}</span></div>`:''}${addOns.map(x=>`<div class="bk-pr"><span>${x.name}${x.qty>1?' ×'+x.qty:''}</span><span>£${((parseFloat(x.price)||0)*x.qty).toFixed(2)}</span></div>`).join('')}${products.map(x=>`<div class="bk-pr"><span>${x.name}${x.qty>1?' ×'+x.qty:''}</span><span>£${((parseFloat(x.price)||0)*x.qty).toFixed(2)}</span></div>`).join('')}${tip>0?`<div class="bk-pr"><span>Tip · ${b.tipPaymentMethod||''}</span><span class="gr">£${tip.toFixed(2)}</span></div>`:''}${dep>0?`<div class="bk-pr"><span>Deposit paid</span><span class="gr">−£${dep.toFixed(2)}</span></div>`:''}${discount>0?`<div class="bk-pr"><span>Discount</span><span class="gr">−£${discount.toFixed(2)}</span></div>`:''}<div class="bk-pr tot"><span>TOTAL · ${b.paymentMethod||''}</span><span>£${paidAmount.toFixed(2)}</span></div></div></div>`;
  } else {
    body+=`<div class="bk-sec"><div class="bk-sec-t">Booking</div>${b.source?`<div class="bk-dr"><span class="bk-dl">Source</span><span class="bk-dv">${b.source}</span></div>`:''}${dep>0?`<div class="bk-dr"><span class="bk-dl">Deposit</span><span class="bk-dv gr">£${dep.toFixed(2)}${b.depositPaymentMethod?' · '+b.depositPaymentMethod:''}</span></div><div class="bk-dr"><span class="bk-dl">Remaining</span><span class="bk-dv or">£${remaining.toFixed(2)}</span></div>`:''}<div class="bk-dr"><span class="bk-dl">Price</span><span class="bk-dv g">${price>0?'£'+price.toFixed(2):'—'}</span></div></div>`;
  }
  if(b.note) body+=`<div class="bk-sec"><div class="bk-sec-t">Note</div><div class="bk-note">"${b.note}"</div></div>`;
  body+=`<div id="bk-history-row" class="bk-sec"><div class="bk-sec-t">Last Visits</div><div style="color:var(--muted);font-size:0.72rem;padding:4px 0">Loading…</div></div>`;

  document.getElementById('bk-body').innerHTML=body;

  // ACTIONS
  const acts=document.getElementById('bk-actions');
  acts.innerHTML=!isPaid
    ?`<button class="btn-ghost" onclick="closeSheet('bk')">Close</button><button class="btn-gold" style="flex:2" onclick="closeSheet('bk');setTimeout(openCheckout,250)">Checkout →</button>`
    :`<button class="btn-ghost" onclick="closeSheet('bk')">Close</button>`;

  openSheet('bk');
  _loadBkClientData(b);
};

async function _loadBkClientData(b){
  try{
    const phone=b.clientPhone||b.phone||''; const email=b.clientEmail||b.email||'';

    // Get client doc: try in-memory cache first, then Firestore clients collection
    let clientDoc=allClients.find(c=>(phone&&c.phone===phone)||(email&&c.email===email));
    if(!clientDoc&&(phone||email)){
      try{
        const cq=phone
          ?query(collection(db,`${T}/clients`),where('phone','==',phone),limit(1))
          :query(collection(db,`${T}/clients`),where('email','==',email),limit(1));
        const cs=await getDocs(cq);
        if(!cs.empty) clientDoc={id:cs.docs[0].id,...cs.docs[0].data()};
      }catch(_){}
    }

    // Show stats from client document immediately (totalVisits/totalSpent are maintained at checkout)
    const pts=clientDoc?.loyaltyPoints||0;
    const visits=clientDoc?.totalVisits||clientDoc?.visits||0;
    const totalSpent=pp(clientDoc?.totalSpent||0);
    const lastVisit=clientDoc?.lastVisit?.toDate?clientDoc.lastVisit.toDate():null;
    const lastVisitStr=lastVisit?lastVisit.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';
    const statsRow=document.getElementById('bk-stats-row');
    if(statsRow) statsRow.innerHTML=`<div class="bk-stat"><div class="bk-stat-val">${visits||'—'}</div><div class="bk-stat-lbl">Visits</div></div><div class="bk-stat"><div class="bk-stat-val">${totalSpent>0?'£'+totalSpent.toFixed(0):'—'}</div><div class="bk-stat-lbl">Total Spent</div></div><div class="bk-stat"><div class="bk-stat-val">${pts>0?'⭐'+pts:'—'}</div><div class="bk-stat-lbl">Points</div></div>`;

    // Fetch booking history for Last Visits list (separate, won't break stats if it fails)
    let histDocs=[];
    if(phone||email){
      try{
        const q2=phone
          ?query(collection(db,`${T}/bookings`),where('clientPhone','==',phone),orderBy('startTime','desc'),limit(12))
          :query(collection(db,`${T}/bookings`),where('clientEmail','==',email),orderBy('startTime','desc'),limit(12));
        const snap=await getDocs(q2);
        histDocs=snap.docs.map(d=>({...d.data(),_id:d.id}));
      }catch(_){}
    }
    const bId=b.bookingId||b._ref?.id||'';
    if(!histDocs.find(h=>h.bookingId===bId||h._id===bId)) histDocs.unshift({...b,_id:bId});

    const histRow=document.getElementById('bk-history-row');
    if(histRow){
      const recent=histDocs.slice(0,4);
      if(!recent.length){ histRow.remove(); return; }
      histRow.innerHTML='<div class="bk-sec-t">Last Visits</div>'+recent.map(h=>{
        const hDate=h.startTime?.toDate?h.startTime.toDate():null;
        const dateStr=hDate?hDate.toLocaleDateString('en-GB',{day:'numeric',month:'short'}):h.date||'';
        const hSvc=(allServices.find(s=>s.id===(h.serviceId||h.service))||{}).name||h.serviceName||h.service||'—';
        const hAmt=pp(h.paidAmount||h.price);
        const hBarber=h.barberName||h.barber||'—';
        const hStatus=(h.status||'').toUpperCase();
        const isCancelled=hStatus==='CANCELLED';
        return `<div class="bk-hrow"${isCancelled?' style="opacity:0.45"':''}><span class="bk-hd">${dateStr}</span><span class="bk-hs">${hSvc}</span><span class="bk-hb">${hBarber}</span><span class="bk-ha">${hAmt>0?'£'+hAmt.toFixed(0):'—'}</span></div>`;
      }).join('');
    }
  }catch(e){ const r=document.getElementById('bk-history-row'); if(r) r.remove(); }
}

window._bkNoShow=async function(){
  if(!currentBooking?._ref) return;
  if(!confirm('Mark as No Show?')) return;
  try{ await updateDoc(currentBooking._ref,{status:'NO_SHOW'}); toast('Marked as No Show','success'); closeSheet('bk'); loadBookings(true); }catch(e){ toast('Error: '+e.message,'error'); }
};
window._bkReschedule=function(){
  const b=currentBooking; if(!b) return;
  const email=b.clientEmail||''; const id=b.bookingId||b._id||b._ref?.id||'';
  if(email&&id) window.open(`https://whitecrossbarbers.com/Reschedule.html?id=${id}&email=${encodeURIComponent(email)}`, '_blank');
  else toast('No email address for reschedule link','error');
};
window._bkReceipt=function(){
  const b=currentBooking; if(!b) return;
  const svcObj=allServices.find(s=>s.id===(b.serviceId||b.service))||{};
  const svc=svcObj.name||b.serviceName||b.serviceId||b.service||'—';
  const price=pp(b.price||b.paidAmount); const dep=bookingDeposit(b);
  const discount=pp(b.discount); const tip=pp(b.tip); const paidAmount=pp(b.paidAmount);
  const addOns=(b.soldAddOns||[]).filter(x=>x.qty>0);
  const products=(b.soldProducts||[]).filter(x=>x.qty>0);
  const dateStr=b.startTime?.toDate?b.startTime.toDate().toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
  const strip=document.getElementById('co-client-strip');
  if(strip) strip.innerHTML=`<div style="padding:10px 16px 6px;display:flex;flex-direction:column;gap:2px"><div style="font-size:0.9rem;font-weight:700;color:var(--text)">${b.clientName||'Walk-in'}</div><div style="font-size:0.7rem;color:var(--muted)">${dateStr}</div></div>`;
  const hdr=document.querySelector('#co-sheet .co-hdr-title'); if(hdr) hdr.textContent='Receipt';
  document.getElementById('co-body').innerHTML=`
    <div class="co-total-card">
      ${price>0?`<div class="co-row"><span>${svc}</span><span>£${price.toFixed(2)}</span></div>`:''}
      ${addOns.map(x=>`<div class="co-row"><span>${x.name}${x.qty>1?' ×'+x.qty:''}</span><span>£${((parseFloat(x.price)||0)*x.qty).toFixed(2)}</span></div>`).join('')}
      ${products.map(x=>`<div class="co-row"><span>${x.name}${x.qty>1?' ×'+x.qty:''}</span><span>£${((parseFloat(x.price)||0)*x.qty).toFixed(2)}</span></div>`).join('')}
      ${dep>0?`<div class="co-row"><span>Deposit paid</span><span style="color:var(--green)">−£${dep.toFixed(2)}</span></div>`:''}
      ${discount>0?`<div class="co-row"><span>Discount</span><span style="color:var(--green)">−£${discount.toFixed(2)}</span></div>`:''}
      ${tip>0?`<div class="co-row"><span>Tip · ${b.tipPaymentMethod||b.paymentMethod||''}</span><span>£${tip.toFixed(2)}</span></div>`:''}
      <div class="co-row final"><span>TOTAL · ${b.paymentMethod||''}</span><span>£${paidAmount.toFixed(2)}</span></div>
    </div>
    <button class="btn-ghost" style="width:100%;margin-top:16px" onclick="closeSheet('co')">Close</button>
    <div style="height:20px"></div>`;
  closeSheet('bk');
  setTimeout(()=>{ currentBooking=b; openSheet('co'); },200);
};

// ── CHECKOUT ─────────────────────────────────────────────────────────────────
window.openCheckout=function(){
  const hdr=document.querySelector('#co-sheet .co-hdr-title'); if(hdr) hdr.textContent='Checkout';
  coMethod='CASH'; coTip=0; coCustomTip=''; coTipMethod='';
  coProducts={}; coAddons={}; coServiceOverride=null;
  const b=currentBooking;
  // Pre-load any already-saved add-ons / products (e.g. from quick walk-in form)
  if(b?.soldAddOns?.length) b.soldAddOns.forEach(a=>{ if(a.qty>0) coAddons[a.productId]=a.qty; });
  if(b?.soldProducts?.length) b.soldProducts.forEach(p=>{ if(p.qty>0) coProducts[p.productId]=p.qty; });
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
  const deposit=bookingDeposit(b);
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
  const deposit=bookingDeposit(b);
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
  // Only award points if client is identifiable by phone or email
  const canEarnPoints=!!(phone||email);
  const pointsEarned=(isMember||!canEarnPoints)?0:Math.floor(basePrice+productsTotal+addonsTotal);
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
      if(clientDocRef){
        const clUpdate={lastVisit:Timestamp.fromDate(new Date()),lastBarber:b.barberName||'',lastService:b.serviceId||b.service||'',totalSpent:increment(billable+deposit),totalVisits:increment(1)};
        if(!isMember&&pointsEarned>0) clUpdate.loyaltyPoints=increment(pointsEarned);
        await updateDoc(clientDocRef,clUpdate);
      } else if(phone||email){
        await addDoc(collection(db,`${T}/clients`),{name:b.clientName||'',phone,email,loyaltyPoints:(!isMember&&pointsEarned>0)?pointsEarned:0,totalSpent:billable+deposit,totalVisits:1,lastVisit:Timestamp.fromDate(new Date()),lastBarber:b.barberName||'',createdAt:Timestamp.fromDate(new Date())});
      }
    }catch(e){}
    if(prog){prog.style.transition='width 0.25s ease';prog.style.width='100%';}
    const methodLabel={'CASH':'💷 Cash','CARD':'💳 Card','MONZO':'📱 Monzo','VOUCHER':'🎟 Voucher'}[coMethod]||coMethod;
    const svcName=(allServices.find(s=>s.id===(b.serviceId||b.service))||{}).name||b.serviceName||b.service||'';
    const ptsLine=pointsEarned>0?`<div class="co-succ-pts">+${pointsEarned} pts earned ⭐</div>`:'';
    document.getElementById('co-body').innerHTML=`<div class="co-succ">
      <div class="co-succ-icon">
        <div class="co-succ-glow"></div>
        <div class="co-succ-ring">
          <svg class="co-succ-check" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(201,168,76,0.2)" stroke-width="1.5"/>
            <polyline class="co-succ-tick" points="12 21 17 26 28 14" fill="none" stroke="#c9a84c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
      <div class="co-succ-amt">£${total.toFixed(2)}</div>
      <div class="co-succ-label">Payment received</div>
      <div class="co-succ-card">
        <div class="co-succ-name">${b.clientName||'Walk-in'}</div>
        ${svcName?`<div class="co-succ-row"><span>${svcName}</span><span style="color:var(--gold)">${b.barberName||b.barber||''}</span></div>`:''}
        <div class="co-succ-row"><span>Payment</span><span>${methodLabel}</span></div>
      </div>
      ${ptsLine}
    </div>`;
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
let _clSort = 'lastVisit'; // 'lastVisit' | 'name'
window.toggleClSort=function(){
  _clSort=_clSort==='lastVisit'?'name':'lastVisit';
  const btn=document.getElementById('cl-sort-btn');
  if(btn) btn.textContent=_clSort==='lastVisit'?'🕐 Last Visit':'🔤 A–Z';
  renderClients(allClients);
};
async function loadClients(){
  _clientsLastDoc = null; _clientsAllLoaded = false; allClients = [];
  try{
    const snap=await getDocs(query(collection(db,`${T}/clients`),orderBy('lastVisit','desc'),limit(CLIENTS_PAGE)));
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
    const snap=await getDocs(query(collection(db,`${T}/clients`),orderBy('lastVisit','desc'),startAfter(_clientsLastDoc),limit(CLIENTS_PAGE)));
    const more=snap.docs.map(d=>({id:d.id,...d.data()}));
    allClients=[...allClients,...more];
    _clientsLastDoc=snap.docs[snap.docs.length-1]||_clientsLastDoc;
    _clientsAllLoaded=snap.docs.length<CLIENTS_PAGE;
    renderClients(allClients);
    document.getElementById('clients-count').textContent=allClients.length+(_clientsAllLoaded?'':'+') +' CLIENTS';
  }catch(e){ console.error('loadMoreClients',e); if(btn){btn.disabled=false;btn.textContent='Load more';} }
}
window.loadMoreClients=loadMoreClients;
function _updateClStatsStrip(){
  const c=document.getElementById('ss-clients'),m=document.getElementById('ss-members'),a=document.getElementById('ss-avg');
  if(!c) return;
  const total=allClients.length;
  const members=allClients.filter(cl=>cl.isMember).length;
  const totalVisits=allClients.reduce((s,cl)=>s+(cl.totalVisits||cl.visits||0),0);
  const avgVisits=total?totalVisits/total:0;
  c.textContent=total+(_clientsAllLoaded?'':'+');
  m.textContent=members||'—';
  a.textContent=avgVisits>0?avgVisits.toFixed(1):'—';
}
window.setClFilter=function(f,btn){
  _clFilter=f;
  document.querySelectorAll('.fp-pill').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderClients(allClients);
};
function renderClients(list){
  window._clientList=list;
  const el=document.getElementById('clients-list');
  _updateClStatsStrip();
  // Sort first
  let sorted=[...list];
  if(_clFilter==='topspenders') sorted.sort((a,b)=>pp(b.totalSpent||0)-pp(a.totalSpent||0));
  else if(_clSort==='name') sorted.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  else sorted.sort((a,b)=>{ const at=a.lastVisit?.toDate?.()?.getTime()||0; const bt=b.lastVisit?.toDate?.()?.getTime()||0; return bt-at; });
  // Then filter
  let filtered=sorted;
  if(_clFilter==='members') filtered=sorted.filter(c=>c.isMember);
  else if(_clFilter==='regulars') filtered=sorted.filter(c=>(c.totalVisits||c.visits||0)>=3);
  else if(_clFilter==='new'){ const d90=new Date(Date.now()-90*24*60*60*1000); filtered=sorted.filter(c=>(c.totalVisits||c.visits||0)<=2||(c.createdAt?.toDate?.()>=d90)); }
  if(!filtered.length){ el.innerHTML='<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">No clients found</div></div>'; return; }
  const cards=filtered.map((c)=>{
    const origIdx=list.indexOf(c);
    const name=c.name||'—'; const pts=c.loyaltyPoints||0;
    const visits=c.totalVisits||c.visits||0;
    const bg=clientColor(c.name||'');
    const lastDate=c.lastVisit?.toDate?c.lastVisit.toDate().toLocaleDateString('en-GB',{day:'numeric',month:'short'}):'';
    const isMember=!!c.isMember;
    return `<div class="client-row" onclick="openClient(${origIdx})">
      <div class="c-av" style="background:${bg}">${ini(name)}${isMember?'<div class="member-ring"></div>':''}</div>
      <div class="c-info">
        <div class="c-name">${name}</div>
        <div class="c-meta">${[c.phone||c.email,lastDate?'Last: '+lastDate:''].filter(Boolean).join(' · ')||'No contact info'}</div>
      </div>
      <div class="c-right">
        ${isMember?'<div class="member-badge">◆ MEMBER</div>':''}
        ${pts>0?`<div class="c-pts">⭐ ${pts}</div>`:''}
        ${visits>0?`<div class="c-visits">${visits} visit${visits===1?'':'s'}</div>`:''}
      </div>
    </div>`;
  }).join('');
  const loadMoreBtn=_clientsAllLoaded?'':'<div style="padding:14px;text-align:center"><button id="load-more-clients" onclick="loadMoreClients()" style="padding:10px 24px;border-radius:99px;border:1px solid var(--border2);background:transparent;color:var(--muted);font-size:0.75rem;font-weight:600;cursor:pointer;font-family:var(--font-ui);">Load more</button></div>';
  el.innerHTML=cards+loadMoreBtn;
}
let _clSearchTimer=null;
window.searchClients=function(q){
  clearTimeout(_clSearchTimer);
  if(!q.trim()){ renderClients(allClients); return; }
  const lq=q.toLowerCase();
  // Show immediate results from loaded clients
  renderClients(allClients.filter(c=>(c.name||'').toLowerCase().includes(lq)||(c.phone||'').includes(q)||(c.email||'').toLowerCase().includes(lq)));
  // Also query Firestore after short delay to find unloaded clients
  if(q.length>=2){
    _clSearchTimer=setTimeout(async()=>{
      try{
        const qUpper=q[0].toUpperCase()+q.slice(1);
        const [nameSnap,phoneSnap]=await Promise.all([
          getDocs(query(collection(db,`${T}/clients`),orderBy('name'),startAt(qUpper),endAt(qUpper+''),limit(20))),
          getDocs(query(collection(db,`${T}/clients`),orderBy('phone'),startAt(q),endAt(q+''),limit(20))),
        ]);
        const seen=new Set(allClients.map(c=>c.id));
        const extra=[];
        [...nameSnap.docs,...phoneSnap.docs].forEach(d=>{ if(!seen.has(d.id)){ seen.add(d.id); extra.push({id:d.id,...d.data()}); }});
        if(extra.length&&document.getElementById('client-search')?.value===q){
          const lq2=q.toLowerCase();
          const merged=[...allClients.filter(c=>(c.name||'').toLowerCase().includes(lq2)||(c.phone||'').includes(q)||(c.email||'').toLowerCase().includes(lq2)),...extra];
          renderClients(merged);
        }
      }catch(_){}
    },350);
  }
};
let _clViewClient=null, _clPtsDelta=0;
function renderClSheet(){
  const c=_clViewClient; if(!c) return;
  const basePts=c.loyaltyPoints||0;
  const newPts=Math.max(0,basePts+_clPtsDelta);
  const visits=c.totalVisits||c.visits||0; const spent=c.totalSpent||0; const disc=c.totalDiscount||0;
  const bg=clientColor(c.name||'');
  const phone=c.phone||'';
  const waNum=phone.replace(/[^0-9]/g,'').replace(/^0/,'44');
  const isMember=!!c.isMember;
  const LOYALTY_TARGET=300;
  const loyaltyPct=Math.min(100,Math.round((newPts/LOYALTY_TARGET)*100));
  const avgVisit=visits>0&&spent>0?'£'+Math.round(spent/visits):'—';
  const lastVisitDate=c.lastVisit?.toDate?c.lastVisit.toDate():null;
  const sinceVisit=lastVisitDate?Math.floor((new Date()-lastVisitDate)/(1000*60*60*24))+'d':'—';
  const lastSvcName=c.lastService?(allServices.find(s=>s.id===c.lastService)?.name||c.lastService):'';
  const presets=[-20,-10,-5,5,10,20,50];

  const callBtn=phone
    ?`<a href="tel:${phone}" class="qa" style="border-color:rgba(45,106,159,0.3);background:rgba(45,106,159,0.06)"><span class="qa-icon">📞</span><span class="qa-lbl" style="color:var(--blue)">Call</span></a>`
    :`<div class="qa" style="opacity:0.3;cursor:default"><span class="qa-icon">📞</span><span class="qa-lbl">Call</span></div>`;
  const waBtn=phone
    ?`<a href="https://wa.me/${waNum}" target="_blank" class="qa" style="border-color:rgba(61,139,94,0.3);background:rgba(61,139,94,0.06)"><span class="qa-icon">💬</span><span class="qa-lbl" style="color:var(--green)">WhatsApp</span></a>`
    :`<div class="qa" style="opacity:0.3;cursor:default"><span class="qa-icon">💬</span><span class="qa-lbl">WhatsApp</span></div>`;
  const bookQa=`<div class="qa" onclick="bookClientNow()"><span class="qa-icon">📅</span><span class="qa-lbl">Book Now</span></div>`;
  const editQa=`<div class="qa" onclick="editClientSheet()" style="border-color:rgba(201,168,76,0.2);background:rgba(201,168,76,0.04)"><span class="qa-icon">✏️</span><span class="qa-lbl" style="color:var(--gold)">Edit</span></div>`;

  document.getElementById('cl-body').innerHTML=`
    <div class="c-hero">
      <div class="c-hero-top">
        <div class="c-hero-av" style="background:${bg}">${ini(c.name)}${isMember?'<div class="member-ring"></div>':''}</div>
        <div>
          <div class="c-hero-name">${c.name||'—'}</div>
          <div class="c-hero-sub">${[phone,c.email].filter(Boolean).join(' · ')||'No contact info'}</div>
        </div>
      </div>
      <div class="c-hero-badges">
        ${isMember?'<span class="badge" style="background:rgba(139,92,246,0.12);color:#a78bfa;">◆ MEMBER</span>':''}
        <span id="cl-pts-chip" class="badge" style="background:var(--gold-dim);color:var(--gold);${newPts>0?'':'display:none'}">⭐ ${newPts} pts</span>
        ${visits>0?`<span class="badge" style="background:rgba(61,139,94,0.1);color:var(--green)">${visits} visit${visits===1?'':'s'}</span>`:''}
      </div>
    </div>
    <div class="qa-row">${callBtn}${waBtn}${bookQa}${editQa}</div>
    <div class="c-stats" id="cl-stats-row">
      <div class="cs"><div class="cs-val">${visits||'—'}</div><div class="cs-lbl">Visits</div></div>
      <div class="cs"><div class="cs-val">${spent>0?'£'+Math.round(spent):'—'}</div><div class="cs-lbl">Total Spent</div></div>
      <div class="cs"><div class="cs-val">${disc>0?'-£'+Math.round(disc):'—'}</div><div class="cs-lbl">Discount</div></div>
      <div class="cs"><div class="cs-val">${sinceVisit}</div><div class="cs-lbl">Since Visit</div></div>
    </div>
    <div class="sec">
      <div class="sec-t">Loyalty</div>
      <div class="loyalty-wrap">
        <div class="loyalty-track"><div class="loyalty-fill" id="cl-loyalty-fill" style="width:${loyaltyPct}%"></div></div>
        <div class="loyalty-meta"><span id="cl-loyalty-meta">${newPts} pts</span><span style="color:var(--gold)">300 pts → Free cut</span></div>
      </div>
    </div>
    ${(phone||c.email||c.lastBarber||lastSvcName)?`<div class="sec">
      <div class="sec-t">Info</div>
      ${phone?`<div class="dr"><span class="dl">Phone</span><span class="dv gr">${phone}</span></div>`:''}
      ${c.email?`<div class="dr"><span class="dl">Email</span><span class="dv" style="font-size:0.72rem">${c.email}</span></div>`:''}
      ${c.lastBarber?`<div class="dr"><span class="dl">Last Barber</span><span class="dv g">${c.lastBarber}</span></div>`:''}
      ${lastSvcName?`<div class="dr"><span class="dl">Last Service</span><span class="dv">${lastSvcName}</span></div>`:''}
    </div>`:''}
    ${c.notes?`<div class="sec"><div class="sec-t">Note</div><div class="note">${c.notes}</div></div>`:''}
    <div class="sec">
      <div class="sec-t">Adjust Points</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">
        ${presets.map(d=>`<button onclick="adjClPts(${d})" style="flex:1;min-width:40px;padding:7px 3px;border-radius:8px;border:1px solid ${d<0?'rgba(155,58,58,0.3)':'rgba(61,139,94,0.3)'};background:${d<0?'rgba(155,58,58,0.06)':'rgba(61,139,94,0.06)'};color:${d<0?'var(--red)':'var(--green)'};font-size:0.72rem;font-weight:700;cursor:pointer;font-family:var(--font-ui)">${d>0?'+':''}${d}</button>`).join('')}
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <input id="cl-pts-custom" type="number" placeholder="Custom pts…" style="flex:1;padding:9px 12px;background:var(--bg);border:1px solid var(--border2);border-radius:10px;color:var(--text);font-size:0.85rem;outline:none;font-family:var(--font-ui)" onkeydown="if(event.key==='Enter')applyClCustomPts()" />
        <button onclick="applyClCustomPts()" style="padding:9px 14px;border-radius:10px;background:var(--gold-dim);border:1px solid var(--gold2);color:var(--gold);font-size:0.75rem;font-weight:700;cursor:pointer;font-family:var(--font-ui);white-space:nowrap">Apply</button>
      </div>
      <div id="cl-pts-delta" style="display:none;margin-top:10px;padding:9px 12px;background:rgba(201,168,76,0.08);border:1px solid var(--gold2);border-radius:10px;font-size:0.75rem;color:var(--gold);font-weight:600"></div>
    </div>
    <div class="sec" id="cl-history-row">
      <div class="sec-t">Visit History</div>
      <div style="font-size:0.68rem;color:var(--muted);padding:6px 0">Loading…</div>
    </div>
  `;
  _updateClPtsUI();
}
function _updateClPtsUI(){
  const c=_clViewClient; if(!c) return;
  const basePts=c.loyaltyPoints||0;
  const newPts=Math.max(0,basePts+_clPtsDelta);
  const LOYALTY_TARGET=300;
  const loyaltyPct=Math.min(100,Math.round((newPts/LOYALTY_TARGET)*100));
  const chip=document.getElementById('cl-pts-chip');
  if(chip){ chip.style.display=newPts>0?'':'none'; chip.textContent='⭐ '+newPts+' pts'; }
  const fill=document.getElementById('cl-loyalty-fill');
  if(fill) fill.style.width=loyaltyPct+'%';
  const meta=document.getElementById('cl-loyalty-meta');
  if(meta) meta.textContent=newPts+' pts';
  const delta=document.getElementById('cl-pts-delta');
  if(delta){
    if(_clPtsDelta!==0){ delta.style.display='block'; delta.innerHTML=`${basePts} pts → <strong>${newPts} pts</strong> (${_clPtsDelta>0?'+':''}${_clPtsDelta})`; }
    else { delta.style.display='none'; }
  }
  const acts=document.getElementById('cl-actions');
  if(acts) acts.innerHTML=_clPtsDelta!==0
    ?`<button class="btn-ghost" onclick="_clPtsDelta=0;_updateClPtsUI()">Reset</button><button class="btn-gold" style="flex:2" onclick="saveClPoints()">Save ${_clPtsDelta>0?'+':''}${_clPtsDelta} pts →</button>`
    :`<button class="btn-ghost" onclick="closeSheet('cl')">Close</button><button class="btn-gold" style="flex:2" onclick="bookClientNow()">📅 Book Now</button>`;
}
async function _loadClHistory(c){
  try{
    const phone=c.phone||''; const email=c.email||'';
    const histRow=document.getElementById('cl-history-row');
    let docs=[];
    if(phone||email){
      const q2=phone
        ?query(collection(db,`${T}/bookings`),where('clientPhone','==',phone),orderBy('startTime','desc'),limit(50))
        :query(collection(db,`${T}/bookings`),where('clientEmail','==',email),orderBy('startTime','desc'),limit(50));
      const snap=await getDocs(q2);
      docs=snap.docs.map(d=>d.data());
      // Fallback: try email if phone returned nothing
      if(!docs.length&&phone&&email){
        const snap2=await getDocs(query(collection(db,`${T}/bookings`),where('clientEmail','==',email),orderBy('startTime','desc'),limit(50)));
        docs=snap2.docs.map(d=>d.data());
      }
    }
    if(!histRow) return;
    if(!docs.length){ if(!phone&&!email) histRow.remove(); return; }
    const paid=docs.filter(h=>(h.status||'').toUpperCase()==='CHECKED_OUT');
    const totalSpent=paid.reduce((s,h)=>s+pp(h.paidAmount||h.price),0);
    const totalDiscount=paid.reduce((s,h)=>s+pp(h.discount||0),0);
    const avgVisit=paid.length>0?'£'+Math.round(totalSpent/paid.length):'—';
    const statsRow=document.getElementById('cl-stats-row');
    if(statsRow){
      const lastDate=docs[0]?.startTime?.toDate?docs[0].startTime.toDate():null;
      const sinceVisit=lastDate?Math.floor((new Date()-lastDate)/(1000*60*60*24))+'d':'—';
      statsRow.innerHTML=`
        <div class="cs"><div class="cs-val">${paid.length||'—'}</div><div class="cs-lbl">Visits</div></div>
        <div class="cs"><div class="cs-val">${totalSpent>0?'£'+Math.round(totalSpent):'—'}</div><div class="cs-lbl">Total Spent</div></div>
        <div class="cs"><div class="cs-val">${totalDiscount>0?'-£'+Math.round(totalDiscount):'—'}</div><div class="cs-lbl">Discount</div></div>
        <div class="cs"><div class="cs-val">${sinceVisit}</div><div class="cs-lbl">Since Visit</div></div>`;
    }
    histRow.innerHTML='<div class="sec-t">Visit History</div>'+docs.map(h=>{
      const hDate=h.startTime?.toDate?h.startTime.toDate():null;
      const dateStr=hDate?hDate.toLocaleDateString('en-GB',{day:'numeric',month:'short'}):h.date||'';
      const hSvc=(allServices.find(s=>s.id===(h.serviceId||h.service))||{}).name||h.serviceName||h.service||'—';
      const hAmt=pp(h.paidAmount||h.price);
      const hBarber=(h.barberName||h.barber||'—').split(' ')[0];
      const hStatus=(h.status||'').toUpperCase();
      const isPaid=hStatus==='CHECKED_OUT';
      return `<div class="vrow">
        <span class="vdate">${dateStr}</span>
        <span class="vsvc">${hSvc}</span>
        <span class="vbarber">${hBarber}</span>
        <span class="vamt">${hAmt>0?'£'+hAmt.toFixed(0):'—'}</span>
      </div>`;
    }).join('');
  }catch(e){ const r=document.getElementById('cl-history-row'); if(r) r.remove(); }
}
window.adjClPts=function(d){ _clPtsDelta=Math.max(-(_clViewClient?.loyaltyPoints||0), _clPtsDelta+d); _updateClPtsUI(); };
window.applyClCustomPts=function(){
  const inp=document.getElementById('cl-pts-custom'); if(!inp) return;
  const v=parseInt(inp.value)||0; if(!v){ inp.value=''; return; }
  _clPtsDelta=Math.max(-(_clViewClient?.loyaltyPoints||0), _clPtsDelta+v);
  inp.value=''; _updateClPtsUI();
};
window.saveClPoints=async function(){
  if(!_clViewClient||_clPtsDelta===0){ closeSheet('cl'); return; }
  const btn=document.querySelector('#cl-actions .btn-gold'); if(btn){ btn.disabled=true; btn.textContent='Saving…'; }
  try{
    await updateDoc(doc(db,`${T}/clients`,_clViewClient.id),{loyaltyPoints:increment(_clPtsDelta)});
    _clViewClient.loyaltyPoints=Math.max(0,(_clViewClient.loyaltyPoints||0)+_clPtsDelta);
    const ci=allClients.findIndex(c=>c.id===_clViewClient.id); if(ci>=0) allClients[ci].loyaltyPoints=_clViewClient.loyaltyPoints;
    _clPtsDelta=0; toast('Points updated','success'); _updateClPtsUI();
  }catch(e){ toast('Error: '+e.message,'error'); if(btn){ btn.disabled=false; btn.textContent=`Save ${_clPtsDelta>0?'+':''}${_clPtsDelta} pts →`; } }
};
window.openClient=function(i){
  const c=window._clientList[i]; if(!c) return;
  _clViewClient=c; _clPtsDelta=0;
  renderClSheet(); openSheet('cl'); _loadClHistory(c);
};
window.bookClientNow=function(){
  const c=_clViewClient; if(!c) return;
  closeSheet('cl'); setTab('new');
  setTimeout(()=>{ const inp=document.getElementById('wi-client-search'); if(inp){inp.value=c.name||''; searchWiClient(c.name||'');} },200);
};
window.editClientSheet=function(){
  const c=_clViewClient; if(!c) return;
  document.getElementById('ac-name').value=c.name||'';
  document.getElementById('ac-phone').value=c.phone||'';
  document.getElementById('ac-email').value=c.email||'';
  document.getElementById('ac-notes').value=c.notes||'';
  openSheet('ac');
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
function _showWiNewFields(show){
  const el=document.getElementById('wi-new-client-fields'); if(!el) return;
  el.style.display=show?'flex':'none';
}
window.searchWiClient=function(q){
  const res=document.getElementById('wi-client-results');
  if(!q.trim()){ res.innerHTML=''; _showWiNewFields(false); return; }
  _showWiNewFields(true);
  const lq=q.toLowerCase();
  const found=allClients.filter(c=>(c.name||'').toLowerCase().includes(lq)||(c.phone||'').includes(q)).slice(0,5);
  if(!found.length){ res.innerHTML=''; return; }
  res.innerHTML=found.map((c,i)=>`<div onclick="selectWiClient(${allClients.indexOf(c)})" style="padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px;margin-bottom:4px;cursor:pointer;display:flex;align-items:center;gap:10px;-webkit-tap-highlight-color:transparent"><div style="width:32px;height:32px;border-radius:50%;background:${clientColor(c.name)};display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:#0a0705;flex-shrink:0">${ini(c.name)}</div><div><div style="font-size:0.85rem;font-weight:600;color:var(--text)">${c.name}</div><div style="font-size:0.68rem;color:var(--muted)">${c.phone||c.email||''}</div></div></div>`).join('');
};
window.selectWiClient=function(i){
  const c=allClients[i]; if(!c) return;
  wiSelectedClient=c;
  document.getElementById('wi-client-results').innerHTML='';
  document.getElementById('wi-client-search').value='';
  _showWiNewFields(false);
  const sel=document.getElementById('wi-selected-client');
  sel.style.display='flex';
  sel.innerHTML=`<span style="flex:1">${c.name}${c.phone?' · '+c.phone:''}</span><span id="wi-pts-badge" style="display:none;font-size:0.65rem;font-weight:700;color:var(--gold);background:var(--gold-dim);border:1px solid var(--gold2);padding:2px 8px;border-radius:99px;margin-right:6px;white-space:nowrap"></span><button onclick="clearWiClient()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:0.9rem;flex-shrink:0;">✕</button>`;
  if(c.phone||c.email){
    const _cr=collection(db,`${T}/clients`);
    const _q=c.phone?query(_cr,where('phone','==',c.phone)):query(_cr,where('email','==',c.email));
    getDocs(_q).then(s=>{ if(!s.empty){ const pts=s.docs[0].data().loyaltyPoints||0; if(pts>0){ const bdg=document.getElementById('wi-pts-badge'); if(bdg){bdg.textContent='⭐ '+pts;bdg.style.display='inline';} } } }).catch(()=>{});
  }
};
window.clearWiClient=function(){
  wiSelectedClient=null;
  document.getElementById('wi-selected-client').style.display='none';
  const q=document.getElementById('wi-client-search').value||'';
  _showWiNewFields(q.trim().length>0);
};

async function _autoCreateClient(name, phone, email){
  if(!name||name==='Walk-in') return;
  // Check if already exists by phone or email
  if(phone){
    const existing=allClients.find(c=>c.phone===phone);
    if(existing) return; // already in system
  }
  try{
    const docRef=await addDoc(collection(db,`${T}/clients`),{name,phone:phone||'',email:email||'',loyaltyPoints:0,visits:0,totalSpent:0,createdAt:Timestamp.fromDate(new Date())});
    // add to local cache so it's searchable immediately
    allClients.unshift({id:docRef.id,name,phone:phone||'',email:email||'',loyaltyPoints:0,visits:0,totalSpent:0});
  }catch(e){ console.warn('auto-create client failed',e); }
}

window.createWalkInNow=async function(){
  const clientInput=(document.getElementById('wi-client-search').value||'').trim();
  const clientName=wiSelectedClient?wiSelectedClient.name:(clientInput||'Walk-in');
  const clientPhone=wiSelectedClient?wiSelectedClient.phone||'':(document.getElementById('wi-phone')?.value||'').trim();
  const clientEmail=wiSelectedClient?wiSelectedClient.email||'':(document.getElementById('wi-email-new')?.value||'').trim();
  const barber=wiBarberSel;
  const svcId=document.getElementById('wi-service').value;
  const note=document.getElementById('wi-notes').value.trim();
  const svc=allServices.find(s=>s.id===svcId)||{};
  if(!barber||!allBarbers.some(b=>b.name===barber)||!svcId){ toast('Select barber and service','error'); return; }
  // Always today's date; time from input (or current time as fallback)
  const today=new Date();
  const timeInput=document.getElementById('wi-walkin-time')?.value;
  let start;
  if(timeInput){
    const[h,m]=timeInput.split(':').map(Number);
    start=new Date(today.getFullYear(),today.getMonth(),today.getDate(),h,m,0);
  } else {
    start=today;
  }
  const time=m2t(start.getHours()*60+start.getMinutes());
  const bookingId='walkin-'+Date.now();
  const btn=document.getElementById('wi-submit'); btn.disabled=true; btn.textContent='Creating…';
  try{
    const newRef=await addDoc(collection(db,`${T}/bookings`),{bookingId,clientName,clientPhone,clientEmail,barberName:barber,serviceId:svcId,service:svcId,price:svc.price||0,time,date:start.toLocaleDateString('en-GB'),startTime:Timestamp.fromDate(start),endTime:Timestamp.fromDate(new Date(start.getTime()+(svc.duration||30)*60000)),status:'CONFIRMED',source:'Walk-in',note,createdAt:Timestamp.fromDate(new Date())});
    currentBooking={_ref:newRef,bookingId,clientName,clientPhone,clientEmail,barberName:barber,serviceId:svcId,service:svcId,price:svc.price||0,time,source:'Walk-in',note};
    _autoCreateClient(clientName, clientPhone, clientEmail);
    wiSelectedClient=null;
    document.getElementById('wi-selected-client').style.display='none';
    document.getElementById('wi-client-search').value='';
    document.getElementById('wi-notes').value='';
    const _ph=document.getElementById('wi-phone'); if(_ph) _ph.value='';
    const _em=document.getElementById('wi-email-new'); if(_em) _em.value='';
    _showWiNewFields(false);
    // Reset time to now for next walk-in
    const nowInp=document.getElementById('wi-walkin-time');
    if(nowInp){ const n=new Date(); nowInp.value=m2t(n.getHours()*60+n.getMinutes()); onWiWalkinTimeChange(); }
    toast('Walk-in created','success');
    setTab('today'); loadBookings(true);
    setTimeout(openCheckout,400);
  }catch(ex){ toast('Error: '+ex.message,'error'); }
  btn.disabled=false; btn.style.opacity='1'; onWiWalkinTimeChange();
};

window.createWalkIn=async function(){
  const clientInput=(document.getElementById('wi-client-search').value||'').trim();
  const clientName=wiSelectedClient?wiSelectedClient.name:(clientInput||'Walk-in');
  const clientPhone=wiSelectedClient?wiSelectedClient.phone||'':(document.getElementById('wi-phone')?.value||'').trim();
  const clientEmail=wiSelectedClient?wiSelectedClient.email||'':(document.getElementById('wi-email-new')?.value||'').trim();
  const barber=wiBarberSel;
  const svcId=document.getElementById('wi-service').value;
  const time=document.getElementById('wi-time').value;
  const note=document.getElementById('wi-notes').value.trim();
  if(!barber||!allBarbers.some(b=>b.name===barber)||!svcId||!time){ toast('Select barber, service and time','error'); return; }
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
    _autoCreateClient(clientName, clientPhone, clientEmail);
    wiSelectedClient=null;
    document.getElementById('wi-selected-client').style.display='none';
    document.getElementById('wi-client-search').value='';
    const _ph2=document.getElementById('wi-phone'); if(_ph2) _ph2.value='';
    const _em2=document.getElementById('wi-email-new'); if(_em2) _em2.value='';
    _showWiNewFields(false);
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

/* ── SALES / REPORTS (hidden — to be redesigned) ────────────────────────────
const SOURCE_COLORS={'Walk-in':'#c9a84c','Fresha':'#4caf50','Booksy':'#2196f3','Treatwell':'#9c27b0','Website':'#64b5f6','Product Sale':'#ff9800'};
const _srcColor=s=>SOURCE_COLORS[s]||'#6b5f43';
let _repPeriod='today', _repAllBookings=null, _repLoading=false;

function _repFilterBookings(all){
  const now=new Date(); const todayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(_repPeriod==='today') return all.filter(b=>{ const d=b.startTime?.toDate?.(); return d&&d>=todayStart; });
  if(_repPeriod==='week'){ const s=new Date(todayStart); s.setDate(s.getDate()-6); return all.filter(b=>{ const d=b.startTime?.toDate?.(); return d&&d>=s; }); }
  return all; // month = all 31 days
}

window.setRepPeriod=function(p){
  _repPeriod=p;
  ['today','week','month'].forEach(x=>document.getElementById('rep-pill-'+x)?.classList.toggle('active',x===p));
  renderReports();
};

async function loadReports(){
  if(_repLoading) return; _repLoading=true;
  document.getElementById('rep-content').innerHTML='<div class="rep-loading">Loading…</div>';
  try{
    const start=new Date(); start.setDate(start.getDate()-30); start.setHours(0,0,0,0);
    const snap=await getDocs(query(collection(db,`${T}/bookings`),where('startTime','>=',Timestamp.fromDate(start)),orderBy('startTime','desc'),limit(600)));
    _repAllBookings=snap.docs.map(d=>d.data());
  }catch(e){ document.getElementById('rep-content').innerHTML='<div class="rep-loading">Error loading data</div>'; _repLoading=false; return; }
  _repLoading=false;
  renderReports();
}

function renderReports(){
  if(!_repAllBookings){ loadReports(); return; }
  const filtered=_repFilterBookings(_repAllBookings);
  const paid=filtered.filter(b=>(b.status||'').toUpperCase()==='CHECKED_OUT');
  const revenue=paid.reduce((s,b)=>s+pp(b.paidAmount||b.price),0);
  const tips=paid.reduce((s,b)=>s+pp(b.tip),0);
  const count=paid.length;

  // Daily bars — last 7 days or today's hours
  const now=new Date();
  let barData=[];
  if(_repPeriod==='today'){
    // Hourly breakdown for today
    for(let h=9;h<=20;h++){
      const hBks=paid.filter(b=>{ const d=b.startTime?.toDate?.(); return d&&d.getHours()===h&&d.toDateString()===now.toDateString(); });
      barData.push({label:h+':00',rev:hBks.reduce((s,b)=>s+pp(b.paidAmount||b.price),0),cnt:hBks.length});
    }
  } else {
    const days=_repPeriod==='week'?7:30;
    for(let i=days-1;i>=0;i--){
      const d=new Date(now); d.setDate(d.getDate()-i); d.setHours(0,0,0,0);
      const dEnd=new Date(d); dEnd.setHours(23,59,59,999);
      const dBks=paid.filter(b=>{ const bd=b.startTime?.toDate?.(); return bd&&bd>=d&&bd<=dEnd; });
      const dayLabel=days<=7?['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()]:d.getDate()+'';
      barData.push({label:dayLabel,rev:dBks.reduce((s,b)=>s+pp(b.paidAmount||b.price),0),cnt:dBks.length});
    }
  }
  const maxRev=Math.max(...barData.map(d=>d.rev),1);
  const barsHtml=barData.map(d=>{
    const pct=Math.round((d.rev/maxRev)*100);
    const isToday=_repPeriod!=='today'&&d.label===(['Su','Mo','Tu','We','Th','Fr','Sa'][now.getDay()]+'');
    return `<div class="rep-bar-col">
      <div class="rep-bar-amt">${d.rev>0?'£'+Math.round(d.rev):''}</div>
      <div class="rep-bar-track"><div class="rep-bar" style="height:${Math.max(pct,3)}%;background:${isToday?'var(--gold)':'rgba(201,168,76,0.35)'}"></div></div>
      <div class="rep-bar-day" style="color:${isToday?'var(--gold)':'var(--muted)'};font-weight:${isToday?'700':'400'}">${d.label}</div>
    </div>`;
  }).join('');

  // Source breakdown
  const srcMap={};
  paid.forEach(b=>{ const s=b.source||'Walk-in'; srcMap[s]=(srcMap[s]||{rev:0,cnt:0}); srcMap[s].rev+=pp(b.paidAmount||b.price); srcMap[s].cnt++; });
  const srcList=Object.entries(srcMap).sort((a,b)=>b[1].rev-a[1].rev);
  const maxSrc=Math.max(...srcList.map(([,v])=>v.rev),1);
  const srcHtml=srcList.map(([name,v])=>`<div class="rep-row">
    <div class="rep-row-dot" style="background:${_srcColor(name)}"></div>
    <div class="rep-row-name">${name}</div>
    <div class="rep-row-bar-track"><div class="rep-row-bar-fill" style="width:${Math.round(v.rev/maxSrc*100)}%;background:${_srcColor(name)}"></div></div>
    <div class="rep-row-cnt">${v.cnt}</div>
    <div class="rep-row-amt">£${Math.round(v.rev)}</div>
  </div>`).join('');

  // Barber breakdown
  const brbMap={};
  paid.forEach(b=>{ const n=b.barberName||b.barber||'Unknown'; brbMap[n]=(brbMap[n]||{rev:0,cnt:0}); brbMap[n].rev+=pp(b.paidAmount||b.price); brbMap[n].cnt++; });
  const brbList=Object.entries(brbMap).sort((a,b)=>b[1].rev-a[1].rev);
  const maxBrb=Math.max(...brbList.map(([,v])=>v.rev),1);
  const brbHtml=brbList.map(([name,v])=>`<div class="rep-row">
    <div class="rep-row-dot" style="background:${bColor(name)}"></div>
    <div class="rep-row-name">${name}</div>
    <div class="rep-row-bar-track"><div class="rep-row-bar-fill" style="width:${Math.round(v.rev/maxBrb*100)}%;background:${bColor(name)}"></div></div>
    <div class="rep-row-cnt">${v.cnt}</div>
    <div class="rep-row-amt">£${Math.round(v.rev)}</div>
  </div>`).join('');

  const periodLabel={'today':'Today','week':'Last 7 Days','month':'Last 30 Days'}[_repPeriod];
  document.getElementById('rep-content').innerHTML=`
    <div class="rep-stats">
      <div class="rep-stat"><div class="rep-stat-val">£${Math.round(revenue)}</div><div class="rep-stat-lbl">Revenue</div></div>
      <div class="rep-stat"><div class="rep-stat-val">${count}</div><div class="rep-stat-lbl">Paid</div></div>
      <div class="rep-stat"><div class="rep-stat-val">£${Math.round(tips)}</div><div class="rep-stat-lbl">Tips</div></div>
    </div>
    <div class="rep-section">
      <div class="rep-section-title">${periodLabel}</div>
      <div class="rep-chart">${barsHtml}</div>
    </div>
    ${srcList.length?`<div class="rep-section" style="margin-top:14px"><div class="rep-section-title">By Source</div><div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:6px 14px">${srcHtml}</div></div>`:''}
    ${brbList.length?`<div class="rep-section" style="margin-top:14px;padding-bottom:24px"><div class="rep-section-title">By Barber</div><div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:6px 14px">${brbHtml}</div></div>`:''}
  `;
}

────────────────────────────────────────────────────────────────────────── */

window.setTab=function(tab){
  ['today','clients','new'].forEach(t=>{
    document.getElementById('screen-'+t)?.classList.toggle('active',t===tab);
    document.getElementById('nav-'+t)?.classList.toggle('active',t===tab);
  });
  if(tab==='new'){ wiCurrentType='walkin'; setNewType('walkin'); }
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
