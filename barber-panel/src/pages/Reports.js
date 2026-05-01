import React, { useState, useEffect, useMemo } from 'react';
import config from '../config';
import { db } from '../firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
function getBColor(barber, barbers) {
  if (barbers) { const f = barbers.find(b => b.name.toLowerCase() === (barber || '').toLowerCase()); if (f) return f.color; }
  return { alex: '#d4af37', arda: '#4caf50', manoj: '#9c27b0' }[(barber || '').toLowerCase()] || '#7a7260';
}

function parsePrice(val) {
  return parseFloat(String(val || '0').replace('£', '').replace('-', '')) || 0;
}
function effectivePrice(b) {
  const p = parsePrice(b.price);
  if (p > 0) return p;
  // For old walk-in records stored without price field, paidAmount at checkout = total (includes tip)
  // Use paidAmount minus tip as the best approximation of service price
  const paid = parsePrice(b.paidAmount);
  const tip = parsePrice(b.tip);
  return Math.max(0, paid - tip);
}

function parseDateStr(dateStr) {
  if (!dateStr) return null;
  const months = { January: 0, February: 1, March: 2, April: 3, May: 4, June: 5, July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 };
  const parts = String(dateStr).split(' ');
  if (parts.length === 3) {
    const d = parseInt(parts[0]), m = months[parts[1]], y = parseInt(parts[2]);
    if (!isNaN(d) && m !== undefined && !isNaN(y)) return new Date(y, m, d);
  }
  const d = new Date(dateStr);
  return isNaN(d) ? null : d;
}

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
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', position: 'relative' }}>
            <div title={d[labelKey] + ': ' + d[valueKey]}
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
  const r = 40, cx = 50, cy = 50, stroke = 18;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const gap = circ - dash;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r}
            fill="none" stroke={seg.color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dasharray 0.4s' }}
          />
        );
        offset += dash;
        return el;
      })}
      <circle cx={cx} cy={cy} r={r - stroke / 2 - 2} fill="var(--card2)" />
    </svg>
  );
}

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'last30', label: 'Last 30 Days' },
  { id: 'last90', label: 'Last 90 Days' },
  { id: 'year', label: 'This Year' },
  { id: 'all', label: 'All Time' },
];

export default function Reports() {
  const [bookings, setBookings] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchData = async () => {
  try {
    const [bookingsSnap, barbersSnap] = await Promise.all([
      getDocs(query(collection(db, 'tenants/whitecross/bookings'), orderBy('startTime', 'desc'))),
      getDocs(collection(db, 'tenants/whitecross/barbers')),
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
      const startTime = d.startTime?.toDate();
      const date = startTime ? startTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      const time = startTime ? startTime.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase() : '';
      const rawBarber = String(d.barberId || '').trim();
      const barber = d.barberName || barberNameById[rawBarber.toLowerCase()] || rawBarber;
      return { ...d, name: d.clientName || 'Walk-in', email: d.clientEmail || '', phone: d.clientPhone || '', barber, service: d.serviceId || '', date, time, bookingId: d.bookingId || doc.id, source: d.source || 'website', paidAmount: d.paidAmount || '', price: d.price || '' };
    });
    setBookings(fetchedBookings);
  } catch (e) { console.log(e); }
  finally { setLoading(false); }
};
    fetchData();
  }, []);

  const now = new Date();

  const periodStart = useMemo(() => {
    const d = new Date();
    if (period === 'today') { d.setHours(0, 0, 0, 0); return d; }
    if (period === 'week') { const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); d.setHours(0, 0, 0, 0); return d; }
    if (period === 'month') { return new Date(d.getFullYear(), d.getMonth(), 1); }
    if (period === 'last30') { d.setDate(d.getDate() - 30); return d; }
    if (period === 'last90') { d.setDate(d.getDate() - 90); return d; }
    if (period === 'year') { return new Date(d.getFullYear(), 0, 1); }
    return null;
  }, [period]);

  const filtered = useMemo(() => {
    if (!periodStart) return bookings;
    return bookings.filter(b => {
      const d = parseDateStr(b.date);
      return d && d >= periodStart && d <= now;
    });
  }, [bookings, periodStart]);

  const active = filtered.filter(b => b.status !== 'CANCELLED' && b.status !== 'BLOCKED');
  const checkedOut = filtered.filter(b => b.status === 'CHECKED_OUT');
  const cancelled = filtered.filter(b => b.status === 'CANCELLED');

  const totalRevenue = checkedOut.reduce((s, b) => s + effectivePrice(b), 0);
  const totalTips = checkedOut.reduce((s, b) => s + parsePrice(b.tip), 0);
  const totalDiscount = checkedOut.reduce((s, b) => s + parsePrice(b.discount), 0);
  const netRevenue = totalRevenue - totalDiscount + totalTips;

  // Daily revenue for chart
  const dailyRevenue = useMemo(() => {
    const map = {};
    checkedOut.forEach(b => {
      const d = parseDateStr(b.date);
      if (!d) return;
      const key = d.toISOString().split('T')[0];
      if (!map[key]) map[key] = { date: key, revenue: 0, tips: 0, count: 0 };
      map[key].revenue += Math.max(0, effectivePrice(b) - parsePrice(b.discount));
      map[key].tips += parsePrice(b.tip);
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  }, [checkedOut]);

  // Source breakdown
  const sourceMap = {};
  active.forEach(b => {
    const src = b.source ? (b.source.charAt(0).toUpperCase() + b.source.slice(1).toLowerCase()).replace('Walk-in','Walk-in') : 'Unknown';
    const normalized = src === 'Walk-in' ? 'Walk-in' : src.charAt(0).toUpperCase() + src.slice(1);
    sourceMap[normalized] = (sourceMap[normalized] || 0) + 1;
  });
  const sourceColors = { Booksy: '#9c27b0', Fresha: '#2196f3', Website: '#4caf50', 'Walk-in': '#ff9800', Manual: '#ff5252', Unknown: '#607d8b' };
  const sourceSegments = Object.entries(sourceMap).map(([k, v]) => ({ label: k, value: v, color: sourceColors[k] || '#999' }));

  // Payment method breakdown
  const pmMap = {};
  checkedOut.forEach(b => { const pm = b.paymentMethod || b.paymentType || 'CASH'; pmMap[pm] = (pmMap[pm] || 0) + 1; });
  const pmColors = { CASH: '#d4af37', CARD: '#2196f3', VOUCHER: '#9c27b0', SPLIT: '#ff9800', UNPAID: '#ff5252' };
  const pmSegments = Object.entries(pmMap).map(([k, v]) => ({ label: k, value: v, color: pmColors[k] || '#999' }));

  // Barber stats
  const barberStats = barbers.map(barber => {
    const bs = active.filter(b => (b.barber || '').toLowerCase() === barber.name.toLowerCase());
    const co = bs.filter(b => b.status === 'CHECKED_OUT');
    return {
      name: barber.name, color: barber.color,
      bookings: bs.length,
      revenue: co.reduce((s, b) => s + Math.max(0, effectivePrice(b) - parsePrice(b.discount)), 0),
      tips: co.reduce((s, b) => s + parsePrice(b.tip), 0),
      checkedOut: co.length,
    };
  });

  // Service stats
  const svcMap = {};
  active.forEach(b => {
    const svc = config.services ? config.services.find(s => s.id === b.service) : null;
    const name = svc ? svc.name : (b.service || 'Unknown');
    if (!svcMap[name]) svcMap[name] = { name, count: 0, checkedOut: 0, revenue: 0 };
    svcMap[name].count++;
    if (b.status === 'CHECKED_OUT') {
      svcMap[name].checkedOut++;
      svcMap[name].revenue += Math.max(0, effectivePrice(b) - parsePrice(b.discount));
    }
  });
  const topServices = Object.values(svcMap).sort((a, b) => b.count - a.count).slice(0, 8);

  // Client stats — deduplicate visits by date (same-day duplicates count as 1 visit)
  const clientMap = {};
  checkedOut.forEach(b => {
    const key = b.phone || b.email || b.name;
    if (!key || b.name === 'Walk-in') return;
    if (!clientMap[key]) clientMap[key] = { name: b.name, spent: 0, dates: new Set() };
    clientMap[key].spent += Math.max(0, effectivePrice(b) - parsePrice(b.discount));
    if (b.date) clientMap[key].dates.add(b.date);
  });
  const topClients = Object.values(clientMap)
    .map(c => ({ ...c, visits: c.dates.size }))
    .sort((a, b) => b.spent - a.spent).slice(0, 10);

  // Monthly revenue trend
  const monthlyMap = {};
  checkedOut.forEach(b => {
    const d = parseDateStr(b.date);
    if (!d) return;
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!monthlyMap[key]) monthlyMap[key] = { label: key, revenue: 0, count: 0, tips: 0 };
    monthlyMap[key].revenue += Math.max(0, effectivePrice(b) - parsePrice(b.discount));
    monthlyMap[key].tips += parsePrice(b.tip);
    monthlyMap[key].count++;
  });
  const monthlyData = Object.values(monthlyMap).sort((a, b) => a.label.localeCompare(b.label)).slice(-12);

  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px 20px' };
  const lbl = { fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '600', marginBottom: '8px' };

  const tabs = ['overview', 'revenue', 'barbers', 'services', 'clients'];

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--muted)' }}>Loading reports...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text)', margin: 0 }}>Reports</h1>
          <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '4px 0 0' }}>{active.length} bookings in period</p>
        </div>
        {/* Period selector */}
        <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              style={{ padding: '8px 12px', border: 'none', cursor: 'pointer', background: period === p.id ? '#d4af37' : 'transparent', color: period === p.id ? '#000' : 'var(--muted)', fontSize: '0.72rem', fontWeight: period === p.id ? '700' : '400', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ padding: '8px 16px', background: 'transparent', border: 'none', color: activeTab === t ? '#d4af37' : 'var(--muted)', fontSize: '0.78rem', fontWeight: activeTab === t ? '700' : '400', cursor: 'pointer', borderBottom: activeTab === t ? '2px solid #d4af37' : '2px solid transparent', textTransform: 'capitalize', transition: 'all 0.15s' }}>
            {t}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            {[
              { label: 'Total Bookings', value: active.length, sub: cancelled.length + ' cancelled', color: '#d4af37' },
              { label: 'Checked Out', value: checkedOut.length, sub: active.length ? Math.round(checkedOut.length / active.length * 100) + '% conversion' : '0%', color: '#4caf50' },
              { label: 'Revenue', value: '£' + totalRevenue.toFixed(2), sub: '+£' + totalTips.toFixed(2) + ' tips', color: '#4caf50' },
              { label: 'Net Revenue', value: '£' + netRevenue.toFixed(2), sub: '-£' + totalDiscount.toFixed(2) + ' discount', color: '#d4af37' },
              { label: 'Tips', value: '£' + totalTips.toFixed(2), sub: checkedOut.length ? (checkedOut.filter(b => parsePrice(b.tip) > 0).length) + ' bookings tipped' : '--', color: '#4caf50' },
              { label: 'Avg Sale', value: checkedOut.length ? '£' + ((totalRevenue - totalDiscount) / checkedOut.length).toFixed(2) : '--', sub: 'per checkout', color: '#2196f3' },
            ].map(k => (
              <div key={k.label} style={{ ...card, borderTop: '2px solid ' + k.color + '40' }}>
                <div style={lbl}>{k.label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '800', color: k.color }}>{k.value}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: '4px' }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Daily chart */}
          {dailyRevenue.length > 0 && (
            <div style={card}>
              <div style={lbl}>Daily Revenue (last 30 days)</div>
              <BarChart data={dailyRevenue} valueKey="revenue" labelKey="date" color="#d4af37" height={100} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                <span style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>{dailyRevenue[0]?.date}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>{dailyRevenue[dailyRevenue.length - 1]?.date}</span>
              </div>
            </div>
          )}

          {/* Source + payment row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={card}>
              <div style={lbl}>Booking Sources</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <DonutChart segments={sourceSegments} size={90} />
                <div style={{ flex: 1 }}>
                  {sourceSegments.map(s => (
                    <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <DonutChart segments={pmSegments} size={90} />
                <div style={{ flex: 1 }}>
                  {pmSegments.map(s => (
                    <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
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

      {/* REVENUE TAB */}
      {activeTab === 'revenue' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            {[
              { label: 'Gross Revenue', value: '£' + totalRevenue.toFixed(2), color: '#d4af37' },
              { label: 'Tips', value: '£' + totalTips.toFixed(2), color: '#4caf50' },
              { label: 'Discounts Given', value: '-£' + totalDiscount.toFixed(2), color: '#ff5252' },
              { label: 'Net Revenue', value: '£' + netRevenue.toFixed(2), color: '#4caf50' },
            ].map(k => (
              <div key={k.label} style={{ ...card, borderLeft: '3px solid ' + k.color }}>
                <div style={lbl}>{k.label}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: '800', color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Monthly trend */}
          {monthlyData.length > 0 && (
            <div style={card}>
              <div style={lbl}>Monthly Revenue Trend</div>
              <BarChart data={monthlyData} valueKey="revenue" labelKey="label" color="#d4af37" height={120} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                {monthlyData.map((d, i) => (
                  <span key={i} style={{ fontSize: '0.52rem', color: 'var(--muted)', flex: 1, textAlign: 'center' }}>{d.label.slice(5)}</span>
                ))}
              </div>
            </div>
          )}

          {/* Daily breakdown table */}
          <div style={card}>
            <div style={lbl}>Daily Breakdown</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Date', 'Bookings', 'Revenue', 'Tips', 'Total'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', textAlign: 'left', fontWeight: '600' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dailyRevenue.slice().reverse().map((d, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontSize: '0.78rem', color: 'var(--text)' }}>{d.date}</td>
                      <td style={{ padding: '8px 12px', fontSize: '0.78rem', color: 'var(--muted)' }}>{d.count}</td>
                      <td style={{ padding: '8px 12px', fontSize: '0.78rem', color: '#d4af37', fontWeight: '600' }}>£{d.revenue.toFixed(2)}</td>
                      <td style={{ padding: '8px 12px', fontSize: '0.78rem', color: '#4caf50' }}>{d.tips > 0 ? '£' + d.tips.toFixed(2) : '--'}</td>
                      <td style={{ padding: '8px 12px', fontSize: '0.82rem', color: '#d4af37', fontWeight: '700' }}>£{(d.revenue + d.tips).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* BARBERS TAB */}
      {activeTab === 'barbers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            {barberStats.map(b => (
              <div key={b.name} style={{ ...card, borderTop: '3px solid ' + b.color }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: b.color + '22', border: '1px solid ' + b.color + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: '800', color: b.color }}>{b.name[0]}</div>
                  <span style={{ fontSize: '0.92rem', fontWeight: '700', color: 'var(--text)' }}>{b.name}</span>
                </div>
                {[
                  { label: 'Bookings', value: b.bookings },
                  { label: 'Checked Out', value: b.checkedOut },
                  { label: 'Revenue', value: '£' + b.revenue.toFixed(2) },
                  { label: 'Tips Earned', value: b.tips > 0 ? '£' + b.tips.toFixed(2) : '--' },
                  { label: 'Total Incl. Tips', value: '£' + (b.revenue + b.tips).toFixed(2) },
                  { label: 'Avg/Booking', value: b.checkedOut ? '£' + (b.revenue / b.checkedOut).toFixed(2) : '--' },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{s.label}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text)', fontWeight: '600' }}>{s.value}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Barber comparison bar */}
          {barberStats.length > 0 && (
            <div style={card}>
              <div style={lbl}>Revenue Comparison</div>
              {barberStats.map(b => {
                const maxRev = Math.max(...barberStats.map(x => x.revenue), 1);
                return (
                  <div key={b.name} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text)', fontWeight: '600' }}>{b.name}</span>
                      <span style={{ fontSize: '0.75rem', color: b.color, fontWeight: '700' }}>£{b.revenue.toFixed(2)}</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: (b.revenue / maxRev * 100) + '%', height: '100%', background: b.color, borderRadius: '4px', transition: 'width 0.5s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SERVICES TAB */}
      {activeTab === 'services' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={card}>
              <div style={lbl}>Most Popular Services</div>
              {topServices.map((s, i) => {
                const maxCount = topServices[0]?.count || 1;
                return (
                  <div key={s.name} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text)', fontWeight: i === 0 ? '700' : '400' }}>{s.name}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{s.count}x</span>
                    </div>
                    <MiniBar value={s.count} max={maxCount} color={i === 0 ? '#d4af37' : 'rgba(212,175,55,0.5)'} />
                  </div>
                );
              })}
            </div>
            <div style={card}>
              <div style={lbl}>Revenue by Service</div>
              {topServices.sort((a, b) => b.revenue - a.revenue).map((s, i) => {
                const maxRev = topServices[0]?.revenue || 1;
                return (
                  <div key={s.name} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text)', fontWeight: i === 0 ? '700' : '400' }}>{s.name}</span>
                      <span style={{ fontSize: '0.72rem', color: '#d4af37', fontWeight: '600' }}>£{s.revenue.toFixed(0)}</span>
                    </div>
                    <MiniBar value={s.revenue} max={maxRev} color={i === 0 ? '#4caf50' : 'rgba(76,175,80,0.5)'} />
                  </div>
                );
              })}
            </div>
          </div>

          <div style={card}>
            <div style={lbl}>Full Service Breakdown</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Service', 'Bookings', 'Revenue', 'Avg Price'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', textAlign: 'left', fontWeight: '600' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.values(svcMap).sort((a, b) => b.revenue - a.revenue).map((s, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 12px', fontSize: '0.78rem', color: 'var(--text)', fontWeight: '500' }}>{s.name}</td>
                    <td style={{ padding: '9px 12px', fontSize: '0.78rem', color: 'var(--muted)' }}>{s.count}</td>
                    <td style={{ padding: '9px 12px', fontSize: '0.78rem', color: '#d4af37', fontWeight: '600' }}>£{s.revenue.toFixed(2)}</td>
                    <td style={{ padding: '9px 12px', fontSize: '0.78rem', color: 'var(--muted)' }}>{s.checkedOut ? '£' + (s.revenue / s.checkedOut).toFixed(2) : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CLIENTS TAB */}
      {activeTab === 'clients' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            {[
              { label: 'Unique Clients', value: Object.keys(clientMap).length, color: '#d4af37' },
              { label: 'Walk-ins', value: active.filter(b => !b.name || b.name === 'Walk-in').length, color: '#ff9800' },
              { label: 'Returning', value: Object.values(clientMap).filter(c => c.dates.size > 1).length, color: '#4caf50' },
              { label: 'New Clients', value: Object.values(clientMap).filter(c => c.dates.size === 1).length, color: '#2196f3' },
            ].map(k => (
              <div key={k.label} style={{ ...card, borderLeft: '3px solid ' + k.color }}>
                <div style={lbl}>{k.label}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: '800', color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          <div style={card}>
            <div style={lbl}>Top Clients by Spend</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Client', 'Visits', 'Total Spent', 'Avg/Visit'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', textAlign: 'left', fontWeight: '600' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topClients.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 12px', fontSize: '0.72rem', color: 'var(--muted)' }}>#{i + 1}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: '700', color: '#d4af37' }}>{c.name[0]}</div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text)', fontWeight: '600' }}>{c.name}</span>
                        {i === 0 && <span style={{ fontSize: '0.55rem', background: 'rgba(212,175,55,0.2)', color: '#d4af37', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>TOP</span>}
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: '0.78rem', color: 'var(--muted)' }}>{c.visits}</td>
                    <td style={{ padding: '9px 12px', fontSize: '0.82rem', color: '#d4af37', fontWeight: '700' }}>£{c.spent.toFixed(2)}</td>
                    <td style={{ padding: '9px 12px', fontSize: '0.75rem', color: 'var(--muted)' }}>£{(c.spent / c.visits).toFixed(2)}</td>
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