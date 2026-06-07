
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { onAuthStateChanged, getIdTokenResult } from 'firebase/auth';
import { auth, db } from './firebase';
import Sidebar from './components/Sidebar';
import NotificationBell from './components/NotificationBell';
import ProfileBar from './components/ProfileBar';
import Login from './pages/Login';
import config from './config';
import { setActiveTenant } from './firestoreActions';
import { collection, getDocs, orderBy, query, doc, getDoc } from 'firebase/firestore';
import './App.css';

const Home = lazy(() => import('./pages/Home'));
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

async function loadServicesIntoConfig(tenantId) {
  try {
    const snap = await getDocs(query(collection(db, `tenants/${tenantId}/services`), orderBy('order', 'asc')));
    // Always reset — even if empty, clear whitecross defaults
    config.services = snap.empty ? [] : snap.docs
      .map((d) => {
        const data = d.data() || {};
        return { ...data, id: String(data.id || d.id || '').trim() };
      })
      .filter((s) => !!s.id);
  } catch { config.services = []; }
}

async function loadTenantConfig(tenantId) {
  try {
    const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
    if (tenantDoc.exists()) {
      const t = tenantDoc.data();
      config.shopName    = t.name        || '';
      config.shopAddress = t.address     || '';
      config.shopPhone   = t.phone       || '';
      config.shopEmail   = t.ownerEmail  || '';
      config.shopWhatsApp = t.whatsapp   || '';
    }
    // Load barbers from Firestore
    const barbersSnap = await getDocs(collection(db, `tenants/${tenantId}/barbers`));
    if (!barbersSnap.empty) {
      config.barbers = barbersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      config.barbers = [];
    }
  } catch {}
}

function App() {
  const [authUser, setAuthUser] = useState(undefined); // undefined = still checking
  const [tenantId, setTenantId] = useState(null);
  const [tenantName, setTenantName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState(null); // null = loading, 'owner' | 'admin' | 'staff'
  const [activePage, setActivePage] = useState('home');
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
        // Read tenantId from Firebase custom claim (falls back to 'whitecross' for existing users)
        // Retry claim fetch — provisionTenant may take a moment to propagate
        let tokenResult;
        let tid = null;
        for (let i = 0; i < 4; i++) {
          tokenResult = await getIdTokenResult(firebaseUser, true);
          tid = tokenResult.claims.tenantId;
          if (tid) break;
          if (i < 3) await new Promise(r => setTimeout(r, 1500));
        }
        // Fallback to 'whitecross' only on the whitecrossbarbers-admin domain
        if (!tid && window.location.hostname.includes('whitecrossbarbers')) {
          tid = 'whitecross';
        }
        if (!tid) {
          setAuthUser(firebaseUser);
          setTenantId('__pending__');
          return;
        }
        setTenantId(tid);
        setActiveTenant(tid);
        // Load tenant name
        try {
          const tenantDoc = await getDoc(doc(db, 'tenants', tid));
          if (tenantDoc.exists()) setTenantName(tenantDoc.data().name || '');
        } catch {}
        try {
          const staffDoc = await getDoc(doc(db, `tenants/${tid}/staff`, firebaseUser.uid));
          const r = staffDoc.exists() ? (staffDoc.data().role || 'staff') : 'owner';
          setRole(r);
          setIsAdmin(r === 'owner' || r === 'admin');
          if (r === 'staff') setActivePage('dashboard');
        } catch {
          setRole('staff');
          setIsAdmin(false);
        }
        setAuthUser(firebaseUser);
      } else {
        setAuthUser(null);
        setTenantId(null);
        setRole(null);
        setIsAdmin(false);
      }
    });
    return unsubscribe;
  }, []);

  // Load tenant config + services once tenantId is known
  useEffect(() => {
    if (!tenantId || tenantId === '__pending__') return;
    Promise.all([
      loadTenantConfig(tenantId),
      loadServicesIntoConfig(tenantId),
    ]).finally(() => setConfigReady(true));
    const handler = () => loadServicesIntoConfig(tenantId);
    window.addEventListener('services-updated', handler);
    return () => window.removeEventListener('services-updated', handler);
  }, [tenantId]);

  const [sidebarDate, setSidebarDate] = useState(new Date());
  const handleSidebarDateSelect = (date) => { setSidebarDate(date); setActivePage('dashboard'); };

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  const handleLogout = () => auth.signOut();

  if (authUser === undefined || (authUser && tenantId && tenantId !== '__pending__' && (!configReady || role === null))) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a08', color: '#d4af37', fontSize: '0.9rem', letterSpacing: '2px' }}>
        Loading...
      </div>
    );
  }

  if (tenantId === '__pending__') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a0a', gap: 16 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center' }}>
          <span style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '-1px', color: '#f0f0f0' }}>sal</span>
          <div style={{ background: '#534AB7', padding: '2px 10px 4px', borderRadius: '7px', marginLeft: '4px' }}>
            <span style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '-1px', color: '#fff' }}>OWN</span>
          </div>
        </div>
        <div style={{ color: '#888', fontSize: 14 }}>Setting up your panel...</div>
        <button onClick={() => window.location.reload()} style={{ marginTop: 8, padding: '8px 20px', background: '#534AB7', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, cursor: 'pointer' }}>
          Refresh
        </button>
      </div>
    );
  }

  if (!authUser || !tenantId) {
    return <Login onLogin={() => {}} />;
  }

  const canAccess = (page) => {
    if (role === 'owner' || role === 'admin') return true;
    const staffPages = ['dashboard', 'bookings', 'calendar', 'clients'];
    return staffPages.includes(page);
  };

  const renderPage = () => {
    if (showCart) {
      return <Cart cartItems={cart} onCheckout={() => alert('Ödeme entegrasyonu eklenecek!')} onRemove={(id) => setCart(cart => cart.filter(item => item.id !== id))} />;
    }
    if (!canAccess(activePage)) {
      return <Dashboard tenantId={tenantId} isAdmin={isAdmin} theme={theme} initialDate={sidebarDate} />;
    }
    const isSuperAdmin = role === 'owner';
    switch (activePage) {
      case 'home':          return <Home tenantId={tenantId} setActivePage={setActivePage} authUser={authUser} role={role} />;
      case 'dashboard':     return <Dashboard tenantId={tenantId} isAdmin={isAdmin} theme={theme} initialDate={sidebarDate} />;
      case 'bookings':      return <Bookings tenantId={tenantId} isAdmin={isAdmin} />;
      case 'barbers':       return <Barbers tenantId={tenantId} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} />;
      case 'online-profile':return <OnlineProfile tenantId={tenantId} isAdmin={isAdmin} />;
      case 'calendar':      return <Calendar tenantId={tenantId} isAdmin={isAdmin} />;
      case 'clients':       return <Clients tenantId={tenantId} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} />;
      case 'reports':       return <Reports tenantId={tenantId} isAdmin={isAdmin} />;
      case 'settings':      return <Settings theme={theme} onToggleTheme={toggleTheme} tenantId={tenantId} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} authUser={authUser} />;
      case 'marketing':     return <Marketing tenantId={tenantId} isAdmin={isAdmin} />;
      case 'activity-log':  return isAdmin ? <AuditLog tenantId={tenantId} /> : <Dashboard tenantId={tenantId} isAdmin={isAdmin} />;
      default:              return <Home tenantId={tenantId} setActivePage={setActivePage} />;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: theme === 'light' ? '#f5f5f0' : '#0a0a0a' }}>
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        theme={theme}
        onToggleTheme={toggleTheme}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        tenantId={tenantId}
        tenantName={tenantName}
        isOwner={isAdmin}
        role={role}
        selectedDate={sidebarDate}
        onDateSelect={handleSidebarDateSelect}
      />
      <div style={{ position: 'fixed', top: '12px', right: '76px', zIndex: 200, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <ProfileBar authUser={authUser} isAdmin={isAdmin} tenantId={tenantId} onLogout={handleLogout} userRole={role} />
        <NotificationBell tenantId={tenantId} />
      </div>
      <main style={{
        flex: 1,
        marginLeft: isCollapsed ? '74px' : '186px',
        padding: '55px 20px 20px 36px',
        overflowY: activePage === 'dashboard' ? 'hidden' : 'auto',
        height: activePage === 'dashboard' ? '100vh' : 'auto',
        transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        <ErrorBoundary>
          <Suspense fallback={<div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>Loading...</div>}>
            {renderPage()}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#f87171', fontFamily: 'monospace', fontSize: 13 }}>
          <strong>Panel error:</strong><br />{this.state.error?.message}<br /><br />
          <button onClick={() => this.setState({ error: null })} style={{ padding: '8px 16px', background: '#534AB7', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default App;
