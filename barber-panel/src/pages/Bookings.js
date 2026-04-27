import React, { useEffect, useMemo, useState } from 'react';
import config from '../config';
import { db } from '../firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';

const STATUS_COLORS = {
  CONFIRMED: '#4caf50',
  PENDING: '#ff9800',
  CANCELLED: '#ff5252',
  CHECKED_OUT: '#2196f3',
  UNPAID: '#ff5252',
};

const SOURCE_COLORS = {
  Booksy: { color: '#9c27b0', bg: 'rgba(156,39,176,0.15)' },
  Fresha: { color: '#2196f3', bg: 'rgba(33,150,243,0.15)' },
  Website: { color: '#4caf50', bg: 'rgba(76,175,80,0.15)' },
  'Walk-in': { color: '#ff9800', bg: 'rgba(255,152,0,0.15)' },
};

function parsePrice(p) {
  if (!p) return 0;
  return parseInt(String(p).replace('£', '').trim()) || 0;
}

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [barbers, setBarbers] = useState(config.barbers || []);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [barberFilter, setBarberFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');

  useEffect(() => { fetchAll(); }, []);

const fetchAll = async () => {
  try {
    const [bookingsSnap, barbersSnap] = await Promise.all([
      getDocs(query(collection(db, 'tenants/whitecross/bookings'), orderBy('startTime', 'desc'))),
      getDocs(collection(db, 'tenants/whitecross/barbers')),
    ]);

    const fetchedBookings = bookingsSnap.docs.map(doc => {
      const d = doc.data();
      const startTime = d.startTime?.toDate();
      const date = startTime ? startTime.toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric'
      }) : '';
      const time = startTime ? startTime.toLocaleTimeString('en-GB', {
        hour: 'numeric', minute: '2-digit', hour12: true
      }).toUpperCase() : '';
      return {
        ...d,
        name: d.clientName || 'Walk-in',
        email: d.clientEmail || '',
        phone: d.clientPhone || '',
        barber: d.barberId || '',
        service: d.serviceId || '',
        date,
        time,
        bookingId: d.bookingId || doc.id,
        source: d.source || 'website',
        paidAmount: d.paidAmount || '',
        price: d.price || '',
      };
    });

    setBookings(fetchedBookings);

    const fetchedBarbers = barbersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (fetchedBarbers.length > 0) setBarbers(fetchedBarbers);

  } catch (err) {
    console.error('fetchAll error:', err);
    setBookings([]);
  } finally {
    setLoading(false);
  }
};
  const filtered = useMemo(() => {
    return bookings
      .filter(b => search === '' ||
        (b.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (b.service || '').toLowerCase().includes(search.toLowerCase()) ||
        String(b.phone || '').includes(search) ||
        String(b.bookingId || '').toLowerCase().includes(search.toLowerCase())
      )
      .filter(b => statusFilter === 'all' || b.status === statusFilter)
      .filter(b => barberFilter === 'all' || (b.barber || '').toLowerCase() === barberFilter.toLowerCase())
      .filter(b => {
        if (sourceFilter === 'all') return true;
        if (sourceFilter === 'Website') return b.source === 'Website';
        if (sourceFilter === 'Walk-in') return b.source === 'Walk-in' || !b.source;
        return b.source === sourceFilter;
      })
      .sort((a, b) => {
        if (sortBy === 'price') return parsePrice(b.price) - parsePrice(a.price);
        return 0;
      });
  }, [bookings, search, statusFilter, barberFilter, sourceFilter, sortBy]);

  const exportCSV = () => {
    const rows = [['Name', 'Service', 'Date', 'Time', 'Barber', 'Status', 'Price', 'Paid', 'Remaining', 'Source', 'Payment', 'Phone', 'Email', 'ID']];
    filtered.forEach(b => {
      rows.push([b.name, b.service, b.date, b.time, b.barber, b.status, b.price, b.paidAmount, b.remaining, b.source, b.paymentMethod, b.phone, b.email, b.bookingId]);
    });
    const csv = rows.map(r => r.map(v => `"${v||''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookings.csv';
    a.click();
  };

  // Stats
  const stats = useMemo(() => ({
    total: filtered.length,
    confirmed: filtered.filter(b => b.status === 'CONFIRMED').length,
    checkedOut: filtered.filter(b => b.status === 'CHECKED_OUT').length,
    cancelled: filtered.filter(b => b.status === 'CANCELLED').length,
    revenue: filtered.filter(b => b.status === 'CHECKED_OUT').reduce((s, b) => s + parsePrice(b.paidAmount), 0),
  }), [filtered]);

  const inpStyle = { padding: '11px 14px', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', outline: 'none', fontSize: '0.85rem' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', color: '#d4af37', marginBottom: '4px' }}>All Bookings</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{filtered.length} booking{filtered.length !== 1 ? 's' : ''} shown</p>
        </div>
        <button onClick={exportCSV} style={{ padding: '10px 16px', background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '8px', color: '#d4af37', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}>
          Export CSV
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total', value: stats.total, color: '#d4af37' },
          { label: 'Confirmed', value: stats.confirmed, color: '#4caf50' },
          { label: 'Checked Out', value: stats.checkedOut, color: '#2196f3' },
          { label: 'Cancelled', value: stats.cancelled, color: '#ff5252' },
          { label: 'Revenue', value: '£' + stats.revenue, color: '#d4af37' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 18px', background: s.color + '10', border: '1px solid ' + s.color + '30', borderRadius: '10px', minWidth: '80px' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: '800', color: s.color }}>{s.value}</span>
            <span style={{ fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginTop: '2px' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', background: 'var(--card)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <input
          placeholder="Search name, service, phone, ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
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
          {barbers.map(b => <option key={b.id} value={b.name.toLowerCase()}>{b.name}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inpStyle}>
          <option value="date">Sort by Date</option>
          <option value="price">Sort by Price</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1fr 1fr 1fr 1fr', gap: '0', padding: '10px 16px', background: 'rgba(212,175,55,0.05)', borderBottom: '1px solid var(--border)' }}>
          {['Customer', 'Service', 'Date & Time', 'Barber', 'Status', 'Source', 'Amount'].map(h => (
            <span key={h} style={{ fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: '600' }}>{h}</span>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📭</div>
            <p>No bookings found</p>
          </div>
        ) : filtered.map((b, i) => {
          const srcStyle = SOURCE_COLORS[b.source] || SOURCE_COLORS['Walk-in'];
          const barberColor = (barbers.find(bar => bar.name.toLowerCase() === (b.barber || '').toLowerCase()) || {}).color || '#7a7260';
          const svcName = config.services ? (config.services.find(s => s.id === b.service) || {}).name || b.service : b.service;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1fr 1fr 1fr 1fr', gap: '0', padding: '12px 16px', borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.03)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

              {/* Customer */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text)' }}>{b.name}</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{b.phone}</span>
              </div>

              {/* Service */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text)', fontWeight: '500' }}>{svcName}</span>
              </div>

              {/* Date & Time */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text)' }}>{b.date}</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{b.time}</span>
              </div>

              {/* Barber */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: barberColor, flexShrink: 0 }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--text)' }}>{(b.barber || '').toUpperCase()}</span>
              </div>

              {/* Status */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: '700', color: STATUS_COLORS[b.status] || 'var(--muted)', background: (STATUS_COLORS[b.status] || '#888') + '18', letterSpacing: '0.5px' }}>
                  {b.status === 'CHECKED_OUT' ? 'PAID' : b.status}
                </span>
              </div>

              {/* Source */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {b.source ? (
                  <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: '700', color: srcStyle.color, background: srcStyle.bg, letterSpacing: '0.5px' }}>
                    {b.source}
                  </span>
                ) : (
                  <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>—</span>
                )}
              </div>

              {/* Amount */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#d4af37' }}>{b.price}</span>
                {b.paidAmount && b.paidAmount !== b.price && (
                  <span style={{ fontSize: '0.65rem', color: '#4caf50' }}>Paid: {b.paidAmount}</span>
                )}
                {b.status === 'CHECKED_OUT' && b.paymentMethod && (
                  <span style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>{b.paymentMethod}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}