import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const TENANT = 'whitecross';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const defaultSettings = {
  shopName: 'I CUT Whitecross Barbers',
  shopAddress: '136 Whitecross Street, London EC1Y 8QJ',
  shopPhone: '020 3621 5929',
  shopEmail: 'whitecrossbarbers@gmail.com',
  hours: {
    Monday:    { open: '09:00', close: '19:00', closed: false },
    Tuesday:   { open: '09:00', close: '19:00', closed: false },
    Wednesday: { open: '09:00', close: '19:00', closed: false },
    Thursday:  { open: '09:00', close: '19:00', closed: false },
    Friday:    { open: '09:00', close: '19:00', closed: false },
    Saturday:  { open: '09:00', close: '19:00', closed: false },
    Sunday:    { open: '10:00', close: '16:00', closed: false },
  },
  platforms: {
    booksy: { depositEnabled: true, depositAmount: 10 },
    fresha: { depositEnabled: false, depositAmount: 0 },
  },
};

export default function Settings({ theme, onToggleTheme }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(function() { fetchSettings(); }, []);

  const fetchSettings = async function() {
    try {
      setLoading(true);
      const snap = await getDoc(doc(db, `tenants/${TENANT}/config`, 'settings'));
      if (snap.exists()) {
        const data = snap.data();
        setSettings({ ...defaultSettings, ...data, hours: { ...defaultSettings.hours, ...(data.hours || {}) }, platforms: { ...defaultSettings.platforms, ...(data.platforms || {}) } });
      }
    } catch (err) {
      console.error('fetchSettings error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async function() {
    setSaving(true);
    setError('');
    try {
      await setDoc(doc(db, `tenants/${TENANT}/config`, 'settings'), settings);
      localStorage.setItem('shopHours', JSON.stringify(settings.hours));
      setSaved(true);
      setTimeout(function() { setSaved(false); }, 3000);
    } catch (err) {
      console.error('handleSave error:', err);
      setError('Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const updateShop = function(key, value) {
    setSettings(Object.assign({}, settings, { [key]: value }));
  };

  const updateHours = function(day, key, value) {
    setSettings(Object.assign({}, settings, {
      hours: Object.assign({}, settings.hours, {
        [day]: Object.assign({}, settings.hours[day], { [key]: value })
      })
    }));
  };

  const updatePlatform = function(platform, key, value) {
    setSettings(s => ({ ...s, platforms: { ...s.platforms, [platform]: { ...s.platforms[platform], [key]: value } } }));
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '60px', color: 'var(--muted)' }}>⏳ Loading settings...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '680px' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', color: '#d4af37', marginBottom: '4px' }}>Settings</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Shop info, opening hours & platform settings</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '12px 28px', background: saving ? 'rgba(212,175,55,0.4)' : 'linear-gradient(135deg, #d4af37, #b8860b)', border: 'none', borderRadius: '8px', color: '#000', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '0.85rem', letterSpacing: '1px' }}>
          {saving ? 'Saving...' : '💾 Save Changes'}
        </button>
      </div>

      {saved && <div style={{ padding: '12px 16px', background: 'rgba(76,175,80,0.15)', border: '1px solid rgba(76,175,80,0.3)', borderRadius: '8px', color: '#4caf50', fontSize: '0.85rem' }}>✅ Settings saved successfully</div>}
      {error && <div style={{ padding: '12px 16px', background: 'rgba(255,82,82,0.15)', border: '1px solid rgba(255,82,82,0.3)', borderRadius: '8px', color: '#ff5252', fontSize: '0.85rem' }}>❌ {error}</div>}

      {/* Theme */}
      <div style={cardStyle}>
        <h2 style={sectionTitle}>Appearance</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text)', fontWeight: '600', marginBottom: '4px' }}>{theme === 'light' ? '☀️ Light Mode' : '🌙 Dark Mode'}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Switch between dark and light interface</div>
          </div>
          <div onClick={() => onToggleTheme()} style={{ width: '52px', height: '28px', borderRadius: '14px', cursor: 'pointer', background: theme === 'light' ? '#d4af37' : 'var(--muted)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: '4px', left: theme === 'light' ? '27px' : '4px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </div>
        </div>
      </div>

      {/* Shop Info */}
      <div style={cardStyle}>
        <h2 style={sectionTitle}>Shop Information</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Shop Name</label>
            <input value={settings.shopName || ''} onChange={e => updateShop('shopName', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Address</label>
            <input value={settings.shopAddress || ''} onChange={e => updateShop('shopAddress', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input value={settings.shopPhone || ''} onChange={e => updateShop('shopPhone', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input value={settings.shopEmail || ''} onChange={e => updateShop('shopEmail', e.target.value)} style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Platform Settings */}
      <div style={cardStyle}>
        <h2 style={sectionTitle}>Platform Settings</h2>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '20px' }}>Configure deposit settings for each booking platform.</p>

        {['booksy', 'fresha'].map(platform => {
          const colors = { booksy: '#9c27b0', fresha: '#2196f3' };
          const color = colors[platform];
          const p = settings.platforms[platform];
          return (
            <div key={platform} style={{ marginBottom: platform === 'booksy' ? '20px' : 0, padding: '16px', background: color + '10', border: '1px solid ' + color + '33', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                <span style={{ fontSize: '0.88rem', fontWeight: '700', color, letterSpacing: '1px' }}>{platform.toUpperCase()}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div onClick={() => updatePlatform(platform, 'depositEnabled', !p.depositEnabled)}
                    style={{ width: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer', background: p.depositEnabled ? color : 'var(--muted)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: '3px', left: p.depositEnabled ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text)' }}>Deposit active</span>
                </div>
                {p.depositEnabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Amount £</span>
                    <input type="number" min="0" value={p.depositAmount} onChange={e => updatePlatform(platform, 'depositAmount', parseFloat(e.target.value) || 0)} style={{ ...inputStyle, width: '80px', padding: '8px 10px' }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Opening Hours */}
      <div style={cardStyle}>
        <h2 style={sectionTitle}>Opening Hours</h2>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '20px' }}>These hours control slot availability on the booking site.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {DAYS.map(function(day) {
            var dh = (settings.hours && settings.hours[day]) || { open: '09:00', close: '19:00', closed: false };
            var isToday = new Date().toLocaleDateString('en-GB', { weekday: 'long' }) === day;
            return (
              <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 16px', borderRadius: '10px', background: dh.closed ? 'rgba(255,82,82,0.05)' : 'rgba(212,175,55,0.04)', border: '1px solid ' + (isToday ? 'rgba(212,175,55,0.3)' : 'rgba(212,175,55,0.1)') }}>
                <div style={{ width: '100px', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: isToday ? '700' : '500', color: isToday ? '#d4af37' : 'var(--text)' }}>{isToday ? '▶ ' : ''}{day}</span>
                </div>
                <div onClick={() => updateHours(day, 'closed', !dh.closed)} style={{ width: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer', background: dh.closed ? '#ff5252' : '#4caf50', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: '3px', left: dh.closed ? '3px' : '23px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: dh.closed ? '#ff5252' : '#4caf50', width: '40px', flexShrink: 0 }}>{dh.closed ? 'Closed' : 'Open'}</span>
                {!dh.closed ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                    <input type="time" value={dh.open || '09:00'} onChange={e => updateHours(day, 'open', e.target.value)} style={timeInputStyle} />
                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>—</span>
                    <input type="time" value={dh.close || '19:00'} onChange={e => updateHours(day, 'close', e.target.value)} style={timeInputStyle} />
                  </div>
                ) : (
                  <div style={{ flex: 1, fontSize: '0.78rem', color: 'var(--muted)', fontStyle: 'italic' }}>Not available for bookings</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Danger zone */}
      <div style={{ ...cardStyle, borderColor: 'rgba(255,82,82,0.2)' }}>
        <h2 style={{ ...sectionTitle, color: '#ff5252' }}>Danger Zone</h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '16px' }}>These actions cannot be undone.</p>
        <button style={{ padding: '10px 20px', background: 'transparent', border: '1px solid rgba(255,82,82,0.4)', borderRadius: '8px', color: '#ff5252', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '600' }}>
          🗑️ Clear All Pending Bookings
        </button>
      </div>
    </div>
  );
}

const cardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '24px',
};

const sectionTitle = {
  fontSize: '0.96rem',
  color: '#d4af37',
  marginBottom: '16px',
  letterSpacing: '1px',
  textTransform: 'uppercase',
};

const labelStyle = {
  display: 'block',
  fontSize: '0.72rem',
  color: 'var(--muted)',
  marginBottom: '8px',
  textTransform: 'uppercase',
  letterSpacing: '1px',
};

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  background: 'var(--card2)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text)',
  fontSize: '0.9rem',
  outline: 'none',
};

const timeInputStyle = {
  background: 'var(--card2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: '8px',
  padding: '8px 10px',
  fontSize: '0.85rem',
  outline: 'none',
};