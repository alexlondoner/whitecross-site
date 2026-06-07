
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import config from '../config';
import PageHeader from '../components/PageHeader';
import { db } from '../firebase';
import { collection, getDocs, addDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { deleteBooking, getActiveTenant } from '../firestoreActions';
import StatPill from '../components/StatPill';


const PAGE_SIZE = 100;

const STATUS_COLORS = {
  CONFIRMED:   '#4caf50',
  PENDING:     '#ff9800',
  CANCELLED:   '#ff5252',
  CHECKED_OUT: '#2196f3',
  UNPAID:      '#ff5252',
};

const SOURCE_COLORS = {
  Booksy:          { color: '#9c27b0', bg: 'rgba(156,39,176,0.15)' },
  Fresha:          { color: '#2196f3', bg: 'rgba(33,150,243,0.15)' },
  Treatwell:       { color: '#ff7043', bg: 'rgba(255,112,67,0.15)' },
  Website:         { color: '#4caf50', bg: 'rgba(76,175,80,0.15)'  },
  'Walk-in':       { color: '#ff9800', bg: 'rgba(255,152,0,0.15)'  },
  'Product Sale':  { color: '#03a9f4', bg: 'rgba(3,169,244,0.15)'  },
};

function normalizeSource(src) {
  const s = String(src || '').trim().toLowerCase();
  if (!s || s === 'historical' || s === 'walk_in' || s === 'walkin' || s === 'walk-in') return 'Walk-in';
  if (s === 'product sale' || s === 'product_sale' || s === 'productsale') return 'Product Sale';
  if (s === 'booksy')     return 'Booksy';
  if (s === 'fresha')     return 'Fresha';
  if (s === 'treatwell')  return 'Treatwell';
  if (s === 'website')    return 'Website';
  return src;
}

function soldProductsTotal(b) {
  const list = Array.isArray(b?.soldProducts) ? b.soldProducts : [];
  return list.reduce((s, p) => {
    const price = parseFloat(String(p?.price || '0').replace(/[£,]/g, '')) || 0;
    return s + price * (parseInt(p?.qty, 10) || 0);
  }, 0);
}
function soldAddOnsTotal(b) {
  const list = Array.isArray(b?.soldAddOns) ? b.soldAddOns : [];
  return list.reduce((s, p) => {
    const price = parseFloat(String(p?.price || '0').replace(/[£,]/g, '')) || 0;
    return s + price * (parseInt(p?.qty, 10) || 1);
  }, 0);
}
function bookingNet(b) {
  const src = String(b.source || '').trim().toLowerCase();
  const isProductSale = src === 'product sale' || src === 'product_sale' || src === 'productsale';
  const serviceGross = isProductSale ? 0 : parsePrice(b.price) + parsePrice(b.serviceCharge);
  return Math.max(0,
    serviceGross + soldProductsTotal(b) + soldAddOnsTotal(b)
    - parsePrice(b.discount) - (parsePrice(b.loyaltyPointsRedeemed) / 20)
  );
}

function parsePrice(p) {
  return parseFloat(String(p || '0').replace(/[^0-9.]/g, '')) || 0;
}

function periodDateRange(period, anchor) {
  const now = anchor || new Date();
  switch (period) {
    case 'today': {
      const s = new Date(now); s.setHours(0, 0, 0, 0);
      const e = new Date(now); e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }
    case 'week': {
      const day = now.getDay();
      const s = new Date(now); s.setDate(now.getDate() - (day === 0 ? 6 : day - 1)); s.setHours(0, 0, 0, 0);
      const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }
    case 'month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start: s, end: e };
    }
    case '3months': {
      const s = new Date(now); s.setMonth(s.getMonth() - 3); s.setDate(1); s.setHours(0, 0, 0, 0);
      return { start: s, end: now };
    }
    case 'year': {
      const s = new Date(now.getFullYear(), 0, 1);
      const e = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start: s, end: e };
    }
    default:
      return null;
  }
}

function periodLabel(period, anchor) {
  const now = anchor || new Date();
  if (period === 'today') return now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  if (period === 'week') {
    const day = now.getDay();
    const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return mon.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' – ' + sun.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (period === 'month') return now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  if (period === 'year') return String(now.getFullYear());
  return null;
}

function stepAnchor(period, anchor, dir) {
  const d = new Date(anchor || new Date());
  if (period === 'today') d.setDate(d.getDate() + dir);
  else if (period === 'week') d.setDate(d.getDate() + dir * 7);
  else if (period === 'month') d.setMonth(d.getMonth() + dir);
  else if (period === 'year') d.setFullYear(d.getFullYear() + dir);
  return d;
}

export default function Bookings({ isAdmin }) {
  const [bookings, setBookings]       = useState([]);
  const [barbers, setBarbers]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [totalFetched, setTotalFetched] = useState(0);

  // New client modal state
  const [showAddClient, setShowAddClient] = useState(false);
  const [addClientForm, setAddClientForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [addClientSaving, setAddClientSaving] = useState(false);
  const [addClientError, setAddClientError] = useState('');
  const [newClientId, setNewClientId] = useState(null);

  const [periodFilter, setPeriodFilter] = useState('month');
  const [navAnchor, setNavAnchor]       = useState(new Date());
  const [search, setSearch]             = useState('');
  const [activeFilter, setActiveFilter] = useState(null);
  const [barberFilter, setBarberFilter] = useState('all');
  const [sortBy, setSortBy]             = useState('date');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [expandedGroupId, setExpandedGroupId] = useState(null);
  const [groupMembersCache, setGroupMembersCache] = useState({});

  const toggleGroupExpand = (b) => {
    if (!b.groupId) return;
    const gid = b.groupId;
    setExpandedGroupId(prev => prev === gid ? null : gid);
    if (!groupMembersCache[gid]) {
      getDocs(query(collection(db, `${getActiveTenant()}/bookings`), where('groupId', '==', gid)))
        .then(snap => {
          const members = snap.docs.map(d => d.data())
            .filter(m => m.bookingId !== b.bookingId)
            .sort((a, c) => (a.groupIndex ?? 99) - (c.groupIndex ?? 99));
          setGroupMembersCache(prev => ({ ...prev, [gid]: members }));
        }).catch(() => {});
    }
  };

  const navPeriods = ['today', 'week', 'month', 'year'];
  const canNav = navPeriods.includes(periodFilter);

  const changePeriod = (key) => { setPeriodFilter(key); setNavAnchor(new Date()); setActiveFilter(null); };
  const nav = (dir) => setNavAnchor(a => stepAnchor(periodFilter, a, dir));
  const goToday = () => { setPeriodFilter('today'); setNavAnchor(new Date()); };

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [periodFilter, navAnchor, search, activeFilter, barberFilter, sortBy]);

  const toggleFilter = (key) => setActiveFilter(prev => prev === key ? null : key);

  const handleDeleteCancelled = async (bookingId) => {
    setDeletingId(bookingId);
    try {
      await deleteBooking(bookingId);
      setBookings(prev => prev.filter(b => b.bookingId !== bookingId));
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Could not delete booking. Please try again.');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const fetchAll = useCallback(async (_period) => {
    setLoading(true);
    try {
      const [barbersSnap] = await Promise.all([
        getDocs(collection(db, `${getActiveTenant()}/barbers`)),
      ]);
      const fetchedBarbers = barbersSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
      setBarbers(fetchedBarbers);

      const barberNameById = fetchedBarbers.reduce((acc, b) => {
        if (!b?.name) return acc;
        [b.docId, b.id].filter(Boolean).forEach(k => { acc[String(k).toLowerCase()] = b.name; });
        return acc;
      }, {});

      // Fetch all bookings with no Firestore ordering/filtering — any orderBy/where
      // silently excludes docs where that field is missing or wrong type (XLS imports).
      // All sorting and period filtering happens client-side.
      const bookingsSnap = await getDocs(collection(db, `${getActiveTenant()}/bookings`));
      setTotalFetched(bookingsSnap.size);

      const fetchedBookings = bookingsSnap.docs.map(doc => {
        const d = doc.data();
        // Handle Timestamp, plain Date, number (ms), or string
        let startTime = null;
        if (d.startTime) {
          if (typeof d.startTime.toDate === 'function') {
            startTime = d.startTime.toDate();
          } else if (d.startTime instanceof Date) {
            startTime = d.startTime;
          } else if (typeof d.startTime === 'number') {
            startTime = new Date(d.startTime);
          } else if (typeof d.startTime === 'string') {
            const parsed = new Date(d.startTime);
            if (!isNaN(parsed)) startTime = parsed;
          }
        }
        const date = startTime ? startTime.toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        }) : '';
        const time = startTime ? startTime.toLocaleTimeString('en-GB', {
          hour: 'numeric', minute: '2-digit', hour12: true,
        }).toUpperCase() : '';
        const rawBarber = String(d.barberId || d.barber || '').trim();
        const barber = d.barberName || barberNameById[rawBarber.toLowerCase()] || rawBarber;
        return {
          ...d,
          name:       d.clientName || d.name || 'Walk-in',
          email:      d.clientEmail || d.email || '',
          phone:      d.clientPhone || d.phone || '',
          barber,
          service:    d.serviceId || d.service || '',
          date,
          time,
          startTime,
          bookingId:  d.bookingId || doc.id,
          source:       normalizeSource(d.source),
          paidAmount:   d.paidAmount || '',
          price:        d.price || '',
          soldProducts: d.soldProducts || [],
        };
      });

      setBookings(fetchedBookings);
    } catch (err) {
      console.error('fetchAll error:', err);
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Base: period + search + barber only — used for pill counts so they stay stable
  const baseFiltered = useMemo(() => {
    const range = periodDateRange(periodFilter, navAnchor);
    const searchLc = search.toLowerCase();
    return bookings
      .filter(b => b.status !== 'BLOCKED')
      .filter(b => {
        if (!range) return true;
        if (!b.startTime) return false;
        return b.startTime >= range.start && b.startTime <= range.end;
      })
      .filter(b => !search || (
        (b.name   || '').toLowerCase().includes(searchLc) ||
        (b.service|| '').toLowerCase().includes(searchLc) ||
        String(b.phone || '').includes(search) ||
        String(b.bookingId || '').toLowerCase().includes(searchLc)
      ))
      .filter(b => barberFilter === 'all' || (b.barber || '').toLowerCase() === barberFilter.toLowerCase());
  }, [bookings, search, barberFilter, periodFilter, navAnchor]);

  const filtered = useMemo(() => {
    const STATUS_FILTER_MAP = { confirmed:'CONFIRMED', pending:'PENDING', checkedout:'CHECKED_OUT', cancelled:'CANCELLED', noshow:'NO_SHOW', unpaid:'UNPAID' };
    const SOURCE_FILTER_MAP = { booksy:'Booksy', fresha:'Fresha', treatwell:'Treatwell', website:'Website', walkin:'Walk-in', productsale:'Product Sale' };
    return baseFiltered
      .filter(b => {
        if (!activeFilter) return true;
        if (STATUS_FILTER_MAP[activeFilter]) return b.status === STATUS_FILTER_MAP[activeFilter];
        if (SOURCE_FILTER_MAP[activeFilter]) return b.source === SOURCE_FILTER_MAP[activeFilter];
        return true;
      })
      .sort((a, b2) => {
        if (sortBy === 'price') return parsePrice(b2.price) - parsePrice(a.price);
        if (sortBy === 'date_asc') return (a.startTime?.getTime() || 0) - (b2.startTime?.getTime() || 0);
        return (b2.startTime?.getTime() || 0) - (a.startTime?.getTime() || 0);
      });
  }, [baseFiltered, activeFilter, sortBy]);

  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const stats = useMemo(() => ({
    total:   baseFiltered.length,
    revenue: baseFiltered.filter(b => b.status === 'CHECKED_OUT').reduce((s, b) => s + bookingNet(b), 0),
  }), [baseFiltered]);

  const exportCSV = () => {
    const rows = [['Name','Service','Date','Time','Barber','Status','Price','Paid','Source','Payment','Phone','Email','ID']];
    filtered.forEach(b => {
      rows.push([b.name,b.service,b.date,b.time,b.barber,b.status,b.price,b.paidAmount,b.source,b.paymentMethod,b.phone,b.email,b.bookingId]);
    });
    const csv = rows.map(r => r.map(v => `"${v||''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'bookings.csv'; a.click();
  };

  const PERIOD_LABELS = { today: 'Day', week: 'Week', month: 'Month', '3months': '3 Months', year: 'Year', all: 'All Time' };

  const statPills = [
      { key: 'confirmed',  label: 'Confirmed',   value: baseFiltered.filter(b => b.status === 'CONFIRMED').length,   color: '#4caf50' },
      { key: 'pending',    label: 'Pending',      value: baseFiltered.filter(b => b.status === 'PENDING').length,     color: '#ff9800' },
      { key: 'checkedout', label: 'Checked Out',  value: baseFiltered.filter(b => b.status === 'CHECKED_OUT').length, color: '#2196f3' },
      { key: 'unpaid',     label: 'Unpaid',       value: baseFiltered.filter(b => b.status === 'UNPAID').length,      color: '#ff5252' },
      { key: 'cancelled',  label: 'Cancelled',    value: baseFiltered.filter(b => b.status === 'CANCELLED').length,   color: '#ff5252' },
      { key: 'noshow',     label: 'No Show',      value: baseFiltered.filter(b => b.status === 'NO_SHOW').length,     color: '#9c27b0' },
    ];
  const sourcePills = [
    { key: 'booksy',      label: 'Booksy',        value: baseFiltered.filter(b => b.source === 'Booksy').length,         color: '#9c27b0' },
    { key: 'fresha',      label: 'Fresha',         value: baseFiltered.filter(b => b.source === 'Fresha').length,         color: '#2196f3' },
    { key: 'treatwell',   label: 'Treatwell',      value: baseFiltered.filter(b => b.source === 'Treatwell').length,      color: '#ff7043' },
    { key: 'website',     label: 'Website',        value: baseFiltered.filter(b => b.source === 'Website').length,        color: '#4caf50' },
    { key: 'walkin',      label: 'Walk-in',        value: baseFiltered.filter(b => b.source === 'Walk-in').length,        color: '#ff9800' },
    { key: 'productsale', label: 'Product Sale',   value: baseFiltered.filter(b => b.source === 'Product Sale').length,   color: '#03a9f4' },
  ].filter(p => p.value > 0 || p.key === 'walkin' || p.key === 'booksy');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Add New Client Modal */}
      {showAddClient && (
        <div style={{ position: 'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.18)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:'12px', boxShadow:'0 2px 24px #0002', padding:'32px 28px', minWidth:'320px', maxWidth:'90vw', position:'relative' }}>
            <button onClick={()=>setShowAddClient(false)} style={{ position:'absolute', top:10, right:12, background:'none', border:'none', color:'#888', fontSize:'1.3rem', cursor:'pointer' }}>×</button>
            <h2 style={{ fontSize:'1.1rem', marginBottom:'18px', color:'#d4af37' }}>Add New Client</h2>
            <form onSubmit={async e => {
              e.preventDefault();
              setAddClientSaving(true); setAddClientError('');
              try {
                if (!addClientForm.name.trim()) throw new Error('Name is required');
                const docRef = await addDoc(collection(db, `${getActiveTenant()}/clients`), {
                  ...addClientForm,
                  createdAt: serverTimestamp(),
                });
                setNewClientId(docRef.id);
                setShowAddClient(false);
                setAddClientForm({ name: '', phone: '', email: '', notes: '' });
                // Optionally: show a toast or feedback
              } catch (err) {
                setAddClientError(err.message || 'Failed to add client');
              } finally {
                setAddClientSaving(false);
              }
            }}>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:'0.8rem', color:'#888', fontWeight:600 }}>Name*</label>
                <input style={{ width:'100%', padding:'8px', borderRadius:'6px', border:'1px solid #ccc', marginTop:4 }}
                  value={addClientForm.name} onChange={e=>setAddClientForm(f=>({...f, name:e.target.value}))} required />
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:'0.8rem', color:'#888', fontWeight:600 }}>Phone</label>
                <input style={{ width:'100%', padding:'8px', borderRadius:'6px', border:'1px solid #ccc', marginTop:4 }}
                  value={addClientForm.phone} onChange={e=>setAddClientForm(f=>({...f, phone:e.target.value}))} />
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:'0.8rem', color:'#888', fontWeight:600 }}>Email</label>
                <input style={{ width:'100%', padding:'8px', borderRadius:'6px', border:'1px solid #ccc', marginTop:4 }}
                  value={addClientForm.email} onChange={e=>setAddClientForm(f=>({...f, email:e.target.value}))} />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:'0.8rem', color:'#888', fontWeight:600 }}>Notes</label>
                <textarea style={{ width:'100%', padding:'8px', borderRadius:'6px', border:'1px solid #ccc', marginTop:4, minHeight:40 }}
                  value={addClientForm.notes} onChange={e=>setAddClientForm(f=>({...f, notes:e.target.value}))} />
              </div>
              {addClientError && <div style={{ color:'#ff5252', marginBottom:10 }}>{addClientError}</div>}
              <button type="submit" disabled={addClientSaving} style={{ background:'#d4af37', color:'#222', fontWeight:700, border:'none', borderRadius:'6px', padding:'10px 22px', fontSize:'1rem', cursor:'pointer' }}>{addClientSaving ? 'Saving…' : 'Add Client'}</button>
            </form>
          </div>
        </div>
      )}

      <PageHeader
        title="All Bookings"
        subtitle={loading ? 'Loading...' : `${filtered.length} shown${totalFetched !== filtered.length ? ` of ${totalFetched} fetched` : ''}`}
        actions={
          <button onClick={exportCSV} style={{ padding: '9px 16px', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '8px', color: '#d4af37', cursor: 'pointer', fontWeight: '600', fontSize: '0.82rem' }}>
            Export CSV
          </button>
        }
      />

      {/* Period selector + nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          {Object.entries(PERIOD_LABELS).map(([key, label]) => (
            <button key={key} onClick={() => changePeriod(key)}
              style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.5px', transition: 'all 0.15s',
                background: periodFilter === key ? '#d4af37' : 'transparent',
                color:      periodFilter === key ? '#000' : 'var(--muted)',
              }}>
              {label}
            </button>
          ))}
        </div>
        {canNav && <>
          <button onClick={() => nav(-1)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', color: '#d4af37', width: '30px', height: '30px', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <span style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--text)', minWidth: '180px', textAlign: 'center' }}>{periodLabel(periodFilter, navAnchor)}</span>
          <button onClick={() => nav(1)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', color: '#d4af37', width: '30px', height: '30px', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
          <button onClick={goToday} style={{ padding: '7px 14px', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px', color: '#d4af37', fontSize: '0.78rem', cursor: 'pointer', fontWeight: '600' }}>Today</button>
        </>}
      </div>

      {/* Stat pills — clickable filters */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <StatPill label="Total" value={stats.total} color="#d4af37" active={!activeFilter} onClick={() => setActiveFilter(null)} />
        {statPills.map(p => (
          <StatPill key={p.key} label={p.label} value={p.value} color={p.color} active={activeFilter === p.key} onClick={() => toggleFilter(p.key)} />
        ))}
        <div style={{ width:'1px', background:'var(--border)', alignSelf:'stretch', margin:'0 2px' }} />
        {sourcePills.map(p => (
          <StatPill key={p.key} label={p.label} value={p.value} color={p.color} active={activeFilter === p.key} onClick={() => toggleFilter(p.key)} />
        ))}
        <StatPill label="Revenue" value={'£' + stats.revenue.toFixed(2)} color="#d4af37" />
      </div>

      {/* Search + Barber tabs + Sort */}
        <div style={{ display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap' }}>
          {/* Add New Client Button */}
          <button onClick={()=>setShowAddClient(true)} style={{ background:'#d4af37', color:'#222', fontWeight:700, border:'none', borderRadius:'6px', padding:'8px 18px', fontSize:'0.92rem', cursor:'pointer', marginRight:10 }}>
            + Add New Client
          </button>
        <input
          placeholder="Search name, service, phone, ID..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex:1, minWidth:'200px', padding:'9px 14px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', outline:'none', fontSize:'0.82rem' }}
        />
        <div style={{ display:'flex', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden' }}>
          <button onClick={() => setBarberFilter('all')}
            style={{ padding:'9px 14px', border:'none', cursor:'pointer', background:barberFilter==='all'?'rgba(212,175,55,0.2)':'transparent', color:barberFilter==='all'?'#d4af37':'var(--muted)', fontSize:'0.78rem', fontWeight:'600', transition:'all 0.15s' }}>All</button>
          {barbers.map(b => (
            <button key={b.id||b.docId} onClick={() => setBarberFilter((b.name||'').toLowerCase())}
              style={{ padding:'9px 14px', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px', fontSize:'0.78rem', fontWeight:'600', transition:'all 0.15s',
                background: barberFilter===(b.name||'').toLowerCase() ? (b.color||'#d4af37')+'20' : 'transparent',
                color:      barberFilter===(b.name||'').toLowerCase() ? (b.color||'#d4af37') : 'var(--muted)',
              }}>
              <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:b.color||'#d4af37' }} />
              {b.name}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden' }}>
          {[['date','Newest'],['date_asc','Oldest'],['price','Price ↓']].map(([val, label]) => (
            <button key={val} onClick={() => setSortBy(val)}
              style={{ padding:'9px 14px', border:'none', cursor:'pointer', background:sortBy===val?'rgba(212,175,55,0.2)':'transparent', color:sortBy===val?'#d4af37':'var(--muted)', fontSize:'0.78rem', fontWeight:'600', transition:'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1fr 1fr 1fr 1fr', padding: '10px 16px', background: 'rgba(212,175,55,0.05)', borderBottom: '1px solid var(--border)' }}>
          {['Customer','Service','Date & Time','Barber','Status','Source','Amount'].map(h => (
            <span key={h} style={{ fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: '600' }}>{h}</span>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px', color: 'var(--muted)', fontSize: '0.85rem' }}>
            Loading {PERIOD_LABELS[periodFilter]}...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px', color: 'var(--muted)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📭</div>
            <p style={{ fontSize: '0.85rem' }}>No bookings found for {PERIOD_LABELS[periodFilter]}</p>
          </div>
        ) : (
          <>
            {visibleRows.map((b, i) => {
              const srcStyle = SOURCE_COLORS[b.source] || SOURCE_COLORS['Walk-in'];
              const barberObj = barbers.find(bar => (bar.name || '').toLowerCase() === (b.barber || '').toLowerCase());
              const barberColor = barberObj?.color || '#7a7260';
              const isProductSale = b.source === 'Product Sale';
              const svcName = isProductSale
                ? (Array.isArray(b.soldProducts) && b.soldProducts.length
                    ? b.soldProducts.map(p => p.name).filter(Boolean).join(', ')
                    : 'Product Sale')
                : (config.services
                    ? (config.services.find(s => s.id === b.service) || {}).name || b.service
                    : b.service);
              // For group bookings, servicePrice holds individual service price; price holds group total for lead
              const rawPrice = b.groupId && b.servicePrice != null ? b.servicePrice : b.price;
              const displayAmount = isProductSale
                ? (soldProductsTotal(b) > 0 ? '£' + soldProductsTotal(b).toFixed(2) : (b.paidAmount ? '£' + b.paidAmount : '—'))
                : (rawPrice != null && rawPrice !== '' ? '£' + parsePrice(rawPrice).toFixed(2) : (b.paidAmount ? '£' + parsePrice(b.paidAmount).toFixed(2) : '—'));
              const isCancelled = b.status === 'CANCELLED';
              const isConfirming = confirmDeleteId === b.bookingId;
              const isDeleting   = deletingId === b.bookingId;
              return (
                <React.Fragment key={b.bookingId + i}>
                <div
                  style={{ position: 'relative', display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1fr 1fr 1fr 1fr', padding: '11px 16px', borderBottom: b.groupId && expandedGroupId === b.groupId ? 'none' : '1px solid var(--border)', transition: 'background 0.1s', background: isConfirming ? 'rgba(255,82,82,0.04)' : 'transparent' }}
                  onMouseEnter={e => { if (!isConfirming) e.currentTarget.style.background = 'rgba(212,175,55,0.03)'; }}
                  onMouseLeave={e => { if (!isConfirming) e.currentTarget.style.background = 'transparent'; }}>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text)' }}>{b.name}</span>
                      {b.groupId && (
                        <button onClick={() => toggleGroupExpand(b)} style={{ fontSize: '0.55rem', fontWeight: '700', color: '#d4af37', background: expandedGroupId === b.groupId ? 'rgba(212,175,55,0.2)' : 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '4px', padding: '1px 5px', cursor: 'pointer', lineHeight: 1.6 }}>
                          👥 GROUP ×{b.groupSize || 2} {expandedGroupId === b.groupId ? '▲' : '▼'}
                        </button>
                      )}
                    </div>
                    {b.phone && <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{b.phone}</span>}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.76rem', color: isProductSale ? '#03a9f4' : 'var(--text)', fontStyle: isProductSale ? 'italic' : 'normal' }}>{svcName}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text)' }}>{b.date}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{b.time}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: barberColor, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.76rem', color: 'var(--text)' }}>{(b.barber || '').toUpperCase()}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '0.58rem', fontWeight: '700', color: STATUS_COLORS[b.status] || 'var(--muted)', background: (STATUS_COLORS[b.status] || '#888') + '18', letterSpacing: '0.5px' }}>
                        {b.status === 'CHECKED_OUT' ? 'PAID' : b.status}
                      </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '0.58rem', fontWeight: '700', color: srcStyle.color, background: srcStyle.bg, letterSpacing: '0.5px' }}>
                        {b.source}
                      </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: '700', color: isProductSale ? '#03a9f4' : '#d4af37' }}>{displayAmount}</span>
                    {!isProductSale && b.status !== 'CHECKED_OUT' && (b.platformDepositAmount > 0 || (b.paymentType === 'DEPOSIT' && b.paidAmount)) && (
                      <span style={{ fontSize: '0.62rem', color: '#4caf50' }}>Dep: £{parsePrice(b.platformDepositAmount || b.paidAmount).toFixed(2).replace(/\.00$/, '')}</span>
                    )}
                    {b.status === 'CHECKED_OUT' && b.paymentMethod && (
                      <span style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>{b.paymentMethod}</span>
                    )}
                  </div>

                  {isCancelled && isAdmin && (
                    <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {isConfirming ? (
                        <>
                          <button
                            onClick={() => handleDeleteCancelled(b.bookingId)}
                            disabled={isDeleting}
                            style={{ padding: '4px 8px', background: 'rgba(255,82,82,0.15)', border: '1px solid rgba(255,82,82,0.4)', borderRadius: '5px', color: '#ff5252', cursor: 'pointer', fontSize: '0.65rem', fontWeight: '700' }}>
                            {isDeleting ? '…' : '✓ Delete'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            style={{ padding: '4px 6px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.65rem' }}>
                            ✕
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(b.bookingId)}
                          style={{ padding: '3px 7px', background: 'transparent', border: '1px solid rgba(255,82,82,0.2)', borderRadius: '5px', color: 'rgba(255,82,82,0.5)', cursor: 'pointer', fontSize: '0.68rem', transition: 'all 0.15s', lineHeight: 1 }}
                          title="Delete booking">
                          🗑
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {b.groupId && expandedGroupId === b.groupId && (
                  <div style={{ padding: '8px 16px 10px 28px', borderBottom: '1px solid var(--border)', background: 'rgba(212,175,55,0.03)' }}>
                    {(groupMembersCache[b.groupId] || []).length === 0 ? (
                      <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Loading members…</span>
                    ) : (groupMembersCache[b.groupId] || []).map((m, mi) => {
                      const mSvcName = config.services
                        ? (config.services.find(s => s.id === (m.serviceId || m.service)) || {}).name || m.serviceId || m.service || '–'
                        : m.serviceId || m.service || '–';
                      return (
                        <div key={m.bookingId || mi} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0', fontSize: '0.72rem', color: 'var(--text)' }}>
                          <span style={{ color: '#d4af37', fontWeight: '700', minWidth: '60px' }}>Person {(m.groupIndex ?? mi) + 1}</span>
                          <span style={{ color: 'var(--muted)' }}>{(m.barberName || m.barber || '').toUpperCase()}</span>
                          <span>·</span>
                          <span>{m.time || '–'}</span>
                          <span>·</span>
                          <span>{mSvcName}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                </React.Fragment>
              );
            })}

            {/* Load more */}
            {filtered.length > visibleCount && (
              <div style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                <button onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  style={{ padding: '9px 24px', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '8px', color: '#d4af37', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}>
                  Show {Math.min(PAGE_SIZE, filtered.length - visibleCount)} more ({filtered.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
