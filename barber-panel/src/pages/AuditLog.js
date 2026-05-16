import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const ACTION_META = {
  CANCEL_BOOKING:  { label: 'Cancelled',    color: '#ff5252' },
  NO_SHOW:         { label: 'No Show',       color: '#ba68c8' },
  CHECKOUT:        { label: 'Checkout',      color: '#4caf50' },
  CHECKOUT_UNPAID: { label: 'Saved Unpaid',  color: '#ff9800' },
  DELETE_BOOKING:  { label: 'Deleted',       color: '#e53935' },
};

function fmtTs(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date((ts.seconds || 0) * 1000);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const PERIODS = [
  { key: 'today',  label: 'Today' },
  { key: 'week',   label: 'This Week' },
  { key: 'month',  label: 'This Month' },
  { key: 'all',    label: 'All Time' },
];

export default function AuditLog({ tenantId }) {
  const [logs, setLogs]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [period, setPeriod]         = useState('week');
  const [actionFilter, setAction]   = useState('all');
  const [userFilter, setUser]       = useState('all');

  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, `tenants/${tenantId}/auditLogs`),
      orderBy('timestamp', 'desc'),
      limit(500),
    );
    const unsub = onSnapshot(q, snap => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [tenantId]);

  const users = useMemo(() => {
    const map = {};
    logs.forEach(l => { if (l.userEmail) map[l.userEmail] = l.userName || l.userEmail; });
    return Object.entries(map).map(([email, name]) => ({ email, name }));
  }, [logs]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoffs = {
      today: now - 86_400_000,
      week:  now - 7 * 86_400_000,
      month: now - 30 * 86_400_000,
      all:   0,
    };
    const cutoff = cutoffs[period] || 0;
    return logs.filter(l => {
      if (actionFilter !== 'all' && l.action !== actionFilter) return false;
      if (userFilter !== 'all' && l.userEmail !== userFilter) return false;
      if (cutoff) {
        const ts = l.timestamp?.toDate ? l.timestamp.toDate().getTime() : (l.timestamp?.seconds || 0) * 1000;
        if (ts < cutoff) return false;
      }
      return true;
    });
  }, [logs, period, actionFilter, userFilter]);

  const T = {
    gold: '#d4af37',
    card: 'var(--card)',
    border: 'var(--border)',
    text: 'var(--text)',
    muted: 'var(--muted)',
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: T.gold, fontSize: '1.4rem', fontWeight: 700, letterSpacing: '2px', margin: 0 }}>
          ACTIVITY LOG
        </h1>
        <p style={{ color: T.muted, fontSize: '0.78rem', marginTop: '4px' }}>
          Every action taken by staff — visible only to you
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {/* Period pills */}
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: `1px solid ${period === p.key ? T.gold : 'var(--border)'}`,
              background: period === p.key ? T.gold + '18' : 'transparent',
              color: period === p.key ? T.gold : T.muted,
              fontSize: '0.75rem',
              fontWeight: period === p.key ? 700 : 400,
              cursor: 'pointer',
            }}
          >
            {p.label}
          </button>
        ))}

        <div style={{ width: '1px', background: 'var(--border)', margin: '0 4px' }} />

        {/* Action filter */}
        <select
          value={actionFilter}
          onChange={e => setAction(e.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--text)',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
        >
          <option value="all">All actions</option>
          {Object.entries(ACTION_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        {/* User filter */}
        {users.length > 1 && (
          <select
            value={userFilter}
            onChange={e => setUser(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            <option value="all">All staff</option>
            {users.map(u => (
              <option key={u.email} value={u.email}>{u.name}</option>
            ))}
          </select>
        )}

        <span style={{ marginLeft: 'auto', color: T.muted, fontSize: '0.72rem', alignSelf: 'center' }}>
          {filtered.length} entries
        </span>
      </div>

      {/* Table */}
      <div style={{
        background: T.card,
        border: '1px solid var(--border)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        {loading ? (
          <p style={{ color: T.muted, textAlign: 'center', padding: '40px', margin: 0 }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: T.muted, textAlign: 'center', padding: '40px', margin: 0 }}>No activity found</p>
        ) : (
          filtered.map((log, i) => {
            const meta = ACTION_META[log.action] || { label: log.action, color: '#888' };
            return (
              <div
                key={log.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 110px 1fr 1fr 90px',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 18px',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  fontSize: '0.78rem',
                }}
              >
                {/* Timestamp */}
                <span style={{ color: T.muted, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtTs(log.timestamp)}
                </span>

                {/* Action badge */}
                <span style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  borderRadius: '10px',
                  background: meta.color + '18',
                  color: meta.color,
                  fontWeight: 700,
                  fontSize: '0.68rem',
                  letterSpacing: '0.5px',
                  whiteSpace: 'nowrap',
                }}>
                  {meta.label}
                </span>

                {/* Client + service */}
                <div>
                  <div style={{ color: 'var(--text)', fontWeight: 600 }}>
                    {log.clientName || '—'}
                  </div>
                  <div style={{ color: T.muted, fontSize: '0.7rem' }}>
                    {[log.service, log.date, log.time].filter(Boolean).join(' · ')}
                  </div>
                </div>

                {/* Who did it */}
                <div>
                  <div style={{ color: 'var(--text)', fontWeight: 500 }}>
                    {log.userName || log.userEmail || '—'}
                  </div>
                  {log.total != null && (
                    <div style={{ color: T.muted, fontSize: '0.7rem' }}>
                      £{parseFloat(log.total || 0).toFixed(2)}
                      {log.paymentMethod ? ` · ${log.paymentMethod}` : ''}
                    </div>
                  )}
                </div>

                {/* Barber */}
                <span style={{ color: T.muted, textTransform: 'capitalize' }}>
                  {log.barber || '—'}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
