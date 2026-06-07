
import { db } from '../firebase';
import { collection, query, getDocs, orderBy, doc, getDoc, setDoc, onSnapshot, where, Timestamp } from 'firebase/firestore';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import config, { seedServices } from '../config';
import { checkoutBooking, saveUnpaidBooking, createWalkIn, blockTime, editBooking, deleteBooking, cancelBooking, markNoShow, getProducts as getProductsAction, createProductSale, getClientLoyaltyPoints } from '../firestoreActions';
import { addDoc, serverTimestamp } from 'firebase/firestore';
import CheckoutPanel from '../components/CheckoutPanel';
import BookingDetail from '../components/BookingDetail';
import {
  pp, normalizeBookingSource, normalizeBookingStatus,
  normalizeSoldProducts, getProductsTotal, bookingNetWithoutTip,
  normalizeServiceKey, findServiceByBookingValue, prettifyServiceId,
  getBookingServiceLabel, getDisplayedAmount,
  isBarberBookingDisabled, getAvailableBarbersForDate,
  getBookingName, getBColor, getExtrasFromServices,
} from '../utils/bookingUtils';
import {
  convertTo24, minsToLabel, formatDateKey, toDateKey,
  getDaysInMonth, getFirstDay, getWeekDates,
} from '../utils/timeUtils';
import {
  normalizeSpecialHours, getSpecialHoursForDate, getEffectiveDayHours,
} from '../utils/scheduleUtils';
import { getExistingRangeMinutes, hasTimeConflict } from '../utils/conflictUtils';
import CollapsiblePanel from '../components/CollapsiblePanel';
import StatPill from '../components/StatPill';
import ResizeHandle from '../components/ResizeHandle';
import SlotPopup from '../components/SlotPopup';
import ProductSelector from '../components/ProductSelector';
import AddClientModal from '../components/AddClientModal';
import BookingProductsPanel from '../components/BookingProductsPanel';
import ProductSalePanel from '../components/ProductSalePanel';
import BlockTimeForm from '../components/BlockTimeForm';
import BookingForm from '../components/BookingForm';
import WalkInForm from '../components/WalkInForm';
import ReceiptPanel from '../components/ReceiptPanel';
import TimeGrid from '../components/TimeGrid';


const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const STATUS_COLORS = { CONFIRMED: '#4caf50', PENDING: '#ff9800', CHECKED_OUT: '#2196f3', CANCELLED: '#ff5252', NO_SHOW: '#9c27b0' };

export default function Dashboard({ tenantId, isAdmin = false, initialDate }) {
  // ...existing useState hooks...
  const [clientName, setClientName] = useState('Walk-in');
  const [clientPhone, setClientPhone] = useState('');
  // Add Client Modal state and handler (must be after clientName/clientPhone)
  const [showAddClient, setShowAddClient] = useState(false);
  const handleAddClientInline = (client) => {
    setClientName(client.name || '');
    setClientPhone(client.phone || '');
    setShowAddClient(false);
  };
  const [bookings, setBookings] = useState([]); 
  const [products, setProducts] = useState([]); // Only retail products
  const [extras, setExtras] = useState([]); // Add-ons from services
  const [bookingProductsDraft, setBookingProductsDraft] = useState({});
  const [specialHours, setSpecialHours] = useState([]);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showBlockTime, setShowBlockTime] = useState(false);
  const [showBookingProducts, setShowBookingProducts] = useState(false);
  const [showProductSale, setShowProductSale] = useState(false);
  const [isEditCheckout, setIsEditCheckout] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [clientData, setClientData] = useState(null);
  const [view, setView] = useState('day');
  const [pillFilter, setPillFilter] = useState(null);
  const [showPillSettings, setShowPillSettings] = useState(false);
  const [pillsCollapsed, setPillsCollapsed] = useState(false);
  const [showLeftCardSettings, setShowLeftCardSettings] = useState(false);
  const ALL_PILLS = ['total','confirmed','pending','checkedout','revenue','discount','tips'];
  const ALL_LEFT_CARDS = ['clients','revenue','discount','tips','barbers'];
  const PREFS_DOC = doc(db, `tenants/${tenantId}/settings/dashboardPrefs`);
  const [visiblePills, setVisiblePills] = useState(new Set(ALL_PILLS));
  const [visibleLeftCards, setVisibleLeftCards] = useState(new Set(ALL_LEFT_CARDS));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarStatsOpen, setSidebarStatsOpen] = useState(true);

  useEffect(() => {
    getDoc(PREFS_DOC).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (Array.isArray(d.visiblePills)) setVisiblePills(new Set(d.visiblePills));
      if (Array.isArray(d.visibleLeftCards)) setVisibleLeftCards(new Set(d.visibleLeftCards));
      if (typeof d.sidebarOpen === 'boolean') setSidebarOpen(d.sidebarOpen);
    }).catch(() => {});
  }, []);

  const saveDashboardPrefs = (pills, leftCards, sidebar) => {
    setDoc(PREFS_DOC, { visiblePills: [...pills], visibleLeftCards: [...leftCards], sidebarOpen: sidebar }, { merge: true }).catch(() => {});
  };

  const togglePillVisibility = (key) => {
    setVisiblePills(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveDashboardPrefs(next, visibleLeftCards, sidebarOpen);
      return next;
    });
  };
  const toggleLeftCard = (key) => {
    setVisibleLeftCards(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveDashboardPrefs(visiblePills, next, sidebarOpen);
      return next;
    });
  };
  const toggleSidebar = () => {
    setSidebarOpen(prev => {
      const next = !prev;
      saveDashboardPrefs(visiblePills, visibleLeftCards, next);
      return next;
    });
  };
  const [selectedDate, setSelectedDate] = useState(() => initialDate || new Date());
  const [currentMonth, setCurrentMonth] = useState(() => initialDate || new Date());
  const prevInitialDate = useRef(initialDate);
  useEffect(() => {
    if (initialDate && initialDate !== prevInitialDate.current) {
      prevInitialDate.current = initialDate;
      setSelectedDate(initialDate);
      setCurrentMonth(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
      setView('day');
    }
  }, [initialDate]);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [barberFilter, setBarberFilter] = useState('all');
  const [barbers, setBarbers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formPreset, setFormPreset] = useState({});
  const [leftPanelWidth, setLeftPanelWidth] = useState(180);
  const [slotHeight, setSlotHeight] = useState(24);
  const [fabOpen, setFabOpen] = useState(false);
  const [customRange, setCustomRange] = useState({ start: null, end: null });
  const today = new Date(); today.setHours(0,0,0,0);

  const closeAllPanels = () => {
    setShowForm(false); setShowWalkIn(false); setShowBlockTime(false);
    setShowBookingProducts(false); setShowProductSale(false);
    setSelectedBooking(null); setShowCheckout(false); setShowReceipt(false);
    setFabOpen(false); setShowPillSettings(false);
  };
  const dayListenerRef = useRef(null);

useEffect(() => {
  fetchAll();
  const interval = setInterval(() => { fetchAll(); }, 60000);
  return () => clearInterval(interval);
}, []);

useEffect(() => {
  if (dayListenerRef.current) { dayListenerRef.current(); dayListenerRef.current = null; }
  const s0 = new Date(selectedDate); s0.setHours(0,0,0,0);
  const s1 = new Date(selectedDate); s1.setHours(23,59,59,999);
  let first = true;
  dayListenerRef.current = onSnapshot(
    query(collection(db, `tenants/${tenantId}/bookings`), where('startTime', '>=', Timestamp.fromDate(s0)), where('startTime', '<=', Timestamp.fromDate(s1))),
    () => { if (first) { first = false; return; } fetchAll(); },
    () => {}
  );
  return () => { if (dayListenerRef.current) { dayListenerRef.current(); dayListenerRef.current = null; } };
}, [selectedDate]);

useEffect(() => {
  if (barberFilter === 'all') return;
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayName = DAYS[selectedDate.getDay()];
  const stillActive = barbers.find(b => b.id === barberFilter &&
    (!b.workingDays || b.workingDays.length === 0 || b.workingDays.includes(dayName)) &&
    !(b.dayHours && b.dayHours[dayName] && b.dayHours[dayName].closed));
  if (!stillActive) setBarberFilter('all');
}, [selectedDate, barbers, barberFilter]);

  const fetchAll = async () => {
    try {
      const [snapshot, barbersSnap, settingsSnap, productsList] = await Promise.all([
        getDocs(query(collection(db, `tenants/${tenantId}/bookings`), orderBy('startTime', 'desc'))),
        getDocs(collection(db, `tenants/${tenantId}/barbers`)),
        getDoc(doc(db, `tenants/${tenantId}/settings/settings`)).catch(() => null),
        getProductsAction().catch(() => []),
      ]);

      const settingsData = settingsSnap && settingsSnap.exists && settingsSnap.exists() ? settingsSnap.data() : {};
      setSpecialHours(normalizeSpecialHours(settingsData && settingsData.specialHours));

      const fetchedBarbers = barbersSnap.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
      setBarbers(fetchedBarbers);
      setProducts((Array.isArray(productsList) ? productsList : []).filter((p) => p && p.active !== false && p.category !== 'Extras'));
      setExtras(getExtrasFromServices(config.services));

      const barberNameById = fetchedBarbers.reduce((acc, b) => {
        if (!b?.name) return acc;
        const keys = [b.docId, b.id].filter(Boolean);
        keys.forEach((k) => { acc[String(k).toLowerCase()] = b.name; });
        return acc;
      }, {});

      const fetchedBookings = snapshot.docs.map(doc => {
        const d = doc.data();
        const startTime = d.startTime?.toDate();
        const date = startTime ? startTime.toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric'
        }) : '';
        const time = startTime ? startTime.toLocaleTimeString('en-GB', {
          hour: 'numeric', minute: '2-digit', hour12: true
        }).toUpperCase() : '';
        const endTimeDate = d.endTime?.toDate?.();
        const endTime = endTimeDate ? endTimeDate.toLocaleTimeString('en-GB', {
          hour: 'numeric', minute: '2-digit', hour12: true
        }).toUpperCase() : null;
        const rawBarber = String(d.barberId || '').trim();
        const barber = d.barberName || barberNameById[rawBarber.toLowerCase()] || rawBarber;
        return {
          ...d,
          name: d.clientName || 'Walk-in',
          email: d.clientEmail || '',
          phone: d.clientPhone || '',
          barber,
          service: String(d.serviceId || d.service || d.serviceName || '').trim(),
          status: normalizeBookingStatus(d.status),
          date,
          time,
          endTime,
          bookingId: d.bookingId || doc.id,
          source: normalizeBookingSource(d.source),
          paidAmount: d.paidAmount ?? '',
          price: d.price ?? '',
        };
      });

      const normalizedBookings = fetchedBookings.map(b => ({ ...b, name: getBookingName(b) }));
      setBookings(normalizedBookings);
      setSelectedBooking(prev => {
        if (!prev) return prev;
        const fresh = normalizedBookings.find(b => b.bookingId === prev.bookingId);
        return fresh || prev;
      });
    } catch (err) {
      console.error('fetchAll error:', err);
    } finally {
      setLoading(false);
      setSelectedDate(d => new Date(d));
    }
  };

  const mergeBookingLocally = useCallback((partial) => {
    if (!partial || !partial.bookingId) return;
    setBookings(prev => {
      const exists = prev.some(b => b.bookingId === partial.bookingId);
      if (exists) {
        return prev.map(b => {
          if (b.bookingId !== partial.bookingId) return b;
          const merged = { ...b, ...partial };
          return { ...merged, name: getBookingName(merged) };
        });
      }
      const normalized = { paidAmount: '', ...partial, name: getBookingName(partial), status: partial.status || 'CONFIRMED' };
      return [normalized, ...prev];
    });
    setSelectedBooking(prev => {
      if (!prev || prev.bookingId !== partial.bookingId) return prev;
      const merged = { ...prev, ...partial };
      return { ...merged, name: getBookingName(merged) };
    });
  }, []);

  const getDraftProductsForBooking = useCallback((booking) => {
    if (!booking) return [];
    const fromDraft = bookingProductsDraft[booking.bookingId];
    if (fromDraft) return normalizeSoldProducts(fromDraft);
    return normalizeSoldProducts(booking.soldProducts);
  }, [bookingProductsDraft]);

  const saveDraftProductsForBooking = useCallback((bookingId, soldProducts) => {
    setBookingProductsDraft((prev) => ({
      ...prev,
      [bookingId]: normalizeSoldProducts(soldProducts),
    }));
    setSelectedBooking((prev) => {
      if (!prev || prev.bookingId !== bookingId) return prev;
      return { ...prev, soldProducts: normalizeSoldProducts(soldProducts) };
    });
  }, []);

  const bookingsByDate = React.useMemo(() => bookings.reduce((acc, b) => {
    if (!acc[b.date]) acc[b.date] = [];
    acc[b.date].push(b);
    return acc;
  }, {}), [bookings]);

  const getForDate = (date) => {
    const list = bookingsByDate[formatDateKey(date)] || [];
    return list
    .filter(b => b.status !== 'CANCELLED' && b.status !== 'BLOCKED')     
    .filter(b => {
        if (barberFilter === 'all') return true;
        const sel = barbers.find(bar => bar.id === barberFilter);
        if (!sel) return true;
        return (b.barber||'').toLowerCase() === sel.name.toLowerCase();
      })
      .sort((a,b) => convertTo24(a.time) - convertTo24(b.time));
  };

const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const activeBarbersForDay = barbers.filter(b => {
  if (!b.workingDays || b.workingDays.length === 0) return true;
  const dayName = DAYS_FULL[selectedDate.getDay()];
  if (!b.workingDays.includes(dayName)) return false;
  if (b.dayHours && b.dayHours[dayName] && b.dayHours[dayName].closed) return false;
  return true;
});



const activeBarbers = barberFilter === 'all'
  ? activeBarbersForDay
  : activeBarbersForDay.filter(b => b.id === barberFilter);
  const statsBookings = view === 'day' ? getForDate(selectedDate)
    : view === 'week' ? getWeekDates(selectedDate).flatMap(d => getForDate(d))
    : view === 'custom' && customRange.start && customRange.end ? (() => {
        const days = [];
        const cur = new Date(customRange.start); cur.setHours(0,0,0,0);
        const end = new Date(customRange.end); end.setHours(23,59,59,999);
        while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate()+1); }
        return days.flatMap(d => getForDate(d));
      })()
    : (() => { const y=currentMonth.getFullYear(), m=currentMonth.getMonth(); return Array.from({length:getDaysInMonth(y,m)},(_,i)=>new Date(y,m,i+1)).flatMap(d=>getForDate(d)); })();
  const checkedOutCount = statsBookings.filter(b => b.status === 'CHECKED_OUT').length;
  const pendingCount = statsBookings.filter(b => b.status === 'PENDING').length;
  const sourceCount = {
    booksy:    statsBookings.filter(b => (b.source||'').toLowerCase() === 'booksy').length,
    fresha:    statsBookings.filter(b => (b.source||'').toLowerCase() === 'fresha').length,
    treatwell: statsBookings.filter(b => (b.source||'').toLowerCase() === 'treatwell').length,
    website:   statsBookings.filter(b => (b.source||'').toLowerCase() === 'website').length,
    walkin:    statsBookings.filter(b => (b.source||'').toLowerCase() === 'walk-in').length,
    app:       statsBookings.filter(b => (b.source||'').toLowerCase() === 'app').length,
  };

  const unpaidCount = statsBookings.filter(b => b.status === 'UNPAID').length;
  const revenue = statsBookings
    .filter(b => b.status === 'CHECKED_OUT')
    .reduce((s, b) => s + bookingNetWithoutTip(b), 0);
  const discountGiven = statsBookings
    .filter(b => b.status === 'CHECKED_OUT')
    .reduce((s, b) => s + pp(b.discount), 0);
  const tipsGiven = statsBookings
    .filter(b => b.status === 'CHECKED_OUT')
    .reduce((s, b) => s + pp(b.tip), 0);
  const now = new Date();
  const needsCheckoutBookings = statsBookings.filter(b => {
    if (b.status !== 'CONFIRMED' && b.status !== 'PENDING') return false;
    const dateKey = b.date || '';
    const timeStr = b.time || '';
    if (!dateKey || !timeStr) return false;
    const mins = convertTo24(timeStr);
    const parts = dateKey.match(/(\d+)\s+(\w+)\s+(\d{4})/);
    if (!parts) return false;
    const bDate = new Date(parts[3], MONTHS.indexOf(parts[2]), parseInt(parts[1]), Math.floor(mins/60), mins%60);
    return bDate < now;
  });
  const needsCheckoutCount = needsCheckoutBookings.length;

  const year = currentMonth.getFullYear(), month = currentMonth.getMonth();
  const calDays = [...Array(getFirstDay(year,month)).fill(null), ...Array.from({length:getDaysInMonth(year,month)},(_,i)=>i+1)];
  const isToday = (d) => { if(!d) return false; const t=new Date(year,month,d); t.setHours(0,0,0,0); return t.getTime()===today.getTime(); };
  const isSel = (d) => d && selectedDate.getDate()===d && selectedDate.getMonth()===month && selectedDate.getFullYear()===year;
  const dayCount = (d) => { if(!d) return 0; return (bookingsByDate[formatDateKey(new Date(year,month,d))]||[]).filter(b=>b.status!=='CANCELLED'&&b.status!=='BLOCKED').length; };

  const navPrev = () => {
    if (view==='day') setSelectedDate(new Date(selectedDate.getTime()-86400000));
    else if (view==='week') setSelectedDate(new Date(selectedDate.getTime()-7*86400000));
    else setCurrentMonth(new Date(year,month-1,1));
  };
  const navNext = () => {
    if (view==='day') setSelectedDate(new Date(selectedDate.getTime()+86400000));
    else if (view==='week') setSelectedDate(new Date(selectedDate.getTime()+7*86400000));
    else setCurrentMonth(new Date(year,month+1,1));
  };

  const periodLabel = view==='day'
    ? selectedDate.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})
    : view==='week'
      ? (()=>{const w=getWeekDates(selectedDate);return w[0].toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' - '+w[6].toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});})()
    : view==='custom' && customRange.start && customRange.end
      ? (()=>{const fmt=d=>d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});return fmt(customRange.start)+' – '+fmt(customRange.end);})()
      : MONTHS[month]+' '+year;

  const weekDates = getWeekDates(selectedDate);
  const openNewBooking = (barber, hour, mins) => { setFormPreset({ barber, hour, mins, date: selectedDate }); setSelectedBooking(null); setShowForm(true); setShowWalkIn(false); setShowBlockTime(false); setShowBookingProducts(false); setShowProductSale(false); };
  const handleBookingClick = (b) => { setShowForm(false); setShowWalkIn(false); setShowBlockTime(false); setShowProductSale(false); setSelectedBooking(selectedBooking?.bookingId === b.bookingId ? null : b); if (selectedBooking?.bookingId === b.bookingId) setShowBookingProducts(false); };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'8px', height:'calc(100vh - 80px)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
        <div style={{ display:'flex', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'6px', overflow:'hidden' }}>
          {['day','week','month','custom'].map(v=>(
            <button key={v} onClick={()=>{setView(v);setSelectedBooking(null);setShowForm(false);setShowWalkIn(false);setShowBlockTime(false);setShowBookingProducts(false);setShowProductSale(false);}}
              style={{ padding:'5px 11px', border:'none', cursor:'pointer', background:view===v?'#d4af37':'transparent', color:view===v?'#000':'var(--muted)', fontWeight:view===v?'700':'400', fontSize:'0.75rem', textTransform:'capitalize', transition:'all 0.2s' }}>{v}</button>
          ))}
        </div>
        {view !== 'custom' && <>
          <button onClick={navPrev} style={{ background:'transparent', border:'1px solid var(--border)', borderRadius:'5px', color:'#d4af37', width:'24px', height:'24px', cursor:'pointer', fontSize:'0.9rem' }}>&#8249;</button>
          <span style={{ fontSize:'0.78rem', fontWeight:'600', color:'var(--text)', minWidth:'150px', textAlign:'center' }}>{periodLabel}</span>
          <button onClick={navNext} style={{ background:'transparent', border:'1px solid var(--border)', borderRadius:'5px', color:'#d4af37', width:'24px', height:'24px', cursor:'pointer', fontSize:'0.9rem' }}>&#8250;</button>
        </>}
        {view === 'custom' && (
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <input type="date" value={customRange.start ? customRange.start.toISOString().slice(0,10) : ''} onChange={e=>{ const d=e.target.value?new Date(e.target.value):null; setCustomRange(r=>({...r,start:d})); }}
              style={{ padding:'4px 8px', borderRadius:'5px', border:'1px solid var(--border)', background:'var(--card)', color:'var(--text)', fontSize:'0.75rem', cursor:'pointer' }} />
            <span style={{ color:'var(--muted)', fontSize:'0.75rem' }}>→</span>
            <input type="date" value={customRange.end ? customRange.end.toISOString().slice(0,10) : ''} onChange={e=>{ const d=e.target.value?new Date(e.target.value):null; setCustomRange(r=>({...r,end:d})); }}
              style={{ padding:'4px 8px', borderRadius:'5px', border:'1px solid var(--border)', background:'var(--card)', color:'var(--text)', fontSize:'0.75rem', cursor:'pointer' }} />
            {customRange.start && customRange.end && <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>{periodLabel}</span>}
          </div>
        )}
        <button onClick={()=>{setSelectedDate(new Date());setCurrentMonth(new Date());setSelectedBooking(null);setShowForm(false);setShowWalkIn(false);setShowBlockTime(false);setShowBookingProducts(false);setShowProductSale(false);}}
          style={{ padding:'4px 10px', background:'rgba(212,175,55,0.1)', border:'1px solid rgba(212,175,55,0.3)', borderRadius:'5px', color:'#d4af37', fontSize:'0.72rem', cursor:'pointer' }}>Today</button>
        <div style={{ display:'flex', alignItems:'center', gap:'4px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'6px', padding:'3px 6px' }}>
          <button onClick={()=>setSlotHeight(h=>Math.max(8,h-2))} style={{ background:'transparent', border:'none', color:'#d4af37', cursor:'pointer', fontSize:'1rem', width:'20px', height:'20px' }}>-</button>
          <span style={{ fontSize:'0.62rem', color:'var(--muted)', minWidth:'26px', textAlign:'center' }}>{slotHeight}px</span>
          <button onClick={()=>setSlotHeight(h=>Math.min(36,h+2))} style={{ background:'transparent', border:'none', color:'#d4af37', cursor:'pointer', fontSize:'1rem', width:'20px', height:'20px' }}>+</button>
        </div>
        <div style={{ display:'flex', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'6px', overflow:'hidden' }}>
          <button onClick={()=>setBarberFilter('all')} style={{ padding:'5px 10px', border:'none', cursor:'pointer', background:barberFilter==='all'?'rgba(212,175,55,0.2)':'transparent', color:barberFilter==='all'?'#d4af37':'var(--muted)', fontSize:'0.72rem', fontWeight:'600' }}>All</button>
          {activeBarbersForDay.map(b=>(
            <button key={b.id} onClick={()=>setBarberFilter(b.id)}
              style={{ padding:'5px 10px', border:'none', cursor:'pointer', background:barberFilter===b.id?b.color+'20':'transparent', color:barberFilter===b.id?b.color:'var(--muted)', fontSize:'0.72rem', fontWeight:'600', display:'flex', alignItems:'center', gap:'4px', opacity:isBarberBookingDisabled(b)?0.6:1 }}>
              <div style={{ width:'5px', height:'5px', borderRadius:'50%', background:b.color }} />{b.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap', padding:'4px 0' }}>
        <button onClick={()=>setPillsCollapsed(v=>!v)}
          style={{ padding:'4px 8px', background:'transparent', border:'1px solid var(--border2)', borderRadius:'99px', color:'var(--muted)', cursor:'pointer', fontSize:'0.65rem', flexShrink:0, transition:'all 0.12s' }}
          title={pillsCollapsed ? 'Show stats' : 'Hide stats'}>
          {pillsCollapsed ? '▶' : '◀'}
        </button>
        {!pillsCollapsed && visiblePills.has('total') && <StatPill label="Total" value={statsBookings.length} color="#d4af37" active={pillFilter==='total'} onClick={()=>setPillFilter(pillFilter==='total'?null:'total')} />}
        {!pillsCollapsed && visiblePills.has('confirmed') && <StatPill label="Confirmed" value={statsBookings.filter(b=>b.status==='CONFIRMED').length} color="#4caf50" active={pillFilter==='confirmed'} onClick={()=>setPillFilter(pillFilter==='confirmed'?null:'confirmed')} />}
        {!pillsCollapsed && visiblePills.has('pending') && pendingCount > 0 && <StatPill label="Pending" value={pendingCount} color="#ff9800" active={pillFilter==='pending'} onClick={()=>setPillFilter(pillFilter==='pending'?null:'pending')} />}
        {!pillsCollapsed && visiblePills.has('checkedout') && <StatPill label="Checked Out" value={checkedOutCount} color="#2196f3" active={pillFilter==='checkedout'} onClick={()=>setPillFilter(pillFilter==='checkedout'?null:'checkedout')} />}
        {!pillsCollapsed && unpaidCount > 0 && <StatPill label="Unpaid" value={unpaidCount} color="#ff5252" active={pillFilter==='unpaid'} onClick={()=>setPillFilter(pillFilter==='unpaid'?null:'unpaid')} />}
        {!pillsCollapsed && isAdmin && visiblePills.has('revenue') && <StatPill label="Revenue" value={'£'+revenue.toFixed(2)} color="#d4af37" active={pillFilter==='revenue'} onClick={()=>setPillFilter(pillFilter==='revenue'?null:'revenue')} />}
        {!pillsCollapsed && isAdmin && visiblePills.has('discount') && <StatPill label="Discount Given" value={'£'+discountGiven.toFixed(2)} color="#4caf50" active={pillFilter==='discount'} onClick={()=>setPillFilter(pillFilter==='discount'?null:'discount')} />}
        {!pillsCollapsed && isAdmin && visiblePills.has('tips') && <StatPill label="Tips" value={'£'+tipsGiven.toFixed(2)} color="#ff9800" active={pillFilter==='tips'} onClick={()=>setPillFilter(pillFilter==='tips'?null:'tips')} />}

        {/* Gear button — fixed far right, same size as bell */}
        <div style={{ position:'fixed', top:'12px', right:'24px', zIndex:210 }}>
          <button onClick={()=>setShowPillSettings(v=>!v)}
            style={{ width:'42px', height:'42px', display:'flex', alignItems:'center', justifyContent:'center', background: showPillSettings ? 'rgba(212,175,55,0.18)' : 'var(--card)', border:'1px solid ' + (showPillSettings ? '#d4af37' : 'var(--border)'), borderRadius:'50%', color: showPillSettings ? '#d4af37' : 'var(--muted)', cursor:'pointer', fontSize:'0.9rem', transition:'all 0.15s' }}
            title="Customise pills">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          {showPillSettings && (
            <div style={{ position:'fixed', top:'62px', right:'24px', background:'var(--card2)', border:'1px solid rgba(212,175,55,0.3)', borderRadius:'12px', padding:'14px', zIndex:210, minWidth:'210px', boxShadow:'0 8px 32px rgba(0,0,0,0.45)' }}>
              <div style={{ fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', fontWeight:'700', marginBottom:'10px' }}>Show / Hide Pills</div>
              {[
                {key:'total',       label:'Total',          color:'#d4af37'},
                {key:'confirmed',   label:'Confirmed',      color:'#4caf50'},
                {key:'pending',     label:'Pending',        color:'#ff9800'},
                {key:'checkedout',  label:'Checked Out',    color:'#2196f3'},
                isAdmin && {key:'revenue',     label:'Revenue',        color:'#d4af37'},
                isAdmin && {key:'discount',    label:'Discount Given', color:'#4caf50'},
                isAdmin && {key:'tips',        label:'Tips',           color:'#ff9800'},
              ].filter(Boolean).map(p => (
                <label key={p.key} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'5px 0', cursor:'pointer', userSelect:'none' }}>
                  <div onClick={()=>togglePillVisibility(p.key)}
                    style={{ width:'32px', height:'18px', borderRadius:'9px', background: visiblePills.has(p.key) ? p.color : 'rgba(180,180,180,0.2)', position:'relative', transition:'background 0.2s', flexShrink:0, cursor:'pointer' }}>
                    <div style={{ position:'absolute', top:'2px', left: visiblePills.has(p.key) ? '16px' : '2px', width:'14px', height:'14px', borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)' }} />
                  </div>
                  <span style={{ fontSize:'0.78rem', color: visiblePills.has(p.key) ? 'var(--text)' : 'var(--muted)', fontWeight: visiblePills.has(p.key) ? '600' : '400' }}>{p.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {pillFilter && (()=>{
        const filterMap = {
          total: ()=>true,
          confirmed: b=>b.status==='CONFIRMED',
          pending: b=>b.status==='PENDING',
          checkedout: b=>b.status==='CHECKED_OUT',
          unpaid: b=>b.status==='UNPAID',
          needscheckout: b=>{
            if(b.status!=='CONFIRMED'&&b.status!=='PENDING') return false;
            const mins=convertTo24(b.time||'');
            const parts=(b.date||'').match(/(\d+)\s+(\w+)\s+(\d{4})/);
            if(!parts) return false;
            const bDate=new Date(parts[3],MONTHS.indexOf(parts[2]),parseInt(parts[1]),Math.floor(mins/60),mins%60);
            return bDate<now;
          },
          revenue: b=>b.status==='CHECKED_OUT',
          discount: b=>b.status==='CHECKED_OUT' && pp(b.discount) > 0,
          tips: b=>b.status==='CHECKED_OUT' && pp(b.tip) > 0,
          booksy: b=>(b.source||'').toLowerCase()==='booksy',
          fresha: b=>(b.source||'').toLowerCase()==='fresha',
          treatwell: b=>(b.source||'').toLowerCase()==='treatwell',
          website: b=>(b.source||'').toLowerCase()==='website',
          walkin: b=>(b.source||'').toLowerCase()==='walk-in',
          app: b=>(b.source||'').toLowerCase()==='app',
          // Show all bookings with products sold, whether with a service or standalone product sales
          productsale: b=>getProductsTotal(b.soldProducts)>0,
          // Only show bookings with add-ons (soldAddOns)
          addonsale: b=>Array.isArray(b.soldAddOns) && b.soldAddOns.length>0 && getProductsTotal(b.soldAddOns)>0,
        };
        const pillColors = { total:'#d4af37', confirmed:'#4caf50', pending:'#ff9800', checkedout:'#2196f3', unpaid:'#ff5252', needscheckout:'#ff5252', revenue:'#d4af37', discount:'#4caf50', tips:'#ff9800', booksy:'#9c27b0', fresha:'#2196f3', treatwell:'#ff7043', website:'#4caf50', walkin:'#ff9800', productsale:'#03a9f4' };
        const pillLabels = { total:'Total', confirmed:'Confirmed', pending:'Pending', checkedout:'Checked Out', unpaid:'Unpaid', needscheckout:'Needs Checkout', revenue:'Revenue', discount:'Discount Given', tips:'Tips', booksy:'Booksy', fresha:'Fresha', treatwell:'Treatwell', website:'Website', walkin:'Walk-in', app:'App', productsale:'Products Sold' };
        const filtered = pillFilter === 'needscheckout' ? needsCheckoutBookings : statsBookings.filter(filterMap[pillFilter]||filterMap.total);
        const pillColor = pillColors[pillFilter]||'#d4af37';
        return (
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'12px', overflow:'hidden' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderBottom:'1px solid var(--border)', background:pillColor+'08' }}>
              <span style={{ fontSize:'0.72rem', fontWeight:'700', color:pillColor, letterSpacing:'1px', textTransform:'uppercase' }}>{pillLabels[pillFilter]||pillFilter.toUpperCase()} — {filtered.length} booking{filtered.length!==1?'s':''}</span>
              <button onClick={()=>setPillFilter(null)} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'1.1rem', lineHeight:1 }}>✕</button>
            </div>
            <div style={{ maxHeight:'260px', overflowY:'auto' }}>
              {filtered.length===0 ? (
                <div style={{ padding:'20px', textAlign:'center', color:'var(--muted)', fontSize:'0.82rem' }}>No bookings</div>
              ) : filtered.map((b,i)=>{
                const svcObj = config.services ? config.services.find(s=>s.id===b.service) : null;
                const svcName = svcObj ? svcObj.name : (b.service||'—');
                const statusColors = { CONFIRMED:'#4caf50', PENDING:'#ff9800', CHECKED_OUT:'#2196f3', CANCELLED:'#ff5252' };
                const amt = pillFilter === 'revenue'
                  ? bookingNetWithoutTip(b)
                  : pillFilter === 'discount'
                    ? pp(b.discount)
                  : (pp(b.paidAmount) || pp(b.price));
                return (
                  <div key={i} onClick={()=>{ if(b.startTime){ const d=b.startTime?.toDate ? b.startTime.toDate() : new Date(b.startTime); setSelectedDate(d); setView('day'); } setSelectedBooking(b); setPillFilter(null); }}
                    style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background 0.15s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:getBColor(b.barber,barbers), flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'0.82rem', fontWeight:'600', color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.name}</div>
                      <div style={{ fontSize:'0.68rem', color:'var(--muted)' }}>{b.date} {b.time} · {svcName}</div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      {isAdmin && <div style={{ fontSize:'0.75rem', fontWeight:'700', color:'#d4af37' }}>{amt>0?'£'+amt.toFixed(2):''}</div>}
                      <div style={{ fontSize:'0.6rem', color:statusColors[b.status]||'var(--muted)', fontWeight:'600' }}>{b.status}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div style={{ flex:1, display:'flex', overflow:'hidden', position:'relative' }}>
          {view === 'day' && (
            <>
              {loading ? (
                <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}>Loading...</div>
              ) : (
                <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0, position:'relative' }}>
                  {(selectedBooking || showForm || showWalkIn || showBlockTime || showBookingProducts || showCheckout || showReceipt) && (
                    <div
                      onClick={closeAllPanels}
                      onWheel={e => {
                        const el = e.currentTarget;
                        el.style.pointerEvents = 'none';
                        const under = document.elementFromPoint(e.clientX, e.clientY);
                        el.style.pointerEvents = '';
                        if (under) under.dispatchEvent(new WheelEvent('wheel', { deltaY: e.deltaY, deltaX: e.deltaX, deltaMode: e.deltaMode, bubbles: true, cancelable: true }));
                      }}
                      style={{ position:'absolute', inset:0, zIndex:5, cursor:'default' }}
                    />
                  )}
                  <TimeGrid date={selectedDate} bookings={(bookingsByDate[formatDateKey(selectedDate)] || []).filter(b => b.status !== 'CANCELLED')} barbers={activeBarbers} slotHeight={slotHeight} specialHours={specialHours} onSlotClick={openNewBooking} onWalkIn={(barber, hour, mins) => { setFormPreset({barber, hour, mins, date: selectedDate}); setSelectedBooking(null); setShowWalkIn(true); setShowBlockTime(false); setShowForm(false); setShowBookingProducts(false); setShowProductSale(false); }} onBlockTime={(barber, hour, mins) => { setFormPreset({barber, hour, mins, date: selectedDate}); setShowBlockTime(true); setShowWalkIn(false); setShowForm(false); setShowBookingProducts(false); setShowProductSale(false); }} onBookingClick={handleBookingClick} selectedBooking={selectedBooking} onAnySlotClick={() => { setShowWalkIn(false); setShowForm(false); setShowBlockTime(false); setShowBookingProducts(false); setShowProductSale(false); setSelectedBooking(null); }} />
                  <div style={{ flexShrink:0, background:'var(--card)', borderTop:'1px solid var(--border)', borderBottomLeftRadius:'12px', borderBottomRightRadius:'12px', display:'flex', alignItems:'center', gap:'0', padding:'0 16px', height:'40px', overflowX:'auto' }}>
                    {[
                      { key:'booksy',    label:'Booksy',   color:'#9c27b0', count: sourceCount.booksy },
                      { key:'fresha',    label:'Fresha',   color:'#2196f3', count: sourceCount.fresha },
                      { key:'treatwell', label:'Treatwell',color:'#ff7043', count: sourceCount.treatwell },
                      { key:'website',   label:'Website',  color:'#4caf50', count: sourceCount.website },
                      { key:'walkin',    label:'Walk-in',  color:'#ff9800', count: sourceCount.walkin },
                      { key:'app',       label:'App',      color:'#e91e63', count: sourceCount.app },
                    ].flatMap((s, i, arr) => [
                      <div key={s.key} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'0 12px', height:'100%' }}>
                        <div style={{ width:'6px', height:'6px', borderRadius:'50%', background: s.count > 0 ? s.color : 'var(--muted2)', flexShrink:0 }} />
                        <span style={{ fontSize:'0.72rem', fontWeight:'500', color:'var(--muted)', whiteSpace:'nowrap' }}>{s.label}</span>
                        <span style={{ fontSize:'0.72rem', fontWeight:'800', color: s.count > 0 ? s.color : 'var(--muted2)', minWidth:'12px' }}>{s.count}</span>
                      </div>,
                      i < arr.length - 1 && <div key={s.key+'-sep'} style={{ width:'1px', height:'16px', background:'var(--border)', flexShrink:0 }} />,
                    ])}
                  </div>
                </div>
              )}
              {(selectedBooking || showForm || showWalkIn || showBlockTime || showBookingProducts) && <ResizeHandle onResize={() => {}} />}
              {selectedBooking && !showForm && !showWalkIn && !showBlockTime && (
                <BookingDetail
                  booking={selectedBooking} barbers={barbers} allBookings={bookings}
                  isAdmin={isAdmin}
                  onClose={()=>setSelectedBooking(null)}
                  onEdit={(b)=>{ setFormPreset({booking:b,date:selectedDate}); setShowForm(true); setShowWalkIn(false); setShowBlockTime(false); setShowBookingProducts(false); setShowProductSale(false); }}
                  onDelete={(b)=>{ setBookings(prev => prev.filter(bk => bk.bookingId !== b.bookingId)); setSelectedBooking(null); fetchAll(); }}
                  onCheckout={()=>{
                    const draftedProducts = getDraftProductsForBooking(selectedBooking);
                    setSelectedBooking((prev) => prev ? { ...prev, soldProducts: draftedProducts } : prev);
                    setIsEditCheckout(false);
                    setShowCheckout(true);
                  }}
                  onAddProducts={()=>{ setShowBookingProducts(true); }}
                  onViewReceipt={()=>setShowReceipt(true)}
                  onStatusChange={(bookingId, newStatus)=>{
                    setSelectedBooking(prev => prev && prev.bookingId === bookingId ? { ...prev, status: newStatus } : prev);
                    fetchAll();
                  }}
                />
              )}
              {showBookingProducts && selectedBooking && (
                <BookingProductsPanel
                  booking={selectedBooking}
                  products={products}
                  initialProducts={getDraftProductsForBooking(selectedBooking)}
                  onClose={() => setShowBookingProducts(false)}
                  onSave={(list) => {
                    saveDraftProductsForBooking(selectedBooking.bookingId, list);
                    setShowBookingProducts(false);
                  }}
                />
              )}
              {showForm && (
                <BookingForm
                  existingBookings={bookings} preBarber={formPreset.barber} preHour={formPreset.hour} preMins={formPreset.mins}
                  preDate={formPreset.date} preBooking={formPreset.booking} barbers={barbers}
                  specialHours={specialHours}
                  onClose={()=>setShowForm(false)}
                  onSaved={(savedBooking, goCheckout)=>{
                    mergeBookingLocally(savedBooking);
                    setTimeout(()=>fetchAll(),2000); setTimeout(()=>fetchAll(),5000);
                    if (goCheckout && savedBooking) { setSelectedBooking(savedBooking); setShowForm(false); setIsEditCheckout(false); setShowCheckout(true); }
                  }}
                />
              )}
              {showWalkIn && (
                <WalkInForm
                  preBarber={formPreset.barber} preHour={formPreset.hour} preMins={formPreset.mins} preDate={formPreset.date} barbers={barbers} existingBookings={bookings}
                  specialHours={specialHours}
                  products={products}
                  onClose={() => setShowWalkIn(false)}
                  onSaved={(savedBooking, goCheckout) => {
                    mergeBookingLocally(savedBooking);
                    setTimeout(() => fetchAll(), 2000); setTimeout(() => fetchAll(), 5000);
                    if (goCheckout && savedBooking) { setSelectedBooking(savedBooking); setShowWalkIn(false); setIsEditCheckout(false); setShowCheckout(true); }
                  }}
                />
              )}
              {showBlockTime && (
                <BlockTimeForm
                  preBarber={formPreset.barber} preHour={formPreset.hour} preDate={formPreset.date} barbers={barbers}
                  specialHours={specialHours}
                  onClose={() => setShowBlockTime(false)}
                  onSaved={() => { setTimeout(() => fetchAll(), 2000); setTimeout(() => fetchAll(), 5000); setShowBlockTime(false); }}
                />
              )}
              {showCheckout && selectedBooking && (
                <CheckoutPanel
                  booking={selectedBooking}
                  barbers={barbers}
                  products={products}
                  extras={extras}
                  isEdit={isEditCheckout}
                  onClose={()=>setShowCheckout(false)}
                  onComplete={(result)=>{
                    if (selectedBooking && result) {
                      mergeBookingLocally({
                        bookingId: selectedBooking.bookingId,
                        status: result.method === 'UNPAID' ? 'UNPAID' : 'CHECKED_OUT',
                        paymentMethod: result.method === 'UNPAID' ? (selectedBooking.paymentMethod || '') : result.method,
                        paidAmount: result.method === 'UNPAID' ? '' : result.total,
                        discount: result.discount || 0,
                        tip: result.tip || 0,
                        splitSecond: result.splitSecond || '',
                        splitAmount: result.splitAmount || 0,
                        soldProducts: normalizeSoldProducts(result.soldProducts || selectedBooking.soldProducts),
                        serviceCharge: result.serviceCharge || 0,
                      });
                      setBookingProductsDraft((prev) => {
                        const next = { ...prev };
                        delete next[selectedBooking.bookingId];
                        return next;
                      });
                    }
                    setShowCheckout(false);
                    setSelectedBooking(null);
                    setIsEditCheckout(false);
                    setTimeout(()=>fetchAll(),2000);
                  }}
                />
              )}
              {showReceipt && selectedBooking && (
                <ReceiptPanel booking={selectedBooking} barbers={barbers} clientData={clientData} onClose={()=>setShowReceipt(false)} onEdit={()=>{ setShowReceipt(false); setIsEditCheckout(true); setShowCheckout(true); }} />
              )}
            </>
          )}
          {view === 'week' && (
          <div style={{ flex:1, background:'var(--card)', border:'1px solid var(--border)', borderRadius:'12px', overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid var(--border)' }}>
              {weekDates.map((wd,i)=>{
                const isWToday=wd.toDateString()===new Date().toDateString();
                const cnt=getForDate(wd).length;
                return (
                  <div key={i} onClick={()=>{setSelectedDate(wd);setView('day');}}
                    style={{ padding:'12px 8px', textAlign:'center', cursor:'pointer', background:isWToday?'rgba(212,175,55,0.08)':'transparent', borderRight:i<6?'1px solid var(--border)':'none' }}
                    onMouseEnter={e=>{if(!isWToday)e.currentTarget.style.background='rgba(212,175,55,0.04)';}}
                    onMouseLeave={e=>{if(!isWToday)e.currentTarget.style.background='transparent';}}>
                    <div style={{ fontSize:'0.6rem', color:'var(--muted)', letterSpacing:'1px', marginBottom:'4px' }}>{DAYS_SHORT[i]}</div>
                    <div style={{ fontSize:'1.1rem', fontWeight:'700', color:isWToday?'#d4af37':'var(--text)', marginBottom:'4px' }}>{wd.getDate()}</div>
                    {cnt>0&&<div style={{ fontSize:'0.6rem', color:'#d4af37', background:'rgba(212,175,55,0.15)', borderRadius:'8px', padding:'1px 5px', display:'inline-block' }}>{cnt}</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ flex:1, display:'grid', gridTemplateColumns:'repeat(7,1fr)', overflowY:'auto' }}>
              {weekDates.map((wd,i)=>{
                const dayBs=getForDate(wd);
                return (
                  <div key={i} style={{ padding:'8px 6px', borderRight:i<6?'1px solid var(--border)':'none', minHeight:'160px' }}>
                    {dayBs.map((b,j)=>(
                      <div key={j} onClick={()=>{setSelectedDate(wd);setSelectedBooking(b);setView('day');}}
                        style={{ padding:'5px 7px', borderRadius:'5px', background:getBColor(b.barber,barbers)+'15', borderLeft:'3px solid '+getBColor(b.barber,barbers), marginBottom:'4px', cursor:'pointer' }}
                        onMouseEnter={e=>e.currentTarget.style.background=getBColor(b.barber,barbers)+'25'}
                        onMouseLeave={e=>e.currentTarget.style.background=getBColor(b.barber,barbers)+'15'}>
                        <div style={{ fontSize:'0.62rem', color:'#d4af37', fontWeight:'700' }}>{b.time}</div>
                        <div style={{ fontSize:'0.68rem', color:'var(--text)', fontWeight:'600', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{getBookingName(b)}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === 'month' && (
          <div style={{ flex:1, background:'var(--card)', border:'1px solid var(--border)', borderRadius:'12px', overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid var(--border)' }}>
              {DAYS_SHORT.map(d=><div key={d} style={{ padding:'10px', textAlign:'center', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1px' }}>{d}</div>)}
            </div>
            <div style={{ flex:1, display:'grid', gridTemplateColumns:'repeat(7,1fr)', gridAutoRows:'1fr', overflowY:'auto' }}>
              {calDays.map((d,i)=>{
                const tod=isToday(d);
                const dayBs=d?(bookingsByDate[formatDateKey(new Date(year,month,d))]||[]).filter(b=>b.status!=='CANCELLED'&&b.status!=='BLOCKED').filter(b=>barberFilter==='all'||(b.barber||'').toLowerCase()===(barbers.find(bar=>bar.id===barberFilter)||{name:''}).name.toLowerCase()):[];
                return (
                  <div key={i} onClick={()=>{if(d){setSelectedDate(new Date(year,month,d));setView('day');setSelectedBooking(null);setShowForm(false);setShowWalkIn(false);setShowBlockTime(false);setShowBookingProducts(false);setShowProductSale(false);}}}
                    style={{ padding:'5px', borderRight:(i+1)%7!==0?'1px solid var(--border)':'none', borderBottom:'1px solid var(--border)', cursor:d?'pointer':'default', background:tod?'rgba(212,175,55,0.04)':'transparent', minHeight:'68px' }}
                    onMouseEnter={e=>{if(d&&!tod)e.currentTarget.style.background='rgba(212,175,55,0.02)';}}
                    onMouseLeave={e=>{if(d&&!tod)e.currentTarget.style.background='transparent';}}>
                    {d&&<>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'3px' }}>
                        <span style={{ fontSize:'0.72rem', fontWeight:tod?'800':'500', color:tod?'#d4af37':'var(--text)', width:'20px', height:'20px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', background:tod?'rgba(212,175,55,0.2)':'transparent' }}>{d}</span>
                        {dayBs.length>0&&<span style={{ fontSize:'0.58rem', color:'#d4af37', background:'rgba(212,175,55,0.15)', borderRadius:'8px', padding:'1px 4px' }}>{dayBs.length}</span>}
                      </div>
                      {dayBs.slice(0,2).map((b,j)=>(
                        <div key={j} style={{ fontSize:'0.6rem', color:'var(--text)', background:getBColor(b.barber,barbers)+'15', borderLeft:'2px solid '+getBColor(b.barber,barbers), padding:'1px 4px', borderRadius:'3px', marginBottom:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {b.time} {getBookingName(b)}
                        </div>
                      ))}
                      {dayBs.length>2&&<div style={{ fontSize:'0.56rem', color:'var(--muted)', paddingLeft:'3px' }}>+{dayBs.length-2} more</div>}
                    </>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(showPillSettings || fabOpen) && (
          <div onClick={() => { setShowPillSettings(false); setFabOpen(false); }}
               style={{ position:'fixed', inset:0, zIndex:99, background:'transparent' }} />
        )}

        <div style={{ position:'fixed', bottom:'32px', right:'32px', display:'flex', flexDirection:'column', gap:'8px', alignItems:'flex-end', zIndex:200 }}>
          {fabOpen && (
            <>
              <button onClick={()=>{ setFabOpen(false); setView('day'); setSelectedBooking(null); setShowWalkIn(false); setShowBlockTime(false); setShowBookingProducts(false); setShowProductSale(false); setFormPreset({date:selectedDate}); setShowForm(true); }}
                style={{ padding:'10px 20px', borderRadius:'24px', background:'var(--card)', border:'1px solid rgba(212,175,55,0.4)', color:'#d4af37', fontSize:'0.8rem', cursor:'pointer', fontWeight:'700', boxShadow:'0 4px 12px rgba(0,0,0,0.3)', whiteSpace:'nowrap' }}>
                📅 Booking
              </button>
              <button onClick={()=>{ setFabOpen(false); setView('day'); setSelectedBooking(null); setShowForm(false); setShowBlockTime(false); setShowBookingProducts(false); setShowProductSale(false); setFormPreset({date:selectedDate}); setShowWalkIn(true); }}
                style={{ padding:'10px 20px', borderRadius:'24px', background:'var(--card)', border:'1px solid rgba(255,152,0,0.4)', color:'#ff9800', fontSize:'0.8rem', cursor:'pointer', fontWeight:'700', boxShadow:'0 4px 12px rgba(0,0,0,0.3)', whiteSpace:'nowrap' }}>
                🚶 Walk-in
              </button>
              <button onClick={()=>{ setFabOpen(false); setView('day'); setSelectedBooking(null); setShowForm(false); setShowWalkIn(false); setShowBookingProducts(false); setShowProductSale(false); setFormPreset({date:selectedDate}); setShowBlockTime(true); }}
                style={{ padding:'10px 20px', borderRadius:'24px', background:'var(--card)', border:'1px solid rgba(255,82,82,0.4)', color:'#ff5252', fontSize:'0.8rem', cursor:'pointer', fontWeight:'700', boxShadow:'0 4px 12px rgba(0,0,0,0.3)', whiteSpace:'nowrap' }}>
                🚫 Block Time
              </button>
              <button onClick={()=>{ setFabOpen(false); setView('day'); setSelectedBooking(null); setShowForm(false); setShowWalkIn(false); setShowBlockTime(false); setShowBookingProducts(false); setShowProductSale(true); }}
                style={{ padding:'10px 20px', borderRadius:'24px', background:'var(--card)', border:'1px solid rgba(33,150,243,0.45)', color:'#8bc4ff', fontSize:'0.8rem', cursor:'pointer', fontWeight:'700', boxShadow:'0 4px 12px rgba(0,0,0,0.3)', whiteSpace:'nowrap' }}>
                🛒 Product Sale
              </button>
            </>
          )}
          <button
            onClick={()=>setFabOpen(o=>!o)}
            style={{ width:'52px', height:'52px', borderRadius:'50%', background:'linear-gradient(135deg,#d4af37,#b8860b)', border:'none', color:'#000', fontSize:'1.6rem', cursor:'pointer', boxShadow:'0 4px 20px rgba(212,175,55,0.4)', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.2s', transform: fabOpen?'rotate(45deg)':'rotate(0deg)' }}
            onMouseEnter={e=>e.currentTarget.style.boxShadow='0 6px 24px rgba(212,175,55,0.6)'}
            onMouseLeave={e=>e.currentTarget.style.boxShadow='0 4px 20px rgba(212,175,55,0.4)'}>+</button>
        </div>
        {showProductSale && (
          <div style={{ position:'fixed', right:'96px', bottom:'32px', zIndex:201 }}>
            <ProductSalePanel
              barbers={activeBarbersForDay.length ? activeBarbersForDay : barbers}
              products={products}
              onClose={() => setShowProductSale(false)}
              onSaved={(saleBooking) => {
                mergeBookingLocally(saleBooking);
                setTimeout(() => fetchAll(), 1500);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}