import React, { useState } from 'react';
import config from '../config';

const navItems = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'bookings', icon: '📅', label: 'Bookings' },
  { id: 'barbers', icon: '✂️', label: 'Team Members' },
  { id: 'online-profile', icon: '🌐', label: 'Online Profile' },
  { id: 'clients', icon: '👥', label: 'Clients' },
  { id: 'reports', icon: '📈', label: 'Reports' },
  { id: 'finance', icon: '💰', label: 'Finance' },
  { id: 'calendar', icon: '🗓️', label: 'Calendar' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
];

function Sidebar({ activePage, setActivePage, onLogout, theme, onToggleTheme, isCollapsed, setIsCollapsed }) {
  const isLight = theme === 'light';
  const [hoveredItem, setHoveredItem] = useState(null);

  // Dynamic values based on state
  const sidebarWidth = isCollapsed ? '72px' : '240px';

  return (
    <aside style={{
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
      width: sidebarWidth,
      background: isLight ? '#ffffff' : '#111111',
      borderRight: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(212,175,55,0.1)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 100,
      transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)', // Smooth slide
      overflow: 'visible'
    }}>
      
      {/* Gold Toggle Tab — sits on the outer edge of the sidebar */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{
          position: 'absolute',
          right: '-14px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '14px',
          height: '48px',
          background: 'linear-gradient(180deg, #d4af37 0%, #b8932a 100%)',
          border: 'none',
          borderRadius: '0 6px 6px 0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#000',
          fontSize: '8px',
          zIndex: 101,
          boxShadow: '2px 0 8px rgba(212,175,55,0.4)',
          transition: 'width 0.2s, box-shadow 0.2s',
          padding: 0,
        }}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <span style={{
          display: 'block',
          transition: 'transform 0.3s',
          transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
          lineHeight: 1,
        }}>▶</span>
      </button>

      {/* Logo Section */}
      <div style={{
        padding: isCollapsed ? '28px 20px' : '28px 24px',
        borderBottom: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(212,175,55,0.1)',
        minHeight: '90px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.5rem', minWidth: '32px' }}>✂️</span>
          {!isCollapsed && (
            <div style={{ opacity: 1, transition: 'opacity 0.2s' }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '0.85rem', color: '#d4af37', letterSpacing: '1px', fontWeight: '700' }}>
                I CUT
              </div>
              <div style={{ fontSize: '0.68rem', color: isLight ? '#9a8a70' : '#7a7260', letterSpacing: '1px' }}>
                ADMIN
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 12px' }}>
        {navItems.map(item => (
          <div key={item.id} style={{ position: 'relative', marginBottom: '4px' }}>
            <button
              onClick={() => setActivePage(item.id)}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
              title={isCollapsed ? item.label : ""} // Basic tooltip for symbol look
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                padding: '12px 14px',
                borderRadius: '8px',
                border: 'none',
                background: activePage === item.id ? 'rgba(212,175,55,0.12)' : 'transparent',
                color: activePage === item.id ? '#d4af37' : (isLight ? '#4a4030' : '#7a7260'),
                cursor: 'pointer',
                transition: 'all 0.2s',
                borderLeft: activePage === item.id ? '3px solid #d4af37' : '3px solid transparent',
              }}
            >
              <span style={{ fontSize: '1.2rem', minWidth: '32px', textAlign: 'center' }}>{item.icon}</span>
              {!isCollapsed && (
                <span style={{ marginLeft: '12px', fontSize: '0.88rem', fontWeight: activePage === item.id ? '600' : '400', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
              )}
            </button>

            {isCollapsed && hoveredItem === item.id && (
              <div style={{
                position: 'absolute',
                left: 'calc(100% + 10px)',
                top: '50%',
                transform: 'translateY(-50%)',
                background: isLight ? '#ffffff' : '#1a1a14',
                color: isLight ? '#3b3324' : '#e4c46a',
                border: '1px solid rgba(212,175,55,0.35)',
                borderRadius: '8px',
                padding: '7px 10px',
                fontSize: '0.76rem',
                fontWeight: 600,
                letterSpacing: '0.2px',
                whiteSpace: 'nowrap',
                boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
                zIndex: 200,
                pointerEvents: 'none'
              }}>
                {item.label}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Shop info & Footer */}
      <div style={{
        padding: isCollapsed ? '16px 10px' : '16px 24px',
        borderTop: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(212,175,55,0.1)',
        background: isCollapsed ? 'transparent' : 'inherit'
      }}>
        {!isCollapsed && (
          <div style={{ fontSize: '0.72rem', color: isLight ? '#9a8a70' : '#7a7260', marginBottom: '12px' }}>
            {config.shopAddress}
          </div>
        )}

        {/* Theme toggle - Icon only when collapsed */}
        <div
            onClick={onToggleTheme}
            title={isCollapsed ? (isLight ? 'Switch to Dark' : 'Switch to Light') : ''}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: isCollapsed ? 'center' : 'space-between',
                marginBottom: '12px',
                cursor: 'pointer'
            }}
        >
          {!isCollapsed && <span style={{ fontSize: '0.72rem', color: isLight ? '#9a8a70' : '#7a7260' }}>
            {isLight ? 'Light' : 'Dark'}
          </span>}
          <div style={{ 
              width: isCollapsed ? '30px' : '44px', 
              height: isCollapsed ? '16px' : '24px', 
              borderRadius: '12px', 
              background: isLight ? '#d4af37' : '#333', 
              position: 'relative',
              flexShrink: 0 
          }}>
            <div style={{ 
                position: 'absolute', 
                top: isCollapsed ? '2px' : '3px', 
                left: isLight ? (isCollapsed ? '16px' : '23px') : '3px', 
                width: isCollapsed ? '12px' : '18px', 
                height: isCollapsed ? '12px' : '18px', 
                borderRadius: '50%', 
                background: '#fff', 
                transition: 'left 0.2s' 
            }} />
          </div>
        </div>

        <button
          onClick={onLogout}
          title={isCollapsed ? 'Sign Out' : ''}
          style={{
            width: '100%',
            padding: '10px 0',
            background: 'transparent',
            border: isCollapsed ? 'none' : '1px solid rgba(255,82,82,0.3)',
            borderRadius: '6px',
            color: '#ff5252',
            fontSize: isCollapsed ? '1.2rem' : '0.75rem',
            cursor: 'pointer',
          }}
        >
          {isCollapsed ? 'Logout' : 'Sign Out'}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;