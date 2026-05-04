import React, { useEffect, useMemo, useState, useCallback } from 'react';
import config from '../config';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

const PAGE_SIZE = 100;

const STATUS_COLORS = {
  CONFIRMED:   '#4caf50',
  PENDING:     '#ff9800',
  CANCELLED:   '#ff5252',
  CHECKED_OUT: '#2196f3',
  UNPAID:      '#ff5252',
};

const SOURCE_COLORS = {
  Booksy:    { color: '#9c27b0', bg: 'rgba(156,39,176,0.15)' },
  Fresha:    { color: '#2196f3', bg: 'rgba(33,150,243,0.15)' },
  Website:   { color: '#4caf50', bg: 'rgba(76,175,80,0.15)' },
  'Walk-in': { color: '#ff9800', bg: 'rgba(255,152,0,0.15)'  },
};

// Historical, walk_in, walkin, empty → Walk-in
function normalizeSource(src) {
  const s = String(src || '').trim().toLowerCase();
  if (!s || s === 'historical' || s === 'walk_in' || s === 'walkin' || s === 'walk-in') return 'Walk-in';
  if (s === 'booksy')  return 'Booksy';
  if (s === 'fresha')  return 'Fresha';
  if (s === 'website') return 'Website';
  return src;
}

function parsePrice(p) {
  return parseInt(String(p || '0').replace('£', '').trim()) || 0;
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

export default function Bookings() {
  const [bookings, setBookings]       = useState([]);
  const [barbers, setBarbers]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [totalFetched, setTotalFetched] = useState(0);

  const [periodFilter, setPeriodFilter] = useState('month');
  const [navAnchor, setNavAnchor]       = useState(new Date());
  const [search, setSearch]             = useState('');
  const [activeFilter, setActiveFilter] = useState(null);
  const [barberFilter, setBarberFilter] = useState('all');
  const [sortBy, setSortBy]             = useState('date');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const navPeriods = ['today', 'week', 'month', 'year'];
  const canNav = navPeriods.includes(periodFilter);

  const changePeriod = (key) => { setPeriodFilter(key); setNavAnchor(new Date()); setActiveFilter(null); };
  const nav = (dir) => setNavAnchor(a => stepAnchor(periodFilter, a, dir));
  const goToday = () => setNavAnchor(new Date());

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [periodFilter, navAnchor, search, activeFilter, barberFilter, sortBy]);

  const toggleFilter = (key) => setActiveFilter(prev => prev === key ? null : key);

  const fetchAll = useCallback(async (_period) => {
    setLoading(true);
    try {
      const [barbersSnap] = await Promise.all([
        getDocs(collection(db, 'tenants/whitecross/barbers')),
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
      const bookingsSnap = await getDocs(collection(db, 'tenants/whitecross/bookings'));
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
        const rawBarber = String(d.barberId || '').trim();
        const barber = d.barberName || barberNameById[rawBarber.toLowerCase()] || rawBarber;
        return {
          ...d,
          name:       d.clientName || 'Walk-in',
          email:      d.clientEmail || '',
          phone:      d.clientPhone || '',
          barber,
          service:    d.serviceId || '',
          date,
          time,
          startTime,
          bookingId:  d.bookingId || doc.id,
          source:     normalizeSource(d.source),
          paidAmount: d.paidAmount || '',
          price:      d.price || '',
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
    const SOURCE_FILTER_MAP = { booksy:'Booksy', fresha:'Fresha', website:'Website', walkin:'Walk-in' };
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
    revenue: baseFiltered.filter(b => b.status === 'CHECKED_OUT').reduce((s, b) => s + parsePrice(b.paidAmount), 0),
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
    { key: 'cancelled',  label: 'Cancelled',    value: baseFiltered.filter(b => b.status === 'CANCELLED').length,   color: '#ff5252' },
    { key: 'noshow',     label: 'No Show',      value: baseFiltered.filter(b => b.status === 'NO_SHOW').length,     color: '#9c27b0' },
  ];
  const sourcePills = [
    { key: 'booksy',  label: 'Booksy',   value: baseFiltered.filter(b => b.source === 'Booksy').length,   color: '#9c27b0' },
    { key: 'fresha',  label: 'Fresha',   value: baseFiltered.filter(b => b.source === 'Fresha').length,   color: '#2196f3' },
    { key: 'website', label: 'Website',  value: baseFiltered.filter(b => b.source === 'Website').length,  color: '#4caf50' },
    { key: 'walkin',  label: 'Walk-in',  value: baseFiltered.filter(b => b.source === 'Walk-in').length,  color: '#ff9800' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', color: '#d4af37', marginBottom: '4px' }}>All Bookings</h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
            {loading ? 'Loading...' : `${filtered.length} shown${totalFetched !== filtered.length ? ` of ${totalFetched} fetched` : ''}`}
          </p>
        </div>
        <button onClick={exportCSV} style={{ padding: '9px 16px', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '8px', color: '#d4af37', cursor: 'pointer', fontWeight: '600', fontSize: '0.82rem' }}>
          Export CSV
        </button>
      </div>

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
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div onClick={() => setActiveFilter(null)}
          style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'12px 20px', background: !activeFilter ? 'rgba(212,175,55,0.25)' : 'rgba(212,175,55,0.1)', border:'1px solid '+(!activeFilter ? '#d4af37' : 'rgba(212,175,55,0.3)'), borderRadius:'10px', minWidth:'80px', cursor:'pointer', transition:'all 0.15s' }}
          onMouseEnter={e=>e.currentTarget.style.background='rgba(212,175,55,0.2)'}
          onMouseLeave={e=>e.currentTarget.style.background=!activeFilter?'rgba(212,175,55,0.25)':'rgba(212,175,55,0.1)'}>
          <span style={{ fontSize:'1.4rem', fontWeight:'800', color:'#d4af37' }}>{stats.total}</span>
          <span style={{ fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1px', textTransform:'uppercase', marginTop:'2px' }}>Total</span>
        </div>
        {statPills.map(p => (
          <div key={p.key} onClick={() => toggleFilter(p.key)}
            style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'12px 20px', background: activeFilter===p.key ? p.color+'25' : p.color+'10', border:'1px solid '+(activeFilter===p.key ? p.color : p.color+'30'), borderRadius:'10px', minWidth:'80px', cursor:'pointer', transition:'all 0.15s' }}
            onMouseEnter={e=>e.currentTarget.style.background=p.color+'20'}
            onMouseLeave={e=>e.currentTarget.style.background=activeFilter===p.key?p.color+'25':p.color+'10'}>
            <span style={{ fontSize:'1.4rem', fontWeight:'800', color:p.color }}>{p.value}</span>
            <span style={{ fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1px', textTransform:'uppercase', marginTop:'2px' }}>{p.label}</span>
          </div>
        ))}
        <div style={{ width:'1px', background:'var(--border)', alignSelf:'stretch', margin:'0 4px' }} />
        {sourcePills.map(p => (
          <div key={p.key} onClick={() => toggleFilter(p.key)}
            style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'12px 20px', background: activeFilter===p.key ? p.color+'25' : p.color+'10', border:'1px solid '+(activeFilter===p.key ? p.color : p.color+'30'), borderRadius:'10px', minWidth:'80px', cursor:'pointer', transition:'all 0.15s' }}
            onMouseEnter={e=>e.currentTarget.style.background=p.color+'20'}
            onMouseLeave={e=>e.currentTarget.style.background=activeFilter===p.key?p.color+'25':p.color+'10'}>
            <span style={{ fontSize:'1.4rem', fontWeight:'800', color:p.color }}>{p.value}</span>
            <span style={{ fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1px', textTransform:'uppercase', marginTop:'2px' }}>{p.label}</span>
          </div>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontSize:'0.72rem', fontWeight:'800', color:'#d4af37' }}>£{stats.revenue}</span>
          <span style={{ fontSize:'0.58rem', color:'var(--muted)', letterSpacing:'1px', textTransform:'uppercase' }}>Revenue</span>
        </div>
      </div>

      {/* Search + Barber tabs + Sort */}
      <div style={{ display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap' }}>
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
              const svcName = config.services
                ? (config.services.find(s => s.id === b.service) || {}).name || b.service
                : b.service;
              return (
                <div key={b.bookingId + i}
                  style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1fr 1fr 1fr 1fr', padding: '11px 16px', borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text)' }}>{b.name}</span>
                    {b.phone && <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{b.phone}</span>}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text)' }}>{svcName}</span>
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
                    <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#d4af37' }}>{b.price}</span>
                    {b.paidAmount && b.paidAmount !== b.price && (
                      <span style={{ fontSize: '0.62rem', color: '#4caf50' }}>Paid: {b.paidAmount}</span>
                    )}
                    {b.status === 'CHECKED_OUT' && b.paymentMethod && (
                      <span style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>{b.paymentMethod}</span>
                    )}
                  </div>
                </div>
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
