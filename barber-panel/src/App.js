
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import Sidebar from './components/Sidebar';
import NotificationBell from './components/NotificationBell';
import ProfileBar from './components/ProfileBar';
import Login from './pages/Login';
import config from './config';
import { collection, getDocs, orderBy, query, doc, getDoc } from 'firebase/firestore';
import './App.css';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Bookings = lazy(() => import('./pages/Bookings'));
const Barbers = lazy(() => import('./pages/Barbers'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Settings = lazy(() => import('./pages/Settings'));
const Clients = lazy(() => import('./pages/Clients'));
const Reports = lazy(() => import('./pages/Reports'));
const OnlineProfile = lazy(() => import('./pages/OnlineProfile'));
const Cart = lazy(() => import('./pages/Cart'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Marketing = lazy(() => import('./pages/Marketing'));

async function loadServicesIntoConfig() {
  try {
    const snap = await getDocs(query(collection(db, 'tenants/whitecross/services'), orderBy('order', 'asc')));
    if (!snap.empty) {
      config.services = snap.docs
        .map((d) => {
          const data = d.data() || {};
          return { ...data, id: String(data.id || d.id || '').trim() };
        })
        .filter((s) => !!s.id);
    }
  } catch {}
}

function App() {
  const [authUser, setAuthUser] = useState(undefined); // undefined = still checking
  const [tenantId, setTenantId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(true); // default true until role loaded
  const [activePage, setActivePage] = useState('dashboard');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  // Sepet state
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Persist session across page refreshes via Firebase auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setTenantId('whitecross');
        // Fetch role from Firestore — no doc = admin (backwards compat for owner)
        try {
          const staffDoc = await getDoc(doc(db, 'tenants/whitecross/staff', firebaseUser.uid));
          if (staffDoc.exists()) {
            setIsAdmin(staffDoc.data().role === 'owner'); // only owner sees delete/cancel
          } else {
            setIsAdmin(true); // no doc = owner (backwards compat)
          }
        } catch {
          setIsAdmin(true);
        }
        setAuthUser(firebaseUser);
      } else {
        setAuthUser(null);
        setTenantId(null);
        setIsAdmin(true);
      }
    });
    return unsubscribe;
  }, []);

  // Load services on startup
  useEffect(() => {
    loadServicesIntoConfig().finally(() => setConfigReady(true));
  }, []);

  // Reload services when Services page saves changes
  useEffect(() => {
    window.addEventListener('services-updated', loadServicesIntoConfig);
    return () => window.removeEventListener('services-updated', loadServicesIntoConfig);
  }, []);

  const [sidebarDate, setSidebarDate] = useState(new Date());
  const handleSidebarDateSelect = (date) => { setSidebarDate(date); setActivePage('dashboard'); };

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  const handleLogout = () => auth.signOut();

  if (authUser === undefined || !configReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a08', color: '#d4af37', fontSize: '0.9rem', letterSpacing: '2px' }}>
        Loading...
      </div>
    );
  }

  if (!authUser || !tenantId) {
    return <Login onLogin={() => {}} />;
  }

  const renderPage = () => {
    if (showCart) {
      return <Cart cartItems={cart} onCheckout={() => alert('Ödeme entegrasyonu eklenecek!')} onRemove={(id) => setCart(cart => cart.filter(item => item.id !== id))} />;
    }
    switch (activePage) {
      case 'dashboard':     return <Dashboard tenantId={tenantId} isAdmin={isAdmin} theme={theme} initialDate={sidebarDate} />;
      case 'bookings':      return <Bookings tenantId={tenantId} isAdmin={isAdmin} />;
      case 'barbers':       return <Barbers tenantId={tenantId} isAdmin={isAdmin} />;
      case 'online-profile':return <OnlineProfile tenantId={tenantId} isAdmin={isAdmin} />;
      case 'calendar':      return <Calendar tenantId={tenantId} isAdmin={isAdmin} />;
      case 'clients':       return <Clients tenantId={tenantId} isAdmin={isAdmin} />;
      case 'reports':       return <Reports tenantId={tenantId} isAdmin={isAdmin} />;
      case 'settings':      return <Settings theme={theme} onToggleTheme={toggleTheme} tenantId={tenantId} isAdmin={isAdmin} authUser={authUser} />;
      case 'marketing':     return <Marketing tenantId={tenantId} isAdmin={isAdmin} />;
      case 'activity-log':  return isAdmin ? <AuditLog tenantId={tenantId} /> : <Dashboard tenantId={tenantId} isAdmin={isAdmin} />;
      default:              return <Dashboard tenantId={tenantId} isAdmin={isAdmin} />;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: theme === 'light' ? '#f5f5f0' : '#0a0a0a' }}>
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        tenantId={tenantId}
        isOwner={isAdmin}
        selectedDate={sidebarDate}
        onDateSelect={handleSidebarDateSelect}
      />
      <div style={{ position: 'fixed', top: '12px', right: '76px', zIndex: 200, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <ProfileBar authUser={authUser} isAdmin={isAdmin} tenantId={tenantId} />
        <NotificationBell tenantId={tenantId} />
      </div>
      <main style={{
        flex: 1,
        marginLeft: isCollapsed ? '74px' : '186px',
        padding: '60px 20px 20px',
        overflowY: activePage === 'dashboard' ? 'hidden' : 'auto',
        height: activePage === 'dashboard' ? '100vh' : 'auto',
        transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        <Suspense fallback={<div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>Loading...</div>}>
          {renderPage()}
        </Suspense>
      </main>
    </div>
  );
}

export default App;
