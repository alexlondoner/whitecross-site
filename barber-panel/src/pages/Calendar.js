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

  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
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

  // Build grid cells (nulls for padding + day numbers)
  const cells = [];
  for (let i = 0; i < firstDayOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const getBarberKey = b => (b.barberName || b.barberId || '').toLowerCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', color: '#d4af37', margin: 0 }}>Calendar</h1>
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
                return <div key={`pad-${i}`} style={{ minHeight: '88px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', opacity: 0.3 }} />;
              }
              const dk        = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const dayBks    = bookingsByDay[dk] || [];
              const isToday   = dk === today;
              const isSelected = selectedDay === dk;
              const checkedOut = dayBks.filter(b => String(b.status||'').toUpperCase() === 'CHECKED_OUT').length;
              const upcoming   = dayBks.filter(b => ['CONFIRMED','PENDING','UNPAID'].includes(String(b.status||'').toUpperCase())).length;
              const totalCount = dayBks.length;

              // Unique barbers working this day
              const dayBarberKeys = [...new Set(dayBks.map(getBarberKey))].filter(Boolean);

              return (
                <div key={dk}
                  onClick={() => setSelectedDay(isSelected ? null : dk)}
                  style={{
                    minHeight: '88px', padding: '7px 6px', cursor: 'pointer',
                    borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                    background: isSelected
                      ? 'rgba(212,175,55,0.1)'
                      : isToday
                        ? 'rgba(212,175,55,0.04)'
                        : 'transparent',
                    outline: isSelected ? '2px solid rgba(212,175,55,0.4)' : 'none',
                    outlineOffset: '-2px',
                    transition: 'background 0.15s',
                    position: 'relative',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* Day number */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <span style={{
                      fontSize: '0.8rem', fontWeight: isToday ? '800' : '400',
                      color: isToday ? '#d4af37' : 'var(--text)',
                      background: isToday ? 'rgba(212,175,55,0.18)' : 'transparent',
                      borderRadius: '50%', width: '22px', height: '22px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>{day}</span>
                    {totalCount > 0 && (
                      <span style={{ fontSize: '0.58rem', color: 'var(--muted)', fontWeight: '700', marginTop: '3px' }}>{totalCount}</span>
                    )}
                  </div>

                  {/* Barber color dots */}
                  {dayBarberKeys.length > 0 && (
                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      {dayBarberKeys.map(key => (
                        <div key={key}
                          title={`${key}: ${dayBks.filter(b => getBarberKey(b) === key).length} booking(s)`}
                          style={{ width: '7px', height: '7px', borderRadius: '50%', background: barberColorMap[key] || '#7a7260', flexShrink: 0 }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Status summary */}
                  {checkedOut > 0 && (
                    <div style={{ fontSize: '0.58rem', color: '#2196f3', fontWeight: '700', lineHeight: '1.3' }}>✓ {checkedOut} done</div>
                  )}
                  {upcoming > 0 && (
                    <div style={{ fontSize: '0.58rem', color: '#4caf50', fontWeight: '700', lineHeight: '1.3' }}>● {upcoming} upcoming</div>
                  )}
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
          .reduce((s, b) => {
            const paid = parseFloat(String(b.paidAmount || b.price || '0').replace(/[£,]/g,'')) || 0;
            return s + paid;
          }, 0);
        const statusColors = { CONFIRMED: '#4caf50', PENDING: '#ff9800', CHECKED_OUT: '#2196f3', UNPAID: '#ff5252' };

        return (
          <div style={{ background: 'var(--card)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '12px', padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#d4af37' }}>{dayLabel}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '2px' }}>
                  {dayBks.length} booking{dayBks.length !== 1 ? 's' : ''}
                  {revenue > 0 && <span style={{ color: '#4caf50', marginLeft: '10px' }}>£{revenue.toFixed(0)} revenue</span>}
                </div>
              </div>
              <button onClick={() => setSelectedDay(null)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>✕</button>
            </div>

            {dayBks.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: '0.82rem', padding: '12px 0' }}>No bookings this day.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {dayBks.map((b, i) => {
                  const timeStr = b.startTimeDate
                    ? b.startTimeDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                    : '—';
                  const barberKey = getBarberKey(b);
                  const barberColor = barberColorMap[barberKey] || '#7a7260';
                  const statusNorm = String(b.status || '').toUpperCase();
                  const statusColor = statusColors[statusNorm] || 'var(--muted)';
                  const paid = parseFloat(String(b.paidAmount || b.price || '0').replace(/[£,]/g,'')) || 0;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <div style={{ width: '3px', height: '32px', borderRadius: '2px', background: barberColor, flexShrink: 0 }} />
                      <div style={{ fontSize: '0.72rem', color: 'var(--muted)', minWidth: '42px', fontWeight: '600' }}>{timeStr}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.clientName || 'Walk-in'}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.barberName || b.barberId || '—'} · {b.serviceId || b.service || b.source || '—'}
                        </div>
                      </div>
                      {paid > 0 && (
                        <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#d4af37', flexShrink: 0 }}>£{paid.toFixed(0)}</div>
                      )}
                      <div style={{ fontSize: '0.62rem', fontWeight: '700', color: statusColor, background: statusColor + '18', padding: '2px 7px', borderRadius: '4px', flexShrink: 0 }}>
                        {statusNorm.replace('_',' ')}
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
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '16px', display: 'flex', gap: '12px' }}>
            <span style={{ fontSize: '0.68rem', color: '#2196f3', fontWeight: '600' }}>✓ Checked out</span>
            <span style={{ fontSize: '0.68rem', color: '#4caf50', fontWeight: '600' }}>● Upcoming</span>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn  = { background: 'var(--card)', border: '1px solid var(--border)', color: '#d4af37', width: '34px', height: '34px', borderRadius: '8px', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 };
const pillBtn = { background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', color: '#d4af37', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: '700', letterSpacing: '1px' };
