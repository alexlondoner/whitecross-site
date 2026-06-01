import React, { useState } from 'react';
import config from '../config';

const navItems = [
  { id: 'home',           icon: '🏠', label: 'Home' },
  { id: 'dashboard',      icon: '📊', label: 'Dashboard' },
  { id: 'bookings',       icon: '📅', label: 'Bookings' },
  { id: 'calendar',       icon: '🗓️', label: 'Calendar' },
  { id: 'clients',        icon: '👥', label: 'Clients' },
  { id: 'barbers',        icon: '🧑‍💼', label: 'Team Members' },
  { id: 'reports',        icon: '📈', label: 'Reports' },
  { id: 'marketing',      icon: '📣', label: 'Marketing' },
  { id: 'online-profile', icon: '🌐', label: 'Online Profile' },
  { id: 'settings',       icon: '⚙️', label: 'Settings' },
];

const OWNER_ONLY_PAGES = new Set(['home', 'reports', 'marketing', 'settings', 'barbers', 'online-profile', 'activity-log']);

function Sidebar({ activePage, setActivePage, theme, onToggleTheme, isCollapsed, setIsCollapsed, tenantId, tenantName, isOwner, role, selectedDate, onDateSelect }) {
  const isLight = theme === 'light';
  const [hoveredItem, setHoveredItem] = useState(null);
  const [tooltipY, setTooltipY] = useState(0);

  const sidebarWidth = isCollapsed ? '76px' : '205px';

  const t = {
    bg:      isLight ? '#f8f5ec' : '#0c0a06',
    bg2:     isLight ? '#f0ebdd' : '#141008',
    card:    isLight ? '#ffffff' : '#1a1610',
    border:  isLight ? '#e2d9c4' : '#252015',
    border2: isLight ? '#d4c9ae' : '#302818',
    gold:    isLight ? '#9a7020' : '#c9a84c',
    gold2:   isLight ? '#7a5510' : '#a07828',
    goldDim: isLight ? 'rgba(154,112,32,0.08)' : 'rgba(201,168,76,0.08)',
    goldActive: isLight ? 'rgba(154,112,32,0.12)' : 'rgba(201,168,76,0.12)',
    txt:     isLight ? '#1a1408' : '#ede0c4',
    muted:   isLight ? '#8a7a5a' : '#6b5f43',
    muted2:  isLight ? '#b0a080' : '#3a3224',
    red:     isLight ? '#8b2a2a' : '#ff5252',
  };

  const isOwnerRole = role === 'owner' || role === 'admin';
  const allItems = [
    ...navItems.filter(item => isOwnerRole || !OWNER_ONLY_PAGES.has(item.id)),
    ...(isOwnerRole ? [{ id: 'activity-log', icon: '🗃️', label: 'Activity Log' }] : []),
  ];

  return (
    <aside style={{
      position: 'fixed', left: 0, top: 0, bottom: 0,
      width: sidebarWidth,
      background: t.bg,
      borderRight: `1px solid ${t.border}`,
      display: 'flex', flexDirection: 'column',
      zIndex: 100,
      transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      overflow: 'visible',
    }}>

      {/* COLLAPSE TOGGLE */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{
          position: 'absolute', right: '-14px', top: '50%',
          transform: 'translateY(-50%)',
          width: '14px', height: '42px',
          background: t.bg2, border: `1px solid ${t.border}`,
          borderLeft: 'none',
          borderRadius: '0 6px 6px 0',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: t.gold, fontSize: '9px', zIndex: 101,
          transition: 'all 0.2s',
          padding: 0,
        }}
        title={isCollapsed ? 'Expand' : 'Collapse'}
      >
        <span style={{
          display: 'block', transition: 'transform 0.25s',
          transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
          lineHeight: 1,
        }}>▶</span>
      </button>

      {/* LOGO SECTION */}
      <div style={{
        padding: isCollapsed ? '14px 10px 10px' : '18px 16px 14px',
        borderBottom: `1px solid ${t.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', flexShrink: 0,
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
          background: `linear-gradient(90deg, transparent, ${t.gold}, transparent)`,
        }} />

        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: isCollapsed ? '0' : '6px',
        }}>
          {/* sal+OWN logo */}
          {isCollapsed ? (
            <div style={{
              width: '38px', height: '38px', borderRadius: '10px',
              background: '#534AB7',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '14px', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>sO</span>
            </div>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', marginTop: '4px' }}>
              <span style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-1px', color: isLight ? '#0a0a0a' : '#f0f0f0', lineHeight: 1 }}>sal</span>
              <div style={{ background: '#534AB7', padding: '1px 8px 3px', borderRadius: '6px', marginLeft: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-1px', color: '#fff', lineHeight: 1 }}>OWN</span>
              </div>
            </div>
          )}

          {!isCollapsed && tenantName && (
            <div style={{
              fontSize: '0.65rem', color: t.muted,
              letterSpacing: '1px', textAlign: 'center',
              textTransform: 'uppercase', fontWeight: 600,
              maxWidth: '160px', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {tenantName}
            </div>
          )}
        </div>
      </div>

      {/* NAV */}
      <nav className="sidebar-nav" style={{
        flex: 1, padding: '10px 8px',
        overflowY: 'auto', overflowX: 'hidden',
      }}>
        {allItems.map(item => {
          const isActive = activePage === item.id;
          const isHover = hoveredItem === item.id;

          return (
            <div key={item.id} style={{ position: 'relative', marginBottom: '5px' }}>
              <button
                onClick={() => { if (item.id === 'dashboard') { onDateSelect(new Date()); } else { setActivePage(item.id); } }}
                onMouseEnter={(e) => {
                  setHoveredItem(item.id);
                  const r = e.currentTarget.getBoundingClientRect();
                  setTooltipY(r.top + r.height / 2);
                }}
                onMouseLeave={() => setHoveredItem(null)}
                title={isCollapsed ? item.label : ''}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center',
                  padding: isCollapsed ? '10px 0' : '9px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isActive ? t.goldActive : isHover ? t.goldDim : 'transparent',
                  color: isActive ? t.gold : t.muted,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  borderLeft: isActive ? `3px solid ${t.gold}` : '3px solid transparent',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                }}
              >
                <span style={{
                  fontSize: isCollapsed ? '1.2rem' : '1rem',
                  minWidth: isCollapsed ? 'auto' : '26px',
                  textAlign: 'center',
                  transition: 'transform 0.15s',
                  transform: isHover ? 'scale(1.1)' : 'scale(1)',
                  filter: isActive ? `drop-shadow(0 0 4px ${t.gold}88)` : 'none',
                }}>
                  {item.icon}
                </span>
                {!isCollapsed && (
                  <span style={{
                    marginLeft: '10px',
                    fontSize: '0.82rem',
                    fontWeight: isActive ? '700' : '500',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    letterSpacing: '0.3px',
                    color: isActive ? t.gold : t.txt,
                    minWidth: 0,
                  }}>
                    {item.label}
                  </span>
                )}
              </button>

              {isCollapsed && isHover && (
                <div style={{
                  position: 'fixed',
                  left: '78px', top: tooltipY,
                  transform: 'translateY(-50%)',
                  background: t.card,
                  color: t.gold,
                  border: `1px solid ${t.border2}`,
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '0.78rem', fontWeight: 700,
                  letterSpacing: '0.3px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                  zIndex: 9999,
                  pointerEvents: 'none',
                }}>
                  {item.label}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* FOOTER */}
      <div style={{
        padding: isCollapsed ? '8px' : '10px 12px',
        borderTop: `1px solid ${t.border}`,
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          marginBottom: '8px', gap: '6px',
        }}>
          {!isCollapsed && (
            <div style={{
              fontSize: '0.55rem', color: t.muted,
              lineHeight: 1.3, flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', letterSpacing: '0.3px',
            }}>
              {config.shopAddress}
            </div>
          )}

          <div
            onClick={onToggleTheme}
            title={isLight ? 'Switch to Dark' : 'Switch to Light'}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', flexShrink: 0 }}
          >
            {!isCollapsed && (
              <span style={{ fontSize: '0.55rem', color: t.muted, letterSpacing: '0.5px' }}>
                {isLight ? '☀️' : '🌙'}
              </span>
            )}
            <div style={{
              width: '30px', height: '16px', borderRadius: '8px',
              background: isLight ? t.gold : t.border2,
              position: 'relative', flexShrink: 0,
              transition: 'background 0.2s',
            }}>
              <div style={{
                position: 'absolute', top: '2px',
                left: isLight ? '16px' : '2px',
                width: '12px', height: '12px',
                borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s',
              }} />
            </div>
          </div>
        </div>

      </div>
    </aside>
  );
}

export default Sidebar;
