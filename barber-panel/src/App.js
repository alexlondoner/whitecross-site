import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Bookings from './pages/Bookings';
import Barbers from './pages/Barbers';
import Calendar from './pages/Calendar';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Clients from './pages/Clients';
import Reports from './pages/Reports';
import Finance from './pages/Finance';
import OnlineProfile from './pages/OnlineProfile';
import Products from './pages/Products';
import config from './config';
import { db } from './firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [tenantId, setTenantId] = useState(null);
  const [activePage, setActivePage] = useState('dashboard');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Load services from Firestore and patch config so all components get live data
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'tenants/whitecross/services'), orderBy('order', 'asc')));
        if (!snap.empty) {
          config.services = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        }
      } catch (e) { /* fallback to hardcoded config.services */ }
      setConfigReady(true);
    };
    loadConfig();
  }, []);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const handleLogin = (tid) => {
    setTenantId(tid);
    setIsLoggedIn(true);
  };

  if (!configReady) {
    return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0a0a08', color:'#d4af37', fontSize:'0.9rem', letterSpacing:'2px' }}>Loading...</div>;
  }

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard tenantId={tenantId} />;
      case 'bookings': return <Bookings tenantId={tenantId} />;
      case 'barbers': return <Barbers tenantId={tenantId} />;
      case 'online-profile': return <OnlineProfile tenantId={tenantId} />;
      case 'calendar': return <Calendar tenantId={tenantId} />;
      case 'clients': return <Clients tenantId={tenantId} />;
      case 'reports': return <Reports tenantId={tenantId} />;
      case 'finance': return <Finance tenantId={tenantId} />;
      case 'products': return <Products tenantId={tenantId} />;
      case 'settings': return <Settings theme={theme} onToggleTheme={toggleTheme} tenantId={tenantId} />;
      case 'gallery': return <OnlineProfile tenantId={tenantId} />;
      case 'services': return <OnlineProfile tenantId={tenantId} />;
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