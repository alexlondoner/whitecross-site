import React from 'react';

export default function PageHeader({ title, subtitle, icon, actions }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      flexWrap: 'wrap',
      gap: '12px',
      paddingBottom: '4px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
        <div style={{
          width: '4px',
          alignSelf: 'stretch',
          minHeight: '36px',
          borderRadius: '4px',
          background: 'linear-gradient(180deg, #d4af37 0%, #b8860b 100%)',
          flexShrink: 0,
          marginTop: '2px',
        }} />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {icon && (
              <span style={{ fontSize: '1.1rem', lineHeight: 1, opacity: 0.85 }}>{icon}</span>
            )}
            <h1 style={{
              fontSize: '1.5rem',
              fontWeight: '800',
              color: '#d4af37',
              margin: 0,
              letterSpacing: '-0.3px',
              lineHeight: 1.2,
            }}>{title}</h1>
          </div>
          {subtitle && (
            <p style={{
              fontSize: '0.72rem',
              color: 'var(--muted)',
              margin: '4px 0 0',
              letterSpacing: '0.1px',
            }}>{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  );
}
