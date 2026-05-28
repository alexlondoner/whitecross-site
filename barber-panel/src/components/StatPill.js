import React from 'react';

export default function StatPill({ label, value, color, onClick, active }) {
  const isEmpty = value === 0 || value === '0' || value === '£0.00' || value === '£0';
  const dotColor = isEmpty ? 'var(--muted2)' : color;
  const valColor = isEmpty ? 'var(--muted)' : color;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '5px 12px',
        borderRadius: '99px',
        border: `1px solid ${active ? color + '60' : 'var(--border2)'}`,
        background: active ? color + '18' : 'var(--card)',
        fontSize: '0.78rem', fontWeight: '600',
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'all 0.12s',
        opacity: isEmpty ? 0.6 : 1,
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.borderColor = active ? color + '60' : 'var(--border)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = active ? color + '60' : 'var(--border2)'; }}
    >
      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <span style={{ color: 'var(--muted)', fontWeight: '500' }}>{label}</span>
      <span style={{ fontWeight: '800', color: valColor }}>{value}</span>
    </div>
  );
}
