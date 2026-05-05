import React, { useState, useEffect, useMemo } from 'react';
import config from '../config';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

// ── Normalizers ───────────────────────────────────────────────────────────────

function normalizeSource(src) {
  const s = String(src || '').trim().toLowerCase();
  if (s === 'product sale' || s === 'product_sale' || s === 'productsale') return 'Product Sale';
  if (!s || s === 'historical' || s === 'walk_in' || s === 'walkin' || s === 'walk-in' || s === 'manual') return 'Walk-in';
  if (s === 'booksy')  return 'Booksy';
  if (s === 'fresha')  return 'Fresha';
  if (s === 'website') return 'Website';
  return String(src).trim();
}

// Handles Firestore Timestamp, JS Date, number (ms), ISO string
function toDate(val) {
  if (!val) return null;
  if (typeof val.toDate === 'function') return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'number') return new Date(val);
  if (typeof val === 'string') { const d = new Date(val); return isNaN(d) ? null : d; }
  return null;
}

function pp(val) {
  return parseFloat(String(val || '0').replace(/[£-]/g, '').trim()) || 0;
}

function soldProductsTotal(b) {
  const list = Array.isArray(b?.soldProducts) ? b.soldProducts : [];
  return list.reduce((sum, p) => sum + (pp(p?.price) * (parseInt(p?.qty, 10) || 0)), 0);
}

function isProductSaleSource(b) {
  return normalizeSource(b?.source) === 'Product Sale';
}

// Service gross is kept separate from retail products.
// For older data without explicit service price, we keep a safe fallback.
function serviceGross(b) {
  if (isProductSaleSource(b)) return 0;
  const explicit = pp(b.price) + pp(b.serviceCharge);
  if (explicit > 0) return explicit;
  const hasProducts = soldProductsTotal(b) > 0;
  if (hasProducts && !b.serviceId) return 0;
  return Math.max(0, pp(b.paidAmount) - pp(b.tip) - soldProductsTotal(b));
}

function bookingNetWithoutTip(b) {
  return Math.max(0, serviceGross(b) + soldProductsTotal(b) - pp(b.discount));
}

function svcName(serviceId) {
  if (!serviceId) return '—';
  const s = config.services ? config.services.find(x => x.id === serviceId) : null;
  return s ? s.name : serviceId;
}

function getBColor(barber, barbers) {
  if (barbers) { const f = barbers.find(b => b.name.toLowerCase() === (barber || '').toLowerCase()); if (f) return f.color; }
  return { alex: '#d4af37', arda: '#4caf50' }[(barber || '').toLowerCase()] || '#7a7260';
}

// ── Chart components ──────────────────────────────────────────────────────────

function MiniBar({ value, max, color }) {
  const pct = max ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
      <div style={{ width: pct + '%', height: '100%', background: color, borderRadius: '3px', transition: 'width 0.4s' }} />
    </div>
  );
}

function BarChart({ data, color, valueKey, labelKey, height = 120 }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: height + 'px', padding: '0 4px' }}>
      {data.map((d, i) => {
        const h = Math.max(2, (d[valueKey] / max) * height);
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            <div title={`${d[labelKey]}: £${d[valueKey].toFixed(0)}`}
              style={{ width: '100%', height: h + 'px', background: color, borderRadius: '3px 3px 0 0', opacity: 0.85, transition: 'height 0.3s', cursor: 'default' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.85'}
            />
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ segments, size = 100 }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) return <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />;
  let offset = 0;
  const r = 40, cx = 50, cy = 50, stroke = 18, circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />;
        offset += dash;
        return el;
      })}
      <circle cx={cx} cy={cy} r={r - stroke / 2 - 2} fill="var(--card2)" />
    </svg>
  );
}

// ── Period helpers ────────────────────────────────────────────────────────────

const PERIODS = [
  { id: 'today',  label: 'Today' },
  { id: 'week',   label: 'This Week' },
  { id: 'month',  label: 'This Month' },
  { id: 'last30', label: 'Last 30 Days' },
  { id: 'last90', label: 'Last 90 Days' },
  { id: 'year',   label: 'This Year' },
  { id: 'all',    label: 'All Time' },
];

function getPeriodRange(period) {
  const now = new Date();
  if (period === 'today')  { const s = new Date(now); s.setHours(0,0,0,0); const e = new Date(now); e.setHours(23,59,59,999); return { start: s, end: e }; }
  if (period === 'week')   { const day = now.getDay(); const s = new Date(now); s.setDate(now.getDate()-(day===0?6:day-1)); s.setHours(0,0,0,0); const e = new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999); return { start: s, end: e }; }
  if (period === 'month')  { return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59, 999) }; }
  if (period === 'last30') { const s = new Date(now); s.setDate(now.getDate()-30); return { start: s, end: now }; }
  if (period === 'last90') { const s = new Date(now); s.setDate(now.getDate()-90); return { start: s, end: now }; }
  if (period === 'year')   { return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999) }; }
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Reports() {
  const [bookings, setBookings] = useState([]);
  const [barbers,  setBarbers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [period,   setPeriod]   = useState('month');
  const [activeTab, setActiveTab] = useState('overview');
  const [financeGroup, setFinanceGroup] = useState('day'); // day | week | month

  useEffect(() => {
    (async () => {
      try {
        const [bookingsSnap, barbersSnap] = await Promise.all([
          getDocs(collection(db, 'tenants/whitecross/bookings')),
          getDocs(collection(db, 'tenants/whitecross/barbers')),
        ]);
        const fetchedBarbers = barbersSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
        setBarbers(fetchedBarbers);
        const barberById = fetchedBarbers.reduce((acc, b) => {
          if (!b?.name) return acc;
          [b.docId, b.id].filter(Boolean).forEach(k => { acc[String(k).toLowerCase()] = b.name; });
          return acc;
        }, {});
        const rows = bookingsSnap.docs.map(doc => {
          const d = doc.data();
          // Parse startTime; fall back to d.date + d.time for walk-in bookings with no startTime
          let st = toDate(d.startTime);
          if (!st && d.date) {
            const raw = d.time ? d.date + ' ' + d.time : d.date;
            const parsed = new Date(raw);
            if (!isNaN(parsed)) st = parsed;
          }
          const date = st ? st.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : (d.date || '');
          const time = st ? st.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase() : (d.time || '');
          const rawBarber = String(d.barberId || '').trim();
          const barber = d.barberName || barberById[rawBarber.toLowerCase()] || rawBarber;
          const rawStatus = String(d.status || '').trim().toUpperCase().replace(/[-\s]+/g, '_');
          const status = ['CONFIRMED','PENDING','CHECKED_OUT','CANCELLED','BLOCKED','NO_SHOW'].includes(rawStatus) ? rawStatus : (rawStatus || 'CONFIRMED');
          return {
            ...d,
            status,
            _date: st,          // JS Date for range filtering
            date,               // display string
            time,
            name:       d.clientName || 'Walk-in',
            email:      d.clientEmail || '',
            phone:      d.clientPhone || '',
            barber,
            service:    d.serviceId || '',
            source:     normalizeSource(d.source),
            bookingId:  d.bookingId || doc.id,
            paidAmount: d.paidAmount || '',
            price:      d.price || '',
          };
        });
        setBookings(rows);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  // ── Period filter ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const range = getPeriodRange(period);
    if (!range) return bookings;
    return bookings.filter(b => b._date && b._date >= range.start && b._date <= range.end);
  }, [bookings, period]);

  // ── Derived datasets ──────────────────────────────────────────────────────

  const active     = useMemo(() => filtered.filter(b => b.status !== 'CANCELLED' && b.status !== 'BLOCKED'), [filtered]);
  const checkedOut = useMemo(() => filtered.filter(b => b.status === 'CHECKED_OUT'), [filtered]);
  const cancelled  = useMemo(() => filtered.filter(b => b.status === 'CANCELLED'),  [filtered]);

  // Revenue formulas:
  // serviceRevenueGross = sum of service totals (service + serviceCharge)
  // productRevenueGross = sum of soldProducts totals
  // grossRevenue        = service + product gross
  // netRevenue          = grossRevenue - discount
  // totalCollected      = netRevenue + tips
  const serviceRevenueGross = useMemo(() => checkedOut.reduce((s, b) => s + serviceGross(b), 0), [checkedOut]);
  const productRevenueGross = useMemo(() => checkedOut.reduce((s, b) => s + soldProductsTotal(b), 0), [checkedOut]);
  const grossRevenue  = serviceRevenueGross + productRevenueGross;
  const totalDiscount = useMemo(() => checkedOut.reduce((s, b) => s + pp(b.discount), 0), [checkedOut]);
  const totalTips     = useMemo(() => checkedOut.reduce((s, b) => s + pp(b.tip), 0), [checkedOut]);
  const netRevenue    = Math.max(0, grossRevenue - totalDiscount);
  const totalCollected = netRevenue + totalTips;

  // Daily revenue for chart
  const dailyRevenue = useMemo(() => {
    const map = {};
    checkedOut.forEach(b => {
      if (!b._date) return;
      const key = b._date.toISOString().split('T')[0];
      if (!map[key]) map[key] = { date: key, revenue: 0, tips: 0, count: 0 };
      map[key].revenue += bookingNetWithoutTip(b);
      map[key].tips    += pp(b.tip);
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  }, [checkedOut]);

  // Monthly trend
  const monthlyData = useMemo(() => {
    const map = {};
    checkedOut.forEach(b => {
      if (!b._date) return;
      const key = b._date.getFullYear() + '-' + String(b._date.getMonth() + 1).padStart(2, '0');
      if (!map[key]) map[key] = { label: key, revenue: 0, tips: 0, count: 0 };
      map[key].revenue += bookingNetWithoutTip(b);
      map[key].tips    += pp(b.tip);
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => a.label.localeCompare(b.label)).slice(-12);
  }, [checkedOut]);

  // Source breakdown (all active bookings)
  const sourceSegments = useMemo(() => {
    const map = {};
    active.forEach(b => { map[b.source] = (map[b.source] || 0) + 1; });
    const colors = { Booksy: '#9c27b0', Fresha: '#2196f3', Website: '#4caf50', 'Walk-in': '#ff9800', 'Product Sale': '#03a9f4' };
    return Object.entries(map).map(([k, v]) => ({ label: k, value: v, color: colors[k] || '#999' }));
  }, [active]);

  // Payment method breakdown (checked out only)
  const pmSegments = useMemo(() => {
    const map = {};
    checkedOut.forEach(b => { const pm = b.paymentMethod || b.paymentType || 'CASH'; map[pm] = (map[pm] || 0) + 1; });
    const colors = { CASH: '#d4af37', CARD: '#2196f3', VOUCHER: '#9c27b0', SPLIT: '#ff9800' };
    return Object.entries(map).map(([k, v]) => ({ label: k, value: v, color: colors[k] || '#999' }));
  }, [checkedOut]);

  // Barber stats
  const barberStats = useMemo(() => barbers.map(barber => {
    const bs = active.filter(b => (b.barber || '').toLowerCase() === barber.name.toLowerCase());
    const co = bs.filter(b => b.status === 'CHECKED_OUT');
    const rev = co.reduce((s, b) => s + bookingNetWithoutTip(b), 0);
    const tips = co.reduce((s, b) => s + pp(b.tip), 0);
    return { name: barber.name, color: barber.color, bookings: bs.length, checkedOut: co.length, revenue: rev, tips };
  }), [barbers, active]);

  // Service stats
  const serviceStats = useMemo(() => {
    const map = {};
    active.forEach(b => {
      if (!b.service) return;
      const name = svcName(b.service);
      if (!map[name]) map[name] = { name, count: 0, checkedOut: 0, revenue: 0 };
      map[name].count++;
      if (b.status === 'CHECKED_OUT') {
        map[name].checkedOut++;
        map[name].revenue += Math.max(0, serviceGross(b) - pp(b.discount));
      }
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [active]);

  const productStats = useMemo(() => {
    const map = {};
    checkedOut.forEach(b => {
      const items = Array.isArray(b.soldProducts) ? b.soldProducts : [];
      items.forEach((item) => {
        const name = String(item?.name || '').trim() || 'Unnamed Product';
        if (!map[name]) map[name] = { name, qty: 0, revenue: 0, txCount: 0 };
        const qty = parseInt(item?.qty, 10) || 0;
        const line = pp(item?.price) * qty;
        map[name].qty += qty;
        map[name].revenue += line;
        map[name].txCount += qty > 0 ? 1 : 0;
      });
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [checkedOut]);

  // Client stats
  const clientMap = useMemo(() => {
    const map = {};
    checkedOut.forEach(b => {
      const key = b.phone || b.email || b.name;
      if (!key || b.name === 'Walk-in') return;
      if (!map[key]) map[key] = { name: b.name, spent: 0, dates: new Set() };
      map[key].spent += bookingNetWithoutTip(b);
      if (b.date) map[key].dates.add(b.date);
    });
    return map;
  }, [checkedOut]);
  const topClients = useMemo(() =>
    Object.values(clientMap).map(c => ({ ...c, visits: c.dates.size }))
      .sort((a, b) => b.spent - a.spent).slice(0, 10),
  [clientMap]);

  // Finance ledger — all checked out rows sorted by date desc
  const financeRows = useMemo(() =>
    checkedOut
      .filter(b => b._date)
      .sort((a, b) => (b._date?.getTime() || 0) - (a._date?.getTime() || 0)),
  [checkedOut]);

  // Group key for finance grouping
  function groupKey(b) {
    if (!b._date) return 'Unknown';
    if (financeGroup === 'day')   return b.date;
    if (financeGroup === 'week')  {
      const d = b._date, day = d.getDay();
      const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      return 'Week of ' + mon.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (financeGroup === 'month') return b._date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return b.date;
  }

  const financeGrouped = useMemo(() => {
    const map = {};
    financeRows.forEach(b => {
      const k = groupKey(b);
      if (!map[k]) map[k] = { label: k, rows: [], serviceGross: 0, productGross: 0, gross: 0, discount: 0, tips: 0, cash: 0, card: 0 };
      const g = map[k];
      const service = serviceGross(b);
      const product = soldProductsTotal(b);
      const price = service + product;
      const disc  = pp(b.discount);
      const tip   = pp(b.tip);
      const net   = Math.max(0, price - disc) + tip;
      const pm    = (b.paymentMethod || b.paymentType || '').toUpperCase();
      g.rows.push(b);
      g.serviceGross += service;
      g.productGross += product;
      g.gross    += price;
      g.discount += disc;
      g.tips     += tip;
      if (pm === 'CASH')  g.cash += net;
      if (pm === 'CARD')  g.card += net;
    });
    return Object.values(map);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [financeRows, financeGroup]);

  // CSV export for finance tab
  const exportFinanceCSV = () => {
    const rows = [['Date', 'Time', 'Client', 'Phone', 'Service', 'Barber', 'Service Gross', 'Products Gross', 'Discount', 'Tip', 'Payment', 'Total', 'Source', 'Booking ID']];
    financeRows.forEach(b => {
      const service = serviceGross(b), products = soldProductsTotal(b), disc = pp(b.discount), tip = pp(b.tip);
      rows.push([b.date, b.time, b.name, b.phone, svcName(b.service), b.barber,
        service.toFixed(2), products.toFixed(2), disc > 0 ? disc.toFixed(2) : '', tip > 0 ? tip.toFixed(2) : '',
        b.paymentMethod || b.paymentType || '', (Math.max(0, service + products - disc) + tip).toFixed(2),
        b.source, b.bookingId]);
    });
    const csv = rows.map(r => r.map(v => `"${v || ''}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `finance_${period}.csv`;
    a.click();
  };

  // ── Styles ────────────────────────────────────────────────────────────────

  const card  = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px 20px' };
  const lbl   = { fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '600', marginBottom: '8px' };
  const th    = { padding: '8px 10px', fontSize: '0.58rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', textAlign: 'left', fontWeight: '600', whiteSpace: 'nowrap' };
  const td    = (extra) => ({ padding: '7px 10px', fontSize: '0.75rem', ...extra });

  const tabs  = ['overview', 'finance', 'barbers', 'services', 'products', 'clients'];

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--muted)' }}>Loading reports...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text)', margin: 0 }}>Reports</h1>
          <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '2px 0 0' }}>{active.length} bookings · {checkedOut.length} checked out</p>
        </div>
        <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              style={{ padding: '7px 11px', border: 'none', cursor: 'pointer', background: period === p.id ? '#d4af37' : 'transparent', color: period === p.id ? '#000' : 'var(--muted)', fontSize: '0.7rem', fontWeight: period === p.id ? '700' : '400', whiteSpace: 'nowrap' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', borderBottom: '1px solid var(--border)' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ padding: '7px 14px', background: 'transparent', border: 'none', color: activeTab === t ? '#d4af37' : 'var(--muted)', fontSize: '0.78rem', fontWeight: activeTab === t ? '700' : '400', cursor: 'pointer', borderBottom: activeTab === t ? '2px solid #d4af37' : '2px solid transparent', textTransform: 'capitalize', marginBottom: '-1px' }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            {[
              { label: 'Total Bookings',  value: active.length,                    sub: cancelled.length + ' cancelled',                                    color: '#d4af37' },
              { label: 'Checked Out',     value: checkedOut.length,                 sub: active.length ? Math.round(checkedOut.length/active.length*100)+'% rate' : '—', color: '#4caf50' },
              { label: 'Service Gross',   value: '£'+serviceRevenueGross.toFixed(2), sub: 'service + service charge',                                        color: '#d4af37' },
              { label: 'Products Gross',  value: '£'+productRevenueGross.toFixed(2), sub: productStats.length + ' product types sold',                       color: '#03a9f4' },
              { label: 'Gross Revenue',   value: '£'+grossRevenue.toFixed(2),        sub: 'service + products',                                               color: '#d4af37' },
              { label: 'Net Revenue',     value: '£'+netRevenue.toFixed(2),         sub: 'after discounts',                                                  color: '#4caf50' },
              { label: 'Tips',            value: '£'+totalTips.toFixed(2),          sub: checkedOut.filter(b=>pp(b.tip)>0).length+' bookings tipped',        color: '#2196f3' },
              { label: 'Total Collected', value: '£'+totalCollected.toFixed(2),     sub: 'net + tips',                                                       color: '#d4af37' },
              { label: 'Avg per Sale',    value: checkedOut.length ? '£'+(netRevenue/checkedOut.length).toFixed(2) : '—', sub: 'excl. tips & discount',      color: '#2196f3' },
            ].map(k => (
              <div key={k.label} style={{ ...card, borderTop: '2px solid '+k.color+'40' }}>
                <div style={lbl}>{k.label}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: '800', color: k.color }}>{k.value}</div>
                <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: '3px' }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {dailyRevenue.length > 0 && (
            <div style={card}>
              <div style={lbl}>Daily Revenue (last 30 days)</div>
              <BarChart data={dailyRevenue} valueKey="revenue" labelKey="date" color="#d4af37" height={90} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '0.58rem', color: 'var(--muted)' }}>{dailyRevenue[0]?.date}</span>
                <span style={{ fontSize: '0.58rem', color: 'var(--muted)' }}>{dailyRevenue[dailyRevenue.length-1]?.date}</span>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={card}>
              <div style={lbl}>Booking Sources</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <DonutChart segments={sourceSegments} size={80} />
                <div style={{ flex: 1 }}>
                  {sourceSegments.map(s => (
                    <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: s.color }} />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text)' }}>{s.label}</span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: s.color, fontWeight: '700' }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={card}>
              <div style={lbl}>Payment Methods</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <DonutChart segments={pmSegments} size={80} />
                <div style={{ flex: 1 }}>
                  {pmSegments.map(s => (
                    <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: s.color }} />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text)' }}>{s.label}</span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: s.color, fontWeight: '700' }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FINANCE ── */}
      {activeTab === 'finance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Summary bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
            {[
              { label: 'Service Gross',   value: '£'+serviceRevenueGross.toFixed(2), color: '#d4af37' },
              { label: 'Products Gross',  value: '£'+productRevenueGross.toFixed(2), color: '#03a9f4' },
              { label: 'Gross Revenue',   value: '£'+grossRevenue.toFixed(2),   color: '#d4af37' },
              { label: 'Discounts',       value: '−£'+totalDiscount.toFixed(2), color: '#ff5252' },
              { label: 'Net Revenue',     value: '£'+netRevenue.toFixed(2),     color: '#4caf50' },
              { label: 'Tips',            value: '£'+totalTips.toFixed(2),      color: '#2196f3' },
              { label: 'Total Collected', value: '£'+totalCollected.toFixed(2), color: '#d4af37' },
              { label: 'Transactions',    value: checkedOut.length,             color: '#9c27b0' },
            ].map(k => (
              <div key={k.label} style={{ ...card, borderLeft: '3px solid '+k.color, padding: '12px 16px' }}>
                <div style={lbl}>{k.label}</div>
                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Group toggle + Export */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              {[['day','Daily'],['week','Weekly'],['month','Monthly']].map(([k, l]) => (
                <button key={k} onClick={() => setFinanceGroup(k)}
                  style={{ padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600',
                    background: financeGroup === k ? '#d4af37' : 'transparent',
                    color:      financeGroup === k ? '#000' : 'var(--muted)' }}>
                  {l}
                </button>
              ))}
            </div>
            <button onClick={exportFinanceCSV}
              style={{ padding: '6px 14px', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '8px', color: '#d4af37', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}>
              Export CSV
            </button>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginLeft: 'auto' }}>{financeRows.length} transactions</span>
          </div>

          {/* Ledger grouped */}
          {financeGrouped.map((group, gi) => (
            <div key={gi} style={card}>
              {/* Group header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#d4af37' }}>{group.label}</span>
                <div style={{ display: 'flex', gap: '16px' }}>
                  {[
                    ['Service', '£'+group.serviceGross.toFixed(2), '#d4af37'],
                    ['Products', '£'+group.productGross.toFixed(2), '#03a9f4'],
                    ['Gross', '£'+group.gross.toFixed(2), '#d4af37'],
                    group.discount > 0 ? ['Disc', '−£'+group.discount.toFixed(2), '#ff5252'] : null,
                    group.tips > 0    ? ['Tips', '+£'+group.tips.toFixed(2), '#2196f3'] : null,
                    ['Net', '£'+(group.gross - group.discount + group.tips).toFixed(2), '#4caf50'],
                    group.cash > 0 ? ['Cash', '£'+group.cash.toFixed(2), '#d4af37'] : null,
                    group.card > 0 ? ['Card', '£'+group.card.toFixed(2), '#2196f3'] : null,
                  ].filter(Boolean).map(([l, v, c]) => (
                    <div key={l} style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.55rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>{l}</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: '700', color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Transaction rows */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Date','Time','Client','Service','Barber','Service','Products','Disc','Tip','Method','Total','Source'].map(h => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((b, i) => {
                      const service = serviceGross(b), products = soldProductsTotal(b), disc = pp(b.discount), tip = pp(b.tip);
                      const total = Math.max(0, service + products - disc) + tip;
                      const pm = (b.paymentMethod || b.paymentType || '—').toUpperCase();
                      return (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}
                          onMouseEnter={e => e.currentTarget.style.background='rgba(212,175,55,0.03)'}
                          onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          <td style={td({ color:'var(--muted)' })}>{b.date}</td>
                          <td style={td({ color:'var(--muted)' })}>{b.time}</td>
                          <td style={td({ color:'var(--text)', fontWeight:'600' })}>
                            {b.name}
                            {b.phone && <div style={{ fontSize: '0.6rem', color: 'var(--muted)', fontWeight: '400' }}>{b.phone}</div>}
                          </td>
                          <td style={td({ color:'var(--text)' })}>{svcName(b.service)}</td>
                          <td style={td({ color: getBColor(b.barber, barbers), fontWeight:'600' })}>{(b.barber||'—').toUpperCase()}</td>
                          <td style={td({ color:'var(--text)', fontWeight:'600' })}>£{service.toFixed(2)}</td>
                          <td style={td({ color:'#03a9f4', fontWeight:'600' })}>£{products.toFixed(2)}</td>
                          <td style={td({ color: disc > 0 ? '#ff5252' : 'var(--border)' })}>{disc > 0 ? '−£'+disc.toFixed(2) : '—'}</td>
                          <td style={td({ color: tip > 0 ? '#2196f3' : 'var(--border)' })}>{tip > 0 ? '+£'+tip.toFixed(2) : '—'}</td>
                          <td style={td({})}>
                            <span style={{ padding:'2px 6px', borderRadius:'4px', fontSize:'0.6rem', fontWeight:'700',
                              background: pm==='CASH'?'rgba(212,175,55,0.15)':'rgba(33,150,243,0.15)',
                              color:      pm==='CASH'?'#d4af37':'#2196f3' }}>
                              {pm}
                            </span>
                          </td>
                          <td style={td({ color:'#4caf50', fontWeight:'700' })}>£{total.toFixed(2)}</td>
                          <td style={td({ color:'var(--muted)' })}>{b.source}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {financeGrouped.length === 0 && (
            <div style={{ textAlign:'center', padding:'50px', color:'var(--muted)' }}>No checked-out bookings in this period.</div>
          )}
        </div>
      )}

      {/* ── PRODUCTS ── */}
      {activeTab === 'products' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            {[
              { label: 'Product Revenue', value: '£' + productRevenueGross.toFixed(2), color: '#03a9f4' },
              { label: 'Units Sold', value: productStats.reduce((s, p) => s + p.qty, 0), color: '#4caf50' },
              { label: 'Products Sold', value: productStats.length, color: '#d4af37' },
              { label: 'Sale Tx Count', value: checkedOut.filter(b => soldProductsTotal(b) > 0).length, color: '#ff9800' },
            ].map(k => (
              <div key={k.label} style={{ ...card, borderLeft: '3px solid ' + k.color }}>
                <div style={lbl}>{k.label}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: '800', color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          <div style={card}>
            <div style={lbl}>Top Products by Revenue</div>
            {productStats.length === 0 && (
              <div style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>No product sales in this period.</div>
            )}
            {productStats.slice(0, 10).map((p, i) => (
              <div key={p.name} style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text)', fontWeight: i === 0 ? '700' : '500' }}>{p.name}</span>
                  <span style={{ fontSize: '0.72rem', color: '#03a9f4', fontWeight: '700' }}>£{p.revenue.toFixed(2)} ({p.qty} pcs)</span>
                </div>
                <MiniBar value={p.revenue} max={productStats[0]?.revenue || 1} color={i === 0 ? '#03a9f4' : 'rgba(3,169,244,0.45)'} />
              </div>
            ))}
          </div>

          <div style={card}>
            <div style={lbl}>Product Breakdown</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Product', 'Units', 'Transactions', 'Revenue', 'Avg Unit Price'].map(h => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {productStats.map((p, i) => (
                  <tr key={p.name} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td({ color: 'var(--muted)' })}>#{i + 1}</td>
                    <td style={td({ color: 'var(--text)', fontWeight: '600' })}>{p.name}</td>
                    <td style={td({ color: 'var(--muted)' })}>{p.qty}</td>
                    <td style={td({ color: 'var(--muted)' })}>{p.txCount}</td>
                    <td style={td({ color: '#03a9f4', fontWeight: '700' })}>£{p.revenue.toFixed(2)}</td>
                    <td style={td({ color: 'var(--muted)' })}>{p.qty > 0 ? '£' + (p.revenue / p.qty).toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BARBERS ── */}
      {activeTab === 'barbers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            {barberStats.map(b => (
              <div key={b.name} style={{ ...card, borderTop: '3px solid '+b.color }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: b.color+'22', border: '1px solid '+b.color+'44', display:'flex', alignItems:'center', justifyContent:'center', fontSize: '0.88rem', fontWeight: '800', color: b.color }}>{b.name[0]}</div>
                  <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text)' }}>{b.name}</span>
                </div>
                {[
                  ['Bookings',        b.bookings],
                  ['Checked Out',     b.checkedOut],
                  ['Gross Revenue',   '£'+b.revenue.toFixed(2)],
                  ['Tips Earned',     b.tips > 0 ? '£'+b.tips.toFixed(2) : '—'],
                  ['Total Collected', '£'+(b.revenue+b.tips).toFixed(2)],
                  ['Avg per Booking', b.checkedOut ? '£'+(b.revenue/b.checkedOut).toFixed(2) : '—'],
                ].map(([l, v]) => (
                  <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{l}</span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text)', fontWeight: '600' }}>{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {barberStats.length > 0 && (
            <div style={card}>
              <div style={lbl}>Revenue Comparison</div>
              {barberStats.map(b => {
                const max = Math.max(...barberStats.map(x => x.revenue), 1);
                return (
                  <div key={b.name} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text)', fontWeight: '600' }}>{b.name}</span>
                      <span style={{ fontSize: '0.75rem', color: b.color, fontWeight: '700' }}>£{b.revenue.toFixed(2)}</span>
                    </div>
                    <div style={{ height: '7px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: (b.revenue/max*100)+'%', height: '100%', background: b.color, borderRadius: '4px', transition: 'width 0.5s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SERVICES ── */}
      {activeTab === 'services' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={card}>
              <div style={lbl}>Most Popular</div>
              {serviceStats.slice(0,8).map((s, i) => (
                <div key={s.name} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text)', fontWeight: i===0?'700':'400' }}>{s.name}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{s.count}×</span>
                  </div>
                  <MiniBar value={s.count} max={serviceStats[0]?.count||1} color={i===0?'#d4af37':'rgba(212,175,55,0.45)'} />
                </div>
              ))}
            </div>
            <div style={card}>
              <div style={lbl}>Revenue by Service</div>
              {[...serviceStats].sort((a,b)=>b.revenue-a.revenue).slice(0,8).map((s, i) => (
                <div key={s.name} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text)', fontWeight: i===0?'700':'400' }}>{s.name}</span>
                    <span style={{ fontSize: '0.7rem', color: '#d4af37', fontWeight: '600' }}>£{s.revenue.toFixed(0)}</span>
                  </div>
                  <MiniBar value={s.revenue} max={serviceStats.sort((a,b)=>b.revenue-a.revenue)[0]?.revenue||1} color={i===0?'#4caf50':'rgba(76,175,80,0.45)'} />
                </div>
              ))}
            </div>
          </div>
          <div style={card}>
            <div style={lbl}>Full Breakdown</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Service','Bookings','Checked Out','Revenue','Avg Price'].map(h => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...serviceStats].sort((a,b)=>b.revenue-a.revenue).map((s, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td({ color:'var(--text)', fontWeight:'500' })}>{s.name}</td>
                    <td style={td({ color:'var(--muted)' })}>{s.count}</td>
                    <td style={td({ color:'var(--muted)' })}>{s.checkedOut}</td>
                    <td style={td({ color:'#d4af37', fontWeight:'600' })}>£{s.revenue.toFixed(2)}</td>
                    <td style={td({ color:'var(--muted)' })}>{s.checkedOut ? '£'+(s.revenue/s.checkedOut).toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CLIENTS ── */}
      {activeTab === 'clients' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            {[
              { label: 'Unique Clients',  value: Object.keys(clientMap).length,                                   color: '#d4af37' },
              { label: 'Walk-ins',        value: active.filter(b => b.name === 'Walk-in').length,                 color: '#ff9800' },
              { label: 'Returning',       value: Object.values(clientMap).filter(c => c.dates.size > 1).length,  color: '#4caf50' },
              { label: 'New Clients',     value: Object.values(clientMap).filter(c => c.dates.size === 1).length, color: '#2196f3' },
            ].map(k => (
              <div key={k.label} style={{ ...card, borderLeft: '3px solid '+k.color }}>
                <div style={lbl}>{k.label}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
          <div style={card}>
            <div style={lbl}>Top Clients by Spend</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['#','Client','Visits','Total Spent','Avg/Visit'].map(h => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {topClients.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td({ color:'var(--muted)' })}>#{i+1}</td>
                    <td style={td({})}>
                      <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
                        <div style={{ width:'24px', height:'24px', borderRadius:'50%', background:'rgba(212,175,55,0.15)', border:'1px solid rgba(212,175,55,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.68rem', fontWeight:'700', color:'#d4af37' }}>{c.name[0]}</div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text)', fontWeight: '600' }}>{c.name}</span>
                        {i===0 && <span style={{ fontSize:'0.52rem', background:'rgba(212,175,55,0.2)', color:'#d4af37', padding:'1px 4px', borderRadius:'3px', fontWeight:'700' }}>TOP</span>}
                      </div>
                    </td>
                    <td style={td({ color:'var(--muted)' })}>{c.visits}</td>
                    <td style={td({ color:'#d4af37', fontWeight:'700' })}>£{c.spent.toFixed(2)}</td>
                    <td style={td({ color:'var(--muted)' })}>£{(c.spent/c.visits).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
