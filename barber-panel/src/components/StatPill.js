import React from 'react';

export default function StatPill({ label, value, color, onClick, active }) {
  return (
    <div onClick={onClick} style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'7px 12px', background:active?color+'25':color+'10', border:'1px solid '+(active?color:color+'30'), borderRadius:'8px', minWidth:'70px', cursor:onClick?'pointer':'default', transition:'all 0.15s' }}
      onMouseEnter={e=>{if(onClick)e.currentTarget.style.background=color+'20';}}
      onMouseLeave={e=>{e.currentTarget.style.background=active?color+'25':color+'10';}}>
      <span style={{ fontSize:'1.05rem', fontWeight:'800', color }}>{value}</span>
      <span style={{ fontSize:'0.55rem', color:'var(--muted)', letterSpacing:'0.5px', textTransform:'uppercase', marginTop:'1px', whiteSpace:'nowrap' }}>{label}</span>
    </div>
  );
}
