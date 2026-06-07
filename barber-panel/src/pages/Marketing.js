import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase';
import PageHeader from '../components/PageHeader';
import { collection, getDocs, getDoc, doc, setDoc, query, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// TENANT is set dynamically from tenantId prop — see usage below
const HOURS   = [9,10,11,12,13,14,15,16,17,18];
const DAYS    = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAYS_F  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const SKIP    = new Set(['CANCELLED','BLOCKED','DELETED','NO_SHOW']);
const MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Finance constants (mirrors Finance.js) ─────────────────────────────────
const FIN_PARTNER_CONFIG = {
  Alex:   { share: 50, wage: 100, isPartner: true,  creditTo: null     },
  Arda:   { share: 25, wage: 100, isPartner: true,  creditTo: null     },
  Tuncay: { share: 25, wage: 0,   isPartner: true,  creditTo: null     },
  Kadim:  { share: 0,  wage: 100, isPartner: false, creditTo: 'Tuncay' },
  Manoj:  { share: 0,  wage: 50,  isPartner: false, creditTo: 'Tuncay' },
};
const FIN_INITIAL_INVESTMENT = [
  { name: 'Alex',   share: 50, paid: 20755.20 },
  { name: 'Arda',   share: 25, paid: 5500     },
  { name: 'Tuncay', share: 25, paid: 1400     },
];
const FIN_INITIAL_POOL  = 35904.40;
const FIN_FIXED_DEFAULT = 100;

function finPaymentToDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  }
  return null;
}
function finMonthKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function finNormName(n) { return String(n||'').trim().toLowerCase(); }

function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  return null;
}
function bookingDate(b) {
  const ts = toDate(b.startTime);
  if (ts) return ts;
  const s = b.date || '';
  const dm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dm) return new Date(+dm[3], +dm[2]-1, +dm[1]);
  const ym = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ym) return new Date(+ym[1], +ym[2]-1, +ym[3]);
  return null;
}
function pp(v) { return parseFloat(String(v||'0').replace(/[£,]/g,'').trim())||0; }
function soldProductsTotal(b) {
  return (Array.isArray(b?.soldProducts) ? b.soldProducts : [])
    .reduce((s, p) => s + pp(p?.price) * (parseInt(p?.qty, 10) || 0), 0);
}
function soldAddOnsTotal(b) {
  return (Array.isArray(b?.soldAddOns) ? b.soldAddOns : [])
    .reduce((s, p) => s + pp(p?.price) * (parseInt(p?.qty, 10) || 1), 0);
}
function bookingRev(b) {
  if (String(b.status||'').toUpperCase() !== 'CHECKED_OUT') return 0;
  const src = String(b.source||'').trim().toLowerCase();
  const isProductSale = src === 'product sale' || src === 'product_sale' || src === 'productsale';
  const serviceGross = isProductSale ? 0 : pp(b.price) + pp(b.serviceCharge);
  return Math.max(0,
    serviceGross
    + soldProductsTotal(b)
    + soldAddOnsTotal(b)
    - pp(b.discount)
    - (pp(b.loyaltyPointsRedeemed) / 20)
  );
}
function pct(a,b) { return b===0?0:Math.round(a/b*100); }
function trend(curr,prev) {
  if (!prev) return null;
  const d = Math.round((curr-prev)/prev*100);
  return { d, up: d >= 0 };
}
function getMonday(d) {
  const r = new Date(d); const day = r.getDay();
  r.setDate(r.getDate() - (day===0?6:day-1)); r.setHours(0,0,0,0); return r;
}
function normalizeSource(s) {
  const v = String(s||'').toLowerCase().trim();
  if (!v||v==='historical'||v==='walk_in'||v==='walkin'||v==='walk-in'||v==='manual') return 'Walk-in';
  if (v==='booksy') return 'Booksy';
  if (v==='fresha') return 'Fresha';
  if (v==='website'||v==='online'||v==='web') return 'Website';
  if (v==='product sale'||v==='product_sale') return 'Product Sale';
  return String(s).trim();
}

const SRC_COLORS = { 'Walk-in':'#c9a84c','Fresha':'#4caf50','Booksy':'#2196f3','Website':'#64b5f6','Treatwell':'#9c27b0','Product Sale':'#ff9800' };
const sColor = s => SRC_COLORS[s]||'#6b5f43';

function cellStyle(pct) {
  if (pct===null) return null;
  if (pct>=0.7)  return { bg:'rgba(155,58,58,0.45)',  color:'#f4a0a0', border:'rgba(155,58,58,0.3)' };
  if (pct>=0.45) return { bg:'rgba(155,107,42,0.35)', color:'#d4a060', border:'rgba(155,107,42,0.25)' };
  if (pct>=0.2)  return { bg:'rgba(201,168,76,0.18)', color:'#c9a84c', border:'rgba(201,168,76,0.2)' };
  if (pct>0)     return { bg:'rgba(61,139,94,0.12)',  color:'#5db882', border:'rgba(61,139,94,0.2)' };
  return           { bg:'rgba(61,139,94,0.06)',  color:'#3d6b4a', border:'rgba(61,139,94,0.1)' };
}

// ─────────────────────────────────────────────────────────────
export default function Marketing({ tenantId, isAdmin }) {
  const [bookings,      setBookings]      = useState([]);
  const [cancelledBks,  setCancelledBks]  = useState([]);
  const [clients,       setClients]       = useState([]);
  const [barbers,       setBarbers]       = useState([]);
  const [shopHours,     setShopHours]     = useState({});
  const [camp,          setCamp]          = useState({ active:false, startDate:'', endDate:'' });
  const [weeklyTarget,  setWeeklyTarget]  = useState(0);
  const [targetInput,   setTargetInput]   = useState('');
  const [editingTarget, setEditingTarget] = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [tab,           setTab]           = useState('overview');
  const [weeks,         setWeeks]         = useState(8);
  const [selBarber,     setSelBarber]     = useState('all');
  const [trendView,     setTrendView]     = useState('weekly'); // 'weekly' | 'monthly'
  const [aiOpen,        setAiOpen]        = useState(false);
  const [aiMessages,    setAiMessages]    = useState([]);
  const [aiInput,       setAiInput]       = useState('');
  const [hoveredKpi,    setHoveredKpi]    = useState(null);
  const [aiLoading,     setAiLoading]     = useState(false);
  const aiBottomRef = useRef(null);
  const [finExpenses,   setFinExpenses]   = useState({});
  const [finPayments,   setFinPayments]   = useState([]);
  const [finFixedRate,  setFinFixedRate]  = useState(FIN_FIXED_DEFAULT);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [bkSnap, barberSnap, clientSnap, settSnap, expSnap, paySnap, finCfgSnap] = await Promise.all([
          getDocs(collection(db, `tenants/${tenantId}/bookings`)),
          getDocs(collection(db, `tenants/${tenantId}/barbers`)),
          getDocs(collection(db, `tenants/${tenantId}/clients`)),
          getDoc(doc(db, `tenants/${tenantId}/settings/settings`)),
          getDocs(collection(db, `tenants/${tenantId}/finance_expenses`)),
          getDocs(query(collection(db, `tenants/${tenantId}/finance_payments`), orderBy('date', 'desc'))),
          getDoc(doc(db, `tenants/${tenantId}/settings`, 'finance_config')),
        ]);
        setBarbers(barberSnap.docs.map(d=>({id:d.id,...d.data()})).filter(b=>b.active!==false).sort((a,b)=>(a.order||99)-(b.order||99)));
        const allBks = bkSnap.docs.map(d=>({...d.data(),_id:d.id}));
        setBookings(allBks.filter(b=>!SKIP.has(String(b.status||'').toUpperCase())));
        setCancelledBks(allBks.filter(b=>['CANCELLED','NO_SHOW'].includes(String(b.status||'').toUpperCase())));
        setClients(clientSnap.docs.map(d=>({id:d.id,...d.data()})));
        const data = settSnap.data()||{};
        if (data.doublePointsCampaign) setCamp(data.doublePointsCampaign);
        if (data.hours) setShopHours(data.hours);
        if (data.weeklyTarget) { setWeeklyTarget(data.weeklyTarget); setTargetInput(String(data.weeklyTarget)); }
        // Finance data
        const expMap = {};
        expSnap.docs.forEach(d => { const dt = finPaymentToDate(d.data().date); if (dt) expMap[`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`] = d.data(); });
        setFinExpenses(expMap);
        setFinPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() })));
        const fcData = finCfgSnap.data() || {};
        if (fcData.fixedDailyRate) setFinFixedRate(parseFloat(fcData.fixedDailyRate) || FIN_FIXED_DEFAULT);
      } catch(e){ console.error(e); }
      setLoading(false);
    })();
  }, []);

  const now          = useMemo(()=>new Date(),[]);
  const cutoff       = useMemo(()=>{ const d=new Date(now); d.setDate(d.getDate()-weeks*7); return d; },[weeks,now]);
  const thisWeekMon  = useMemo(()=>getMonday(now),[now]);
  const lastWeekMon  = useMemo(()=>{ const d=new Date(thisWeekMon); d.setDate(d.getDate()-7); return d; },[thisWeekMon]);

  const isShopOpen = (di, hour) => {
    const h = shopHours[DAYS_F[di]];
    if (!h) return true;
    if (h.closed) return false;
    return hour >= parseInt((h.open||'09:00')) && hour < parseInt((h.close||'19:00'));
  };

  // ── base filtered sets ──────────────────────────────────────
  const filteredAll = useMemo(()=>
    bookings.filter(b=>{
      const d=bookingDate(b); if(!d||d<cutoff) return false;
      if(selBarber!=='all'&&(b.barberName||b.barberId||'')!==selBarber) return false;
      return true;
    }),[bookings,cutoff,selBarber]);

  const filteredTs = useMemo(()=>
    filteredAll.filter(b=>!!toDate(b.startTime)),[filteredAll]);

  const thisWeekBks = useMemo(()=>bookings.filter(b=>{ const d=bookingDate(b); return d&&d>=thisWeekMon; }),[bookings,thisWeekMon]);
  // Elapsed cutoff: same number of ms into last week as we are into this week
  const lastWeekElapsedEnd = useMemo(()=>new Date(lastWeekMon.getTime()+(now-thisWeekMon)),[lastWeekMon,now,thisWeekMon]);
  const lastWeekBks = useMemo(()=>bookings.filter(b=>{ const d=bookingDate(b); return d&&d>=lastWeekMon&&d<lastWeekElapsedEnd; }),[bookings,lastWeekMon,lastWeekElapsedEnd]);
  const lastWeekFullBks = useMemo(()=>bookings.filter(b=>{ const d=bookingDate(b); return d&&d>=lastWeekMon&&d<thisWeekMon; }),[bookings,lastWeekMon,thisWeekMon]);

  // ── Month boundaries ────────────────────────────────────────
  const thisMonthStart = useMemo(()=>new Date(now.getFullYear(),now.getMonth(),1),[now]);
  const lastMonthStart = useMemo(()=>new Date(now.getFullYear(),now.getMonth()-1,1),[now]);
  const lastMonthEnd   = useMemo(()=>new Date(now.getFullYear(),now.getMonth(),0,23,59,59),[now]);
  // Same elapsed days in last month (apples-to-apples)
  const lastMonthSameDay = useMemo(()=>new Date(now.getFullYear(),now.getMonth()-1,now.getDate(),23,59,59),[now]);

  const thisMonthBks = useMemo(()=>bookings.filter(b=>{ const d=bookingDate(b); return d&&d>=thisMonthStart; }),[bookings,thisMonthStart]);
  const lastMonthBks = useMemo(()=>bookings.filter(b=>{ const d=bookingDate(b); return d&&d>=lastMonthStart&&d<=lastMonthSameDay; }),[bookings,lastMonthStart,lastMonthSameDay]);
  const lastMonthFull= useMemo(()=>bookings.filter(b=>{ const d=bookingDate(b); return d&&d>=lastMonthStart&&d<=lastMonthEnd; }),[bookings,lastMonthStart,lastMonthEnd]);

  // Same week last month (Mon of same calendar week number, last month)
  const sameWeekLastMonthStart = useMemo(()=>{
    const d=new Date(thisWeekMon); d.setMonth(d.getMonth()-1); return d;
  },[thisWeekMon]);
  const sameWeekLastMonthEnd = useMemo(()=>{
    const d=new Date(sameWeekLastMonthStart); d.setDate(d.getDate()+7); return d;
  },[sameWeekLastMonthStart]);
  // Elapsed-matched end: same ms into that week as we are into this week
  const sameWeekLastMonthElapsedEnd = useMemo(()=>new Date(sameWeekLastMonthStart.getTime()+(now-thisWeekMon)),[sameWeekLastMonthStart,now,thisWeekMon]);
  const sameWeekLastMonthBks = useMemo(()=>bookings.filter(b=>{ const d=bookingDate(b); return d&&d>=sameWeekLastMonthStart&&d<sameWeekLastMonthEnd; }),[bookings,sameWeekLastMonthStart,sameWeekLastMonthEnd]);
  const sameWeekLastMonthElapsedBks = useMemo(()=>bookings.filter(b=>{ const d=bookingDate(b); return d&&d>=sameWeekLastMonthStart&&d<sameWeekLastMonthElapsedEnd; }),[bookings,sameWeekLastMonthStart,sameWeekLastMonthElapsedEnd]);

  // ── MoM metrics ─────────────────────────────────────────────
  const mom = useMemo(()=>{
    const tmRev  = thisMonthBks.reduce((s,b)=>s+bookingRev(b),0);
    const lmRev  = lastMonthBks.reduce((s,b)=>s+bookingRev(b),0);
    const tmCount= thisMonthBks.length;
    const lmCount= lastMonthBks.length;
    const lmFullRev = lastMonthFull.reduce((s,b)=>s+bookingRev(b),0);
    // Same week last month — elapsed-matched and full week
    const swElapsedRev   = sameWeekLastMonthElapsedBks.reduce((s,b)=>s+bookingRev(b),0);
    const swElapsedCount = sameWeekLastMonthElapsedBks.length;
    const swFullRev      = sameWeekLastMonthBks.reduce((s,b)=>s+bookingRev(b),0);
    const swFullCount    = sameWeekLastMonthBks.length;
    const twRev          = thisWeekBks.reduce((s,b)=>s+bookingRev(b),0);
    const twCount        = thisWeekBks.length;
    return {
      tmRev, lmRev, tmCount, lmCount, lmFullRev,
      swElapsedRev, swElapsedCount, swFullRev, swFullCount, twRev, twCount,
      revTrend:   trend(tmRev,  lmRev),
      countTrend: trend(tmCount,lmCount),
      weekVsLastMonth: trend(twRev, swElapsedRev),
    };
  },[thisMonthBks,lastMonthBks,lastMonthFull,sameWeekLastMonthBks,sameWeekLastMonthElapsedBks,thisWeekBks]);

  // ── Last 12 months trend ─────────────────────────────────────
  const monthlyTrend = useMemo(()=>{
    const result=[];
    for(let i=11;i>=0;i--){
      const ms=new Date(now.getFullYear(),now.getMonth()-i,1);
      const me=new Date(now.getFullYear(),now.getMonth()-i+1,0,23,59,59);
      const bks=bookings.filter(b=>{ const d=bookingDate(b); return d&&d>=ms&&d<=me; });
      const rev=bks.reduce((s,b)=>s+bookingRev(b),0);
      result.push({ label:`${MONTHS[ms.getMonth()]} ${ms.getFullYear()===now.getFullYear()?'':ms.getFullYear()}`.trim(), rev, count:bks.length, isCurrent:i===0 });
    }
    return result;
  },[bookings,now]);

  // ── Overview metrics ────────────────────────────────────────
  const overview = useMemo(()=>{
    const twCount = thisWeekBks.length;
    const lwCount = lastWeekBks.length;        // elapsed-matched
    const lwFullCount = lastWeekFullBks.length; // full last week
    const twRev   = thisWeekBks.reduce((s,b)=>s+bookingRev(b),0);
    const lwRev   = lastWeekBks.reduce((s,b)=>s+bookingRev(b),0);   // elapsed
    const lwFullRev = lastWeekFullBks.reduce((s,b)=>s+bookingRev(b),0); // full
    const daysSinceMonday = (now-thisWeekMon)/(1000*60*60*24);
    const workDaysElapsed = Math.max(1,Math.ceil(daysSinceMonday));
    const bCount = Math.max(1,barbers.length);
    const avgPerBarberDay = (twCount/(workDaysElapsed*bCount)).toFixed(1);
    const daysElapsedLabel = workDaysElapsed === 1 ? '1 day' : `${workDaysElapsed} days`;
    return { twCount, lwCount, lwFullCount, twRev, lwRev, lwFullRev, avgPerBarberDay, daysElapsedLabel,
      countTrend: trend(twCount,lwCount), revTrend: trend(twRev,lwRev) };
  },[thisWeekBks,lastWeekBks,lastWeekFullBks,barbers,now,thisWeekMon]);

  // ── Cancellation / no-show stats ────────────────────────────
  const cancelStats = useMemo(()=>{
    const inPeriod = cancelledBks.filter(b=>{ const d=bookingDate(b); return d&&d>=cutoff; });
    const cancelled = inPeriod.filter(b=>String(b.status||'').toUpperCase()==='CANCELLED').length;
    const noShows   = inPeriod.filter(b=>String(b.status||'').toUpperCase()==='NO_SHOW').length;
    const totalAttempted = filteredAll.length + inPeriod.length;
    const rate = pct(inPeriod.length, totalAttempted);
    const lostRev = inPeriod.reduce((s,b)=>s+pp(b.price||b.paidAmount),0);
    return { cancelled, noShows, total: inPeriod.length, rate, lostRev };
  },[cancelledBks, filteredAll, cutoff]);

  // ── Weekly trend (last N weeks) ─────────────────────────────
  const weeklyTrend = useMemo(()=>{
    const result=[];
    for(let i=weeks-1;i>=0;i--){
      const ws=new Date(thisWeekMon); ws.setDate(ws.getDate()-i*7);
      const we=new Date(ws); we.setDate(we.getDate()+7);
      const bks=bookings.filter(b=>{ const d=bookingDate(b); return d&&d>=ws&&d<we; });
      const rev=bks.reduce((s,b)=>s+bookingRev(b),0);
      result.push({ label:`${ws.getDate()} ${MONTHS[ws.getMonth()]}`, rev, count:bks.length, isCurrent:i===0 });
    }
    return result;
  },[bookings,weeks,thisWeekMon]);

  const maxWeeklyRev = useMemo(()=>Math.max(...weeklyTrend.map(w=>w.rev),1),[weeklyTrend]);

  // ── Barber breakdown ────────────────────────────────────────
  const barberStats = useMemo(()=>{
    const map={};
    const normalize = s => s ? s.trim().replace(/\b\w/g, c=>c.toUpperCase()) : 'Unknown';
    filteredAll.forEach(b=>{
      const name=normalize(b.barberName||b.barberId||'Unknown');
      if(!map[name]) map[name]={ name, count:0, rev:0, tips:0, tipsCount:0, addOns:0 };
      map[name].count++;
      map[name].rev      += bookingRev(b);
      map[name].tips     += pp(b.tip);
      map[name].tipsCount+= pp(b.tip)>0?1:0;
      map[name].addOns   += (b.soldAddOns||[]).filter(x=>x.qty>0).length>0?1:0;
    });
    return Object.values(map).sort((a,b)=>b.rev-a.rev).map(s=>({
      ...s, avg: s.count?Math.round(s.rev/s.count):0,
    }));
  },[filteredAll]);

  const maxBarberRev = useMemo(()=>Math.max(...barberStats.map(b=>b.rev),1),[barberStats]);

  // ── Service breakdown ───────────────────────────────────────
  const serviceStats = useMemo(()=>{
    const map={};
    filteredAll.forEach(b=>{
      const name=b.serviceName||b.service||b.serviceId||'Unknown';
      if(!map[name]) map[name]={ name, count:0, rev:0 };
      map[name].count++;
      map[name].rev+=bookingRev(b);
    });
    return Object.values(map).sort((a,b)=>b.count-a.count).slice(0,8);
  },[filteredAll]);

  const maxSvcCount = useMemo(()=>Math.max(...serviceStats.map(s=>s.count),1),[serviceStats]);

  // ── Source breakdown ────────────────────────────────────────
  const sourceStats = useMemo(()=>{
    const map={};
    filteredAll.forEach(b=>{
      const src=normalizeSource(b.source);
      if(!map[src]) map[src]={ src, count:0, rev:0 };
      map[src].count++;
      map[src].rev+=bookingRev(b);
    });
    return Object.values(map).sort((a,b)=>b.count-a.count);
  },[filteredAll]);

  const totalSourceCount = useMemo(()=>sourceStats.reduce((s,x)=>s+x.count,0)||1,[sourceStats]);

  // ── Revenue quality ─────────────────────────────────────────
  const quality = useMemo(()=>{
    const total = filteredAll.length||1;
    const rev   = filteredAll.reduce((s,b)=>s+bookingRev(b),0);
    const tips  = filteredAll.reduce((s,b)=>s+pp(b.tip),0);
    const withTip   = filteredAll.filter(b=>pp(b.tip)>0).length;
    const withAddon = filteredAll.filter(b=>(b.soldAddOns||[]).some(x=>x.qty>0)).length;
    const withDisc  = filteredAll.filter(b=>pp(b.discount)>0).length;
    return { avgBasket:rev/total, tipRate:pct(withTip,total), addonRate:pct(withAddon,total), discRate:pct(withDisc,total), totalTips:tips };
  },[filteredAll]);

  // ── Customer insights ───────────────────────────────────────
  const customerInsights = useMemo(()=>{
    const nowMs = now.getTime();
    // Build visit map from bookings (source of truth — works for all booking sources)
    const visitMap = {};
    bookings.forEach(b=>{
      const name = b.clientName || '';
      if (!name || name==='Walk-in' || name==='walk_in' || name==='walkin') return;
      const key = b.clientPhone || b.phone || b.clientEmail || b.email || name;
      const d = bookingDate(b);
      if (!visitMap[key]) visitMap[key] = { firstDate: d, lastDate: d, count: 0 };
      visitMap[key].count++;
      if (d && visitMap[key].firstDate && d < visitMap[key].firstDate) visitMap[key].firstDate = d;
      if (d && visitMap[key].lastDate  && d > visitMap[key].lastDate)  visitMap[key].lastDate  = d;
    });
    const clientList = Object.values(visitMap);
    const total = clientList.length || 1;
    const newC  = clientList.filter(c=>c.count<=1).length;
    const retC  = clientList.filter(c=>c.count>1).length;
    // Lost clients: use clients Firestore doc lastVisit where available, else booking-derived lastDate
    const clientLastVisitMap = {};
    clients.forEach(c=>{
      const key = c.phone||c.email||c.name;
      if (key) clientLastVisitMap[key] = toDate(c.lastVisit);
    });
    const lost30 = clientList.filter(c=>{ const lv=c.lastDate; return lv&&(nowMs-lv.getTime())>30*864e5; }).length;
    const lost60 = clientList.filter(c=>{ const lv=c.lastDate; return lv&&(nowMs-lv.getTime())>60*864e5; }).length;
    const lost90 = clientList.filter(c=>{ const lv=c.lastDate; return lv&&(nowMs-lv.getTime())>90*864e5; }).length;
    const freqClients = clientList.filter(c=>c.count>=2&&c.firstDate&&c.lastDate);
    const avgFreqDays = freqClients.length
      ? freqClients.reduce((s,c)=>s+(c.lastDate.getTime()-c.firstDate.getTime())/864e5/Math.max(1,c.count-1),0)/freqClients.length
      : null;
    const retentionRate = pct(retC, total);
    return { total, newC, retC, lost30, lost60, lost90, avgFreqDays, retentionRate };
  },[bookings,clients,now]);

  // ── Top clients ─────────────────────────────────────────────
  const topClients = useMemo(()=>{
    const map = {};
    bookings.forEach(b=>{
      const name = b.clientName || '';
      if (!name || name==='Walk-in' || name==='walk_in' || name==='walkin') return;
      const key = b.clientPhone || b.phone || b.clientEmail || b.email || name;
      if (!map[key]) {
        const clientDoc = clients.find(c=>c.phone===b.clientPhone||c.phone===b.phone||c.email===b.clientEmail||c.email===b.email||c.name===name);
        map[key] = { name, phone: b.clientPhone||b.phone||'', email: b.clientEmail||b.email||'', totalVisits: 0, loyaltyPoints: clientDoc?.loyaltyPoints||0, isMember: clientDoc?.isMember||false };
      }
      map[key].totalVisits++;
    });
    return Object.values(map).sort((a,b)=>b.totalVisits-a.totalVisits).slice(0,10);
  },[bookings,clients]);

  // ── Occupancy heatmap ───────────────────────────────────────
  const weekdayCounts = useMemo(()=>{
    const counts=[0,0,0,0,0,0,0];
    const d=new Date(cutoff);
    while(d<=now){ const i=d.getDay(); counts[i===0?6:i-1]++; d.setDate(d.getDate()+1); }
    return counts;
  },[cutoff,now]);

  const barberCount = selBarber==='all'?Math.max(1,barbers.length):1;

  const heatmap = useMemo(()=>{
    const grid=Array.from({length:7},()=>Array(HOURS.length).fill(0));
    filteredTs.forEach(b=>{
      const dt=toDate(b.startTime); if(!dt) return;
      const di=dt.getDay()===0?6:dt.getDay()-1;
      const hi=HOURS.indexOf(dt.getHours());
      if(hi>=0) grid[di][hi]++;
    });
    return grid.map((row,di)=>row.map((cnt,hi)=>{
      if(!isShopOpen(di,HOURS[hi])) return null;
      const cap=weekdayCounts[di]*barberCount;
      return cap===0?null:Math.min(1,cnt/cap);
    }));
  },[filteredTs,weekdayCounts,barberCount,shopHours]);

  const dayOcc = useMemo(()=>{
    const counts=[0,0,0,0,0,0,0];
    filteredAll.forEach(b=>{ const dt=bookingDate(b); if(!dt) return; const di=dt.getDay()===0?6:dt.getDay()-1; counts[di]++; });
    const maxC=Math.max(...counts,1);
    return counts.map((cnt,di)=>({ day:DAYS[di], dayFull:DAYS_F[di], count:cnt, rel:cnt/maxC,
      pct:weekdayCounts[di]===0?null:Math.min(1,cnt/(weekdayCounts[di]*barberCount)) }));
  },[filteredAll,weekdayCounts,barberCount]);

  const quietSlots = useMemo(()=>{
    const slots=[];
    heatmap.forEach((row,di)=>row.forEach((pct,hi)=>{ if(pct!==null&&pct<0.35) slots.push({di,hi,pct,day:DAYS[di],dayFull:DAYS_F[di],hour:HOURS[hi]}); }));
    return slots.sort((a,b)=>a.pct-b.pct).slice(0,5);
  },[heatmap]);

  // ── Save campaign ───────────────────────────────────────────
  const saveCamp = async()=>{
    setSaving(true);
    try{
      await setDoc(doc(db,`tenants/${tenantId}/settings/settings`),{ doublePointsCampaign:camp, weeklyTarget },{ merge:true });
      setSaved(true); setTimeout(()=>setSaved(false),2500);
    } catch(e){ console.error(e); }
    setSaving(false);
  };

  const saveTarget = async(val)=>{
    const n = parseFloat(val)||0;
    setWeeklyTarget(n);
    setEditingTarget(false);
    try { await setDoc(doc(db,`tenants/${tenantId}/settings/settings`),{ weeklyTarget: n },{ merge:true }); } catch{}
  };

  const today   = now.toISOString().slice(0,10);
  const isLive  = camp.active&&camp.startDate&&camp.endDate&&today>=camp.startDate&&today<=camp.endDate;

  // ── Shared styles ───────────────────────────────────────────
  const card  = { background:'var(--card)', border:'1px solid var(--border)', borderRadius:'14px', overflow:'hidden', marginBottom:'16px' };
  const hdr   = () => ({ padding:'14px 20px 12px', borderBottom:'1px solid var(--border)', position:'relative' });
  const title = { fontFamily:"'Cormorant Garamond',serif", fontWeight:700, color:'var(--text)', letterSpacing:'1px' };
  const inp   = { width:'100%', padding:'10px 12px', background:'var(--card2)', border:'1px solid var(--border)', borderRadius:'10px', color:'var(--text)', fontSize:'0.82rem', fontFamily:'inherit', outline:'none' };
  const TABS  = ['overview','bookings','customers','occupancy','campaigns'];
  const TAB_LABELS = { overview:'Overview', bookings:'Bookings', customers:'Customers', occupancy:'Occupancy', campaigns:'Campaigns' };

  // ── Finance monthly P&L + partner positions ─────────────────
  const financeMonthly = useMemo(() => {
    if (!bookings.length) return [];
    // Group bookings by month
    const bksByMonth = {};
    bookings.forEach(b => {
      const d = bookingDate(b); if (!d) return;
      const mk = finMonthKey(d);
      if (!bksByMonth[mk]) bksByMonth[mk] = [];
      bksByMonth[mk].push(b);
    });
    const months = Object.keys(bksByMonth).sort();
    return months.map(mk => {
      const [my, mm] = mk.split('-').map(Number);
      const mBks = bksByMonth[mk] || [];
      // Revenue
      let grossRev = 0, cashRev = 0, cardRev = 0;
      const barberDays = {}, barberRev = {};
      mBks.forEach(b => {
        const status = String(b.status || '').toUpperCase();
        if (['CANCELLED','BLOCKED','DELETED','NO_SHOW'].includes(status)) return;
        let rev = 0;
        if (status === 'CHECKED_OUT') { rev = bookingRev(b); }
        else { rev = pp(b.price); }
        grossRev += rev;
        const pm = String(b.paymentMethod || '').toLowerCase();
        if (pm === 'cash') cashRev += rev; else cardRev += rev;
        const bname = b.barberName || b.barberId || '';
        if (bname) {
          const d2 = bookingDate(b);
          if (!barberDays[bname]) barberDays[bname] = new Set();
          if (d2) barberDays[bname].add(`${d2.getFullYear()}-${d2.getMonth()}-${d2.getDate()}`);
          barberRev[bname] = (barberRev[bname] || 0) + rev;
        }
      });
      // Expenses
      let cashExp = 0, bankExp = 0;
      Object.entries(finExpenses).forEach(([dk, exp]) => {
        const [ey, em] = dk.split('-').map(Number);
        if (ey === my && em === mm) { cashExp += pp(exp.cashExpense); bankExp += pp(exp.bankExpense); }
      });
      const netRevenue = grossRev - cashExp - bankExp;
      // Shop days (days with any booking)
      const shopDays = new Set(mBks.map(b => { const d2 = bookingDate(b); return d2 ? `${d2.getDate()}` : null; }).filter(Boolean)).size;
      const fixedCostTotal = shopDays * finFixedRate;
      // Wages
      let totalWages = 0;
      Object.entries(FIN_PARTNER_CONFIG).forEach(([name, cfg]) => {
        const days = barberDays[name]?.size || 0;
        totalWages += days * cfg.wage;
      });
      const companyNetPL = netRevenue - totalWages - fixedCostTotal;
      // Per partner
      const partners = {};
      Object.entries(FIN_PARTNER_CONFIG).filter(([, cfg]) => cfg.isPartner).forEach(([name, cfg]) => {
        let wagesEarned = cfg.wage > 0 ? (barberDays[name]?.size || 0) * cfg.wage : 0;
        Object.entries(FIN_PARTNER_CONFIG).filter(([, c]) => c.creditTo === name).forEach(([empName, empCfg]) => {
          wagesEarned += (barberDays[empName]?.size || 0) * empCfg.wage;
        });
        const advances = finPayments
          .filter(p => { const d2 = finPaymentToDate(p.date); return d2 && finMonthKey(d2) === mk && finNormName(p.barberName) === finNormName(name); })
          .reduce((s, p) => s + pp(p.amount), 0);
        const elEmegi  = wagesEarned - advances;
        const hisseden = (cfg.share / 100) * companyNetPL;
        partners[name] = { wagesEarned, advances, elEmegi, hisseden, netDurum: elEmegi + hisseden, share: cfg.share };
      });
      return { mk, label: MONTHS[mm - 1] + ' ' + my, grossRev, cashRev, cardRev, cashExp, bankExp, netRevenue, totalWages, fixedCostTotal, companyNetPL, shopDays, partners, barberRev };
    });
  }, [bookings, finExpenses, finPayments, finFixedRate]);

  const finCumulative = useMemo(() => {
    const cum = {};
    financeMonthly.forEach(row => {
      Object.entries(row.partners).forEach(([name, p]) => { cum[name] = (cum[name] || 0) + p.netDurum; });
    });
    return cum;
  }, [financeMonthly]);

  // ── AI helpers ──────────────────────────────────────────────
  const buildContext = () => {
    const { twRev, lwRev, twCount, lwCount } = overview;
    const { retC, newC, total, retentionRate, avgFreqDays } = customerInsights;

    // ── Helper: group bookings by client key ──
    const groupByClient = (bks) => {
      const map = {};
      bks.forEach(b => {
        const name = b.clientName || 'Walk-in';
        const key  = b.clientPhone || b.phone || b.clientEmail || b.email || name;
        if (!map[key]) map[key] = { name, spent: 0, visits: 0, services: [], barbers: new Set(), cash: 0, card: 0, tips: 0 };
        const amt = bookingRev(b);
        const pm  = String(b.paymentMethod || '').toLowerCase();
        map[key].spent  += amt;
        map[key].visits += 1;
        map[key].tips   += pp(b.tip);
        if (pm === 'cash') map[key].cash += amt; else map[key].card += amt;
        if (b.serviceId || b.service) map[key].services.push(b.serviceId || b.service);
        if (b.barberName || b.barberId) map[key].barbers.add(b.barberName || b.barberId);
      });
      return Object.values(map).sort((a,b) => b.spent - a.spent);
    };

    // ── Finance: payment method breakdown ──
    const pmBreakdown = (bks) => {
      let cash = 0, card = 0, tips = 0;
      bks.forEach(b => {
        const pm = String(b.paymentMethod || '').toLowerCase();
        const amt = bookingRev(b);
        if (pm === 'cash') cash += amt; else card += amt;
        tips += pp(b.tip);
      });
      return { cash, card, tips, total: cash + card };
    };

    const weekFin   = pmBreakdown(thisWeekBks);
    const monthFin  = pmBreakdown(thisMonthBks);

    // ── Barber breakdown this month ──
    const monthBarberMap = {};
    thisMonthBks.forEach(b => {
      const name = b.barberName || b.barberId || 'Unknown';
      if (!monthBarberMap[name]) monthBarberMap[name] = { rev: 0, count: 0, cash: 0, card: 0 };
      const amt = bookingRev(b);
      const pm  = String(b.paymentMethod || '').toLowerCase();
      monthBarberMap[name].rev   += amt;
      monthBarberMap[name].count += 1;
      if (pm === 'cash') monthBarberMap[name].cash += amt; else monthBarberMap[name].card += amt;
    });
    const monthBarberLines = Object.entries(monthBarberMap)
      .sort((a,b) => b[1].rev - a[1].rev)
      .map(([n,v]) => `${n}: £${v.rev.toFixed(0)} (${v.count} bookings, cash £${v.cash.toFixed(0)} / card £${v.card.toFixed(0)})`);

    // ── Service stats this month ──
    const monthSvcMap = {};
    thisMonthBks.forEach(b => {
      const svc = b.serviceId || b.service || 'Unknown';
      if (!monthSvcMap[svc]) monthSvcMap[svc] = { rev: 0, count: 0 };
      monthSvcMap[svc].rev   += bookingRev(b);
      monthSvcMap[svc].count += 1;
    });
    const monthSvcLines = Object.entries(monthSvcMap)
      .sort((a,b) => b[1].rev - a[1].rev).slice(0,8)
      .map(([n,v]) => `${n}: £${v.rev.toFixed(0)} (${v.count})`);

    // ── All-time top services ──
    const topSvcs = serviceStats.slice(0,8).map(s=>`${s.name}: £${s.rev.toFixed(0)} (${s.count})`).join(', ');

    // ── Client groups ──
    const weekClients  = groupByClient(thisWeekBks).slice(0,20)
      .map(c=>`${c.name}: £${c.spent.toFixed(0)}, ${c.visits}v, cash £${c.cash.toFixed(0)}/card £${c.card.toFixed(0)}${c.services.length?', svc: '+[...new Set(c.services)].join('/'):''}${c.barbers.size?', barber: '+[...c.barbers].join('/'):''}${c.tips>0?`, tip £${c.tips.toFixed(0)}`:''}`);

    const monthClients = groupByClient(thisMonthBks).slice(0,20)
      .map(c=>`${c.name}: £${c.spent.toFixed(0)}, ${c.visits}v${c.tips>0?`, tip £${c.tips.toFixed(0)}`:''}`);

    // ── All-time top clients (from topClients memo) ──
    const allTimeClients = topClients.slice(0,15)
      .map(c=>`${c.name}: ${c.totalVisits} visits total${c.loyaltyPoints>0?`, ${c.loyaltyPoints} loyalty pts`:''}${c.isMember?' [MEMBER]':''}`);

    // ── Last 40 bookings (recent history) ──
    const recentBks = [...bookings]
      .filter(b => bookingDate(b))
      .sort((a,b) => bookingDate(b) - bookingDate(a))
      .slice(0, 40)
      .map(b => {
        const d = bookingDate(b);
        const dateStr = d ? `${d.getDate()}/${d.getMonth()+1}` : '?';
        const pm = String(b.paymentMethod||'').toLowerCase();
        return `${dateStr} | ${b.clientName||'Walk-in'} | ${b.serviceId||b.service||'?'} | ${b.barberName||b.barberId||'?'} | £${bookingRev(b).toFixed(0)} ${pm==='cash'?'cash':'card'}${pp(b.tip)>0?` +tip£${pp(b.tip).toFixed(0)}`:''}`;
      });

    // ── Cancellations ──
    const cancelLines = cancelledBks.slice(0,10).map(b=>{
      const d = bookingDate(b);
      return `${d?`${d.getDate()}/${d.getMonth()+1}`:'?'} | ${b.clientName||'?'} | ${b.serviceId||b.service||'?'} | ${b.status}`;
    });

    // ── Finance: monthly P&L lines ──
    const finMonthLines = financeMonthly.slice(-12).map(r =>
      `${r.label}: Gross £${r.grossRev.toFixed(0)} | Expenses £${(r.cashExp+r.bankExp).toFixed(0)} | Wages £${r.totalWages.toFixed(0)} | Fixed £${r.fixedCostTotal.toFixed(0)} | Net P&L £${r.companyNetPL.toFixed(0)}`
    );

    // ── Finance: partner monthly net durum (last 6 months) ──
    const finPartnerLines = financeMonthly.slice(-6).map(r => {
      const ps = Object.entries(r.partners).map(([name, p]) =>
        `${name}: el £${p.elEmegi.toFixed(0)} + hisse £${p.hisseden.toFixed(0)} = net £${p.netDurum.toFixed(0)}`
      ).join(' | ');
      return `${r.label}: ${ps}`;
    });

    // ── Finance: total position per partner (operational + initial investment) ──
    // Total Position = cumulative operational net durum + initial investment balance (paid - required)
    // Positive = company owes this partner; Negative = this partner owes the company/others
    const partnerTotals = {};
    const finCumLines = Object.entries(finCumulative).map(([name, netDurum]) => {
      const inv = FIN_INITIAL_INVESTMENT.find(r => r.name === name);
      const required = inv ? FIN_INITIAL_POOL * (inv.share / 100) : 0;
      const invBalance = inv ? inv.paid - required : 0; // positive = overpaid (owed back), negative = underpaid (owes)
      const totalPosition = netDurum + invBalance;
      partnerTotals[name] = totalPosition;
      return [
        `${name}:`,
        `  Operational (wages+profit share birikimli): £${netDurum.toFixed(2)}`,
        `  Initial investment paid: £${(inv?.paid||0).toFixed(2)} | Required (${inv?.share||0}% of £${FIN_INITIAL_POOL.toFixed(2)}): £${required.toFixed(2)} | Balance: ${invBalance >= 0 ? '+' : ''}£${invBalance.toFixed(2)}`,
        `  TOTAL POSITION: ${totalPosition >= 0 ? '+' : ''}£${totalPosition.toFixed(2)} (${totalPosition >= 0 ? 'company owes this partner' : 'this partner owes the company'})`,
      ].join('\n');
    });

    // ── Finance: settlement — who pays who and how much ──
    // Partners with negative total position owe those with positive total position
    const settlements = [];
    const totalEntries = Object.entries(partnerTotals);
    const debtors   = totalEntries.filter(([,v]) => v < 0).sort((a,b) => a[1]-b[1]);
    const creditors = totalEntries.filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]);
    if (debtors.length && creditors.length) {
      const debMap  = Object.fromEntries(debtors.map(([n,v]) => [n, -v]));
      const credMap = Object.fromEntries(creditors.map(([n,v]) => [n, v]));
      debtors.forEach(([d]) => { creditors.forEach(([c]) => { if (debMap[d] > 0.01 && credMap[c] > 0.01) {
        const amt = Math.min(debMap[d], credMap[c]);
        settlements.push(`${d} must pay ${c}: £${amt.toFixed(2)}`);
        debMap[d] -= amt; credMap[c] -= amt;
      }}); });
    } else if (!debtors.length) {
      settlements.push('All partners are in positive or neutral position — no payments needed.');
    }

    return [
      `=== WHITECROSS BARBERS — FULL BUSINESS SNAPSHOT ===`,
      `Date: ${now.toDateString()}`,
      `IMPORTANT CONTEXT: The client tracking, loyalty points, and retention system went live on 11 May 2026 (${Math.round((now - new Date('2026-05-11')) / 864e5)} days ago). Retention rates, visit counts and client data only reflect this period. Do not draw long-term conclusions from retention/loyalty metrics yet — more time is needed for meaningful data.`,
      '',
      `=== THIS WEEK ===`,
      `Bookings: ${twCount} | Revenue: £${twRev.toFixed(0)} | Cash: £${weekFin.cash.toFixed(0)} | Card: £${weekFin.card.toFixed(0)} | Tips: £${weekFin.tips.toFixed(0)}`,
      `vs Last week: ${lwCount} bookings, £${lwRev.toFixed(0)} (${twRev>lwRev?'+':''}${lwRev?Math.round((twRev-lwRev)/lwRev*100):0}%)`,
      '',
      `=== THIS MONTH ===`,
      `Bookings: ${mom.tmCount} | Revenue: £${mom.tmRev.toFixed(0)} | Cash: £${monthFin.cash.toFixed(0)} | Card: £${monthFin.card.toFixed(0)} | Tips: £${monthFin.tips.toFixed(0)}`,
      `vs Last month (same period): ${mom.lmCount} bookings, £${mom.lmRev.toFixed(0)} (${mom.revTrend?`${mom.revTrend.d>=0?'+':''}${mom.revTrend.d}%`:'n/a'})`,
      `Last month full: £${mom.lmFullRev.toFixed(0)}`,
      '',
      `=== BARBERS (THIS MONTH) ===`,
      ...monthBarberLines,
      '',
      `=== SERVICES (THIS MONTH) ===`,
      monthSvcLines.join(' | '),
      '',
      `=== ALL-TIME TOP SERVICES ===`,
      topSvcs,
      '',
      `=== CLIENT STATS ===`,
      `Total unique clients: ${total} | Returning (2+ visits): ${retC} | New (1 visit): ${newC} | Retention: ${retentionRate}%`,
      avgFreqDays ? `Avg revisit: every ${Math.round(avgFreqDays)} days` : '',
      `Cancellations: ${cancelStats.rate}% rate, £${cancelStats.lostRev.toFixed(0)} lost revenue`,
      '',
      `=== THIS WEEK — CLIENTS BY SPEND ===`,
      ...weekClients,
      '',
      `=== THIS MONTH — TOP CLIENTS BY SPEND ===`,
      ...monthClients,
      '',
      `=== ALL-TIME TOP CLIENTS ===`,
      ...allTimeClients,
      '',
      `=== LAST 40 BOOKINGS (newest first) ===`,
      `Format: date | client | service | barber | amount payment`,
      ...recentBks,
      cancelLines.length ? `\n=== RECENT CANCELLATIONS ===\n${cancelLines.join('\n')}` : '',
      '',
      `=== FINANCE — MONTHLY P&L (last 12 months) ===`,
      `Formula: Net P&L = Gross Revenue - Expenses - Wages - Fixed Costs (£${finFixedRate}/day)`,
      ...finMonthLines,
      '',
      `=== FINANCE — PARTNER NET DURUM (last 6 months) ===`,
      `Formula per partner: El Emeği = (worked days × wage) + credited employees - advances; Hisseden = Net P&L × share%; Net Durum = El Emeği + Hisseden`,
      `Partners: Alex 50% share £100/day | Arda 25% share £100/day | Tuncay 25% share £0/day (Kadim+Manoj wages credit to Tuncay)`,
      ...finPartnerLines,
      '',
      `=== FINANCE — PARTNER TOTAL POSITIONS ===`,
      `Initial Investment Pool: £${FIN_INITIAL_POOL.toFixed(2)} (includes £1,212.20 stamp duty)`,
      `Total Position = cumulative operational net durum + initial investment overpay/underpay`,
      ...finCumLines,
      '',
      `=== FINANCE — SETTLEMENT (who must pay who to settle up) ===`,
      ...settlements,
    ].filter(v => v !== undefined).join('\n');
  };

  const sendAiMessage = async () => {
    const q = aiInput.trim();
    if (!q || aiLoading) return;
    setAiInput('');
    setAiMessages(m => [...m, { role: 'user', text: q }]);
    setAiLoading(true);
    try {
      const fns = getFunctions();
      const askAI = httpsCallable(fns, 'askAI');
      const res = await askAI({ question: q, context: buildContext() });
      setAiMessages(m => [...m, { role: 'ai', text: res.data.answer }]);
    } catch(e) {
      setAiMessages(m => [...m, { role: 'ai', text: '⚠️ Something went wrong. Please try again.' }]);
    }
    setAiLoading(false);
    setTimeout(() => aiBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  if(loading) return <div style={{textAlign:'center',padding:'80px',color:'var(--muted)',fontSize:'0.85rem'}}>Loading analytics…</div>;

  return (
    <div style={{maxWidth:'920px',fontFamily:"'DM Sans',var(--font,sans-serif)"}}>

      <PageHeader
        title="Marketing"
        subtitle="Insights · occupancy · campaigns"
        actions={
          <>
            <div style={{display:'flex',gap:'4px',background:'var(--card)',border:'1px solid var(--border)',borderRadius:'10px',padding:'3px'}}>
              {[2,4,8].map(w=>(
                <div key={w} onClick={()=>setWeeks(w)} style={{padding:'5px 13px',borderRadius:'7px',fontSize:'0.68rem',fontWeight:700,cursor:'pointer',background:weeks===w?'var(--gold)':'transparent',color:weeks===w?'#080705':'var(--muted)',transition:'all 0.15s'}}>{w}w</div>
              ))}
            </div>
            <select value={selBarber} onChange={e=>setSelBarber(e.target.value)} style={{...inp,width:'auto',padding:'7px 12px'}}>
              <option value="all">All Barbers</option>
              {barbers.map(b=><option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
            <button onClick={()=>setAiOpen(o=>!o)} style={{display:'flex',alignItems:'center',gap:'6px',padding:'7px 14px',background:aiOpen?'var(--gold)':'var(--card)',border:'1px solid '+(aiOpen?'var(--gold)':'var(--border)'),borderRadius:'10px',color:aiOpen?'#080705':'var(--gold)',fontSize:'0.72rem',fontWeight:700,cursor:'pointer',letterSpacing:'0.5px',transition:'all 0.18s'}}>
              ✦ AI
            </button>
          </>
        }
      />

      {/* Tabs */}
      <div style={{display:'flex',gap:'2px',background:'var(--card)',border:'1px solid var(--border)',borderRadius:'12px',padding:'4px',marginBottom:'20px',overflowX:'auto'}}>
        {TABS.map(t=>(
          <div key={t} onClick={()=>setTab(t)} style={{flex:'1 0 auto',padding:'8px 16px',borderRadius:'9px',fontSize:'0.72rem',fontWeight:700,cursor:'pointer',textAlign:'center',letterSpacing:'0.5px',whiteSpace:'nowrap',background:tab===t?'var(--gold)':'transparent',color:tab===t?'#080705':'var(--muted)',transition:'all 0.15s'}}>
            {TAB_LABELS[t]}
          </div>
        ))}
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────── */}
      {tab==='overview' && <>
        {/* KPI cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'10px'}}>
          {[
            { key:'bookings', icon:'📅', label:'This Week', val:overview.twCount+' bookings', sub:`${overview.daysElapsedLabel} elapsed`, trend:overview.countTrend, fullVal:`${overview.lwFullCount}`, elapsedVal:`${overview.lwCount}` },
            { key:'revenue',  icon:'💷', label:'This Week Revenue', val:`£${overview.twRev.toFixed(0)}`, sub:`${overview.daysElapsedLabel} elapsed`, trend:overview.revTrend, fullVal:`£${overview.lwFullRev.toFixed(0)}`, elapsedVal:`£${overview.lwRev.toFixed(0)}` },
            { key:'avg',      icon:'✂️', label:'Avg / Barber / Day', val:overview.avgPerBarberDay, sub:'customers this week', trend:null, fullVal:null, elapsedVal:null },
            { key:'clients',  icon:'👥', label:'Total Clients', val:customerInsights.total, sub:`${customerInsights.lost30} inactive 30d+`, trend:null, fullVal:null, elapsedVal:null },
          ].map(({key,icon,label,val,sub,trend:tr,fullVal,elapsedVal})=>(
            <div key={label}
              style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:'14px',padding:'14px 16px',position:'relative',overflow:'hidden',cursor:'default',borderColor:'var(--border)'}}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:'1.5px',background:'linear-gradient(90deg,transparent,var(--gold-dark),transparent)',opacity:0.4}}/>
              <div style={{fontSize:'1.1rem',marginBottom:'8px'}}>{icon}</div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.5rem',fontWeight:700,color:'var(--gold)',lineHeight:1}}>{val}</div>
              <div style={{fontSize:'0.58rem',color:'var(--muted)',letterSpacing:'1.5px',textTransform:'uppercase',marginTop:'4px',fontWeight:600}}>{label}</div>
              <div style={{fontSize:'0.65rem',marginTop:'6px',fontWeight:600,color:tr?(tr.up?'#4caf50':'#ef5350'):'var(--muted)'}}>
                {tr?`${tr.up?'↑':'↓'} ${Math.abs(tr.d)}% vs last wk (${overview.daysElapsedLabel})`:sub}
              </div>
              {elapsedVal && (
                <div style={{marginTop:'8px',paddingTop:'8px',borderTop:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:'3px'}}>
                  <div style={{fontSize:'0.6rem',color:'var(--muted)',letterSpacing:'1px',textTransform:'uppercase',fontWeight:700}}>Last Week Breakdown</div>
                  <div style={{fontSize:'0.65rem',color:'var(--gold-dark)',fontWeight:600}}>Same {overview.daysElapsedLabel}: <span style={{color:'#c9a84c'}}>{elapsedVal}</span></div>
                  <div style={{fontSize:'0.65rem',color:'var(--muted)',fontWeight:600}}>Full last week: <span style={{color:'var(--fg)'}}>{fullVal}</span></div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* MoM comparison strip */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px',marginBottom:'10px'}}>
          {[
            {
              label: `${MONTHS[now.getMonth()]} vs ${MONTHS[lastMonthStart.getMonth()]}`,
              sub: 'revenue · same days elapsed',
              curr: `£${mom.tmRev.toFixed(0)}`,
              prev: `£${mom.lmRev.toFixed(0)}`,
              tr: mom.revTrend,
            },
            {
              label: `${MONTHS[now.getMonth()]} vs ${MONTHS[lastMonthStart.getMonth()]}`,
              sub: 'bookings · same days elapsed',
              curr: `${mom.tmCount}`,
              prev: `${mom.lmCount}`,
              tr: mom.countTrend,
            },
            {
              label: 'This week vs same week last month',
              sub: `${sameWeekLastMonthStart.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} · ${overview.daysElapsedLabel} elapsed`,
              curr: `£${mom.twRev.toFixed(0)}`,
              prev: `£${mom.swElapsedRev.toFixed(0)}`,
              tr: mom.weekVsLastMonth,
              elapsedVal: `£${mom.swElapsedRev.toFixed(0)}`,
              fullVal: `£${mom.swFullRev.toFixed(0)}`,
            },
          ].map(({label,sub,curr,prev,tr,elapsedVal,fullVal})=>(
            <div key={label+sub} style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:'12px',padding:'12px 16px',display:'flex',flexDirection:'column',gap:'4px'}}>
              <div style={{fontSize:'0.58rem',color:'var(--muted)',letterSpacing:'1.5px',textTransform:'uppercase',fontWeight:700}}>{label}</div>
              <div style={{fontSize:'0.6rem',color:'var(--muted)'}}>{sub}</div>
              <div style={{display:'flex',alignItems:'baseline',gap:'8px',marginTop:'4px'}}>
                <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.4rem',fontWeight:700,color:'var(--gold)',lineHeight:1}}>{curr}</span>
                <span style={{fontSize:'0.7rem',color:'var(--muted)'}}>vs {prev}</span>
              </div>
              {tr && (
                <div style={{fontSize:'0.72rem',fontWeight:700,color:tr.up?'#4caf50':'#ef5350'}}>
                  {tr.up?'↑':'↓'} {Math.abs(tr.d)}% month-over-month
                </div>
              )}
              {elapsedVal && (
                <div style={{marginTop:'4px',padding:'6px 8px',background:'var(--card2)',borderRadius:'6px',border:'1px solid var(--border)'}}>
                  <div style={{fontSize:'0.58rem',color:'var(--muted)',fontWeight:700,letterSpacing:'1px',textTransform:'uppercase',marginBottom:'2px'}}>Same Week Last Month</div>
                  <div style={{fontSize:'0.65rem',color:'var(--gold-dark)',fontWeight:600}}>Same {overview.daysElapsedLabel}: <span style={{color:'#c9a84c'}}>{elapsedVal}</span></div>
                  <div style={{fontSize:'0.65rem',color:'var(--muted)',fontWeight:600}}>Full week: <span style={{color:'var(--muted)'}}>{fullVal}</span></div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Cancellation strip */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px',marginBottom:'16px'}}>
          {[
            { label:'Cancellations', val:cancelStats.cancelled, color:'#ef5350', icon:'✕' },
            { label:'No-shows', val:cancelStats.noShows, color:'#ffa726', icon:'👻' },
            { label:'Lost Revenue', val:`£${cancelStats.lostRev.toFixed(0)}`, color:'#b0bec5', icon:'💸' },
          ].map(({label,val,color,icon})=>(
            <div key={label} style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:'12px',padding:'10px 14px',display:'flex',alignItems:'center',gap:'10px'}}>
              <div style={{width:'32px',height:'32px',borderRadius:'8px',background:`${color}18`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.9rem',flexShrink:0}}>{icon}</div>
              <div>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.25rem',fontWeight:700,color,lineHeight:1}}>{val}</div>
                <div style={{fontSize:'0.58rem',color:'var(--muted)',letterSpacing:'1px',textTransform:'uppercase',fontWeight:600,marginTop:'2px'}}>{label} · {weeks}w</div>
              </div>
            </div>
          ))}
        </div>

        {/* Revenue trend chart */}
        <div style={card}>
          <div style={{...hdr(),display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
              <div>
                <div style={{...title,fontSize:'1rem'}}>
                  {trendView==='weekly'?`Weekly Revenue — last ${weeks} weeks`:'Monthly Revenue — last 12 months'}
                </div>
                <div style={{fontSize:'0.6rem',color:'var(--muted)',marginTop:'2px'}}>
                  {trendView==='weekly'?'Current week in gold · bars = revenue':'Current month in gold · MoM growth rate shown'}
                </div>
              </div>
              <div style={{display:'flex',gap:'2px',background:'var(--card2)',border:'1px solid var(--border)',borderRadius:'8px',padding:'2px'}}>
                {[['weekly','Weekly'],['monthly','12 Months']].map(([id,lbl])=>(
                  <div key={id} onClick={()=>setTrendView(id)} style={{padding:'4px 10px',borderRadius:'6px',fontSize:'0.62rem',fontWeight:700,cursor:'pointer',background:trendView===id?'var(--gold)':'transparent',color:trendView===id?'#080705':'var(--muted)',transition:'all 0.15s'}}>{lbl}</div>
                ))}
              </div>
            </div>
            {/* Revenue target inline */}
            <div style={{display:'flex',alignItems:'center',gap:'8px',flexShrink:0}}>
              <span style={{fontSize:'0.6rem',color:'var(--muted)',fontWeight:600}}>Weekly target:</span>
              {editingTarget ? (
                <div style={{display:'flex',gap:'4px'}}>
                  <input
                    autoFocus type="number" value={targetInput}
                    onChange={e=>setTargetInput(e.target.value)}
                    onKeyDown={e=>{ if(e.key==='Enter') saveTarget(targetInput); if(e.key==='Escape') setEditingTarget(false); }}
                    style={{...inp,width:'80px',padding:'4px 8px',fontSize:'0.75rem'}}
                    placeholder="e.g. 2000"
                  />
                  <button onClick={()=>saveTarget(targetInput)} style={{padding:'4px 10px',background:'var(--gold)',border:'none',borderRadius:'7px',cursor:'pointer',fontSize:'0.7rem',fontWeight:700,color:'#080705'}}>✓</button>
                </div>
              ) : (
                <div onClick={()=>{ setEditingTarget(true); setTargetInput(String(weeklyTarget||'')); }}
                  style={{fontSize:'0.78rem',fontWeight:700,color:'var(--gold)',cursor:'pointer',padding:'3px 8px',background:'rgba(201,168,76,0.08)',borderRadius:'6px',border:'1px solid rgba(201,168,76,0.2)'}}>
                  {weeklyTarget?`£${weeklyTarget}`:'Set target'}
                </div>
              )}
            </div>
          </div>
          {/* Target progress bar (this week) */}
          {weeklyTarget>0 && (
            <div style={{padding:'10px 20px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.6rem',color:'var(--muted)',marginBottom:'5px'}}>
                <span>This week: <strong style={{color:'var(--gold)'}}>£{overview.twRev.toFixed(0)}</strong></span>
                <span>{pct(overview.twRev, weeklyTarget)}% of £{weeklyTarget} target</span>
              </div>
              <div style={{height:'6px',background:'var(--border)',borderRadius:'99px',overflow:'hidden',marginBottom:'10px'}}>
                <div style={{height:'100%',width:Math.min(100,pct(overview.twRev,weeklyTarget))+'%',background:overview.twRev>=weeklyTarget?'#4caf50':'var(--gold)',borderRadius:'99px',transition:'width 0.5s'}}/>
              </div>
            </div>
          )}
          <div style={{padding:'20px',overflowX:'auto'}}>
            {trendView==='weekly' ? (
              <div style={{display:'flex',gap:'6px',alignItems:'flex-end',height:'160px',minWidth:'400px'}}>
                {weeklyTrend.map((w,i)=>{
                  const h=Math.max(4,Math.round((w.rev/maxWeeklyRev)*140));
                  const atTarget = weeklyTarget>0 && w.rev>=weeklyTarget;
                  return (
                    <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'4px',height:'100%',justifyContent:'flex-end'}}>
                      <div style={{fontSize:'0.6rem',color:'var(--muted)',fontWeight:700}}>£{w.rev>=1000?(w.rev/1000).toFixed(1)+'k':w.rev.toFixed(0)}</div>
                      <div title={`${w.label}: ${w.count} bookings · £${w.rev.toFixed(0)}`}
                        style={{width:'100%',height:h+'px',borderRadius:'6px 6px 2px 2px',background:atTarget?'rgba(76,175,80,0.5)':w.isCurrent?'var(--gold)':'rgba(201,168,76,0.25)',border:`1px solid ${atTarget?'#4caf50':w.isCurrent?'var(--gold)':'rgba(201,168,76,0.2)'}`,transition:'height 0.4s',cursor:'default'}}/>
                      <div style={{fontSize:'0.55rem',color:'var(--muted)',textAlign:'center',lineHeight:1.3}}>{w.label}</div>
                    </div>
                  );
                })}
              </div>
            ) : (() => {
              const maxMRev = Math.max(...monthlyTrend.map(m=>m.rev),1);
              return (
                <div style={{display:'flex',gap:'6px',alignItems:'flex-end',height:'160px',minWidth:'520px'}}>
                  {monthlyTrend.map((m,i)=>{
                    const h=Math.max(4,Math.round((m.rev/maxMRev)*140));
                    const prev=monthlyTrend[i-1];
                    const momPct=prev&&prev.rev>0?Math.round((m.rev-prev.rev)/prev.rev*100):null;
                    return (
                      <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'4px',height:'100%',justifyContent:'flex-end'}}>
                        {momPct!==null&&(
                          <div style={{fontSize:'0.52rem',fontWeight:700,color:momPct>=0?'#4caf50':'#ef5350',lineHeight:1}}>{momPct>=0?'+':''}{momPct}%</div>
                        )}
                        <div style={{fontSize:'0.58rem',color:'var(--muted)',fontWeight:700}}>£{m.rev>=1000?(m.rev/1000).toFixed(1)+'k':m.rev.toFixed(0)}</div>
                        <div title={`${m.label}: ${m.count} bookings · £${m.rev.toFixed(0)}`}
                          style={{width:'100%',height:h+'px',borderRadius:'6px 6px 2px 2px',background:m.isCurrent?'var(--gold)':'rgba(201,168,76,0.25)',border:`1px solid ${m.isCurrent?'var(--gold)':'rgba(201,168,76,0.2)'}`,transition:'height 0.4s',cursor:'default'}}/>
                        <div style={{fontSize:'0.52rem',color:'var(--muted)',textAlign:'center',lineHeight:1.2}}>{m.label}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Source + quality row */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
          {/* Source */}
          <div style={card}>
            <div style={hdr()}>
              <div style={{...title,fontSize:'0.95rem'}}>Booking Sources</div>
              <div style={{fontSize:'0.6rem',color:'var(--muted)',marginTop:'2px'}}>{filteredAll.length} bookings · {weeks}w</div>
            </div>
            <div style={{padding:'12px 0'}}>
              {sourceStats.map(s=>(
                <div key={s.src} style={{padding:'8px 18px',display:'flex',alignItems:'center',gap:'10px'}}>
                  <div style={{width:'8px',height:'8px',borderRadius:'50%',background:sColor(s.src),flexShrink:0}}/>
                  <div style={{flex:1,fontSize:'0.8rem',fontWeight:600,color:'var(--text)'}}>{s.src}</div>
                  <div style={{width:'100px',height:'5px',background:'var(--border)',borderRadius:'99px',overflow:'hidden'}}>
                    <div style={{width:pct(s.count,totalSourceCount)+'%',height:'100%',background:sColor(s.src),borderRadius:'99px'}}/>
                  </div>
                  <div style={{fontSize:'0.72rem',fontWeight:700,color:sColor(s.src),minWidth:'28px',textAlign:'right'}}>{s.count}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Revenue quality */}
          <div style={card}>
            <div style={hdr()}>
              <div style={{...title,fontSize:'0.95rem'}}>Revenue Quality</div>
              <div style={{fontSize:'0.6rem',color:'var(--muted)',marginTop:'2px'}}>{weeks}w period</div>
            </div>
            <div style={{padding:'16px 18px',display:'flex',flexDirection:'column',gap:'12px'}}>
              {[
                { label:'Avg Basket Size', val:`£${quality.avgBasket.toFixed(2)}`, color:'var(--gold)' },
                { label:'Tip Rate', val:`${quality.tipRate}%`, color:'#66bb6a', sub:`£${quality.totalTips.toFixed(0)} total tips` },
                { label:'Add-on Rate', val:`${quality.addonRate}%`, color:'#64b5f6', sub:'bookings with extras' },
                { label:'Discount Rate', val:`${quality.discRate}%`, color:'#ffa726', sub:'bookings with discount' },
              ].map(({label,val,color,sub})=>(
                <div key={label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                  <div>
                    <div style={{fontSize:'0.78rem',fontWeight:600,color:'var(--text)'}}>{label}</div>
                    {sub&&<div style={{fontSize:'0.62rem',color:'var(--muted)',marginTop:'2px'}}>{sub}</div>}
                  </div>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.4rem',fontWeight:700,color}}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>}

      {/* ── BOOKINGS ─────────────────────────────────────────── */}
      {tab==='bookings' && <>
        {/* Barber breakdown */}
        <div style={card}>
          <div style={hdr()}>
            <div style={{...title,fontSize:'1rem'}}>Barber Performance — {weeks}w</div>
          </div>
          <div style={{padding:'0'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 80px 80px 80px 80px',padding:'8px 20px',borderBottom:'1px solid var(--border)',fontSize:'0.6rem',color:'var(--muted)',fontWeight:700,letterSpacing:'1px',textTransform:'uppercase'}}>
              <div>Barber</div><div style={{textAlign:'right'}}>Bookings</div><div style={{textAlign:'right'}}>Revenue</div><div style={{textAlign:'right'}}>Avg</div><div style={{textAlign:'right'}}>Tip Rate</div>
            </div>
            {barberStats.map(b=>(
              <div key={b.name} style={{padding:'12px 20px',borderBottom:'1px solid var(--border)',display:'grid',gridTemplateColumns:'1fr 80px 80px 80px 80px',alignItems:'center',gap:'4px'}}>
                <div>
                  <div style={{fontSize:'0.85rem',fontWeight:700,color:'var(--text)',marginBottom:'4px'}}>{b.name}</div>
                  <div style={{width:'100%',height:'4px',background:'var(--border)',borderRadius:'99px',overflow:'hidden'}}>
                    <div style={{width:pct(b.rev,maxBarberRev)+'%',height:'100%',background:'linear-gradient(90deg,var(--gold-dark),var(--gold))',borderRadius:'99px'}}/>
                  </div>
                </div>
                <div style={{textAlign:'right',fontSize:'0.88rem',fontWeight:700,color:'var(--text)'}}>{b.count}</div>
                <div style={{textAlign:'right',fontSize:'0.88rem',fontWeight:700,color:'var(--gold)'}}>£{b.rev.toFixed(0)}</div>
                <div style={{textAlign:'right',fontSize:'0.82rem',color:'var(--muted)'}}>£{b.avg}</div>
                <div style={{textAlign:'right',fontSize:'0.82rem',color:'#66bb6a'}}>{pct(b.tipsCount,b.count)}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* Services */}
        <div style={card}>
          <div style={hdr()}>
            <div style={{...title,fontSize:'1rem'}}>Top Services — {weeks}w</div>
          </div>
          <div style={{padding:'12px 0'}}>
            {serviceStats.map((s,i)=>(
              <div key={s.name} style={{padding:'8px 20px',display:'flex',alignItems:'center',gap:'12px',borderBottom:i<serviceStats.length-1?'1px solid var(--border)':'none'}}>
                <div style={{fontSize:'0.7rem',fontWeight:800,color:'var(--muted)',minWidth:'18px'}}>#{i+1}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'0.82rem',fontWeight:600,color:'var(--text)',marginBottom:'4px'}}>{s.name}</div>
                  <div style={{width:'100%',height:'4px',background:'var(--border)',borderRadius:'99px',overflow:'hidden'}}>
                    <div style={{width:pct(s.count,maxSvcCount)+'%',height:'100%',background:'rgba(201,168,76,0.5)',borderRadius:'99px'}}/>
                  </div>
                </div>
                <div style={{fontSize:'0.75rem',fontWeight:700,color:'var(--muted)',minWidth:'24px',textAlign:'right'}}>{s.count}×</div>
                <div style={{fontSize:'0.75rem',fontWeight:700,color:'var(--gold)',minWidth:'48px',textAlign:'right'}}>£{s.rev.toFixed(0)}</div>
              </div>
            ))}
          </div>
        </div>
      </>}

      {/* ── CUSTOMERS ────────────────────────────────────────── */}
      {tab==='customers' && <>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'16px'}}>
          {[
            { icon:'🆕', label:'New Clients', val:customerInsights.newC, sub:'1 visit only', color:'#64b5f6' },
            { icon:'🔄', label:'Returning', val:customerInsights.retC, sub:'2+ visits', color:'#66bb6a' },
            { icon:'❤️', label:'Retention Rate', val:customerInsights.retentionRate+'%', sub:'clients who came back', color:'#e57373' },
            { icon:'📅', label:'Avg Visit Freq', val:customerInsights.avgFreqDays?Math.round(customerInsights.avgFreqDays)+'d':'—', sub:'days between visits', color:'var(--gold)' },
          ].map(({icon,label,val,sub,color})=>(
            <div key={label} style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:'14px',padding:'16px',position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:'1.5px',background:`linear-gradient(90deg,transparent,${color},transparent)`,opacity:0.5}}/>
              <div style={{fontSize:'1.1rem',marginBottom:'8px'}}>{icon}</div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.8rem',fontWeight:700,color,lineHeight:1}}>{val}</div>
              <div style={{fontSize:'0.58rem',color:'var(--muted)',letterSpacing:'1.5px',textTransform:'uppercase',marginTop:'4px',fontWeight:600}}>{label}</div>
              <div style={{fontSize:'0.65rem',color:'var(--muted)',marginTop:'4px'}}>{sub}</div>
            </div>
          ))}
        </div>

        {/* New vs returning bar */}
        <div style={{...card,marginBottom:'16px'}}>
          <div style={hdr()}>
            <div style={{...title,fontSize:'0.95rem'}}>New vs Returning</div>
          </div>
          <div style={{padding:'20px'}}>
            {(() => {
              const total = (customerInsights.newC + customerInsights.retC)||1;
              const newPct = pct(customerInsights.newC, total);
              const retPct = pct(customerInsights.retC, total);
              return (
                <>
                  <div style={{display:'flex',height:'28px',borderRadius:'8px',overflow:'hidden',marginBottom:'12px'}}>
                    <div style={{width:newPct+'%',background:'rgba(100,181,246,0.4)',borderRight:'2px solid var(--card)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.65rem',fontWeight:700,color:'#64b5f6',transition:'width 0.5s'}}>
                      {newPct>8?newPct+'%':''}
                    </div>
                    <div style={{flex:1,background:'rgba(102,187,106,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.65rem',fontWeight:700,color:'#66bb6a'}}>
                      {retPct>8?retPct+'%':''}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:'20px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.72rem',color:'var(--muted)'}}>
                      <div style={{width:'10px',height:'10px',borderRadius:'3px',background:'rgba(100,181,246,0.4)'}}/>
                      New: <strong style={{color:'var(--text)'}}>{customerInsights.newC}</strong>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.72rem',color:'var(--muted)'}}>
                      <div style={{width:'10px',height:'10px',borderRadius:'3px',background:'rgba(102,187,106,0.3)'}}/>
                      Returning: <strong style={{color:'var(--text)'}}>{customerInsights.retC}</strong>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Top clients */}
        <div style={{...card,marginBottom:'16px'}}>
          <div style={hdr()}>
            <div style={{...title,fontSize:'0.95rem'}}>Top Clients — Most Visits</div>
            <div style={{fontSize:'0.6rem',color:'var(--muted)',marginTop:'2px'}}>All-time visit count</div>
          </div>
          <div>
            <div style={{display:'grid',gridTemplateColumns:'32px 1fr 60px 80px',padding:'7px 18px',borderBottom:'1px solid var(--border)',fontSize:'0.58rem',color:'var(--muted)',fontWeight:700,letterSpacing:'1px',textTransform:'uppercase'}}>
              <div>#</div><div>Client</div><div style={{textAlign:'right'}}>Visits</div><div style={{textAlign:'right'}}>Points</div>
            </div>
            {topClients.map((c,i)=>{
              const name = c.name || c.clientName || c.email || 'Unknown';
              const visits = c.totalVisits||0;
              const maxV = topClients[0]?.totalVisits||1;
              return (
                <div key={c.id} style={{display:'grid',gridTemplateColumns:'32px 1fr 60px 80px',padding:'9px 18px',borderBottom:i<topClients.length-1?'1px solid var(--border)':'none',alignItems:'center',gap:'4px'}}>
                  <div style={{fontSize:'0.7rem',fontWeight:800,color:i<3?'var(--gold)':'var(--muted)'}}>{i+1}</div>
                  <div>
                    <div style={{fontSize:'0.82rem',fontWeight:600,color:'var(--text)',marginBottom:'3px'}}>{name}</div>
                    <div style={{width:'100%',height:'3px',background:'var(--border)',borderRadius:'99px',overflow:'hidden'}}>
                      <div style={{width:pct(visits,maxV)+'%',height:'100%',background:i<3?'var(--gold)':'rgba(201,168,76,0.4)',borderRadius:'99px'}}/>
                    </div>
                  </div>
                  <div style={{textAlign:'right',fontSize:'0.82rem',fontWeight:700,color:'var(--text)'}}>{visits}</div>
                  <div style={{textAlign:'right',fontSize:'0.78rem',color:'var(--gold)',fontWeight:600}}>{c.loyaltyPoints||0} pts</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Lost customers */}
        <div style={card}>
          <div style={hdr()}>
            <div style={{...title,fontSize:'0.95rem'}}>Inactive Clients</div>
            <div style={{fontSize:'0.6rem',color:'var(--muted)',marginTop:'2px'}}>Clients who haven't visited in a while</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'1px',background:'var(--border)'}}>
            {[
              { label:'30+ days', val:customerInsights.lost30, color:'#ffa726', note:'worth a reminder' },
              { label:'60+ days', val:customerInsights.lost60, color:'#ef5350', note:'likely lost' },
              { label:'90+ days', val:customerInsights.lost90, color:'#9b3a3a', note:'almost certainly lost' },
            ].map(({label,val,color,note})=>(
              <div key={label} style={{background:'var(--card)',padding:'20px',textAlign:'center'}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'2rem',fontWeight:700,color,lineHeight:1}}>{val}</div>
                <div style={{fontSize:'0.68rem',fontWeight:700,color:'var(--text)',marginTop:'6px',letterSpacing:'0.5px'}}>{label}</div>
                <div style={{fontSize:'0.6rem',color:'var(--muted)',marginTop:'3px'}}>{note}</div>
              </div>
            ))}
          </div>
        </div>
      </>}

      {/* ── OCCUPANCY ────────────────────────────────────────── */}
      {tab==='occupancy' && <>
        {/* Day overview */}
        <div style={card}>
          <div style={hdr()}>
            <div style={{...title,fontSize:'1rem'}}>Day of Week — {weeks}w · {filteredAll.length} bookings</div>
            <div style={{fontSize:'0.65rem',color:'var(--muted)',marginTop:'2px'}}>Includes historical bookings without timestamps</div>
          </div>
          <div style={{padding:'20px',display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'10px'}}>
            {dayOcc.map(({day,dayFull,count,rel,pct:p})=>{
              const cs=cellStyle(p);
              const barColor = cs ? cs.color : 'var(--gold)';
              return (
                <div key={day} title={`${dayFull}: ${count} bookings`} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'8px'}}>
                  <div style={{fontSize:'0.72rem',fontWeight:800,color:'var(--text)',letterSpacing:'1px',textTransform:'uppercase'}}>{day}</div>
                  <div style={{width:'100%',height:'100px',background:'rgba(255,255,255,0.04)',borderRadius:'10px',position:'relative',overflow:'hidden',border:`1px solid ${cs?cs.border:'var(--border)'}`}}>
                    <div style={{position:'absolute',bottom:0,left:0,right:0,height:Math.max(4,Math.round(rel*100))+'%',background:cs?cs.bg.replace(/0\.\d+\)/, '0.55)') :'rgba(201,168,76,0.35)',borderTop:`3px solid ${barColor}`,transition:'height 0.6s'}}/>
                  </div>
                  <div style={{fontSize:'0.95rem',fontWeight:800,color:barColor,lineHeight:1}}>{count}</div>
                  {p!==null && <div style={{fontSize:'0.65rem',fontWeight:700,color:barColor,opacity:0.85}}>{Math.round(p*100)}%</div>}
                </div>
              );
            })}
          </div>
          <div style={{padding:'10px 20px 14px',display:'flex',gap:'20px',flexWrap:'wrap',borderTop:'1px solid var(--border)'}}>
            {[...dayOcc].sort((a,b)=>a.count-b.count).slice(0,2).map(d=>(
              <span key={d.day} style={{fontSize:'0.72rem',color:'var(--muted)'}}>💤 <strong style={{color:'var(--text)'}}>{d.dayFull}</strong> — {d.count} bookings</span>
            ))}
            {[...dayOcc].sort((a,b)=>b.count-a.count).slice(0,1).map(d=>(
              <span key={d.day} style={{fontSize:'0.72rem',color:'var(--muted)'}}>🔥 <strong style={{color:'var(--text)'}}>{d.dayFull}</strong> — {d.count} bookings</span>
            ))}
          </div>
        </div>

        {/* Heatmap */}
        <div style={card}>
          <div style={{...hdr(),display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'10px'}}>
            <div>
              <div style={{...title,fontSize:'1rem'}}>Hourly Heatmap</div>
              <div style={{fontSize:'0.65rem',color:'var(--muted)',marginTop:'2px'}}>Timestamp bookings only ({filteredTs.length}) · accuracy improves over time</div>
            </div>
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
              {[['#c84c4c','Peak 70%+'],['#c97830','Busy 45–70%'],['#c9a84c','Moderate 20–45%'],['#3d8b5e','Quiet <20%']].map(([color,lbl])=>(
                <div key={lbl} style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'0.65rem',color:'var(--text)',fontWeight:600}}>
                  <div style={{width:'11px',height:'11px',borderRadius:'3px',background:color,opacity:0.85}}/>{lbl}
                </div>
              ))}
            </div>
          </div>
          <div style={{padding:'16px 20px',overflowX:'auto'}}>
            <div style={{display:'grid',gridTemplateColumns:'52px repeat(7,1fr)',gap:'5px',minWidth:'480px'}}>
              <div/>
              {DAYS.map(d=><div key={d} style={{textAlign:'center',fontSize:'0.72rem',fontWeight:800,color:'var(--text)',letterSpacing:'1px',textTransform:'uppercase',padding:'4px 0'}}>{d}</div>)}
              {HOURS.map((h,hi)=>[
                <div key={`t${h}`} style={{display:'flex',alignItems:'center',fontSize:'0.68rem',color:'var(--text)',fontWeight:700,height:'40px'}}>{h}:00</div>,
                ...heatmap.map((row,di)=>{
                  const p=row[hi]; const cs=cellStyle(p);
                  const vivid = cs ? { bg: cs.bg.replace(/0\.\d+\)/, p>=0.7?'0.65)':p>=0.45?'0.55)':p>=0.2?'0.4)':'0.25)'), color: cs.color, border: cs.border } : null;
                  return <div key={`${di}-${hi}`} title={`${DAYS_F[di]} ${h}:00 — ${p===null?'Closed':Math.round(p*100)+'%'}`}
                    style={{height:'40px',borderRadius:'8px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.7rem',fontWeight:800,
                      background:vivid?vivid.bg:'rgba(255,255,255,0.03)',
                      border:`1px solid ${vivid?vivid.border:'rgba(255,255,255,0.06)'}`,
                      color:vivid?vivid.color:'var(--muted)'}}>
                    {p===null?<span style={{fontSize:'0.6rem',opacity:0.4}}>—</span>:Math.round(p*100)+'%'}
                  </div>;
                })
              ])}
            </div>
          </div>
        </div>

        {/* Quiet slots */}
        {quietSlots.length>0&&(
          <div style={card}>
            <div style={hdr()}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:'2px',background:'linear-gradient(90deg,transparent,#3d8b5e,transparent)',opacity:0.5}}/>
              <div style={{...title,fontSize:'1rem'}}>Quietest Slots — opportunity windows</div>
            </div>
            <div>
              {quietSlots.map((sl,i)=>{
                const zero=sl.pct===0;
                return (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'14px',padding:'14px 20px',borderBottom:i<quietSlots.length-1?'1px solid var(--border)':'none'}}>
                    <div style={{width:'52px',height:'52px',borderRadius:'12px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:'0.85rem',fontWeight:800,
                      background:zero?'rgba(61,139,94,0.2)':'rgba(201,168,76,0.15)',
                      color:zero?'#5db882':'var(--gold)',
                      border:`2px solid ${zero?'rgba(61,139,94,0.4)':'rgba(201,168,76,0.3)'}`}}>
                      {Math.round(sl.pct*100)}%
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'0.9rem',fontWeight:700,color:'var(--text)'}}>{sl.dayFull} {sl.hour}:00</div>
                      <div style={{fontSize:'0.68rem',color:'var(--muted)',marginTop:'3px'}}>{zero?'Consistently empty — no bookings in this period':'Near-empty · worth targeting with a promotion'}</div>
                    </div>
                    <div style={{fontSize:'0.65rem',fontWeight:700,
                      color:zero?'#5db882':'var(--gold)',
                      background:zero?'rgba(61,139,94,0.15)':'rgba(201,168,76,0.12)',
                      border:`1px solid ${zero?'rgba(61,139,94,0.3)':'rgba(201,168,76,0.25)'}`,
                      padding:'5px 12px',borderRadius:'99px',whiteSpace:'nowrap'}}>
                      {zero?'⚡ Campaign ready':'💡 Promote this slot'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>}

      {/* ── CAMPAIGNS ────────────────────────────────────────── */}
      {tab==='campaigns' && (
        <div style={{...card,maxWidth:'480px'}}>
          <div style={hdr()}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:'1.5px',background:'linear-gradient(90deg,transparent,var(--gold),transparent)',opacity:0.4}}/>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.1rem',fontWeight:700,color:'var(--gold)',letterSpacing:'1px'}}>⚡ Double Points Campaign</div>
            <div style={{fontSize:'0.6rem',color:'var(--muted)',marginTop:'3px',lineHeight:1.5}}>Website bookings during this period earn 2× loyalty points.<br/>Banner appears on the booking success page automatically.</div>
          </div>
          <div style={{padding:'18px 20px',display:'flex',flexDirection:'column',gap:'14px'}}>
            {isLive&&(
              <div style={{padding:'10px 14px',background:'rgba(201,168,76,0.1)',border:'1px solid rgba(201,168,76,0.3)',borderRadius:'10px',display:'flex',alignItems:'center',gap:'10px'}}>
                <div style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--gold)',flexShrink:0,animation:'mktPulse 1.5s ease-in-out infinite'}}/>
                <div>
                  <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--gold)',letterSpacing:'0.5px'}}>CAMPAIGN LIVE</div>
                  <div style={{fontSize:'0.6rem',color:'var(--gold-dark)',marginTop:'1px'}}>
                    {new Date(camp.startDate+'T00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})} → {new Date(camp.endDate+'T00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
                  </div>
                </div>
              </div>
            )}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:'0.78rem',fontWeight:600,color:'var(--text)'}}>Campaign {camp.active?'enabled':'disabled'}</span>
              <div onClick={()=>setCamp(c=>({...c,active:!c.active}))}
                style={{width:'44px',height:'24px',borderRadius:'12px',cursor:'pointer',background:camp.active?'var(--gold)':'var(--muted2)',position:'relative',transition:'background 0.2s',flexShrink:0}}>
                <div style={{position:'absolute',top:'3px',left:camp.active?'23px':'3px',width:'18px',height:'18px',borderRadius:'50%',background:'#fff',transition:'left 0.2s'}}/>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              {[['Start Date','startDate'],['End Date','endDate']].map(([lbl,key])=>(
                <div key={key}>
                  <label style={{display:'block',fontSize:'0.58rem',color:'var(--muted)',letterSpacing:'2px',textTransform:'uppercase',fontWeight:700,marginBottom:'6px'}}>{lbl}</label>
                  <input type="date" value={camp[key]||''} onChange={e=>setCamp(c=>({...c,[key]:e.target.value}))} style={inp}/>
                </div>
              ))}
            </div>
            <div style={{padding:'10px 12px',background:'var(--card2)',borderRadius:'9px',fontSize:'0.68rem',color:'var(--muted)',lineHeight:1.5,borderLeft:'2px solid var(--border)'}}>
              Only applies to <strong style={{color:'var(--text)'}}>website bookings</strong>. Walk-ins and manual bookings are excluded. Points doubled at checkout automatically.
            </div>
            <button onClick={saveCamp} disabled={saving}
              style={{width:'100%',padding:'12px',background:saved?'rgba(61,139,94,0.2)':'var(--gold)',border:saved?'1px solid #4caf50':'none',borderRadius:'11px',color:saved?'#5db882':'#080705',fontSize:'0.78rem',fontWeight:700,letterSpacing:'1px',cursor:saving?'not-allowed':'pointer',fontFamily:'inherit',transition:'all 0.2s'}}>
              {saved?'✓ Saved':saving?'Saving…':'Save Campaign'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes mktPulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.5;transform:scale(0.85);}}
        @keyframes aiSlideIn{from{opacity:0;transform:translateX(40px);}to{opacity:1;transform:translateX(0);}}
        @keyframes aiDot{0%,80%,100%{transform:scale(0.6);opacity:0.4;}40%{transform:scale(1);opacity:1;}}
        .ai-msg-user{background:var(--gold);color:#080705;border-radius:14px 14px 4px 14px;align-self:flex-end;}
        .ai-msg-ai{background:var(--card2);color:var(--text);border-radius:14px 14px 14px 4px;align-self:flex-start;border:1px solid var(--border);}
      `}</style>

      {/* AI Panel */}
      {aiOpen && (
        <div style={{position:'fixed',top:0,right:0,bottom:0,width:'360px',background:'var(--card)',borderLeft:'1px solid var(--border)',zIndex:300,display:'flex',flexDirection:'column',animation:'aiSlideIn 0.25s ease',boxShadow:'-8px 0 40px rgba(0,0,0,0.3)'}}>
          {/* Header */}
          <div style={{padding:'18px 20px 14px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
            <div>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.2rem',fontWeight:700,color:'var(--gold)',letterSpacing:'1.5px'}}>{tenantId === 'whitecross' ? '✦ Ask Whitecross AI' : '✦ Ask Salown AI'}</div>
              <div style={{fontSize:'0.58rem',color:'var(--muted)',letterSpacing:'1.5px',textTransform:'uppercase',marginTop:'2px'}}>Powered by Claude Sonnet</div>
            </div>
            <button onClick={()=>setAiOpen(false)} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'1.2rem',cursor:'pointer',padding:'4px 8px',borderRadius:'8px'}}>✕</button>
          </div>

          {/* Messages */}
          <div style={{flex:1,overflowY:'auto',padding:'16px',display:'flex',flexDirection:'column',gap:'10px'}}>
            {aiMessages.length===0 && (
              <div style={{textAlign:'center',padding:'40px 20px'}}>
                <div style={{fontSize:'2rem',marginBottom:'12px'}}>✦</div>
                <div style={{fontSize:'0.78rem',color:'var(--muted)',lineHeight:1.6}}>Ask me anything about your business.</div>
                <div style={{marginTop:'16px',display:'flex',flexDirection:'column',gap:'6px'}}>
                  {['Bu haftaki en iyi performans?','Hangi servis en çok gelir getiriyor?','Müşteri geri dönüş oranım nasıl?'].map(q=>(
                    <div key={q} onClick={()=>{ setAiInput(q); }} style={{padding:'8px 12px',background:'var(--card2)',border:'1px solid var(--border)',borderRadius:'10px',fontSize:'0.7rem',color:'var(--muted)',cursor:'pointer',textAlign:'left',transition:'border-color 0.15s'}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor='var(--gold)'}
                      onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}
                    >{q}</div>
                  ))}
                </div>
              </div>
            )}
            {aiMessages.map((m,i)=>(
              <div key={i} className={m.role==='user'?'ai-msg-user':'ai-msg-ai'} style={{padding:'10px 14px',fontSize:'0.78rem',lineHeight:1.6,maxWidth:'90%',whiteSpace:'pre-wrap'}}>{m.text}</div>
            ))}
            {aiLoading && (
              <div className="ai-msg-ai" style={{padding:'12px 16px',display:'flex',gap:'5px',alignItems:'center'}}>
                {[0,1,2].map(i=><div key={i} style={{width:'6px',height:'6px',borderRadius:'50%',background:'var(--muted)',animation:`aiDot 1.2s ease-in-out ${i*0.2}s infinite`}}/>)}
              </div>
            )}
            <div ref={aiBottomRef}/>
          </div>

          {/* Input */}
          <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)',flexShrink:0}}>
            <div style={{display:'flex',gap:'8px',alignItems:'flex-end'}}>
              <textarea
                value={aiInput}
                onChange={e=>setAiInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendAiMessage();} }}
                placeholder="Ask about your business…"
                rows={2}
                style={{flex:1,padding:'10px 12px',background:'var(--card2)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--text)',fontSize:'0.75rem',fontFamily:'inherit',resize:'none',outline:'none',lineHeight:1.5}}
              />
              <button onClick={sendAiMessage} disabled={aiLoading||!aiInput.trim()} style={{padding:'10px 14px',background:'var(--gold)',border:'none',borderRadius:'10px',color:'#080705',fontWeight:700,fontSize:'0.8rem',cursor:aiLoading||!aiInput.trim()?'not-allowed':'pointer',opacity:aiLoading||!aiInput.trim()?0.5:1,flexShrink:0}}>↑</button>
            </div>
            <div style={{fontSize:'0.58rem',color:'var(--muted)',marginTop:'6px',textAlign:'center'}}>Enter to send · Shift+Enter for new line</div>
          </div>
        </div>
      )}
    </div>
  );
}
