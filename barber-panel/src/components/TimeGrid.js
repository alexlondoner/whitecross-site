import React, { useState, useEffect, useRef } from 'react';
import config from '../config';
import { findServiceByBookingValue, getBookingName, getDisplayedAmount, pp } from '../utils/bookingUtils';
import { convertTo24, minsToLabel } from '../utils/timeUtils';
import { getEffectiveDayHours } from '../utils/scheduleUtils';
import SlotPopup from './SlotPopup';

const SOURCE_COLORS = {
  'booksy':    '#9c27b0',
  'fresha':    '#2196f3',
  'treatwell': '#ff7043',
  'website':   '#4caf50',
  'walk-in':   '#ff9800',
  'manual':    '#ff9800',
};

const STATUS_STYLES = {
  'CONFIRMED':    { bg:'rgba(76,175,80,0.15)',    color:'#4caf50',  label:'Confirmed' },
  'PENDING':      { bg:'rgba(255,193,7,0.15)',    color:'#ffc107',  label:'Pending' },
  'CHECKED_OUT':  { bg:'rgba(33,150,243,0.15)',   color:'#2196f3',  label:'Checked Out' },
  'NO_SHOW':      { bg:'rgba(255,82,82,0.15)',    color:'#ff5252',  label:'No Show' },
  'CANCELLED':    { bg:'rgba(150,150,150,0.15)',  color:'#999',     label:'Cancelled' },
};

function BookingHoverCard({ popup }) {
  if (!popup) return null;
  const { booking: b, barber, mx, my } = popup;
  const isLight = document.body.classList.contains('light');
  const svc = findServiceByBookingValue(b.service);
  const duration = (svc && svc.duration) || 30;
  const displayName = getBookingName(b);
  const statusKey = (b.status || 'CONFIRMED').toUpperCase();
  const statusStyle = STATUS_STYLES[statusKey] || STATUS_STYLES['CONFIRMED'];
  const sourceColor = SOURCE_COLORS[(b.source || '').toLowerCase()];
  const initials = displayName.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();

  const theme = isLight ? {
    bg:        'linear-gradient(145deg, #ffffff 0%, #f5f3ec 100%)',
    border:    barber.color + '35',
    shadow:    '0 20px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)',
    text:      '#1a1a14',
    sub:       '#6b6050',
    faint:     'rgba(0,0,0,0.35)',
    divider:   'rgba(0,0,0,0.07)',
    timePill:  'rgba(0,0,0,0.06)',
    timePillC: '#3a3a2e',
    avatarBg:  'linear-gradient(135deg, '+barber.color+'22, '+barber.color+'0e)',
    noteC:     'rgba(0,0,0,0.4)',
  } : {
    bg:        'linear-gradient(145deg, #1c1c1e 0%, #141416 100%)',
    border:    barber.color + '40',
    shadow:    '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.07)',
    text:      '#ffffff',
    sub:       'rgba(255,255,255,0.85)',
    faint:     'rgba(255,255,255,0.3)',
    divider:   'rgba(255,255,255,0.06)',
    timePill:  'rgba(255,255,255,0.07)',
    timePillC: 'rgba(255,255,255,0.7)',
    avatarBg:  'linear-gradient(135deg, '+barber.color+'33, '+barber.color+'15)',
    noteC:     'rgba(255,255,255,0.4)',
  };
  const phone = b.phone || b.clientPhone;
  const email = b.email || b.clientEmail;
  const amountStr = getDisplayedAmount(b);
  const price = b.price ? pp(b.price) : null;
  const deposit = b.paidAmount ? pp(b.paidAmount) : null;
  const hasPayment = price || deposit;

  const cardW = 260;
  const cardH = 240;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const GAP = 16;
  let left = mx + GAP;
  let top = my - 20;
  if (left + cardW > vw - 12) left = mx - cardW - GAP;
  if (top + cardH > vh - 12) top = vh - cardH - 12;
  if (top < 8) top = 8;

  const divider = <div style={{ height:'1px', background: theme.divider, margin:'8px 0' }} />;

  return (
    <div style={{
      position: 'fixed', left, top, zIndex: 9999, width: cardW,
      background: theme.bg,
      border: '1px solid ' + theme.border,
      borderRadius: '14px',
      boxShadow: theme.shadow,
      padding: '14px 16px',
      pointerEvents: 'none',
      animation: 'hoverCardIn 0.15s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      {/* top accent bar */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:'3px', background:'linear-gradient(90deg, '+barber.color+', '+barber.color+'44)', borderRadius:'14px 14px 0 0' }} />

      {/* header: barber + time */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <div style={{ width:'6px', height:'6px', borderRadius:'50%', background: barber.color, boxShadow:'0 0 6px '+barber.color }} />
          <span style={{ fontSize:'0.62rem', fontWeight:'800', color: barber.color, letterSpacing:'1.5px', textTransform:'uppercase' }}>{barber.name}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
          <span style={{ fontSize:'0.68rem', fontWeight:'700', color: theme.timePillC, background: theme.timePill, borderRadius:'6px', padding:'2px 7px', letterSpacing:'0.3px' }}>{b.time}</span>
          <span style={{ fontSize:'0.6rem', color: theme.faint, fontWeight:'600' }}>{duration}m</span>
        </div>
      </div>

      {/* client row */}
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'4px' }}>
        <div style={{ width:'36px', height:'36px', borderRadius:'10px', background: theme.avatarBg, border:'1px solid '+barber.color+'50', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <span style={{ fontSize:'0.72rem', fontWeight:'900', color: barber.color, letterSpacing:'0.5px' }}>{initials || '?'}</span>
        </div>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:'0.88rem', fontWeight:'800', color: theme.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', lineHeight:'1.2' }}>{displayName}</div>
          {b.visitCount > 0 && (
            <div style={{ fontSize:'0.58rem', fontWeight:'700', color:'rgba(212,175,55,0.7)', letterSpacing:'0.5px', marginTop:'1px' }}>
              {b.visitCount === 1 ? '1st visit' : b.visitCount === 2 ? '2nd visit' : b.visitCount === 3 ? '3rd visit' : b.visitCount + 'th visit'}
            </div>
          )}
        </div>
      </div>

      {divider}

      {/* service */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: hasPayment ? '6px' : '0' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'6px', minWidth:0 }}>
          <span style={{ fontSize:'0.7rem' }}>✂</span>
          <span style={{ fontSize:'0.72rem', fontWeight:'700', color: theme.sub, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{svc ? svc.name : b.service}</span>
        </div>
        <span style={{ fontSize:'0.62rem', color: theme.faint, flexShrink:0, marginLeft:'8px' }}>{duration} min</span>
      </div>

      {/* price */}
      {hasPayment && (
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <span style={{ fontSize:'0.7rem' }}>💷</span>
          {price && <span style={{ fontSize:'0.72rem', fontWeight:'700', color: theme.sub }}>{price}</span>}
          {deposit && price && deposit !== price && (
            <span style={{ fontSize:'0.62rem', color:'#4caf50', background:'rgba(76,175,80,0.12)', border:'1px solid rgba(76,175,80,0.25)', borderRadius:'4px', padding:'0 5px' }}>£{deposit} paid</span>
          )}
          {deposit && !price && (
            <span style={{ fontSize:'0.62rem', color:'#4caf50' }}>£{deposit} paid</span>
          )}
        </div>
      )}

      {/* contact */}
      {(phone || email) && (
        <>
          {divider}
          {phone && (
            <div style={{ display:'flex', alignItems:'center', gap:'7px', marginBottom: email ? '5px' : '0' }}>
              <span style={{ fontSize:'0.65rem', width:'14px', textAlign:'center' }}>📞</span>
              <span style={{ fontSize:'0.68rem', color: theme.sub, letterSpacing:'0.3px' }}>{phone}</span>
            </div>
          )}
          {email && (
            <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
              <span style={{ fontSize:'0.65rem', width:'14px', textAlign:'center' }}>✉</span>
              <span style={{ fontSize:'0.65rem', color: theme.faint, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{email}</span>
            </div>
          )}
        </>
      )}

      {/* notes */}
      {b.notes && (
        <>
          {divider}
          <div style={{ fontSize:'0.65rem', color: theme.noteC, fontStyle:'italic', lineHeight:'1.4', overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>"{b.notes}"</div>
        </>
      )}

      {divider}

      {/* badges */}
      <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
        <span style={{ fontSize:'0.58rem', fontWeight:'800', color: statusStyle.color, background: statusStyle.bg, border:'1px solid '+statusStyle.color+'35', borderRadius:'5px', padding:'2px 7px', letterSpacing:'0.6px', textTransform:'uppercase' }}>{statusStyle.label}</span>
        {b.source && (
          <span style={{ fontSize:'0.58rem', fontWeight:'800', color: sourceColor || 'rgba(255,255,255,0.5)', background:(sourceColor||'rgba(255,255,255,0.1)')+'22', border:'1px solid '+(sourceColor||'rgba(255,255,255,0.2)')+'55', borderRadius:'5px', padding:'2px 7px', letterSpacing:'0.6px', textTransform:'uppercase' }}>{b.source}</span>
        )}
        {b.groupId && (
          <span style={{ fontSize:'0.58rem', fontWeight:'800', color:'#d4af37', background:'rgba(212,175,55,0.12)', border:'1px solid rgba(212,175,55,0.3)', borderRadius:'5px', padding:'2px 7px', letterSpacing:'0.6px' }}>GROUP ×{b.groupSize || '?'}</span>
        )}
        {b.paymentType === 'DEPOSIT' && (
          <span style={{ fontSize:'0.58rem', fontWeight:'800', color:'#03a9f4', background:'rgba(3,169,244,0.12)', border:'1px solid rgba(3,169,244,0.3)', borderRadius:'5px', padding:'2px 7px', letterSpacing:'0.6px' }}>DEPOSIT</span>
        )}
      </div>
    </div>
  );
}

export default function TimeGrid({ date, bookings, barbers, slotHeight, specialHours, onSlotClick, onWalkIn, onBlockTime, onBookingClick, selectedBooking, onAnySlotClick }) {
  const nowRef = useRef(null);
  const [slotPopup, setSlotPopup] = useState(null);
  const [hoverPopup, setHoverPopup] = useState(null);
  const hoverTimer = useRef(null);
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayName = DAYS[date.getDay()];
  const savedHours = (() => { try { const h = localStorage.getItem('shopHours'); return h ? JSON.parse(h) : null; } catch { return null; } })();
  const hoursConfig = savedHours || config.hours;

  // Per-barber hours for this day
  const barberHours = barbers.map(barber => {
    const special = getEffectiveDayHours(date, dayName, hoursConfig, specialHours);
    const bDayHours = barber.dayHours && barber.dayHours[dayName];
    const h = bDayHours || special;
    const isOff = !!(h && h.closed) || (barber.workingDays && !barber.workingDays.includes(dayName));
    return {
      open:  isOff ? null : convertTo24((h && h.open)  || '09:00'),
      close: isOff ? null : convertTo24((h && h.close) || '19:00'),
      isOff,
    };
  });

  const allOpenMins  = barberHours.filter(h => !h.isOff).map(h => h.open);
  const allCloseMins = barberHours.filter(h => !h.isOff).map(h => h.close);
  const OPEN_MINS  = allOpenMins.length  ? Math.min(...allOpenMins)  : 9 * 60;
  const CLOSE_MINS = allCloseMins.length ? Math.max(...allCloseMins) : 19 * 60;
  const GRID_START = Math.max(0, Math.floor(OPEN_MINS / 60) - 2);
  const GRID_END   = Math.min(24, Math.ceil(CLOSE_MINS / 60) + 2);
  const slots = [];
  for (let h = GRID_START; h < GRID_END; h++) {
    [0, 15, 30, 45].forEach(m => { slots.push({ h, m, mins: h * 60 + m }); });
  }
  const isToday = date.toDateString() === new Date().toDateString();
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const TIME_COL = 56;

  const byBarber = {};
  barbers.forEach(b => { byBarber[b.id] = []; byBarber[b.name.toLowerCase()] = byBarber[b.id]; });
  bookings.forEach(b => { const key = (b.barber||b.barberId||b.barberName||'').toLowerCase(); if (byBarber[key]) byBarber[key].push(b); });

  useEffect(() => {
    if (isToday && nowRef.current) nowRef.current.scrollIntoView({ behavior:'smooth', block:'center' });
  }, [isToday]);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  return (
    <div style={{ flex:1, overflowY:'auto', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'12px', position:'relative' }}>
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', position:'sticky', top:0, background:'var(--card)', zIndex:10 }}>
        <div style={{ width:TIME_COL, flexShrink:0, borderRight:'1px solid var(--border)' }} />
        {barbers.map((barber, bi) => {
          const aptCount = (byBarber[barber.name.toLowerCase()]||[]).filter(b=>b.status!=='CANCELLED'&&b.status!=='BLOCKED').length;
          return (
            <div key={barber.id} onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setSlotPopup({ barber, hour: Math.floor(OPEN_MINS / 60), mins: OPEN_MINS, x: rect.left + 10, y: rect.bottom }); }}
              style={{ flex:1, padding:'10px 14px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'2px', borderRight:bi<barbers.length-1?'1px solid var(--border)':'none', cursor:'pointer', borderTop:'3px solid '+barber.color+'aa', transition:'background 0.15s' }}
              onMouseEnter={e=>{ e.currentTarget.style.background='rgba(212,175,55,0.1)'; }}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{ fontSize:'0.72rem', fontWeight:'800', color:barber.color, letterSpacing:'2px', textTransform:'uppercase' }}>{barber.name}</div>
              <div style={{ fontSize:'0.55rem', color:'var(--muted)', letterSpacing:'0.5px' }}>{aptCount} apt{aptCount !== 1 ? 's' : ''} · {minsToLabel(OPEN_MINS)}–{minsToLabel(CLOSE_MINS)}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display:'flex', position:'relative' }}>
        <div style={{ width:TIME_COL, flexShrink:0, borderRight:'1px solid var(--border)' }}>
          {slots.map(slot => (
            <div key={slot.mins} style={{ height:slotHeight, borderBottom:slot.m===0?'1px solid var(--border)':'1px solid rgba(212,175,55,0.1)', background: slot.h % 2 === 0 ? 'var(--slot-bg)' : 'var(--slot-alt)', position:'relative', display:'flex', alignItems:'flex-start', justifyContent:'flex-end', paddingRight:'6px' }}>
              {slot.m === 0 && (
                <span style={{ fontSize:'0.6rem', color:'var(--muted)', lineHeight:'1', marginTop:'2px', whiteSpace:'nowrap' }}>
                  {slot.h < 12 ? slot.h + ':00' : slot.h === 12 ? '12:00' : (slot.h - 12) + ':00'}{slot.h < 12 ? 'am' : 'pm'}
                </span>
              )}
            </div>
          ))}
        </div>
        {barbers.map((barber, bi) => {
          const bh = barberHours[bi];
          const barberBs = (byBarber[barber.name.toLowerCase()]||[]).filter(b=>b.status!=='CANCELLED');
          return (
            <div key={barber.id} style={{ flex:1, position:'relative', borderRight:bi<barbers.length-1?'1px solid var(--border)':'none' }}>
              {slots.map(slot => {
                const isOutsideHours = bh.isOff || slot.mins < bh.open || slot.mins >= bh.close;
                const inactive = isOutsideHours;
                return (
                  <div key={slot.mins}
                    onClick={(e) => { if (!inactive) { onAnySlotClick && onAnySlotClick(); const rect = e.currentTarget.getBoundingClientRect(); setSlotPopup({ barber, hour: slot.h, mins: slot.mins, x: rect.left + 10, y: rect.top }); } }}
                    style={{ height:slotHeight, borderBottom:slot.m===0?'1px solid var(--border)':'1px solid rgba(212,175,55,0.1)', cursor:inactive?'default':'pointer', background: inactive ? 'var(--slot-past)' : slot.h % 2 === 0 ? 'var(--slot-bg)' : 'var(--slot-alt)', transition:'background 0.1s', position:'relative' }}
                    onMouseEnter={e=>{ if(!inactive) e.currentTarget.style.background='var(--slot-hover)'; }}
                    onMouseLeave={e=>e.currentTarget.style.background=inactive?'var(--slot-past)':slot.h%2===0?'var(--slot-bg)':'var(--slot-alt)'}>
                  </div>
                );
              })}
              {barberBs.map((b,i) => {
                if (b.status === 'BLOCKED') {
                  const startMins = convertTo24(b.time || b.startTime);
                  if (!startMins) return null;
                  const endMins = b.endTime ? convertTo24(b.endTime) : startMins + 60;
                  const duration = Math.max(endMins - startMins, 30);
                  const top = (startMins - GRID_START*60) * slotHeight / 15;
                  const height = Math.max(duration * slotHeight / 15 - 4, slotHeight * 2);
                  return (
                    <div key={i} onClick={e => { e.stopPropagation(); onBookingClick(b); }}
                      style={{ position:'absolute', top:top+2, left:4, right:4, height, background:'rgba(255,82,82,0.1)', border:'1px solid rgba(255,82,82,0.3)', borderLeft:'3px solid #ff5252', borderRadius:'6px', padding:'4px 8px', overflow:'hidden', zIndex:2, cursor:'pointer' }}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(255,82,82,0.2)'}
                      onMouseLeave={e=>e.currentTarget.style.background='rgba(255,82,82,0.1)'}>
                      <div style={{ fontSize:'0.68rem', fontWeight:'700', color:'#ff5252', marginBottom:'1px' }}>🚫 {(b.time || b.startTime)}{b.endTime ? ' → ' + b.endTime : ''}</div>
                      <div style={{ fontSize:'0.65rem', color:'rgba(255,82,82,0.7)' }}>{b.note || b.service || 'Blocked'}</div>
                    </div>
                  );
                }
                const startMins = convertTo24(b.time || b.startTime);
                if (!startMins) return null;
                const top = (startMins - GRID_START*60) * slotHeight / 15;
                const svc = findServiceByBookingValue(b.service);
                const duration = (svc&&svc.duration) || 30;
                const height = Math.max(duration * slotHeight / 15 - 4, slotHeight * 2);
                const isSel = selectedBooking && selectedBooking.bookingId===b.bookingId;
                const sourceColor = SOURCE_COLORS[(b.source||'').toLowerCase()];
                const displayName = getBookingName(b);
                const compactName = height < 34 ? displayName.split(' ')[0] || displayName : displayName;
                return (
                  <div key={i} onClick={e=>{e.stopPropagation();onBookingClick(b);}}
                    style={{ position:'absolute', top:top+2, left:4, right:4, height, background:isSel?barber.color+'35':barber.color+'18', border:'1px solid '+barber.color+(isSel?'bb':'45'), borderLeft:'3px solid '+barber.color, borderRadius:'6px', padding:'4px 8px', cursor:'pointer', overflow:'hidden', transition:'all 0.15s', zIndex:2 }}
                    onMouseEnter={e=>{ e.currentTarget.style.background=barber.color+'28'; clearTimeout(hoverTimer.current); const mx=e.clientX; const my=e.clientY; hoverTimer.current=setTimeout(()=>setHoverPopup({booking:b,barber,mx,my}),300); }}
                    onMouseLeave={e=>{ e.currentTarget.style.background=isSel?barber.color+'35':barber.color+'18'; clearTimeout(hoverTimer.current); setHoverPopup(null); }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'4px', lineHeight:'1.2', flexWrap:'wrap' }}>
                      <span style={{ fontSize:'0.68rem', fontWeight:'700', color:barber.color }}>{b.time}</span>
                      {b.groupId && <span style={{ fontSize:'0.5rem', fontWeight:'800', color:'#fff', background:'rgba(212,175,55,0.8)', borderRadius:'4px', padding:'0 3px', letterSpacing:'0.5px', flexShrink:0 }}>GROUP×{b.groupSize||'?'}</span>}
                      {sourceColor && <span style={{ fontSize:'0.5rem', fontWeight:'800', color:sourceColor, background:sourceColor+'22', border:'1px solid '+sourceColor+'55', borderRadius:'4px', padding:'0 4px', letterSpacing:'0.5px', flexShrink:0, textTransform:'uppercase' }}>{b.source}</span>}
                    </div>
                    <div title={displayName} style={{ fontSize:'0.72rem', fontWeight:'700', color: isSel ? '#fff' : barber.color, filter: isSel ? 'none' : 'brightness(0.55) saturate(1.4)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', lineHeight:'1.2' }}>{compactName}</div>
                    <div style={{ fontSize:'0.62rem', fontWeight:'500', color: isSel ? 'rgba(255,255,255,0.85)' : barber.color, filter: isSel ? 'none' : 'brightness(0.45) saturate(1.2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', lineHeight:'1.2' }}>{svc ? svc.name : b.service}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
        {isToday && (
          <div ref={nowRef} style={{ position:'absolute', left:0, right:0, top:(nowMins-GRID_START*60)*slotHeight/15, zIndex:5, pointerEvents:'none' }}>
            <div style={{ position:'absolute', left:TIME_COL-6, right:0, height:'2px', background:'#ff5252' }}>
              <div style={{ position:'absolute', left:-4, top:-4, width:'10px', height:'10px', borderRadius:'50%', background:'#ff5252' }} />
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes hoverCardIn{from{opacity:0;transform:scale(0.92) translateY(4px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
      <BookingHoverCard popup={hoverPopup} />
      <SlotPopup
        popup={slotPopup}
        onNewBooking={() => { onSlotClick && onSlotClick(slotPopup.barber, slotPopup.hour, slotPopup.mins); setSlotPopup(null); }}
        onWalkIn={() => { onWalkIn && onWalkIn(slotPopup.barber, slotPopup.hour, slotPopup.mins); setSlotPopup(null); }}
        onBlockTime={() => { onBlockTime && onBlockTime(slotPopup.barber, slotPopup.hour, slotPopup.mins); setSlotPopup(null); }}
        onClose={() => setSlotPopup(null)}
      />
    </div>
  );
}
