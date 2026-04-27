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
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activePage, setActivePage] = useState('dashboard');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  // New state to control the symbol look
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  if (!isLoggedIn) {
    return <Login onLogin={() => setIsLoggedIn(true)} />;
  }

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard />;
      case 'bookings': return <Bookings />;
      case 'barbers': return <Barbers />;
      case 'calendar': return <Calendar />;
      case 'clients': return <Clients />;
      case 'reports': return <Reports />;
      case 'settings': return <Settings theme={theme} onToggleTheme={toggleTheme} />;
      default: return <Dashboard />;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: theme === 'light' ? '#f5f5f0' : '#0a0a0a' }}>
      {/* Sidebar gets the toggle state and function */}
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        onLogout={() => setIsLoggedIn(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
      />

      {/* The main margin now changes based on the sidebar width */}
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