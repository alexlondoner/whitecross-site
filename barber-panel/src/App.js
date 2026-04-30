import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Bookings from './pages/Bookings';
import Barbers from './pages/Barbers';
import Gallery from './pages/Gallery';
import Calendar from './pages/Calendar';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Clients from './pages/Clients';
import Reports from './pages/Reports';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [tenantId, setTenantId] = useState(null);
  const [activePage, setActivePage] = useState('dashboard');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const handleLogin = (tid) => {
    setTenantId(tid);
    setIsLoggedIn(true);
  };

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard tenantId={tenantId} />;
      case 'bookings': return <Bookings tenantId={tenantId} />;
      case 'barbers': return <Barbers tenantId={tenantId} />;
      case 'gallery': return <Gallery tenantId={tenantId} />;
      case 'calendar': return <Calendar tenantId={tenantId} />;
      case 'clients': return <Clients tenantId={tenantId} />;
      case 'reports': return <Reports tenantId={tenantId} />;
      case 'settings': return <Settings theme={theme} onToggleTheme={toggleTheme} tenantId={tenantId} />;
      default: return <Dashboard tenantId={tenantId} />;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: theme === 'light' ? '#f5f5f0' : '#0a0a0a' }}>
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        onLogout={() => { setIsLoggedIn(false); setTenantId(null); }}
        theme={theme}
        onToggleTheme={toggleTheme}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
      />
      <main style={{
        flex: 1,
        marginLeft: isCollapsed ? '80px' : '240px',
        padding: '32px',
        overflowY: 'auto',
        transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        {renderPage()}
      </main>
    </div>
  );
}

export default App;