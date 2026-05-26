import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';

const TENANT = 'whitecross';

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', color: '#e1306c',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    )
  },
  { key: 'tiktok', label: 'TikTok', color: '#fff',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.54V6.78a4.85 4.85 0 01-1.02-.09z"/>
      </svg>
    )
  },
  { key: 'youtube', label: 'YouTube', color: '#ff0000',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
      </svg>
    )
  },
  { key: 'twitter', label: 'X / Twitter', color: '#e7e9ea',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    )
  },
  { key: 'facebook', label: 'Facebook', color: '#1877f2',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    )
  },
];

export default function ProfileBar({ authUser, isAdmin, tenantId }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [staffData, setStaffData] = useState(null);
  const [barberMatch, setBarberMatch] = useState(null);
  const [socialForm, setSocialForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setEditing(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load staff doc + barbers for matching
  useEffect(() => {
    if (!authUser) return;
    (async () => {
      try {
        const [staffSnap, barbersSnap] = await Promise.all([
          getDoc(doc(db, `tenants/${TENANT}/staff`, authUser.uid)),
          getDocs(collection(db, `tenants/${TENANT}/barbers`)),
        ]);
        const staff = staffSnap.exists()
          ? { uid: authUser.uid, ...staffSnap.data() }
          : { uid: authUser.uid, name: authUser.displayName || authUser.email, email: authUser.email, role: 'owner' };
        setStaffData(staff);
        setSocialForm({
          instagram: staff.instagram || '',
          tiktok:    staff.tiktok    || '',
          youtube:   staff.youtube   || '',
          twitter:   staff.twitter   || '',
          facebook:  staff.facebook  || '',
        });
        // Match to barber by name
        const barbers = barbersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const match = barbers.find(b =>
          b.name && staff.name &&
          b.name.toLowerCase().trim() === staff.name.toLowerCase().trim()
        );
        if (match) setBarberMatch(match);
      } catch (e) {
        console.error('ProfileBar load error', e);
      }
    })();
  }, [authUser]);

  const handleSave = async () => {
    if (!authUser || !staffData) return;
    setSaving(true);
    try {
      const staffRef = doc(db, `tenants/${TENANT}/staff`, authUser.uid);
      const snap = await getDoc(staffRef);
      if (snap.exists()) {
        await updateDoc(staffRef, socialForm);
      }
      setStaffData(prev => ({ ...prev, ...socialForm }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setEditing(false);
    } catch (e) {
      console.error('Save error', e);
    } finally {
      setSaving(false);
    }
  };

  if (!authUser || !staffData) return null;

  const name    = staffData.name || authUser.email || 'User';
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const color   = barberMatch?.color || '#d4af37';
  const photo   = barberMatch?.photo || null;
  const role    = isAdmin ? 'Super Admin' : 'Admin';
  const activeSocials = PLATFORMS.filter(p => staffData[p.key]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Compact chip */}
      <button
        onClick={() => { setOpen(o => !o); setEditing(false); }}
        style={{
          display: 'flex', alignItems: 'center', gap: '9px',
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: '40px', padding: '5px 14px 5px 5px',
          cursor: 'pointer', transition: 'all 0.2s',
          boxShadow: open ? '0 0 0 2px rgba(212,175,55,0.35)' : 'none',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(212,175,55,0.5)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = open ? 'rgba(212,175,55,0.5)' : 'var(--border)'}
      >
        {/* Avatar */}
        <div style={{
          width: '30px', height: '30px', borderRadius: '50%',
          overflow: 'hidden', flexShrink: 0,
          background: color + '22', border: '1.5px solid ' + color + '66',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {photo
            ? <img src={photo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '0.72rem', fontWeight: '800', color }}>{initials}</span>
          }
        </div>
        {/* Name + role */}
        <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text)', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ fontSize: '0.58rem', fontWeight: '600', color, letterSpacing: '0.8px', textTransform: 'uppercase' }}>{role}</div>
        </div>
        {/* Social dots if any */}
        {activeSocials.length > 0 && (
          <div style={{ display: 'flex', gap: '3px', marginLeft: '2px' }}>
            {activeSocials.slice(0, 3).map(p => (
              <div key={p.key} style={{ width: '5px', height: '5px', borderRadius: '50%', background: p.color, opacity: 0.8 }} />
            ))}
          </div>
        )}
        <span style={{ fontSize: '0.6rem', color: 'var(--muted)', marginLeft: '2px' }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0,
          width: '300px',
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: '14px', boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          zIndex: 1000, overflow: 'hidden',
        }}>
          {/* Profile header */}
          <div style={{
            padding: '20px',
            background: 'linear-gradient(135deg, ' + color + '18, ' + color + '06)',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {/* Big avatar */}
              <div style={{
                width: '56px', height: '56px', borderRadius: '50%',
                overflow: 'hidden', flexShrink: 0,
                background: color + '22', border: '2px solid ' + color + '66',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {photo
                  ? <img src={photo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: '1.3rem', fontWeight: '800', color }}>{initials}</span>
                }
              </div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text)', marginBottom: '3px' }}>{name}</div>
                <div style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                  background: color + '22', border: '1px solid ' + color + '44',
                  fontSize: '0.6rem', fontWeight: '700', color, letterSpacing: '1px', textTransform: 'uppercase',
                }}>{role}</div>
                {staffData.email && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: '4px' }}>{staffData.email}</div>
                )}
              </div>
            </div>
          </div>

          {/* Social links section */}
          <div style={{ padding: '16px 20px' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px',
            }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '1.2px', textTransform: 'uppercase', fontWeight: '600' }}>
                Social & Portfolio
              </span>
              <button
                onClick={() => setEditing(e => !e)}
                style={{
                  padding: '3px 10px', border: '1px solid rgba(212,175,55,0.3)',
                  borderRadius: '6px', background: editing ? 'rgba(212,175,55,0.15)' : 'transparent',
                  color: '#d4af37', cursor: 'pointer', fontSize: '0.65rem', fontWeight: '700',
                }}
              >
                {editing ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {!editing ? (
              /* View mode */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {PLATFORMS.map(p => {
                  const val = staffData[p.key];
                  return (
                    <div key={p.key} style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      opacity: val ? 1 : 0.35,
                    }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                        background: val ? p.color + '22' : 'rgba(255,255,255,0.04)',
                        border: '1px solid ' + (val ? p.color + '44' : 'rgba(255,255,255,0.08)'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: val ? p.color : 'var(--muted)',
                      }}>{p.icon}</div>
                      <div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: '600' }}>{p.label}</div>
                        {val
                          ? <a href={val.startsWith('http') ? val : 'https://' + val} target="_blank" rel="noreferrer"
                              style={{ fontSize: '0.7rem', color: p.color, textDecoration: 'none', wordBreak: 'break-all' }}>
                              {val}
                            </a>
                          : <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>Not connected</span>
                        }
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Edit mode */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {PLATFORMS.map(p => (
                  <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                      background: p.color + '22', border: '1px solid ' + p.color + '44',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: p.color,
                    }}>{p.icon}</div>
                    <input
                      value={socialForm[p.key] || ''}
                      onChange={e => setSocialForm(f => ({ ...f, [p.key]: e.target.value }))}
                      placeholder={p.label + ' URL'}
                      style={{
                        flex: 1, padding: '6px 10px',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                        borderRadius: '7px', color: 'var(--text)', fontSize: '0.7rem',
                        outline: 'none',
                      }}
                      onFocus={e => e.target.style.borderColor = p.color + '80'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
                  </div>
                ))}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    marginTop: '6px', padding: '9px',
                    background: saved ? 'rgba(76,175,80,0.2)' : 'linear-gradient(135deg,#d4af37,#b8860b)',
                    border: saved ? '1px solid rgba(76,175,80,0.4)' : 'none',
                    borderRadius: '8px', color: saved ? '#4caf50' : '#000',
                    cursor: saving ? 'default' : 'pointer',
                    fontSize: '0.78rem', fontWeight: '700',
                  }}
                >
                  {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Links'}
                </button>
              </div>
            )}
          </div>

          {/* Footer note */}
          <div style={{
            padding: '10px 20px',
            borderTop: '1px solid var(--border)',
            background: 'rgba(212,175,55,0.03)',
          }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>
              Portfolio links will be shown on your public booking page.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
