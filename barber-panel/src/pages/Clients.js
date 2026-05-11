import React, { useState, useEffect, useMemo } from 'react';
import config from '../config';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query, serverTimestamp } from 'firebase/firestore';

const TENANT = 'whitecross';

function getBColor(barber) {
  const map = { alex: '#d4af37', arda: '#4caf50', manoj: '#9c27b0' };
  return map[(barber || '').toLowerCase()] || '#7a7260';
}

const inp = { width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' };
const lbl = { display: 'block', fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '5px', fontWeight: '600' };

const SEGMENT_DEFS = [
  { key: 'new',          label: 'New clients',          color: '#4caf50', desc: 'Clients added in the last 30 days' },
  { key: 'recent',       label: 'Recent clients',        color: '#2196f3', desc: 'Clients with appointments in the last 30 days' },
  { key: 'firstVisit',   label: 'First visit',           color: '#ff9800', desc: 'Clients with no past appointments, but with appointments in the future' },
  { key: 'loyal',        label: 'Loyal clients',         color: '#d4af37', desc: 'Clients with 2 or more visits in the last 5 months' },
  { key: 'lapsed',       label: 'Lapsed clients',        color: '#ff5252', desc: 'Clients with 3 or more visits in the last 12 months, and no visits in the last 2 months' },
  { key: 'highSpenders', label: 'High spenders',         color: '#9c27b0', desc: 'Clients with more than £81 in sales in the last 12 months' },
  { key: 'highPoints',   label: 'High points',           color: '#d4af37', desc: 'Clients with 100 or more loyalty points — ready to redeem' },
  { key: 'birthdays',    label: 'Upcoming birthdays',    color: '#e91e63', desc: 'Clients with birthdays in the next 30 days' },
];

function ClientDetailPanel({ client, onClose, onEdit, onDelete, getSvcLabel }) {
  const [detailTab, setDetailTab] = React.useState('overview');

  const favBarber = Object.entries(client.barbers || {}).sort((a, b) => b[1] - a[1])[0];
  const avatarColor = getBColor(favBarber?.[0]);
  const pts = client.loyaltyPoints || 0;
  const redeemable = Math.floor(pts / 100);
  const nextMilestone = pts < 100 ? 100 : Math.ceil(pts / 100) * 100;
  const pctFill = Math.min(pts / 500 * 100, 100);

  const statRows = [
    { label: 'APPOINTMENTS', value: client.visits, sub: null },
    { label: 'NO-SHOWS', value: client.bookings.filter(b => b.status === 'NO_SHOW').length, sub: null },
    { label: 'CANCELLED', value: client.cancelled, sub: null },
    { label: 'TOTAL SPENT', value: '£' + client.totalSpent.toFixed(2), sub: null },
    { label: 'AVG / VISIT', value: client.visits ? '£' + (client.totalSpent / client.visits).toFixed(0) : '—', sub: null },
    { label: 'TIPS GIVEN', value: client.totalTip > 0 ? '£' + client.totalTip.toFixed(2) : '—', sub: null },
  ];

  const tabBtn = (key, label) => (
    <button onClick={() => setDetailTab(key)} style={{
      flex: 1, padding: '9px 0', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.65rem', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase',
      color: detailTab === key ? '#d4af37' : 'var(--muted)',
      borderBottom: detailTab === key ? '2px solid #d4af37' : '2px solid transparent',
      transition: 'color 0.15s, border-color 0.15s',
    }}>{label}</button>
  );

  return (
    <div style={{ width: '340px', flexShrink: 0, background: 'var(--card2)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: 'calc(100vh - 200px)', boxShadow: '0 8px 40px rgba(0,0,0,0.35)' }}>

      {/* ── HERO ── */}
      <div style={{ padding: '22px 22px 0', background: 'linear-gradient(180deg, rgba(212,175,55,0.07) 0%, transparent 100%)', flexShrink: 0 }}>
        {/* top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <span style={{ fontSize: '0.58rem', color: 'var(--muted)', letterSpacing: '2.5px', textTransform: 'uppercase', fontWeight: '700' }}>Client Profile</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={onEdit} title="Edit" style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1px solid rgba(212,175,55,0.25)', background: 'transparent', color: '#d4af37', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✎</button>
            <button onClick={onDelete} title="Delete" style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1px solid rgba(255,82,82,0.25)', background: 'transparent', color: '#ff5252', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🗑</button>
            <button onClick={onClose} style={{ width: '28px', height: '28px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* avatar + name */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', paddingBottom: '18px' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: avatarColor + '18', border: '2.5px solid ' + avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', fontWeight: '800', color: avatarColor, flexShrink: 0, boxShadow: '0 0 0 4px ' + avatarColor + '18' }}>
            {(client.name[0] || '?').toUpperCase()}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text)', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', flexWrap: 'wrap' }}>
              {client.name}
            </div>
            {/* badges */}
            <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '7px' }}>
              {client.visits >= 5 && <span style={{ fontSize: '0.58rem', background: 'rgba(212,175,55,0.18)', color: '#d4af37', padding: '2px 8px', borderRadius: '20px', fontWeight: '800', letterSpacing: '0.8px', border: '1px solid rgba(212,175,55,0.3)' }}>VIP</span>}
              {client.visits === 1 && <span style={{ fontSize: '0.58rem', background: 'rgba(76,175,80,0.18)', color: '#4caf50', padding: '2px 8px', borderRadius: '20px', fontWeight: '800', letterSpacing: '0.8px', border: '1px solid rgba(76,175,80,0.3)' }}>NEW</span>}
              {client.isManualOnly && <span style={{ fontSize: '0.58rem', background: 'rgba(33,150,243,0.15)', color: '#64b5f6', padding: '2px 8px', borderRadius: '20px', fontWeight: '800', letterSpacing: '0.8px', border: '1px solid rgba(33,150,243,0.3)' }}>WALK-IN</span>}
              {pts >= 100 && <span style={{ fontSize: '0.58rem', background: 'rgba(212,175,55,0.12)', color: '#d4af37', padding: '2px 8px', borderRadius: '20px', fontWeight: '800', letterSpacing: '0.8px', border: '1px solid rgba(212,175,55,0.25)' }}>⭐ {pts} PTS</span>}
            </div>
            {/* contact */}
            {client.phone && <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '7px' }}>{client.phone}</div>}
            {client.email && <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '2px' }}>{client.email}</div>}
            {client.birthday && <div style={{ fontSize: '0.65rem', color: '#e91e63', marginTop: '4px' }}>🎂 {new Date(client.birthday).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</div>}
          </div>

          {/* action buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            {client.phone && (
              <a href={'https://wa.me/' + String(client.phone).replace(/[\s+\-()]/g, '')} target="_blank" rel="noreferrer"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', textDecoration: 'none' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#25D36614', border: '1px solid #25D36628', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>💬</div>
                <span style={{ fontSize: '0.58rem', color: '#25D366', fontWeight: '700', letterSpacing: '0.5px' }}>WhatsApp</span>
              </a>
            )}
            {client.email && (
              <a href={'mailto:' + client.email}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', textDecoration: 'none' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>✉️</div>
                <span style={{ fontSize: '0.58rem', color: '#d4af37', fontWeight: '700', letterSpacing: '0.5px' }}>Email</span>
              </a>
            )}
            {client.phone && (
              <a href={'tel:' + client.phone}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', textDecoration: 'none' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(33,150,243,0.08)', border: '1px solid rgba(33,150,243,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>📞</div>
                <span style={{ fontSize: '0.58rem', color: '#64b5f6', fontWeight: '700', letterSpacing: '0.5px' }}>Call</span>
              </a>
            )}
          </div>
        </div>

        {/* tabs */}
        <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
          {tabBtn('overview', 'Overview')}
          {tabBtn('history', 'History')}
          {tabBtn('loyalty', 'Loyalty')}
        </div>
      </div>

      {/* ── TAB BODY ── */}
      <div style={{ overflowY: 'auto', flex: 1 }}>

        {/* OVERVIEW */}
        {detailTab === 'overview' && (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* notes */}
            {client.notes && (
              <div style={{ padding: '10px 14px', background: 'rgba(212,175,55,0.05)', borderRadius: '10px', border: '1px solid rgba(212,175,55,0.15)' }}>
                <div style={{ fontSize: '0.58rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '700', marginBottom: '5px' }}>Notes</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text)', lineHeight: '1.5', fontStyle: 'italic' }}>{client.notes}</div>
              </div>
            )}

            {/* stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {statRows.map(s => (
                <div key={s.label} style={{ padding: '10px 10px 8px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--text)', lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: '0.54rem', color: 'var(--muted)', letterSpacing: '0.8px', marginTop: '4px', fontWeight: '600' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* favourite service + barber */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              <div style={{ fontSize: '0.58rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '700', marginBottom: '8px' }}>Top Services</div>
              {Object.entries(client.services || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, count]) => {
                const total = Object.values(client.services).reduce((a, b) => a + b, 0);
                const pct = total ? Math.round(count / total * 100) : 0;
                return (
                  <div key={id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text)', fontWeight: '600' }}>{getSvcLabel(id)}</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{count}x</span>
                    </div>
                    <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg,#d4af37,#b8860b)', borderRadius: '2px' }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* barbers breakdown */}
            {Object.keys(client.barbers || {}).length > 0 && (
              <div>
                <div style={{ fontSize: '0.58rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '700', marginBottom: '8px' }}>Barbers</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {Object.entries(client.barbers).sort((a, b) => b[1] - a[1]).map(([name, cnt]) => (
                    <span key={name} style={{ fontSize: '0.65rem', color: getBColor(name), background: getBColor(name) + '15', border: '1px solid ' + getBColor(name) + '30', padding: '3px 10px', borderRadius: '20px', fontWeight: '700' }}>
                      {name} · {cnt}x
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* first/last visit */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                <div style={{ fontSize: '0.54rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>First Visit</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text)', fontWeight: '600' }}>{client.firstVisit || '—'}</div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                <div style={{ fontSize: '0.54rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: '700', marginBottom: '4px' }}>Last Visit</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text)', fontWeight: '600' }}>{client.lastVisit || '—'}</div>
              </div>
            </div>
          </div>
        )}

        {/* HISTORY */}
        {detailTab === 'history' && (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {client.bookings.length === 0 && <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.78rem' }}>No bookings yet</div>}
            {client.bookings.slice().reverse().slice(0, 20).map((b, i) => (
              <div key={i} style={{ padding: '11px 14px', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text)' }}>{getSvcLabel(b.service)}</div>
                    <div style={{ fontSize: '0.63rem', color: 'var(--muted)', marginTop: '2px' }}>{b.date} · {b.time || ''}</div>
                    {b.barber && <div style={{ fontSize: '0.63rem', color: getBColor(b.barber), marginTop: '2px', fontWeight: '600' }}>{b.barber}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#d4af37' }}>{b.paidAmount ? '£' + b.paidAmount : (b.price ? '£' + b.price : '—')}</div>
                    <span style={{ fontSize: '0.55rem', color: b.status === 'CHECKED_OUT' ? '#4caf50' : b.status === 'CANCELLED' ? '#ff5252' : '#ff9800', background: b.status === 'CHECKED_OUT' ? 'rgba(76,175,80,0.15)' : b.status === 'CANCELLED' ? 'rgba(255,82,82,0.15)' : 'rgba(255,152,0,0.15)', padding: '2px 6px', borderRadius: '4px', fontWeight: '700', marginTop: '4px', display: 'inline-block' }}>
                      {b.status === 'CHECKED_OUT' ? 'PAID' : b.status}
                    </span>
                    {b.tip && parseFloat(String(b.tip).replace('£', '')) > 0 && <div style={{ fontSize: '0.6rem', color: '#4caf50', marginTop: '2px' }}>+£{b.tip} tip</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* LOYALTY */}
        {detailTab === 'loyalty' && (
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* big points display */}
            <div style={{ textAlign: 'center', padding: '24px 20px', background: 'linear-gradient(135deg, rgba(212,175,55,0.1), rgba(184,134,11,0.06))', borderRadius: '14px', border: '1px solid rgba(212,175,55,0.25)' }}>
              <div style={{ fontSize: '3rem', fontWeight: '900', color: '#d4af37', lineHeight: 1 }}>{pts}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: '700', marginTop: '6px' }}>Loyalty Points</div>
              {redeemable > 0 && (
                <div style={{ marginTop: '12px', padding: '6px 16px', background: 'rgba(212,175,55,0.15)', borderRadius: '20px', display: 'inline-block', fontSize: '0.72rem', color: '#d4af37', fontWeight: '700' }}>
                  £{redeemable} available to redeem
                </div>
              )}
            </div>

            {/* progress bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: '600' }}>Progress to £{Math.ceil(nextMilestone / 100)} reward</span>
                <span style={{ fontSize: '0.62rem', color: '#d4af37', fontWeight: '700' }}>{pts} / {nextMilestone} pts</span>
              </div>
              <div style={{ height: '8px', background: 'rgba(212,175,55,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: pctFill + '%', height: '100%', background: 'linear-gradient(90deg,#d4af37,#b8860b)', borderRadius: '4px', transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' }} />
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginTop: '5px' }}>100 pts = £1 discount · Earned 10 pts per £1 spent</div>
            </div>

            {/* milestones */}
            <div>
              <div style={{ fontSize: '0.58rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '700', marginBottom: '10px' }}>Milestones</div>
              {[100, 250, 500, 1000].map(milestone => {
                const reached = pts >= milestone;
                return (
                  <div key={milestone} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: reached ? 'rgba(212,175,55,0.2)' : 'var(--card)', border: '1.5px solid ' + (reached ? '#d4af37' : 'var(--border)'), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.75rem' }}>
                      {reached ? '✓' : ''}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.72rem', color: reached ? 'var(--text)' : 'var(--muted)', fontWeight: reached ? '700' : '500' }}>{milestone} pts — £{milestone / 100} reward</div>
                    </div>
                    {reached && <span style={{ fontSize: '0.58rem', color: '#d4af37', fontWeight: '700' }}>REACHED</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Clients() {
  const [bookings, setBookings] = useState([]);
  const [manualClients, setManualClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('list');
  const [search, setSearch] = useState('');
  const [segSearch, setSegSearch] = useState('');
  const [sortBy, setSortBy] = useState('totalSpent');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedClient, setSelectedClient] = useState(null);
  const [filterBarber, setFilterBarber] = useState('all');
  const [barbers, setBarbers] = useState([]);
  const [activeSegment, setActiveSegment] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', phone: '', email: '', birthday: '', notes: '' });
  const [addSaving, setAddSaving] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', birthday: '', notes: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editingClient, setEditingClient] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [bookingsSnap, barbersSnap, clientsSnap] = await Promise.all([
          getDocs(query(collection(db, `tenants/${TENANT}/bookings`), orderBy('startTime', 'desc'))),
          getDocs(collection(db, `tenants/${TENANT}/barbers`)),
          getDocs(collection(db, `tenants/${TENANT}/clients`)).catch(() => ({ docs: [] })),
        ]);

        const fetchedBarbers = barbersSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
        setBarbers(fetchedBarbers);

        const barberNameById = fetchedBarbers.reduce((acc, b) => {
          if (!b?.name) return acc;
          const keys = [b.docId, b.id].filter(Boolean);
          keys.forEach((k) => { acc[String(k).toLowerCase()] = b.name; });
          return acc;
        }, {});

        const fetchedBookings = bookingsSnap.docs.map(doc => {
          const d = doc.data();
          const startTime = d.startTime?.toDate() || null;
          const date = startTime ? startTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
          const time = startTime ? startTime.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase() : '';
          const rawBarber = String(d.barberId || '').trim();
          const barber = d.barberName || barberNameById[rawBarber.toLowerCase()] || rawBarber;
          return { ...d, name: d.clientName || 'Walk-in', email: d.clientEmail || '', phone: d.clientPhone || '', barber, service: d.serviceId || '', date, time, startTimeRaw: startTime, bookingId: d.bookingId || doc.id, source: d.source || 'website', paidAmount: d.paidAmount || '', price: d.price || '' };
        });
        setBookings(fetchedBookings);
        setManualClients(clientsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const bookingClients = useMemo(() => {
    const map = {};
    bookings.forEach(b => {
      if (!b.name || b.name === 'Walk-in') return;
      const key = b.phone || b.email || b.name;
      if (!map[key]) {
        map[key] = { name: b.name, phone: b.phone || '', email: b.email || '', visits: 0, totalSpent: 0, totalTip: 0, totalDiscount: 0, services: {}, barbers: {}, sources: {}, bookings: [], firstVisit: null, lastVisit: null, firstVisitRaw: null, lastVisitRaw: null, lastService: '', lastBarber: '', paymentMethods: {}, checkedOut: 0, cancelled: 0 };
      }
      const c = map[key];
      c.bookings.push(b);
      if (b.status !== 'CANCELLED') {
        c.visits++;
        const booksyDeposit = b.source === 'Booksy' && config.platforms?.booksy?.depositEnabled ? (config.platforms.booksy.depositAmount || 0) : 0;
        const rawAmount = parseFloat(String(b.paidAmount || b.price || '0').replace('£', '')) || 0;
        const price = b.source === 'Booksy'
          ? (b.status === 'CHECKED_OUT' ? rawAmount + booksyDeposit : booksyDeposit)
          : rawAmount;
        const tip = parseFloat(String(b.tip || '0').replace('£', '')) || 0;
        const discount = parseFloat(String(b.discount || '0').replace('£', '').replace('-', '')) || 0;
        c.totalSpent += price;
        c.totalTip += tip;
        c.totalDiscount += discount;
        c.services[b.service] = (c.services[b.service] || 0) + 1;
        c.barbers[b.barber] = (c.barbers[b.barber] || 0) + 1;
        c.sources[b.source] = (c.sources[b.source] || 0) + 1;
        if (b.paymentMethod || b.paymentType) { const pm = b.paymentMethod || b.paymentType; c.paymentMethods[pm] = (c.paymentMethods[pm] || 0) + 1; }
        if (b.status === 'CHECKED_OUT') c.checkedOut++;
        const bRaw = b.startTimeRaw;
        if (!c.firstVisitRaw || (bRaw && bRaw < c.firstVisitRaw)) { c.firstVisit = b.date; c.firstVisitRaw = bRaw; }
        if (!c.lastVisitRaw || (bRaw && bRaw > c.lastVisitRaw)) { c.lastVisit = b.date; c.lastVisitRaw = bRaw; c.lastService = b.service; c.lastBarber = b.barber; }
      } else {
        c.cancelled++;
      }
    });
    return Object.values(map);
  }, [bookings]);

  const allClients = useMemo(() => {
    const hiddenKeys = new Set(
      manualClients.filter(m => m.hidden)
        .flatMap(m => [m.phone, m.email, m.name?.toLowerCase()].filter(Boolean))
    );
    const merged = bookingClients
      .filter(c => !hiddenKeys.has(c.phone) && !hiddenKeys.has(c.email) && !hiddenKeys.has(c.name?.toLowerCase()))
      .map(c => {
        const manual = manualClients.find(m => !m.hidden && ((m.phone && m.phone === c.phone) || (m.email && m.email === c.email) || m.name?.toLowerCase() === c.name.toLowerCase()));
        return {
          ...c,
          phone: manual?.phone || c.phone,
          email: manual?.email || c.email,
          birthday: manual?.birthday || '',
          notes: manual?.notes || '',
          manualId: manual?.id,
          loyaltyPoints: manual?.loyaltyPoints || 0,
        };
      });
    manualClients.filter(m => !m.hidden).forEach(m => {
      const exists = bookingClients.some(c => (m.phone && m.phone === c.phone) || (m.email && m.email === c.email) || m.name?.toLowerCase() === c.name?.toLowerCase());
      if (!exists) {
        const addedAt = m.createdAt?.toDate ? m.createdAt.toDate() : (m.createdAt ? new Date(m.createdAt) : new Date());
        merged.push({ name: m.name || '', phone: m.phone || '', email: m.email || '', birthday: m.birthday || '', notes: m.notes || '', visits: 0, totalSpent: 0, totalTip: 0, totalDiscount: 0, services: {}, barbers: {}, sources: {}, bookings: [], firstVisit: null, lastVisit: null, firstVisitRaw: null, lastVisitRaw: null, lastService: '', lastBarber: '', paymentMethods: {}, checkedOut: 0, cancelled: 0, manualId: m.id, isManualOnly: true, addedAt, loyaltyPoints: m.loyaltyPoints || 0 });
      }
    });
    return merged;
  }, [bookingClients, manualClients]);

  const segments = useMemo(() => {
    const now = new Date();
    const ago = (days) => new Date(now - days * 24 * 3600 * 1000);
    return {
      new: allClients.filter(c => c.isManualOnly ? (c.addedAt && c.addedAt >= ago(30)) : (c.firstVisitRaw && c.firstVisitRaw >= ago(30))),
      recent: allClients.filter(c => c.lastVisitRaw && c.lastVisitRaw >= ago(30)),
      firstVisit: allClients.filter(c => {
        const past = c.bookings.filter(b => b.startTimeRaw && b.startTimeRaw < now && b.status !== 'CANCELLED');
        const future = c.bookings.filter(b => b.startTimeRaw && b.startTimeRaw > now);
        return past.length === 0 && future.length > 0;
      }),
      loyal: allClients.filter(c => c.bookings.filter(b => b.startTimeRaw && b.startTimeRaw >= ago(150) && b.status !== 'CANCELLED').length >= 2),
      lapsed: allClients.filter(c => {
        const yr = c.bookings.filter(b => b.startTimeRaw && b.startTimeRaw >= ago(365) && b.status !== 'CANCELLED').length;
        const rec = c.bookings.filter(b => b.startTimeRaw && b.startTimeRaw >= ago(60) && b.status !== 'CANCELLED').length;
        return yr >= 3 && rec === 0;
      }),
      highSpenders: allClients.filter(c => c.bookings.filter(b => b.startTimeRaw && b.startTimeRaw >= ago(365) && b.status !== 'CANCELLED').reduce((s, b) => s + (parseFloat(String(b.paidAmount || b.price || '0').replace('£', '')) || 0), 0) > 81),
      highPoints: allClients.filter(c => (c.loyaltyPoints || 0) >= 100),
      birthdays: allClients.filter(c => {
        if (!c.birthday) return false;
        try {
          const bd = new Date(c.birthday);
          if (isNaN(bd)) return false;
          const next = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
          if (next < now) next.setFullYear(now.getFullYear() + 1);
          const diff = next - now;
          return diff >= 0 && diff <= 30 * 24 * 3600 * 1000;
        } catch { return false; }
      }),
    };
  }, [allClients]);

  const filtered = useMemo(() => {
    let list = allClients;
    if (activeSegment && segments[activeSegment]) {
      const keys = new Set(segments[activeSegment].map(c => c.phone || c.email || c.name));
      list = list.filter(c => keys.has(c.phone || c.email || c.name));
    }
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
  }, [allClients, search, sortBy, sortDir, filterBarber, activeSegment, segments]);

  const handleAddClient = async () => {
    if (!addForm.name.trim()) return;
    setAddSaving(true);
    try {
      const data = { name: addForm.name.trim(), phone: addForm.phone.trim(), email: addForm.email.trim(), birthday: addForm.birthday, notes: addForm.notes.trim(), createdAt: serverTimestamp() };
      const ref = await addDoc(collection(db, `tenants/${TENANT}/clients`), data);
      setManualClients(prev => [...prev, { id: ref.id, ...data, createdAt: new Date() }]);
      setAddForm({ name: '', phone: '', email: '', birthday: '', notes: '' });
      setShowAddForm(false);
    } catch (e) { console.error(e); }
    finally { setAddSaving(false); }
  };

  // Store original identifying fields for edit lookup
  const openEditClient = (client) => {
    setEditingClient({
      ...client,
      _origPhone: client.phone,
      _origEmail: client.email,
      _origName: client.name,
    });
    setEditForm({ name: client.name, phone: client.phone, email: client.email, birthday: client.birthday || '', notes: client.notes || '' });
    setShowEditForm(true);
  };

  const handleEditClient = async () => {
    if (!editForm.name.trim()) return;
    setEditSaving(true);
    try {
      const data = { name: editForm.name.trim(), phone: editForm.phone.trim(), email: editForm.email.trim(), birthday: editForm.birthday, notes: editForm.notes.trim() };
      const clientsRef = collection(db, `tenants/${TENANT}/clients`);

      if (editingClient.manualId) {
        // Already have the doc ID — update directly
        await updateDoc(doc(db, `tenants/${TENANT}/clients`, editingClient.manualId), data);
        setManualClients(prev => prev.map(m => m.id === editingClient.manualId ? { ...m, ...data } : m));
      } else {
        // Booking-only client — search by ORIGINAL values to find any existing doc
        const normalizePhone = (p) => String(p || '').replace(/[\s\-().+]/g, '').toLowerCase();
        const origPhone = normalizePhone(editingClient._origPhone);
        const origEmail = (editingClient._origEmail || '').trim().toLowerCase();
        const origName  = (editingClient._origName || '').trim().toLowerCase();
        const snap = await getDocs(clientsRef);
        let foundId = null;
        snap.forEach(docSnap => {
          if (foundId) return; // stop once matched
          const d = docSnap.data();
          const docPhone = normalizePhone(d.phone);
          const docEmail = (d.email || '').trim().toLowerCase();
          const docName  = (d.name  || '').trim().toLowerCase();
          if (origPhone && docPhone && origPhone === docPhone) { foundId = docSnap.id; }
          else if (origEmail && docEmail && origEmail === docEmail) { foundId = docSnap.id; }
          else if (origName  && docName  && origName  === docName)  { foundId = docSnap.id; }
        });
        if (foundId) {
          await updateDoc(doc(db, `tenants/${TENANT}/clients`, foundId), data);
          setManualClients(prev => prev.map(m => m.id === foundId ? { ...m, ...data } : m));
        } else {
          const ref = await addDoc(clientsRef, { ...data, createdAt: serverTimestamp() });
          setManualClients(prev => [...prev, { id: ref.id, ...data, createdAt: new Date() }]);
        }
      }
      setSelectedClient(prev => prev ? { ...prev, ...data } : null);
      setShowEditForm(false);
      setEditingClient(null);
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  const handleDeleteClient = async (client) => {
    if (!window.confirm(`Delete "${client.name}" from the system? This will hide them from the client list.`)) return;
    try {
      if (client.manualId && client.isManualOnly) {
        await deleteDoc(doc(db, `tenants/${TENANT}/clients`, client.manualId));
        setManualClients(prev => prev.filter(m => m.id !== client.manualId));
      } else if (client.manualId) {
        await deleteDoc(doc(db, `tenants/${TENANT}/clients`, client.manualId));
        const ref = await addDoc(collection(db, `tenants/${TENANT}/clients`), { name: client.name, phone: client.phone, email: client.email, hidden: true, createdAt: serverTimestamp() });
        setManualClients(prev => [...prev.filter(m => m.id !== client.manualId), { id: ref.id, name: client.name, phone: client.phone, email: client.email, hidden: true }]);
      } else {
        const ref = await addDoc(collection(db, `tenants/${TENANT}/clients`), { name: client.name, phone: client.phone, email: client.email, hidden: true, createdAt: serverTimestamp() });
        setManualClients(prev => [...prev, { id: ref.id, name: client.name, phone: client.phone, email: client.email, hidden: true }]);
      }
      setSelectedClient(null);
    } catch (e) { console.error(e); }
  };

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const getSvcLabel = (id) => {
    const s = config.services ? config.services.find(s => s.id === id) : null;
    return s ? s.name : id;
  };

  const viewSegment = (key) => { setActiveSegment(key); setTab('list'); setSearch(''); };

  const totalRevenue = allClients.reduce((s, c) => s + c.totalSpent, 0);
  const totalVisits = allClients.reduce((s, c) => s + c.visits, 0);
  const avgSpend = allClients.length ? totalRevenue / allClients.length : 0;
  const vipCount = allClients.filter(c => c.visits >= 5).length;

  const col = { fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: '600', cursor: 'pointer', userSelect: 'none', padding: '10px 14px', whiteSpace: 'nowrap' };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--muted)' }}>Loading clients...</div>;

  return (

    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: 'calc(100vh - 64px)' }}>
      {/* Header + Tabs + Add Client in one row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '1.4rem', color: '#d4af37', margin: 0, fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1 }}>Clients</h1>
            <span style={{ display: 'inline-block', width: '32px', height: '6px', borderRadius: '4px', background: 'linear-gradient(90deg,#d4af37,#b8860b)', marginTop: '8px' }} />
          </div>
          <div style={{ fontSize: '0.92rem', color: '#d4af37', fontWeight: 700, marginTop: '2px', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: 'var(--muted)', fontWeight: 500, fontSize: '0.95rem' }}>{allClients.length} total clients · {totalVisits} visits</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginRight: '8px' }}>
            <button onClick={() => setTab('list')} style={{ padding: '8px 18px', border: 'none', background: tab === 'list' ? 'rgba(212,175,55,0.15)' : 'transparent', color: tab === 'list' ? '#d4af37' : 'var(--muted)', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' }}>All Clients</button>
            <button onClick={() => setTab('segments')} style={{ padding: '8px 18px', border: 'none', background: tab === 'segments' ? 'rgba(212,175,55,0.15)' : 'transparent', color: tab === 'segments' ? '#d4af37' : 'var(--muted)', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' }}>Segments</button>
          </div>
          <button onClick={() => setShowAddForm(true)}
            style={{ padding: '10px 20px', background: 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '8px', color: '#000', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(212,175,55,0.3)' }}>
            Add Client
          </button>
        </div>
      </div>

        {/* Active segment banner */}
        {activeSegment && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: SEGMENT_DEFS.find(s => s.key === activeSegment)?.color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text)', fontWeight: '600' }}>
              {SEGMENT_DEFS.find(s => s.key === activeSegment)?.label}
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>· {segments[activeSegment]?.length || 0} clients</span>
            <button onClick={() => setActiveSegment(null)}
              style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--muted)', fontSize: '0.68rem', padding: '3px 10px', cursor: 'pointer' }}>
              Clear ×
            </button>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email..."
            style={{ padding: '7px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.82rem', outline: 'none', minWidth: '240px' }} />
          <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            <button onClick={() => setFilterBarber('all')} style={{ padding: '7px 12px', border: 'none', cursor: 'pointer', background: filterBarber === 'all' ? 'rgba(212,175,55,0.2)' : 'transparent', color: filterBarber === 'all' ? '#d4af37' : 'var(--muted)', fontSize: '0.78rem', fontWeight: '600' }}>All</button>
            {barbers.map(b => (
              <button key={b.id} onClick={() => setFilterBarber(b.name)}
                style={{ padding: '7px 12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', fontWeight: '600', transition: 'all 0.15s',
                  background: filterBarber === b.name ? (b.color || '#d4af37') + '20' : 'transparent',
                  color: filterBarber === b.name ? (b.color || '#d4af37') : 'var(--muted)' }}>
                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: b.color || '#d4af37' }} />{b.name}
              </button>
            ))}
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginLeft: 'auto' }}>{filtered.length} results</span>
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
                      { label: 'Points', key: 'loyaltyPoints' },
                      { label: 'Last Visit', key: 'lastVisit' },
                      { label: 'Fav Service', key: null },
                      { label: 'Barber', key: null },
                      { label: 'Status', key: null },
                    ].map(h => (
                      <th key={h.label} onClick={() => h.key && toggleSort(h.key)} style={{ ...col, textAlign: 'left', color: sortBy === h.key ? '#d4af37' : 'var(--muted)' }}>
                        {h.label}{sortBy === h.key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
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
                              {(c.name[0] || '?').toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                {c.name}
                                {isVIP && <span style={{ fontSize: '0.55rem', background: 'rgba(212,175,55,0.2)', color: '#d4af37', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>VIP</span>}
                                {isNew && !isVIP && <span style={{ fontSize: '0.55rem', background: 'rgba(76,175,80,0.2)', color: '#4caf50', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>NEW</span>}
                                {c.isManualOnly && <span style={{ fontSize: '0.55rem', background: 'rgba(33,150,243,0.15)', color: '#2196f3', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>ADDED</span>}
                              </div>
                              <div style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>{c.phone || c.email || '--'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '0.82rem', color: 'var(--text)', fontWeight: '600' }}>{c.visits}</td>
                        <td style={{ padding: '12px 14px', fontSize: '0.85rem', color: '#d4af37', fontWeight: '700' }}>£{c.totalSpent.toFixed(2)}</td>
                        <td style={{ padding: '12px 14px', fontSize: '0.78rem', color: 'var(--muted)' }}>£{c.visits ? (c.totalSpent / c.visits).toFixed(0) : '0'}</td>
                        <td style={{ padding: '12px 14px', fontSize: '0.78rem', color: c.totalTip > 0 ? '#4caf50' : 'var(--muted)' }}>{c.totalTip > 0 ? '£' + c.totalTip.toFixed(2) : '--'}</td>
                        <td style={{ padding: '12px 14px' }}>
                          {c.loyaltyPoints > 0
                            ? <span style={{ fontSize: '0.75rem', color: '#d4af37', fontWeight: '700' }}>⭐ {c.loyaltyPoints}</span>
                            : <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>--</span>}
                        </td>
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
          {selectedClient && <ClientDetailPanel
            client={selectedClient}
            onClose={() => setSelectedClient(null)}
            onEdit={() => openEditClient(selectedClient)}
            onDelete={() => handleDeleteClient(selectedClient)}
            getSvcLabel={getSvcLabel}
          />}
        </div>
      

      {/* ── SEGMENTS TAB ── */}
      {tab === 'segments' && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input value={segSearch} onChange={e => setSegSearch(e.target.value)} placeholder="Search by client name across all segments..."
            style={{ padding: '9px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.85rem', outline: 'none', maxWidth: '400px' }} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
            {SEGMENT_DEFS.map(seg => {
              const list = segSearch
                ? (segments[seg.key] || []).filter(c => c.name.toLowerCase().includes(segSearch.toLowerCase()))
                : (segments[seg.key] || []);
              const count = list.length;
              return (
                <div key={seg.key} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: seg.color, fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>{seg.label}</div>
                      <div style={{ fontSize: '2rem', fontWeight: '800', color: seg.color, lineHeight: 1 }}>{count}</div>
                    </div>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: seg.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '1.1rem' }}>
                        {{ new: '🆕', recent: '🕐', firstVisit: '✨', loyal: '⭐', lapsed: '💤', highSpenders: '💎', highPoints: '🏆', birthdays: '🎂' }[seg.key]}
                      </span>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: 0, lineHeight: '1.5' }}>{seg.desc}</p>

                  {count > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {list.slice(0, 3).map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: seg.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', color: seg.color, fontWeight: '700', flexShrink: 0 }}>
                            {(c.name[0] || '?').toUpperCase()}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text)' }}>{c.name}</span>
                          {c.loyaltyPoints > 0 && <span style={{ fontSize: '0.6rem', color: '#d4af37', marginLeft: 'auto' }}>⭐{c.loyaltyPoints}</span>}
                          {!c.loyaltyPoints && c.visits > 0 && <span style={{ fontSize: '0.62rem', color: 'var(--muted)', marginLeft: 'auto' }}>{c.visits}v</span>}
                        </div>
                      ))}
                      {count > 3 && <div style={{ fontSize: '0.65rem', color: 'var(--muted)', paddingLeft: '30px' }}>+{count - 3} more clients</div>}
                    </div>
                  )}

                  <button onClick={() => viewSegment(seg.key)}
                    style={{ padding: '8px 0', background: count > 0 ? seg.color + '15' : 'transparent', border: '1px solid ' + seg.color + (count > 0 ? '35' : '20'), borderRadius: '8px', color: count > 0 ? seg.color : 'var(--muted)', fontSize: '0.75rem', fontWeight: '600', cursor: count > 0 ? 'pointer' : 'default', marginTop: 'auto' }}>
                    {count > 0 ? 'View Clients →' : 'No clients'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── EDIT CLIENT MODAL ── */}
      {showEditForm && editingClient && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowEditForm(false); setEditingClient(null); } }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', width: '420px', maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px' }}>✦ EDIT CLIENT</span>
              <button onClick={() => { setShowEditForm(false); setEditingClient(null); }} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={lbl}>Full Name *</label>
                <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Client name" style={inp} autoFocus />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={lbl}>Phone</label>
                  <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="+44..." style={inp} />
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder="email@..." style={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>Birthday</label>
                <input type="date" value={editForm.birthday} onChange={e => setEditForm(f => ({ ...f, birthday: e.target.value }))} style={{ ...inp, colorScheme: 'dark' }} />
              </div>
              <div>
                <label style={lbl}>Notes</label>
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Preferences, allergies, any notes..." rows={3} style={{ ...inp, resize: 'vertical', lineHeight: '1.5' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button onClick={() => { setShowEditForm(false); setEditingClient(null); }}
                style={{ padding: '10px 18px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.82rem' }}>
                Cancel
              </button>
              <button onClick={handleEditClient} disabled={editSaving || !editForm.name.trim()}
                style={{ padding: '10px 22px', background: (editSaving || !editForm.name.trim()) ? 'rgba(212,175,55,0.25)' : 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '8px', color: (editSaving || !editForm.name.trim()) ? 'var(--muted)' : '#000', fontWeight: '700', fontSize: '0.82rem', cursor: (editSaving || !editForm.name.trim()) ? 'not-allowed' : 'pointer' }}>
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD CLIENT MODAL ── */}
      {showAddForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddForm(false); }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', width: '420px', maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px' }}>✦ NEW CLIENT</span>
              <button onClick={() => setShowAddForm(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={lbl}>Full Name *</label>
                <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Client name" style={inp} autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleAddClient()} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={lbl}>Phone</label>
                  <input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="+44..." style={inp} />
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="email@..." style={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>Birthday</label>
                <input type="date" value={addForm.birthday} onChange={e => setAddForm(f => ({ ...f, birthday: e.target.value }))} style={{ ...inp, colorScheme: 'dark' }} />
              </div>
              <div>
                <label style={lbl}>Notes</label>
                <textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="Preferences, allergies, any notes..." rows={3} style={{ ...inp, resize: 'vertical', lineHeight: '1.5' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button onClick={() => setShowAddForm(false)}
                style={{ padding: '10px 18px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.82rem' }}>
                Cancel
              </button>
              <button onClick={handleAddClient} disabled={addSaving || !addForm.name.trim()}
                style={{ padding: '10px 22px', background: (addSaving || !addForm.name.trim()) ? 'rgba(212,175,55,0.25)' : 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '8px', color: (addSaving || !addForm.name.trim()) ? 'var(--muted)' : '#000', fontWeight: '700', fontSize: '0.82rem', cursor: (addSaving || !addForm.name.trim()) ? 'not-allowed' : 'pointer' }}>
                {addSaving ? 'Saving...' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* The main flex column container closes here */}
    </div>
  );
}
