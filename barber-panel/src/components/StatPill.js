import React from 'react';

export default function StatPill({ label, value, color, onClick, active }) {
  return (
    <div onClick={onClick} style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'4px 9px', background:active?color+'25':color+'10', border:'1px solid '+(active?color:color+'30'), borderRadius:'6px', minWidth:'54px', cursor:onClick?'pointer':'default', transition:'all 0.15s' }}
      onMouseEnter={e=>{if(onClick)e.currentTarget.style.background=color+'20';}}
      onMouseLeave={e=>{e.currentTarget.style.background=active?color+'25':color+'10';}}>
      <span style={{ fontSize:'0.88rem', fontWeight:'800', color, lineHeight:1.2 }}>{value}</span>
      <span style={{ fontSize:'0.5rem', color:'var(--muted)', letterSpacing:'0.4px', textTransform:'uppercase', whiteSpace:'nowrap' }}>{label}</span>
    </div>
  );
}
