import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

const TENANT = 'whitecross';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const SKIP_STATUSES = new Set(['CANCELLED','BLOCKED','DELETED','NO_SHOW']);

const STATUS_META = {
  CONFIRMED:   { label: 'Confirmed', color: '#2e7d32', bg: 'rgba(46,125,50,0.12)',   border: 'rgba(46,125,50,0.3)'   },
  PENDING:     { label: 'Pending',   color: '#e65100', bg: 'rgba(230,81,0,0.12)',    border: 'rgba(230,81,0,0.3)'    },
  CHECKED_OUT: { label: 'Paid',      color: '#1565c0', bg: 'rgba(21,101,192,0.12)',  border: 'rgba(21,101,192,0.3)'  },
  UNPAID:      { label: 'Unpaid',    color: '#c62828', bg: 'rgba(198,40,40,0.12)',   border: 'rgba(198,40,40,0.3)'   },
  NO_SHOW:     { label: 'No show',   color: '#6a1b9a', bg: 'rgba(106,27,154,0.12)', border: 'rgba(106,27,154,0.3)'  },
};

function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parsePaid(b) {
  return parseFloat(String(b.paidAmount || b.price || '0').replace(/[£,]/g, '')) || 0;
}

function getBarberColor(b, barberColorMap) {
  const k = (b.barberName || b.barberId || '').toLowerCase();
  return barberColorMap[k] || '#7a7260';
}

function getTimeStr(b) {
  if (b.startTimeDate) return b.startTimeDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return b.time || '';
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: '14px', color: 'var(--text)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' },
  title: { fontSize: '1.35rem', fontWeight: '700', color: '#d4af37', margin: 0 },
  subLabel: { fontSize: '0.72rem', color: 'var(--muted)', marginTop: '3px' },
  navRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  navBtn: {
    background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px',
    color: '#d4af37', width: '32px', height: '32px', cursor: 'pointer', fontSize: '1.1rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s',
  },
  todayBtn: {
    background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.35)',
    borderRadius: '8px', color: '#d4af37', padding: '0 14px', height: '32px',
    cursor: 'pointer', fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.5px',
  },
  monthLabel: { fontSize: '0.88rem', fontWeight: '700', color: 'var(--text)', minWidth: '148px', textAlign: 'center' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' },
  statCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px' },
  statLabel: { fontSize: '0.62rem', color: 'var(--muted)', marginBottom: '4px', letterSpacing: '0.5px', textTransform: 'uppercase' },
  statVal: { fontSize: '1.25rem', fontWeight: '700' },
  weekStrip: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  gridOuter: { border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' },
  dowRow: { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--border)', background: 'rgba(212,175,55,0.04)' },
  dowCell: { padding: '7px 4px', textAlign: 'center', fontSize: '0.6rem', color: 'var(--muted)', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', borderRight: '1px solid var(--border)' },
  dayGrid: { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' },
};

function WeekPill({ label, active, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '4px 13px', borderRadius: '20px',
        border: `1px solid ${active || hov ? 'rgba(212,175,55,0.55)' : 'var(--border)'}`,
        background: active ? 'rgba(212,175,55,0.13)' : hov ? 'rgba(212,175,55,0.06)' : 'var(--card)',
        color: active || hov ? '#d4af37' : 'var(--muted)',
        fontSize: '0.68rem', fontWeight: active ? '700' : '500',
        cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
      }}>
      {label}
    </button>
  );
}

function DayCell({ day, dayBks, isToday, isSelected, maxCnt, barberColorMap, onClick }) {
  const [hov, setHov] = useState(false);
  const totalCnt  = dayBks.length;
  const unpaidCnt = dayBks.filter(b => String(b.status || '').toUpperCase() === 'UNPAID').length;
  const heatPct   = maxCnt > 0 ? Math.round((totalCnt / maxCnt) * 100) : 0;
  const heatOpacity = heatPct > 70 ? '1' : heatPct > 40 ? '0.6' : '0.3';

  const bg = isSelected ? 'rgba(212,175,55,0.1)' : isToday ? 'rgba(212,175,55,0.05)' : hov ? 'rgba(212,175,55,0.04)' : 'transparent';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        minHeight: '108px', padding: '6px 5px',
        borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
        cursor: 'pointer', background: bg,
        boxShadow: isSelected ? 'inset 0 0 0 1.5px rgba(212,175,55,0.5)' : 'none',
        transition: 'background 0.12s', display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <div style={{
          width: '22px', height: '22px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.78rem', fontWeight: isToday ? '800' : '600',
          color: isToday || isSelected ? '#d4af37' : 'var(--text)',
          background: isToday ? 'rgba(212,175,55,0.2)' : 'transparent',
        }}>{day}</div>
        <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
          {unpaidCnt > 0 && (
            <span style={{ fontSize: '0.5rem', fontWeight: '800', color: '#c62828', background: 'rgba(198,40,40,0.12)', border: '1px solid rgba(198,40,40,0.28)', padding: '1px 5px', borderRadius: '20px', letterSpacing: '0.3px' }}>UNPAID</span>
          )}
          {totalCnt > 0 && (
            <span style={{ fontSize: '0.62rem', fontWeight: '700', color: '#d4af37', background: 'rgba(212,175,55,0.15)', borderRadius: '8px', padding: '1px 6px' }}>{totalCnt}</span>
          )}
        </div>
      </div>

      {totalCnt > 0 && (
        <div style={{ height: '3px', borderRadius: '2px', marginBottom: '5px', width: `${Math.max(heatPct, 8)}%`, background: `rgba(212,175,55,${heatOpacity})`, transition: 'width 0.3s' }} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {dayBks.slice(0, 3).map((b, j) => {
          const color    = getBarberColor(b, barberColorMap);
          const isUnpaid = String(b.status || '').toUpperCase() === 'UNPAID';
          const dotColor = isUnpaid ? '#c62828' : color;
          return (
            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
              <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
              <span style={{ fontSize: '0.58rem', fontWeight: '700', color: dotColor, whiteSpace: 'nowrap', flexShrink: 0 }}>{getTimeStr(b)}</span>
              <span style={{ fontSize: '0.58rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.clientName || 'Walk-in'}</span>
            </div>
          );
        })}
        {dayBks.length > 3 && (
          <div style={{ fontSize: '0.56rem', color: 'var(--muted)', paddingLeft: '9px', marginTop: '1px' }}>+{dayBks.length - 3} more</div>
        )}
      </div>
    </div>
  );
}

function Chip({ color, bg, border, children }) {
  return (
    <span style={{ fontSize: '0.6rem', fontWeight: '700', background: bg, color, padding: '2px 8px', borderRadius: '20px', border: `1px solid ${border}` }}>{children}</span>
  );
}

function BkRow({ last, accentColor, isUnpaid, clientName, svcLabel, meta, isDone, timeStr, barberLabel, barberColor, paid, priceColor }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px 12px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        borderLeft: `4px solid ${accentColor}`,
        background: hov ? (isUnpaid ? 'rgba(198,40,40,0.06)' : 'rgba(255,255,255,0.025)') : (isUnpaid ? 'rgba(198,40,40,0.03)' : 'transparent'),
        transition: 'background 0.12s',
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {clientName || 'Walk-in'}
        </div>
        {svcLabel && (
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{svcLabel}</div>
        )}
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: svcLabel ? 0 : '4px' }}>
          <Chip color={meta.color} bg={meta.bg} border={meta.border}>{isDone ? '✓ ' : ''}{meta.label}</Chip>
          <Chip color="var(--muted)" bg="var(--card)" border="var(--border)">🕐 {timeStr}</Chip>
          {barberLabel && <Chip color={barberColor} bg={barberColor + '18'} border={barberColor + '44'}>{barberLabel}</Chip>}
        </div>
      </div>
      {paid > 0 && (
        <div style={{ fontSize: '0.85rem', fontWeight: '800', color: priceColor, flexShrink: 0 }}>£{paid.toFixed(0)}</div>
      )}
    </div>
  );
}

function DetailPanel({ selectedDay, bookingsByDay, barberColorMap, onClose }) {
  const dayBks = (bookingsByDay[selectedDay] || []).slice().sort((a, b) => (a.startTimeDate || 0) - (b.startTimeDate || 0));
  const [sy, sm, sd] = selectedDay.split('-').map(Number);
  const dayLabel = new Date(sy, sm - 1, sd).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const revenue = dayBks.filter(b => String(b.status || '').toUpperCase() === 'CHECKED_OUT').reduce((s, b) => s + parsePaid(b), 0);

  return (
    <div style={{ background: 'var(--card)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '14px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(212,175,55,0.04)' }}>
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#d4af37' }}>{dayLabel}</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '2px', display: 'flex', gap: '10px' }}>
            <span>{dayBks.length} booking{dayBks.length !== 1 ? 's' : ''}</span>
            {revenue > 0 && <span style={{ color: '#2e7d32', fontWeight: '600' }}>£{revenue.toFixed(0)} revenue</span>}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer', width: '28px', height: '28px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      </div>
      {dayBks.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: '0.82rem', padding: '24px', textAlign: 'center' }}>No bookings this day.</div>
      ) : (
        <div>
          {dayBks.map((b, i) => {
            const color      = getBarberColor(b, barberColorMap);
            const statusNorm = String(b.status || '').toUpperCase();
            const meta       = STATUS_META[statusNorm] || { label: statusNorm, color: 'var(--muted)', bg: 'var(--card)', border: 'var(--border)' };
            const isUnpaid   = statusNorm === 'UNPAID';
            const isDone     = statusNorm === 'CHECKED_OUT';
            const paid       = parsePaid(b);
            const timeStr    = b.startTimeDate ? b.startTimeDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : b.time || '—';
            return (
              <BkRow key={i} last={i === dayBks.length - 1}
                accentColor={isUnpaid ? '#c62828' : color} isUnpaid={isUnpaid}
                clientName={b.clientName} svcLabel={b.serviceId || b.service || ''}
                meta={meta} isDone={isDone} timeStr={timeStr}
                barberLabel={b.barberName || b.barberId || ''} barberColor={color}
                paid={paid} priceColor={isDone ? '#2e7d32' : isUnpaid ? '#c62828' : '#d4af37'}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings]       = useState([]);
  const [barbers, setBarbers]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  const year     = currentDate.getFullYear();
  const month    = currentDate.getMonth();
  const todayKey = toDateKey(new Date());

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [bkSnap, barberSnap] = await Promise.all([
          getDocs(collection(db, `tenants/${TENANT}/bookings`)),
          getDocs(collection(db, `tenants/${TENANT}/barbers`)),
        ]);
        setBarbers(barberSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)));
        setBookings(
          bkSnap.docs.map(d => {
            const data = d.data();
            const st = data.startTime?.toDate?.();
            return { ...data, startTimeDate: st, dateKey: st ? toDateKey(st) : null };
          }).filter(b => b.dateKey && !SKIP_STATUSES.has(String(b.status || '').toUpperCase()))
        );
      } catch (e) { console.error('Calendar fetch error:', e); }
      setLoading(false);
    })();
  }, []);

  const barberColorMap = useMemo(() => {
    const map = {};
    barbers.forEach(b => { map[(b.name || '').toLowerCase()] = b.color || '#7a7260'; });
    return map;
  }, [barbers]);

  const bookingsByDay = useMemo(() => {
    const map = {};
    bookings.forEach(b => { if (b.dateKey) { if (!map[b.dateKey]) map[b.dateKey] = []; map[b.dateKey].push(b); } });
    return map;
  }, [bookings]);

  const monthBookings = useMemo(() => {
    const days = new Date(year, month + 1, 0).getDate();
    let all = [];
    for (let d = 1; d <= days; d++) {
      const dk = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      if (bookingsByDay[dk]) all = all.concat(bookingsByDay[dk]);
    }
    return all;
  }, [bookingsByDay, year, month]);

  const stats = useMemo(() => {
    const co     = monthBookings.filter(b => String(b.status||'').toUpperCase() === 'CHECKED_OUT');
    const unpaid = monthBookings.filter(b => String(b.status||'').toUpperCase() === 'UNPAID').length;
    return { total: monthBookings.length, rev: co.reduce((s, b) => s + parsePaid(b), 0), co: co.length, unpaid };
  }, [monthBookings]);

  const maxDayCount = useMemo(() => {
    const days = new Date(year, month + 1, 0).getDate();
    let max = 0;
    for (let d = 1; d <= days; d++) {
      const cnt = (bookingsByDay[`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`] || []).length;
      if (cnt > max) max = cnt;
    }
    return max || 1;
  }, [bookingsByDay, year, month]);

  const monthWeeks = useMemo(() => {
    const lastOfMonth = new Date(year, month + 1, 0);
    const fm = new Date(year, month, 1);
    const dow = fm.getDay();
    fm.setDate(fm.getDate() - (dow === 0 ? 6 : dow - 1));
    const weeks = [];
    let ws = new Date(fm);
    while (ws <= lastOfMonth) {
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      weeks.push({ start: new Date(ws), end: new Date(we) });
      ws.setDate(ws.getDate() + 7);
    }
    return weeks;
  }, [year, month]);

  const fmtShort = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth    = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => { setCurrentDate(new Date(year, month - 1, 1)); setSelectedDay(null); };
  const nextMonth = () => { setCurrentDate(new Date(year, month + 1, 1)); setSelectedDay(null); };
  const goToday   = () => { setCurrentDate(new Date()); setSelectedDay(todayKey); };

  return (
    <div style={S.wrap}>

      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>
            Calendar{' '}
            <span style={{ display: 'inline-block', width: '28px', height: '5px', borderRadius: '3px', background: 'linear-gradient(90deg,#d4af37,#b8860b)', verticalAlign: 'middle', marginLeft: '6px' }} />
          </h1>
          <p style={S.subLabel}>{bookings.length} bookings loaded · click any day for details</p>
        </div>
        <div style={S.navRow}>
          <button onClick={goToday} style={S.todayBtn}>Today</button>
          <button onClick={prevMonth} style={S.navBtn}>&#8249;</button>
          <span style={S.monthLabel}>{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} style={S.navBtn}>&#8250;</button>
        </div>
      </div>

      {/* Month stats */}
      <div style={S.statsRow}>
        {[
          { label: 'Total',       val: stats.total,                color: '#d4af37' },
          { label: 'Revenue',     val: `£${stats.rev.toFixed(0)}`, color: '#d4af37' },
          { label: 'Checked out', val: stats.co,                   color: '#2e7d32' },
          { label: 'Unpaid',      val: stats.unpaid,               color: '#c62828' },
        ].map(({ label, val, color }) => (
          <div key={label} style={S.statCard}>
            <div style={S.statLabel}>{label}</div>
            <div style={{ ...S.statVal, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Week jump pills */}
      <div style={S.weekStrip}>
        {monthWeeks.map((w, i) => {
          const selDate  = selectedDay ? new Date(selectedDay + 'T12:00:00') : null;
          const isActive = !!(selDate && selDate >= w.start && selDate <= w.end);
          return (
            <WeekPill key={i} label={`${fmtShort(w.start)} – ${fmtShort(w.end)}`} active={isActive}
              onClick={() => {
                const jumpDay = w.start.getMonth() === month ? w.start : new Date(year, month, 1);
                setSelectedDay(toDateKey(jumpDay));
              }} />
          );
        })}
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: '60px', textAlign: 'center', fontSize: '0.85rem' }}>Loading…</div>
      ) : (
        <div style={S.gridOuter}>
          <div style={S.dowRow}>
            {DAYS_SHORT.map((d, i) => (
              <div key={d} style={{ ...S.dowCell, borderRight: i < 6 ? '1px solid var(--border)' : 'none' }}>{d}</div>
            ))}
          </div>
          <div style={S.dayGrid}>
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <div key={`pad-${i}`} style={{ minHeight: '108px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', opacity: 0.3 }} />
            ))}
            {Array.from({ length: daysInMonth }, (_, idx) => idx + 1).map(day => {
              const dk = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const dayBks = (bookingsByDay[dk] || []).slice().sort((a, b) => (a.startTimeDate || 0) - (b.startTimeDate || 0));
              return (
                <DayCell key={dk} day={day} dayBks={dayBks}
                  isToday={dk === todayKey} isSelected={selectedDay === dk}
                  maxCnt={maxDayCount} barberColorMap={barberColorMap}
                  onClick={() => setSelectedDay(selectedDay === dk ? null : dk)}
                />
              );
            })}
          </div>
        </div>
      )}

      {selectedDay && (
        <DetailPanel selectedDay={selectedDay} bookingsByDay={bookingsByDay} barberColorMap={barberColorMap} onClose={() => setSelectedDay(null)} />
      )}

      {!loading && barbers.length > 0 && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          {barbers.map(b => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: b.color || '#7a7260' }} />
              <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{b.name}</span>
            </div>
          ))}
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '16px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            {[
              { label: '✓ Paid', color: '#1565c0', bg: 'rgba(21,101,192,0.12)', border: 'rgba(21,101,192,0.3)' },
              { label: 'Unpaid', color: '#c62828', bg: 'rgba(198,40,40,0.12)',  border: 'rgba(198,40,40,0.28)' },
            ].map(({ label, color, bg, border }) => (
              <Chip key={label} color={color} bg={bg} border={border}>{label}</Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
