import React, { useState } from 'react';
import config from '../config';

const navItems = [
  { id: 'dashboard',     icon: '📊', label: 'Dashboard' },
  { id: 'bookings',      icon: '📅', label: 'Bookings' },
  { id: 'calendar',      icon: '🗓️', label: 'Calendar' },
  { id: 'clients',       icon: '👥', label: 'Clients' },
  { id: 'barbers',       icon: '✂️', label: 'Team Members' },
  { id: 'products',      icon: '🛒', label: 'Products' },
  { id: 'reports',       icon: '📈', label: 'Reports' },
  { id: 'finance',       icon: '💰', label: 'Finance' },
  { id: 'online-profile',icon: '🌐', label: 'Online Profile' },
  { id: 'settings',      icon: '⚙️', label: 'Settings' },
];

function Sidebar({ activePage, setActivePage, onLogout, theme, onToggleTheme, isCollapsed, setIsCollapsed, tenantId, isOwner }) {
  const isLight = theme === 'light';
  const [hoveredItem, setHoveredItem] = useState(null);

  // Dynamic values based on state
  const sidebarWidth = isCollapsed ? '72px' : '220px';

  return (
    <aside style={{
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
      width: sidebarWidth,
      background: isLight
        ? 'linear-gradient(135deg, #fffbe7 0%, #f7ecd0 100%)'
        : 'linear-gradient(135deg, #18140a 0%, #23201a 100%)',
      borderRight: 'none',
      boxShadow: isLight
        ? '2px 0 24px 0 rgba(212,175,55,0.07)'
        : '2px 0 32px 0 rgba(212,175,55,0.13)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 100,
      transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      overflow: 'visible',
      borderTopRightRadius: '18px',
      borderBottomRightRadius: '18px',
      border: isLight ? '1.5px solid #f3e3b2' : '1.5px solid #2d2412',
    }}>
      
      {/* Gold Toggle Tab — sits on the outer edge of the sidebar */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{
          position: 'absolute',
          right: '-16px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '18px',
          height: '54px',
          background: 'linear-gradient(180deg, #d4af37 0%, #b8932a 100%)',
          border: 'none',
          borderRadius: '0 10px 10px 0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#000',
          fontSize: '10px',
          zIndex: 101,
          boxShadow: '2px 0 12px rgba(212,175,55,0.25)',
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

      {/* Logo Section + Gold Line */}
      <div style={{
        padding: isCollapsed ? '16px 10px 10px' : '22px 18px 12px',
        borderBottom: 'none',
        minHeight: isCollapsed ? '76px' : '140px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        position: 'relative',
      }}>
        <div style={{ width: '100%', height: '6px', background: 'linear-gradient(90deg,#d4af37,#b8860b)', borderRadius: '0 0 8px 8px', marginBottom: isCollapsed ? '10px' : '18px', boxShadow: '0 2px 8px #d4af3722' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isCollapsed ? '0' : '8px' }}>
          <img
            src="/logo.png"
            alt="Whitecross Barbers"
            style={{
              width: isCollapsed ? '40px' : '80px',
              height: isCollapsed ? '40px' : '80px',
              objectFit: 'contain',
              borderRadius: '12px',
              boxShadow: '0 2px 12px #d4af3722',
              background: '#fff',
              border: '1.5px solid #e7d7a2',
            }}
          />
          {!isCollapsed && (
            <div style={{
              fontFamily: 'Georgia, serif',
              fontSize: '1.05rem',
              color: '#d4af37',
              letterSpacing: '2.5px',
              fontWeight: '700',
              lineHeight: 1,
              textAlign: 'center',
              marginTop: '2px',
              textShadow: '0 1px 8px #d4af3740',
            }}>
              I CUT
            </div>
          )}
        </div>
        {!isCollapsed && (
          <div style={{ width: '80%', height: '2px', background: 'linear-gradient(90deg,#d4af37,#b8860b)', borderRadius: '2px', margin: '18px auto 0', opacity: 0.5 }} />
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '18px 10px 10px' }}>
        {[...navItems, ...(isOwner ? [{ id: 'activity-log', icon: '🗃️', label: 'Activity Log' }] : [])].map(item => (
          <div key={item.id} style={{ position: 'relative', marginBottom: '6px' }}>
            <button
              onClick={() => setActivePage(item.id)}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
              title={isCollapsed ? item.label : ""}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                padding: isCollapsed ? '13px 0' : '13px 18px',
                borderRadius: '10px',
                border: 'none',
                background: activePage === item.id
                  ? 'linear-gradient(90deg, #fffbe7 60%, #f7ecd0 100%)'
                  : 'transparent',
                color: activePage === item.id ? '#d4af37' : (isLight ? '#4a4030' : '#e4c46a'),
                cursor: 'pointer',
                transition: 'all 0.22s cubic-bezier(.4,0,.2,1)',
                boxShadow: activePage === item.id
                  ? '0 2px 16px #d4af3730, 0 0 0 2px #d4af3722'
                  : hoveredItem === item.id
                    ? '0 2px 12px #d4af3722'
                    : 'none',
                borderLeft: activePage === item.id ? '4px solid #d4af37' : '4px solid transparent',
                filter: activePage === item.id ? 'blur(0.1px) brightness(1.08)' : 'none',
              }}
            >
              <span style={{
                fontSize: isCollapsed ? '1.45rem' : '1.25rem',
                minWidth: isCollapsed ? '100%' : '32px',
                textAlign: 'center',
                transition: 'transform 0.18s',
                transform: hoveredItem === item.id ? 'scale(1.18) rotate(-8deg)' : 'scale(1)',
                filter: activePage === item.id ? 'drop-shadow(0 0 6px #d4af37cc)' : 'none',
              }}>{item.icon}</span>
              {!isCollapsed && (
                <span style={{
                  marginLeft: '14px',
                  fontSize: '1.01rem',
                  fontWeight: activePage === item.id ? '700' : '500',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.5px',
                  textShadow: activePage === item.id ? '0 1px 8px #d4af3740' : 'none',
                }}>
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
                background: isLight ? '#fffbe7' : '#23201a',
                color: isLight ? '#3b3324' : '#e4c46a',
                border: '1.5px solid #d4af37',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '0.92rem',
                fontWeight: 700,
                letterSpacing: '0.2px',
                whiteSpace: 'nowrap',
                boxShadow: '0 10px 24px rgba(212,175,55,0.18)',
                zIndex: 200,
                pointerEvents: 'none',
              }}>
                {item.label}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Shop info & Footer */}
      <div style={{
        padding: isCollapsed ? '16px 10px' : '18px 24px',
        borderTop: 'none',
        background: isCollapsed ? 'transparent' : 'inherit',
        borderTopLeftRadius: '16px',
        borderTopRightRadius: '16px',
        marginTop: 'auto',
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
            padding: isCollapsed ? '10px 0' : '12px 0',
            background: 'linear-gradient(90deg, #fffbe7 60%, #f7ecd0 100%)',
            border: 'none',
            borderRadius: '8px',
            color: '#ff5252',
            fontSize: isCollapsed ? '1.2rem' : '0.95rem',
            cursor: 'pointer',
            fontWeight: 700,
            marginTop: '8px',
            boxShadow: '0 2px 8px #ff525222',
            transition: 'background 0.18s',
          }}
          onMouseOver={e => e.currentTarget.style.background = 'linear-gradient(90deg,#ffe7e7 60%,#ffd6d6 100%)'}
          onMouseOut={e => e.currentTarget.style.background = 'linear-gradient(90deg, #fffbe7 60%, #f7ecd0 100%)'}
        >
          {isCollapsed ? '🚪' : 'Sign Out'}
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;