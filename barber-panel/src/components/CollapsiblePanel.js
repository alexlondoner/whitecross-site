import React, { useState } from 'react';

export default function CollapsiblePanel({ title, color = '#d4af37', children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: '18px', borderRadius: '14px', border: `1px solid ${color}30`, background: open ? `${color}08` : 'rgba(0,0,0,0.04)', boxShadow: open ? `0 2px 12px ${color}18` : undefined }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          padding: '13px 18px',
          background: open ? `${color}12` : 'transparent',
          borderRadius: '14px',
          userSelect: 'none',
          fontWeight: 700,
          color,
          fontSize: '0.98rem',
          letterSpacing: '0.5px',
          transition: 'background 0.18s',
        }}
      >
        <span style={{ fontSize: '1.15em', marginRight: '2px', transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        <span>{title}</span>
      </div>
      {open && <div style={{ padding: '14px 18px 8px 18px' }}>{children}</div>}
    </div>
  );
}
