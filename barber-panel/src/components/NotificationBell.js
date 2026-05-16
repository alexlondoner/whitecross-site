import React, { useState, useEffect, useRef } from 'react';
import {
  collection, query, orderBy, limit,
  onSnapshot, updateDoc, doc, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';

const TYPE_ICONS = {
  new_booking: '📅',
  confirmed:   '✅',
  cancelled:   '❌',
  rescheduled: '🔄',
};

function playDing() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx  = new AudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(550, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch (_) {}
}

function fmtTime(ts) {
  if (!ts) return '';
  const d   = ts.toDate ? ts.toDate() : new Date((ts.seconds || 0) * 1000);
  const ms  = Date.now() - d.getTime();
  if (ms < 60_000)    return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function NotificationBell({ tenantId }) {
  const [items,  setItems]  = useState([]);
  const [open,   setOpen]   = useState(false);
  const prevUnread          = useRef(0);
  const wrapRef             = useRef(null);

  const unread = items.filter(n => !n.read).length;

  // Real-time listener
  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, `tenants/${tenantId}/notifications`),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    return onSnapshot(q, snap => {
      const list      = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const newUnread = list.filter(n => !n.read).length;
      if (newUnread > prevUnread.current) playDing();
      prevUnread.current = newUnread;
      setItems(list);
    });
  }, [tenantId]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const markRead = id =>
    updateDoc(doc(db, `tenants/${tenantId}/notifications`, id), { read: true }).catch(() => {});

  const markAllRead = () => {
    const unreadItems = items.filter(n => !n.read);
    if (!unreadItems.length) return;
    const batch = writeBatch(db);
    unreadItems.forEach(n =>
      batch.update(doc(db, `tenants/${tenantId}/notifications`, n.id), { read: true }),
    );
    batch.commit().catch(() => {});
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>

      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position:        'relative',
          background:      open ? 'rgba(212,175,55,0.1)' : 'none',
          border:          '1px solid rgba(212,175,55,0.25)',
          borderRadius:    '10px',
          width:           '42px',
          height:          '42px',
          cursor:          'pointer',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          fontSize:        '1.15rem',
          transition:      'border-color 0.2s, background 0.2s',
        }}
        title="Notifications"
      >
        🔔
        {unread > 0 && (
          <span style={{
            position:       'absolute',
            top:            '4px',
            right:          '4px',
            background:     '#e53935',
            color:          '#fff',
            borderRadius:   '50%',
            width:          '16px',
            height:         '16px',
            fontSize:       '0.6rem',
            fontWeight:     700,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            lineHeight:     1,
            pointerEvents:  'none',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position:       'absolute',
          top:            'calc(100% + 8px)',
          right:          0,
          width:          '320px',
          maxHeight:      '420px',
          background:     'var(--card)',
          border:         '1px solid var(--border)',
          borderRadius:   '12px',
          boxShadow:      '0 8px 32px rgba(0,0,0,0.18)',
          overflow:       'hidden',
          display:        'flex',
          flexDirection:  'column',
          zIndex:         9999,
        }}>

          {/* Header */}
          <div style={{
            padding:        '12px 16px',
            borderBottom:   '1px solid var(--border)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            flexShrink:     0,
          }}>
            <span style={{
              color:          '#d4af37',
              fontWeight:     700,
              fontSize:       '0.78rem',
              letterSpacing:  '1px',
              textTransform:  'uppercase',
            }}>
              Notifications {unread > 0 && `(${unread})`}
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background:     'none',
                  border:         'none',
                  color:          'var(--muted)',
                  fontSize:       '0.7rem',
                  cursor:         'pointer',
                  textDecoration: 'underline',
                  padding:        0,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {items.length === 0 ? (
              <p style={{
                color:      'var(--muted)',
                fontSize:   '0.8rem',
                textAlign:  'center',
                padding:    '28px 16px',
                margin:     0,
              }}>
                No notifications yet
              </p>
            ) : (
              items.map(n => (
                <div
                  key={n.id}
                  onClick={() => { if (!n.read) markRead(n.id); }}
                  style={{
                    padding:        '11px 16px',
                    borderBottom:   '1px solid var(--border)',
                    cursor:         n.read ? 'default' : 'pointer',
                    background:     n.read ? 'transparent' : 'rgba(212,175,55,0.04)',
                    display:        'flex',
                    gap:            '10px',
                    alignItems:     'flex-start',
                  }}
                >
                  <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '2px' }}>
                    {TYPE_ICONS[n.type] || '🔔'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display:        'flex',
                      justifyContent: 'space-between',
                      alignItems:     'center',
                      gap:            '6px',
                      marginBottom:   '2px',
                    }}>
                      <span style={{
                        color:          n.read ? 'var(--muted)' : 'var(--text)',
                        fontWeight:     n.read ? 400 : 700,
                        fontSize:       '0.78rem',
                        overflow:       'hidden',
                        textOverflow:   'ellipsis',
                        whiteSpace:     'nowrap',
                      }}>
                        {n.title}
                      </span>
                      <span style={{
                        color:      'var(--muted)',
                        fontSize:   '0.66rem',
                        flexShrink: 0,
                      }}>
                        {fmtTime(n.createdAt)}
                      </span>
                    </div>
                    <p style={{
                      color:        'var(--muted)',
                      fontSize:     '0.72rem',
                      margin:       0,
                      overflow:     'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace:   'nowrap',
                    }}>
                      {n.body}
                    </p>
                    {!n.read && (
                      <span style={{
                        display:      'inline-block',
                        width:        '5px',
                        height:       '5px',
                        borderRadius: '50%',
                        background:   '#d4af37',
                        marginTop:    '5px',
                      }} />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
