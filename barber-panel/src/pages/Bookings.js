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

function periodDateRange(period) {
  const now = new Date();
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

export default function Bookings() {
  const [bookings, setBookings]       = useState([]);
  const [barbers, setBarbers]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [totalFetched, setTotalFetched] = useState(0);

  const [periodFilter, setPeriodFilter] = useState('month');
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [barberFilter, setBarberFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortBy, setSortBy]           = useState('date');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset visible count whenever filters/period change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [periodFilter, search, statusFilter, barberFilter, sourceFilter, sortBy]);

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

  const filtered = useMemo(() => {
    const range = periodDateRange(periodFilter);
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
      .filter(b => statusFilter === 'all' || b.status === statusFilter)
      .filter(b => barberFilter === 'all' || (b.barber || '').toLowerCase() === barberFilter.toLowerCase())
      .filter(b => {
        if (sourceFilter === 'all') return true;
        return b.source === sourceFilter;
      })
      .sort((a, b2) => {
        if (sortBy === 'price') return parsePrice(b2.price) - parsePrice(a.price);
        if (sortBy === 'date_asc') return (a.startTime?.getTime() || 0) - (b2.startTime?.getTime() || 0);
        return (b2.startTime?.getTime() || 0) - (a.startTime?.getTime() || 0); // date desc default
      });
  }, [bookings, search, statusFilter, barberFilter, sourceFilter, sortBy, periodFilter]);

  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const stats = useMemo(() => ({
    total:      filtered.length,
    confirmed:  filtered.filter(b => b.status === 'CONFIRMED').length,
    checkedOut: filtered.filter(b => b.status === 'CHECKED_OUT').length,
    cancelled:  filtered.filter(b => b.status === 'CANCELLED').length,
    revenue:    filtered.filter(b => b.status === 'CHECKED_OUT').reduce((s, b) => s + parsePrice(b.paidAmount), 0),
  }), [filtered]);

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

  const inpStyle = { padding: '9px 12px', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', outline: 'none', fontSize: '0.82rem' };

  const PERIOD_LABELS = { today: 'Today', week: 'This Week', month: 'This Month', '3months': 'Last 3 Months', year: 'This Year', all: 'All Time' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

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

      {/* Period selector */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {Object.entries(PERIOD_LABELS).map(([key, label]) => (
          <button key={key} onClick={() => setPeriodFilter(key)}
            style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.5px', transition: 'all 0.15s',
              background: periodFilter === key ? 'linear-gradient(135deg,#d4af37,#b8860b)' : 'var(--card2)',
              color:      periodFilter === key ? '#000' : 'var(--muted)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total',       value: stats.total,        color: '#d4af37' },
          { label: 'Confirmed',   value: stats.confirmed,    color: '#4caf50' },
          { label: 'Checked Out', value: stats.checkedOut,   color: '#2196f3' },
          { label: 'Cancelled',   value: stats.cancelled,    color: '#ff5252' },
          { label: 'Revenue',     value: '£' + stats.revenue, color: '#d4af37' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 18px', background: s.color + '12', border: '1px solid ' + s.color + '30', borderRadius: '10px', minWidth: '80px' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: '800', color: s.color }}>{s.value}</span>
            <span style={{ fontSize: '0.58rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginTop: '2px' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', background: 'var(--card)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <input
          placeholder="Search name, service, phone, ID..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inpStyle, flex: 1, minWidth: '200px' }}
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={inpStyle}>
          <option value="all">All Status</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="PENDING">Pending</option>
          <option value="CHECKED_OUT">Checked Out</option>
          <option value="UNPAID">Unpaid</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={inpStyle}>
          <option value="all">All Sources</option>
          <option value="Booksy">Booksy</option>
          <option value="Fresha">Fresha</option>
          <option value="Website">Website</option>
          <option value="Walk-in">Walk-in</option>
        </select>
        <select value={barberFilter} onChange={e => setBarberFilter(e.target.value)} style={inpStyle}>
          <option value="all">All Barbers</option>
          {barbers.map(b => <option key={b.id || b.docId} value={(b.name || '').toLowerCase()}>{b.name}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inpStyle}>
          <option value="date">Newest First</option>
          <option value="date_asc">Oldest First</option>
          <option value="price">Highest Price</option>
        </select>
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
