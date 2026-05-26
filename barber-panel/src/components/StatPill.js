import React from 'react';

export default function StatPill({ label, value, color, onClick, active }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '5px',
        padding: '4px 10px',
        borderRadius: '99px',
        border: `1px solid ${active ? color + '60' : 'var(--border2)'}`,
        background: active ? color + '18' : 'var(--card)',
        fontSize: '0.65rem', fontWeight: '600',
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'all 0.12s',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.borderColor = active ? color + '60' : 'var(--border)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = active ? color + '60' : 'var(--border2)'; }}
    >
      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontWeight: '700', color }}>{value}</span>
    </div>
  );
}
