import React, { useState } from 'react';
import Services from './Services';
import Gallery from './Gallery';
import Announcements from './Announcements';
import Products from './Products';
import PageHeader from '../components/PageHeader';

const TABS = [
  { id: 'services', label: 'Services' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'products', label: 'Products' },
];

export default function OnlineProfile() {
  const [activeTab, setActiveTab] = useState('services');

  const renderTab = function() {
    if (activeTab === 'services') return <Services />;
    if (activeTab === 'gallery') return <Gallery />;
    if (activeTab === 'products') return <Products cart={[]} setCart={() => {}} onOpenCart={() => {}} />;
    return <Announcements />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <PageHeader
        title="Online Profile"
        subtitle="Manage all website-facing content from one place."
      />

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
