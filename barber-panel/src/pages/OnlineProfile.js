import React, { useState } from 'react';
import Services from './Services';
import Gallery from './Gallery';
import Announcements from './Announcements';

const TABS = [
  { id: 'services', label: 'Services' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'announcements', label: 'Announcements' },
];

export default function OnlineProfile() {
  const [activeTab, setActiveTab] = useState('services');

  const renderTab = function() {
    if (activeTab === 'services') return <Services />;
    if (activeTab === 'gallery') return <Gallery />;
    return <Announcements />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h1 style={{ margin: 0, fontSize: '1.45rem', color: 'var(--text)', letterSpacing: '0.3px' }}>
          Online Profile
        </h1>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
          Manage all website-facing content from one place.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {TABS.map(function(tab) {
          var selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={function() { setActiveTab(tab.id); }}
              style={{
                padding: '9px 14px',
                borderRadius: '999px',
                border: selected ? '1px solid rgba(212,175,55,0.55)' : '1px solid var(--border)',
                background: selected ? 'rgba(212,175,55,0.15)' : 'var(--card)',
                color: selected ? '#d4af37' : 'var(--muted)',
                fontSize: '0.76rem',
                fontWeight: '700',
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div>{renderTab()}</div>
    </div>
  );
}
