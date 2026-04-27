import React, { useState, useEffect, useMemo } from 'react';
import config from '../config';
import { db } from '../firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';

function getBColor(barber) {
  const map = { alex: '#d4af37', arda: '#4caf50', manoj: '#9c27b0' };
  return map[(barber || '').toLowerCase()] || '#7a7260';
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

export default function Clients() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('totalSpent');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedClient, setSelectedClient] = useState(null);
  const [filterBarber, setFilterBarber] = useState('all');
  const [barbers, setBarbers] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
  try {
    const [bookingsSnap, barbersSnap] = await Promise.all([
      getDocs(query(collection(db, 'tenants/whitecross/bookings'), orderBy('startTime', 'desc'))),
      getDocs(collection(db, 'tenants/whitecross/barbers')),
    ]);
    const fetchedBookings = bookingsSnap.docs.map(doc => {
      const d = doc.data();
      const startTime = d.startTime?.toDate();
      const date = startTime ? startTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      const time = startTime ? startTime.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase() : '';
      return { ...d, name: d.clientName || 'Walk-in', email: d.clientEmail || '', phone: d.clientPhone || '', barber: d.barberId || '', service: d.serviceId || '', date, time, bookingId: d.bookingId || doc.id, source: d.source || 'website', paidAmount: d.paidAmount || '', price: d.price || '' };
    });
    setBookings(fetchedBookings);
    const fetchedBarbers = barbersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (fetchedBarbers.length > 0) setBarbers(fetchedBarbers);
  } catch (e) { console.log(e); }
  finally { setLoading(false); }
};
    fetchData();
  }, []);

  const clients = useMemo(() => {
    const map = {};
    bookings.forEach(b => {
      if (!b.name || b.name === 'Walk-in') return;
      const key = b.phone || b.email || b.name;
      if (!map[key]) {
        map[key] = {
          name: b.name, phone: b.phone || '', email: b.email || '',
          visits: 0, totalSpent: 0, totalTip: 0, totalDiscount: 0,
          services: {}, barbers: {}, sources: {},
          bookings: [], firstVisit: null, lastVisit: null,
          lastService: '', lastBarber: '', paymentMethods: {},
          checkedOut: 0, cancelled: 0,
        };
      }
      const c = map[key];
      c.bookings.push(b);
      if (b.status !== 'CANCELLED') {
        c.visits++;
        const price = parseFloat(String(b.paidAmount || b.price || '0').replace('£', '')) || 0;
        const tip = parseFloat(String(b.tip || '0').replace('£', '')) || 0;
        const discount = parseFloat(String(b.discount || '0').replace('£', '').replace('-', '')) || 0;
        c.totalSpent += price;
        c.totalTip += tip;
        c.totalDiscount += discount;
        c.services[b.service] = (c.services[b.service] || 0) + 1;
        c.barbers[b.barber] = (c.barbers[b.barber] || 0) + 1;
        c.sources[b.source] = (c.sources[b.source] || 0) + 1;
        if (b.paymentMethod || b.paymentType) {
          const pm = b.paymentMethod || b.paymentType;
          c.paymentMethods[pm] = (c.paymentMethods[pm] || 0) + 1;
        }
        if (b.status === 'CHECKED_OUT') c.checkedOut++;
        if (!c.firstVisit || b.date < c.firstVisit) c.firstVisit = b.date;
        if (!c.lastVisit || b.date > c.lastVisit) { c.lastVisit = b.date; c.lastService = b.service; c.lastBarber = b.barber; }
      } else {
        c.cancelled++;
      }
    });
    return Object.values(map);
  }, [bookings]);

  const filtered = useMemo(() => {
    let list = clients;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.email.toLowerCase().includes(q));
    }
    if (filterBarber !== 'all') {
      list = list.filter(c => Object.keys(c.barbers).some(b => b.toLowerCase() === filterBarber.toLowerCase()));
    }
    list = [...list].sort((a, b) => {
      let av = a[sortBy], bv = b[sortBy];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      return sortDir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
    });
    return list;
  }, [clients, search, sortBy, sortDir, filterBarber]);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const getSvcLabel = (id) => {
    const s = config.services ? config.services.find(s => s.id === id) : null;
    return s ? s.name : id;
  };

  const totalRevenue = clients.reduce((s, c) => s + c.totalSpent, 0);
  const totalVisits = clients.reduce((s, c) => s + c.visits, 0);
  const avgSpend = clients.length ? totalRevenue / clients.length : 0;
  const vipCount = clients.filter(c => c.visits >= 5).length;

  const col = { fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: '600', cursor: 'pointer', userSelect: 'none', padding: '10px 14px', whiteSpace: 'nowrap' };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--muted)' }}>Loading clients...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 64px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text)', margin: 0 }}>Clients</h1>
          <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '4px 0 0', letterSpacing: '0.5px' }}>{clients.length} total clients · {totalVisits} visits</p>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total Clients', value: clients.length, color: '#d4af37' },
          { label: 'Total Revenue', value: '£' + totalRevenue.toFixed(0), color: '#4caf50' },
          { label: 'Avg Spend', value: '£' + avgSpend.toFixed(0), color: '#2196f3' },
          { label: 'VIP (5+ visits)', value: vipCount, color: '#9c27b0' },
        ].map(s => (  
          <div key={s.label} style={{ padding: '14px 20px', background: s.color + '10', border: '1px solid ' + s.color + '30', borderRadius: '10px', minWidth: '120px' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email..."
          style={{ padding: '9px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.85rem', outline: 'none', minWidth: '260px' }} />
        <select value={filterBarber} onChange={e => setFilterBarber(e.target.value)}
          style={{ padding: '9px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.82rem', outline: 'none', cursor: 'pointer' }}>
          <option value="all">All Barbers</option>
          {barbers.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--muted)' }}>{filtered.length} results</div>
      </div>

      <div style={{ display: 'flex', gap: '14px', flex: 1, overflow: 'hidden' }}>
        {/* Table */}
        <div style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflowX: 'auto', flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 5 }}>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {[
                    { label: 'Client', key: 'name' },
                    { label: 'Visits', key: 'visits' },
                    { label: 'Total Spent', key: 'totalSpent' },
                    { label: 'Avg/Visit', key: null },
                    { label: 'Tips', key: 'totalTip' },
                    { label: 'Last Visit', key: 'lastVisit' },
                    { label: 'Fav Service', key: null },
                    { label: 'Barber', key: null },
                    { label: 'Status', key: null },
                  ].map(h => (
                    <th key={h.label} onClick={() => h.key && toggleSort(h.key)} style={{ ...col, textAlign: 'left', color: sortBy === h.key ? '#d4af37' : 'var(--muted)' }}>
                      {h.label} {sortBy === h.key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => {
                  const favSvc = Object.entries(c.services).sort((a, b) => b[1] - a[1])[0];
                  const favBarber = Object.entries(c.barbers).sort((a, b) => b[1] - a[1])[0];
                  const isVIP = c.visits >= 5;
                  const isNew = c.visits === 1;
                  const isSel = selectedClient?.phone === c.phone && selectedClient?.name === c.name;
                  return (
                    <tr key={i} onClick={() => setSelectedClient(isSel ? null : c)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isSel ? 'rgba(212,175,55,0.06)' : 'transparent', transition: 'background 0.15s' }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(212,175,55,0.03)'; }}
                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: getBColor(favBarber?.[0]) + '22', border: '1px solid ' + getBColor(favBarber?.[0]) + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem', fontWeight: '700', color: getBColor(favBarber?.[0]), flexShrink: 0 }}>
                            {c.name[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {c.name}
                              {isVIP && <span style={{ fontSize: '0.55rem', background: 'rgba(212,175,55,0.2)', color: '#d4af37', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>VIP</span>}
                              {isNew && <span style={{ fontSize: '0.55rem', background: 'rgba(76,175,80,0.2)', color: '#4caf50', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>NEW</span>}
                            </div>
                            <div style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>{c.phone || c.email || '--'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.82rem', color: 'var(--text)', fontWeight: '600' }}>{c.visits}</td>
                      <td style={{ padding: '12px 14px', fontSize: '0.85rem', color: '#d4af37', fontWeight: '700' }}>£{c.totalSpent.toFixed(2)}</td>
                      <td style={{ padding: '12px 14px', fontSize: '0.78rem', color: 'var(--muted)' }}>£{c.visits ? (c.totalSpent / c.visits).toFixed(0) : '0'}</td>
                      <td style={{ padding: '12px 14px', fontSize: '0.78rem', color: c.totalTip > 0 ? '#4caf50' : 'var(--muted)' }}>{c.totalTip > 0 ? '£' + c.totalTip.toFixed(2) : '--'}</td>
                      <td style={{ padding: '12px 14px', fontSize: '0.75rem', color: 'var(--muted)' }}>{c.lastVisit || '--'}</td>
                      <td style={{ padding: '12px 14px', fontSize: '0.72rem', color: 'var(--text)' }}>{favSvc ? getSvcLabel(favSvc[0]) : '--'}</td>
                      <td style={{ padding: '12px 14px' }}>
                        {favBarber && <span style={{ fontSize: '0.68rem', color: getBColor(favBarber[0]), background: getBColor(favBarber[0]) + '18', padding: '2px 7px', borderRadius: '4px', fontWeight: '600' }}>{favBarber[0]?.toUpperCase()}</span>}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {c.checkedOut > 0 && <span style={{ fontSize: '0.6rem', color: '#4caf50', background: 'rgba(76,175,80,0.15)', padding: '2px 5px', borderRadius: '4px' }}>{c.checkedOut} paid</span>}
                          {c.cancelled > 0 && <span style={{ fontSize: '0.6rem', color: '#ff5252', background: 'rgba(255,82,82,0.15)', padding: '2px 5px', borderRadius: '4px' }}>{c.cancelled} cancelled</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.82rem' }}>No clients found</div>}
          </div>
        </div>

        {/* Client detail panel */}
        {selectedClient && (
          <div style={{ width: '300px', flexShrink: 0, background: 'var(--card2)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: 'calc(100vh - 200px)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(212,175,55,0.04)', flexShrink: 0 }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: '600' }}>Client Profile</span>
              <button onClick={() => setSelectedClient(null)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem' }}>x</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Avatar + name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', background: 'rgba(212,175,55,0.05)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#d4af3722', border: '2px solid #d4af3744', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: '800', color: '#d4af37', flexShrink: 0 }}>
                  {selectedClient.name[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '0.92rem', fontWeight: '700', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {selectedClient.name}
                    {selectedClient.visits >= 5 && <span style={{ fontSize: '0.58rem', background: 'rgba(212,175,55,0.2)', color: '#d4af37', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>VIP</span>}
                  </div>
                  {selectedClient.phone && <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '2px' }}>{selectedClient.phone}</div>}
                  {selectedClient.email && <div style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{selectedClient.email}</div>}
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { label: 'Visits', value: selectedClient.visits, color: '#d4af37' },
                  { label: 'Total Spent', value: '£' + selectedClient.totalSpent.toFixed(2), color: '#4caf50' },
                  { label: 'Tips Given', value: selectedClient.totalTip > 0 ? '£' + selectedClient.totalTip.toFixed(2) : '--', color: '#4caf50' },
                  { label: 'Discounts', value: selectedClient.totalDiscount > 0 ? '£' + selectedClient.totalDiscount.toFixed(2) : '--', color: '#ff9800' },
                  { label: 'Avg/Visit', value: '£' + (selectedClient.visits ? selectedClient.totalSpent / selectedClient.visits : 0).toFixed(0), color: '#2196f3' },
                  { label: 'Cancelled', value: selectedClient.cancelled, color: '#ff5252' },
                ].map(s => (
                  <div key={s.label} style={{ padding: '10px 12px', background: s.color + '08', border: '1px solid ' + s.color + '20', borderRadius: '8px' }}>
                    <div style={{ fontSize: '1rem', fontWeight: '700', color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '0.5px', marginTop: '1px' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Loyalty bar */}
              <div style={{ padding: '10px 14px', background: 'rgba(212,175,55,0.04)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Loyalty</span>
                  <span style={{ fontSize: '0.65rem', color: '#d4af37' }}>{selectedClient.visits}/10</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(212,175,55,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: Math.min(selectedClient.visits / 10 * 100, 100) + '%', height: '100%', background: 'linear-gradient(90deg, #d4af37, #b8860b)', borderRadius: '3px', transition: 'width 0.5s' }} />
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginTop: '4px' }}>
                  {selectedClient.visits >= 10 ? '🎉 Free service earned!' : selectedClient.visits >= 5 ? '10% discount active' : `${5 - selectedClient.visits} more visits for 10% discount`}
                </div>
              </div>

              {/* Fav services */}
              <div>
                <div style={{ fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px', fontWeight: '600' }}>Services</div>
                {Object.entries(selectedClient.services).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, count]) => (
                  <div key={id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text)' }}>{getSvcLabel(id)}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{count}x</span>
                  </div>
                ))}
              </div>

              {/* Booking history */}
              <div>
                <div style={{ fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px', fontWeight: '600' }}>History</div>
                {selectedClient.bookings.slice().reverse().slice(0, 10).map((b, i) => (
                  <div key={i} style={{ padding: '8px 10px', background: 'rgba(212,175,55,0.04)', borderRadius: '8px', marginBottom: '6px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: '600', color: 'var(--text)' }}>{b.date}</span>
                      <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#d4af37' }}>{b.paidAmount ? '£' + b.paidAmount : (b.price ? '£' + b.price : '--')}</span>
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{getSvcLabel(b.service)} · {(b.barber || '').toUpperCase()}</div>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '3px' }}>
                      <span style={{ fontSize: '0.58rem', color: b.status === 'CHECKED_OUT' ? '#4caf50' : b.status === 'CANCELLED' ? '#ff5252' : '#ff9800', background: b.status === 'CHECKED_OUT' ? 'rgba(76,175,80,0.15)' : b.status === 'CANCELLED' ? 'rgba(255,82,82,0.15)' : 'rgba(255,152,0,0.15)', padding: '1px 5px', borderRadius: '3px' }}>{b.status}</span>
                      {b.tip && parseFloat(String(b.tip).replace('£', '')) > 0 && <span style={{ fontSize: '0.58rem', color: '#4caf50', background: 'rgba(76,175,80,0.1)', padding: '1px 5px', borderRadius: '3px' }}>tip £{b.tip}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Contact actions */}
              <div style={{ display: 'flex', gap: '8px' }}>
                {selectedClient.phone && (
                  <a href={'https://wa.me/' + String(selectedClient.phone).replace(/[\s+\-()]/g, '')} target="_blank" rel="noreferrer"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', background: '#25D36610', border: '1px solid #25D36630', borderRadius: '8px', color: '#25D366', fontSize: '0.72rem', textDecoration: 'none', fontWeight: '600' }}>
                    WhatsApp
                  </a>
                )}
                {selectedClient.email && (
                  <a href={'mailto:' + selectedClient.email}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', background: 'rgba(212,175,55,0.06)', border: '1px solid var(--border)', borderRadius: '8px', color: '#d4af37', fontSize: '0.72rem', textDecoration: 'none', fontWeight: '600' }}>
                    Email
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}