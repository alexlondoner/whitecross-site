import React, { useState, useEffect, useRef } from 'react';
import config from '../config';
import { findServiceByBookingValue, getBookingName } from '../utils/bookingUtils';
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

export default function TimeGrid({ date, bookings, barbers, slotHeight, specialHours, onSlotClick, onWalkIn, onBlockTime, onBookingClick, selectedBooking, onAnySlotClick }) {
  const nowRef = useRef(null);
  const [slotPopup, setSlotPopup] = useState(null);
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayName = DAYS[date.getDay()];
  const savedHours = (() => { try { const h = localStorage.getItem('shopHours'); return h ? JSON.parse(h) : null; } catch { return null; } })();
  const hoursConfig = savedHours || config.hours;
  const dayHours = getEffectiveDayHours(date, dayName, hoursConfig, specialHours);
  const OPEN_MINS = dayHours && !dayHours.closed ? convertTo24(dayHours.open) : 9 * 60;
  const CLOSE_MINS = dayHours && !dayHours.closed ? convertTo24(dayHours.close) : 19 * 60;
  const IS_CLOSED = !!(dayHours && dayHours.closed);
  const GRID_START = 7, GRID_END = 21;
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

  return (
    <div style={{ flex:1, overflowY:'auto', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'12px', position:'relative' }}>
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', position:'sticky', top:0, background:'var(--card)', zIndex:10 }}>
        <div style={{ width:TIME_COL, flexShrink:0, borderRight:'1px solid var(--border)' }} />
        {barbers.map((barber, bi) => {
          const aptCount = (byBarber[barber.name.toLowerCase()]||[]).filter(b=>b.status!=='CANCELLED').length;
          return (
            <div key={barber.id} onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setSlotPopup({ barber, hour: Math.floor(OPEN_MINS / 60), mins: OPEN_MINS, x: rect.left + 10, y: rect.bottom }); }}
              style={{ flex:1, padding:'10px 14px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'2px', borderRight:bi<barbers.length-1?'1px solid var(--border)':'none', cursor:'pointer', borderTop:'2px solid '+barber.color+'55', transition:'background 0.15s' }}
              onMouseEnter={e=>{ e.currentTarget.style.background='rgba(212,175,55,0.04)'; }}
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
            <div key={slot.mins} style={{ height:slotHeight, borderBottom:slot.m===0?'1px solid var(--border)':'1px solid rgba(212,175,55,0.06)', background:'transparent', position:'relative', display:'flex', alignItems:'flex-start', justifyContent:'flex-end', paddingRight:'6px' }}>
              {slot.m === 0 && (
                <span style={{ fontSize:'0.6rem', color:'var(--muted)', lineHeight:'1', marginTop:'2px', whiteSpace:'nowrap' }}>
                  {slot.h < 12 ? slot.h + ':00' : slot.h === 12 ? '12:00' : (slot.h - 12) + ':00'}{slot.h < 12 ? 'am' : 'pm'}
                </span>
              )}
            </div>
          ))}
        </div>
        {barbers.map((barber, bi) => {
          const barberBs = (byBarber[barber.name.toLowerCase()]||[]).filter(b=>b.status!=='CANCELLED');
          return (
            <div key={barber.id} style={{ flex:1, position:'relative', borderRight:bi<barbers.length-1?'1px solid var(--border)':'none' }}>
              {slots.map(slot => {
                const isOutsideHours = IS_CLOSED || slot.mins < OPEN_MINS || slot.mins >= CLOSE_MINS;
                const past = isToday && slot.mins < nowMins;
                const inactive = past || isOutsideHours;
                return (
                  <div key={slot.mins}
                    onClick={(e) => { if (!inactive) { onAnySlotClick && onAnySlotClick(); const rect = e.currentTarget.getBoundingClientRect(); setSlotPopup({ barber, hour: slot.h, mins: slot.mins, x: rect.left + 10, y: rect.top }); } }}
                    style={{ height:slotHeight, borderBottom:slot.m===0?'1px solid var(--border)':'1px solid rgba(212,175,55,0.06)', cursor:inactive?'default':'pointer', background:inactive?'var(--slot-past)':'var(--slot-bg)', transition:'background 0.1s', position:'relative' }}
                    onMouseEnter={e=>{ if(!inactive) e.currentTarget.style.background='var(--slot-hover)'; }}
                    onMouseLeave={e=>e.currentTarget.style.background=inactive?'var(--slot-past)':'var(--slot-bg)'}>
                    {inactive && <div style={{ position:'absolute', inset:0, background:'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.03) 4px, rgba(0,0,0,0.03) 8px)', pointerEvents:'none' }} />}
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
                    onMouseEnter={e=>e.currentTarget.style.background=barber.color+'28'}
                    onMouseLeave={e=>e.currentTarget.style.background=isSel?barber.color+'35':barber.color+'18'}>
                    <div style={{ display:'flex', alignItems:'center', gap:'4px', lineHeight:'1.2', flexWrap:'wrap' }}>
                      <span style={{ fontSize:'0.68rem', fontWeight:'700', color:barber.color }}>{b.time}</span>
                      {b.groupId && <span style={{ fontSize:'0.5rem', fontWeight:'800', color:'#fff', background:'rgba(212,175,55,0.8)', borderRadius:'4px', padding:'0 3px', letterSpacing:'0.5px', flexShrink:0 }}>GROUP×{b.groupSize||'?'}</span>}
                      {sourceColor && <span style={{ fontSize:'0.5rem', fontWeight:'800', color:sourceColor, background:sourceColor+'22', border:'1px solid '+sourceColor+'55', borderRadius:'4px', padding:'0 4px', letterSpacing:'0.5px', flexShrink:0, textTransform:'uppercase' }}>{b.source}</span>}
                    </div>
                    <div title={displayName} style={{ fontSize:'0.72rem', fontWeight:'600', color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', lineHeight:'1.2' }}>{compactName}</div>
                    <div style={{ fontSize:'0.62rem', color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', lineHeight:'1.2' }}>{svc ? svc.name : b.service}</div>
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
