import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

const TENANT = 'whitecross';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const SKIP_STATUSES = new Set(['CANCELLED','BLOCKED','DELETED','NO_SHOW']);

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings]       = useState([]);
  const [barbers, setBarbers]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [bkSnap, barberSnap] = await Promise.all([
          getDocs(collection(db, `tenants/${TENANT}/bookings`)),
          getDocs(collection(db, `tenants/${TENANT}/barbers`)),
        ]);
        const barberList = barberSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        setBarbers(barberList);

        const bkList = bkSnap.docs.map(d => {
          const data = d.data();
          const st   = data.startTime?.toDate?.();
          return { ...data, startTimeDate: st, dateKey: st ? toDateKey(st) : null };
        }).filter(b => b.dateKey && !SKIP_STATUSES.has(String(b.status || '').toUpperCase()));
        setBookings(bkList);
      } catch (e) {
        console.error('Calendar fetch error:', e);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const today = toDateKey(new Date());

  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth    = new Date(year, month + 1, 0).getDate();

  const bookingsByDay = useMemo(() => {
    const map = {};
    bookings.forEach(b => {
      if (!b.dateKey) return;
      if (!map[b.dateKey]) map[b.dateKey] = [];
      map[b.dateKey].push(b);
    });
    return map;
  }, [bookings]);

  const barberColorMap = useMemo(() => {
    const map = {};
    barbers.forEach(b => { map[(b.name || '').toLowerCase()] = b.color || '#7a7260'; });
    return map;
  }, [barbers]);

  const prevMonth = () => { setCurrentDate(new Date(year, month - 1, 1)); setSelectedDay(null); };
  const nextMonth = () => { setCurrentDate(new Date(year, month + 1, 1)); setSelectedDay(null); };
  const goToday   = () => { setCurrentDate(new Date()); setSelectedDay(today); };

  const cells = [];
  for (let i = 0; i < firstDayOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const getBarberKey = b => (b.barberName || b.barberId || '').toLowerCase();
  const getBarberColor = b => barberColorMap[getBarberKey(b)] || '#7a7260';

  const getTimeStr = b => {
    if (b.startTimeDate) {
      return b.startTimeDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
    return b.time || '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '1.4rem', color: '#d4af37', margin: 0 }}>Calendar</h1>
            <span style={{ display: 'inline-block', width: '32px', height: '6px', borderRadius: '4px', background: 'linear-gradient(90deg,#d4af37,#b8860b)', marginTop: '8px' }} />
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '4px 0 0' }}>
            {bookings.length} bookings loaded · click any day for details
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={goToday} style={pillBtn}>Today</button>
          <button onClick={prevMonth} style={navBtn}>‹</button>
          <span style={{ color: 'var(--text)', fontWeight: '700', fontSize: '0.95rem', minWidth: '148px', textAlign: 'center' }}>
            {MONTHS[month]} {year}
          </span>
          <button onClick={nextMonth} style={navBtn}>›</button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: '60px', textAlign: 'center', fontSize: '0.85rem' }}>Loading...</div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>

          {/* Day-of-week headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)', background: 'rgba(212,175,55,0.04)' }}>
            {DAYS_SHORT.map(d => (
              <div key={d} style={{ padding: '10px 6px', textAlign: 'center', fontSize: '0.62rem', color: 'var(--muted)', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{d}</div>
            ))}
          </div>

          {/* Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {cells.map((day, i) => {
              if (!day) {
                return <div key={`pad-${i}`} style={{ minHeight: '100px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', opacity: 0.3 }} />;
              }
              const dk         = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const dayBks     = (bookingsByDay[dk] || []).slice().sort((a,b) => (a.startTimeDate||0) - (b.startTimeDate||0));
              const isToday    = dk === today;
              const isSelected = selectedDay === dk;
              const totalCount = dayBks.length;
              const checkedOut = dayBks.filter(b => String(b.status||'').toUpperCase() === 'CHECKED_OUT').length;
              const unpaid     = dayBks.filter(b => String(b.status||'').toUpperCase() === 'UNPAID').length;

              return (
                <div key={dk}
                  onClick={() => setSelectedDay(isSelected ? null : dk)}
                  style={{
                    minHeight: '100px', padding: '0', cursor: 'pointer',
                    borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                    background: isSelected
                      ? 'rgba(212,175,55,0.08)'
                      : isToday
                        ? 'rgba(212,175,55,0.04)'
                        : 'transparent',
                    boxShadow: isSelected ? 'inset 0 0 0 2px rgba(212,175,55,0.45)' : 'none',
                    transition: 'background 0.15s',
                    boxSizing: 'border-box',
                    display: 'flex', flexDirection: 'column',
                  }}
                >
                  {/* Day header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 8px 4px' }}>
                    <span style={{
                      fontSize: '1rem', fontWeight: isToday ? '800' : '600',
                      color: isToday ? '#d4af37' : isSelected ? '#d4af37' : 'var(--text)',
                      width: '26px', height: '26px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isToday ? 'rgba(212,175,55,0.18)' : 'transparent',
                    }}>{day}</span>
                    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                      {unpaid > 0 && (
                        <span style={{ fontSize: '0.52rem', fontWeight: '800', color: '#ef5350', background: 'rgba(255,82,82,0.14)', border: '1px solid rgba(255,82,82,0.28)', padding: '1px 5px', borderRadius: '20px', letterSpacing: '0.3px' }}>UNPAID</span>
                      )}
                      {totalCount > 0 && (
                        <span style={{ fontSize: '0.62rem', color: '#d4af37', background: 'rgba(212,175,55,0.15)', borderRadius: '8px', padding: '1px 6px', fontWeight: '700' }}>{totalCount}</span>
                      )}
                    </div>
                  </div>

                  {/* Booking cards */}
                  <div style={{ padding: '0 5px 7px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {dayBks.slice(0, 3).map((b, j) => {
                      const color    = getBarberColor(b);
                      const statusUp = String(b.status||'').toUpperCase();
                      const isUnpaid = statusUp === 'UNPAID';
                      const isDone   = statusUp === 'CHECKED_OUT';
                      const borderC  = isUnpaid ? '#ef5350' : color;
                      return (
                        <div key={j}
                          style={{
                            padding: '4px 6px 4px 7px',
                            borderRadius: '5px',
                            background: isUnpaid ? 'rgba(255,82,82,0.08)' : color + '18',
                            borderLeft: '3px solid ' + borderC,
                            opacity: isDone ? 0.72 : 1,
                            transition: 'background 0.12s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = isUnpaid ? 'rgba(255,82,82,0.15)' : color + '2e'}
                          onMouseLeave={e => e.currentTarget.style.background = isUnpaid ? 'rgba(255,82,82,0.08)' : color + '18'}
                        >
                          {/* Time + badge row */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1px' }}>
                            <span style={{ fontSize: '0.58rem', color: color, fontWeight: '800', letterSpacing: '0.3px' }}>{getTimeStr(b)}</span>
                            {isDone && <span style={{ fontSize: '0.46rem', background: color + '30', color: color, borderRadius: '3px', padding: '0 3px', fontWeight: '800', lineHeight: 1.6 }}>✓ PAID</span>}
                            {isUnpaid && <span style={{ fontSize: '0.46rem', background: 'rgba(255,82,82,0.2)', color: '#ef5350', borderRadius: '3px', padding: '0 3px', fontWeight: '800', lineHeight: 1.6 }}>UNPAID</span>}
                          </div>
                          {/* Client name */}
                          <div style={{ fontSize: '0.67rem', color: color, fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.25 }}>
                            {b.clientName || 'Walk-in'}
                          </div>
                        </div>
                      );
                    })}
                    {dayBks.length > 3 && (
                      <div style={{ fontSize: '0.58rem', color: 'var(--muted)', paddingLeft: '5px', marginTop: '1px' }}>+{dayBks.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected day detail panel */}
      {selectedDay && (() => {
        const dayBks = (bookingsByDay[selectedDay] || [])
          .slice()
          .sort((a, b) => (a.startTimeDate || 0) - (b.startTimeDate || 0));
        const [sy, sm, sd] = selectedDay.split('-').map(Number);
        const dayLabel = new Date(sy, sm - 1, sd).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const revenue = dayBks
          .filter(b => String(b.status||'').toUpperCase() === 'CHECKED_OUT')
          .reduce((s, b) => parseFloat(String(b.paidAmount || b.price || '0').replace(/[£,]/g,'')) || 0 + s, 0);

        const STATUS_META = {
          CONFIRMED:   { label: 'Confirmed',   color: '#4caf50', bg: 'rgba(76,175,80,0.12)'     },
          PENDING:     { label: 'Pending',      color: '#ff9800', bg: 'rgba(255,152,0,0.12)'     },
          CHECKED_OUT: { label: 'Paid',         color: '#2196f3', bg: 'rgba(33,150,243,0.12)'    },
          UNPAID:      { label: 'Unpaid',       color: '#ef5350', bg: 'rgba(255,82,82,0.12)'     },
          NO_SHOW:     { label: 'No Show',      color: '#9c27b0', bg: 'rgba(156,39,176,0.12)'    },
        };

        return (
          <div style={{ background: 'var(--card)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '14px', overflow: 'hidden' }}>

            {/* Panel header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(212,175,55,0.04)' }}>
              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#d4af37', letterSpacing: '-0.2px' }}>{dayLabel}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '2px', display: 'flex', gap: '10px' }}>
                  <span>{dayBks.length} booking{dayBks.length !== 1 ? 's' : ''}</span>
                  {revenue > 0 && <span style={{ color: '#4caf50', fontWeight: '600' }}>£{revenue.toFixed(0)} revenue</span>}
                </div>
              </div>
              <button onClick={() => setSelectedDay(null)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer', width: '28px', height: '28px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            {dayBks.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: '0.82rem', padding: '24px', textAlign: 'center' }}>No bookings this day.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {dayBks.map((b, i) => {
                  const barberKey   = getBarberKey(b);
                  const barberColor = barberColorMap[barberKey] || '#7a7260';
                  const statusNorm  = String(b.status || '').toUpperCase();
                  const meta        = STATUS_META[statusNorm] || { label: statusNorm, color: '#7a7260', bg: 'rgba(120,120,120,0.1)' };
                  const isUnpaid    = statusNorm === 'UNPAID';
                  const isDone      = statusNorm === 'CHECKED_OUT';
                  const paid        = parseFloat(String(b.paidAmount || b.price || '0').replace(/[£,]/g,'')) || 0;
                  const timeStr     = b.startTimeDate
                    ? b.startTimeDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                    : b.time || '—';
                  const svcLabel    = b.serviceId || b.service || '';
                  const barberLabel = b.barberName || b.barberId || '';
                  const leftC       = isUnpaid ? '#ef5350' : barberColor;

                  return (
                    <div key={i} style={{
                      borderBottom: i < dayBks.length - 1 ? '1px solid var(--border)' : 'none',
                      background: isUnpaid ? 'rgba(255,82,82,0.03)' : 'transparent',
                      borderLeft: '4px solid ' + leftC,
                      padding: '12px 16px 12px 14px',
                      transition: 'background 0.12s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = isUnpaid ? 'rgba(255,82,82,0.06)' : 'rgba(255,255,255,0.025)'}
                      onMouseLeave={e => e.currentTarget.style.background = isUnpaid ? 'rgba(255,82,82,0.03)' : 'transparent'}
                    >
                      {/* Top: name + price */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div style={{ fontSize: '0.92rem', fontWeight: '700', color: barberColor, lineHeight: 1.2 }}>
                          {b.clientName || 'Walk-in'}
                        </div>
                        {paid > 0 && (
                          <div style={{ fontSize: '0.82rem', fontWeight: '800', color: isDone ? '#4caf50' : '#d4af37', marginLeft: '8px', flexShrink: 0 }}>£{paid.toFixed(0)}</div>
                        )}
                      </div>
                      {/* Subtitle: service */}
                      {svcLabel && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {svcLabel}
                        </div>
                      )}
                      {/* Chips row */}
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.6rem', fontWeight: '700', background: meta.bg, color: meta.color, padding: '2px 8px', borderRadius: '20px', border: '1px solid ' + meta.color + '35' }}>
                          {isDone ? '✓ ' : ''}{meta.label}
                        </span>
                        <span style={{ fontSize: '0.6rem', fontWeight: '600', background: 'rgba(255,255,255,0.05)', color: 'var(--muted)', padding: '2px 8px', borderRadius: '20px', border: '1px solid var(--border)' }}>
                          🕐 {timeStr}
                        </span>
                        {barberLabel && (
                          <span style={{ fontSize: '0.6rem', fontWeight: '700', background: barberColor + '18', color: barberColor, padding: '2px 8px', borderRadius: '20px', border: '1px solid ' + barberColor + '35' }}>
                            {barberLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Legend */}
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
              ['✓ done',   'rgba(33,150,243,0.14)',  '#64b5f6', 'rgba(33,150,243,0.22)'],
              ['UNPAID',   'rgba(255,82,82,0.14)',   '#ef5350', 'rgba(255,82,82,0.28)'],
            ].map(([label, bg, color, border]) => (
              <span key={label} style={{ fontSize: '0.52rem', fontWeight: '800', background: bg, color, padding: '2px 8px', borderRadius: '20px', border: '1px solid ' + border, letterSpacing: label === 'UNPAID' ? '0.4px' : '0' }}>
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn  = { background: 'var(--card)', border: '1px solid var(--border)', color: '#d4af37', width: '34px', height: '34px', borderRadius: '8px', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 };
const pillBtn = { background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', color: '#d4af37', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: '700', letterSpacing: '1px' };
