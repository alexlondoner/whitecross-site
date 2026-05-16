import React from 'react';
import { minsToLabel } from '../utils/timeUtils';

export default function SlotPopup({ popup, onNewBooking, onWalkIn, onBlockTime, onClose }) {
  if (!popup) return null;
  return (
    <div style={{ position:'fixed', top:popup.y, left:popup.x, zIndex:1000, background:'var(--card)', border:'1px solid rgba(212,175,55,0.3)', borderRadius:'10px', padding:'6px', minWidth:'170px', boxShadow:'0 8px 24px rgba(0,0,0,0.6)' }}
      onMouseLeave={onClose}>
      <div style={{ fontSize:'0.62rem', color:'var(--muted)', padding:'4px 10px 6px', letterSpacing:'1px', borderBottom:'1px solid var(--border)', marginBottom:'4px' }}>
      {minsToLabel(popup.mins || popup.hour * 60)} -- {popup.barber.name}
      </div>
      {[
        { label:'📅 New Booking', action: onNewBooking },
        { label:'🚶 Walk-in', action: onWalkIn },
        { label:'🚫 Block Time', action: onBlockTime },
      ].map(item => (
        <button key={item.label} onClick={item.action}
          style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'8px 10px', background:'transparent', border:'none', color:'var(--text)', cursor:'pointer', borderRadius:'6px', fontSize:'0.78rem', textAlign:'left' }}
          onMouseEnter={e=>e.currentTarget.style.background='rgba(212,175,55,0.1)'}
          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
