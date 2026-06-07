import React, { useState, useEffect } from 'react';
import { deleteBooking, cancelBooking, markNoShow, getClientLoyaltyPoints, getActiveTenant } from '../firestoreActions';
import { logAudit } from '../utils/auditLogger';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import {
  getBColor,
  getBookingServiceLabel,
  getDisplayedAmount,
  normalizeBookingStatus,
  pp,
} from '../utils/bookingUtils';
import config from '../config';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:       'var(--bg)',
  bg2:      'var(--card)',
  bg3:      'var(--card2)',
  border:   'var(--border)',
  gold:     '#d4af37',
  goldDim:  '#d4af3740',
  goldFaint:'#d4af3712',
  text:     'var(--text)',
  muted:    'var(--muted)',
  faint:    'var(--muted2)',
  green:    '#4caf50',
  orange:   '#ff9800',
  red:      '#ff5252',
  blue:     '#2196f3',
  purple:   '#9c27b0',
};

const SOURCE_COLORS = {
  Booksy:        { bg: '#9c27b015', color: '#ce93d8', dot: '#9c27b0' },
  Fresha:        { bg: '#2196f315', color: '#64b5f6', dot: '#2196f3' },
  Website:       { bg: '#4caf5015', color: '#81c784', dot: '#4caf50' },
  'Walk-in':     { bg: '#d4af3715', color: '#d4af37', dot: '#d4af37' },
  Treatwell:     { bg: '#ff704315', color: '#ff8a65', dot: '#ff7043' },
  'Product Sale':{ bg: '#03a9f415', color: '#4fc3f7', dot: '#03a9f4' },
};

const STATUS_COLORS = {
  CONFIRMED:   '#4caf50',
  PENDING:     '#ff9800',
  CHECKED_OUT: '#2196f3',
  CANCELLED:   '#ff5252',
  NO_SHOW:     '#9c27b0',
  UNPAID:      '#ff9800',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function visitOrdinal(n) {
  if (n === 1) return '1st'; if (n === 2) return '2nd'; if (n === 3) return '3rd'; return n + 'th';
}

function ActionButton({ onClick, disabled, label, bg, border, color, hoverBg }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, padding: '10px 8px',
        background: bg, border: `1px solid ${border}`,
        borderRadius: '8px', color, cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '0.75rem', fontWeight: '600', transition: 'all 0.15s',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = hoverBg; }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = bg; }}
    >{label}</button>
  );
}

function Spinner({ color }) {
  return (
    <div style={{
      width: '32px', height: '32px',
      border: `2px solid ${color}25`,
      borderTop: `2px solid ${color}`,
      borderRadius: '50%',
      animation: 'bd-spin 0.8s linear infinite',
    }} />
  );
}

// ─── Info row ─────────────────────────────────────────────────────────────────
function InfoRow({ label, value, color, even }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '7px 12px',
      background: even ? 'rgba(255,255,255,0.02)' : 'transparent',
      gap: '8px',
    }}>
      <span style={{ fontSize: '0.68rem', color: T.faint, flexShrink: 0, paddingTop: '1px' }}>{label}</span>
      <span style={{
        fontSize: '0.72rem', color: color || T.text,
        fontWeight: '500', textAlign: 'right', wordBreak: 'break-all',
      }}>{value}</span>
    </div>
  );
}

// ─── Overlay loader ───────────────────────────────────────────────────────────
function Overlay({ color, label }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(10,10,8,0.92)',
      zIndex: 10, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '12px', borderRadius: '16px',
    }}>
      <style>{`@keyframes bd-spin { to { transform: rotate(360deg); } }`}</style>
      <Spinner color={color} />
      <span style={{ fontSize: '0.75rem', color, fontWeight: '600', letterSpacing: '1px' }}>{label}</span>
    </div>
  );
}

// ─── MAIN BookingDetail ───────────────────────────────────────────────────────
function safePrice(v) {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

export default function BookingDetail({
  booking, barbers, allBookings, isAdmin,
  onClose, onEdit, onDelete, onCheckout,
  onAddProducts, onViewReceipt, onStatusChange,
}) {
  const [deleting, setDeleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [noShowing, setNoShowing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sendingReceipt, setSendingReceipt] = useState(false);
  const [receiptSent, setReceiptSent] = useState(false);
  const [sendingLoyalty, setSendingLoyalty] = useState(false);
  const [loyaltySent, setLoyaltySent] = useState(false);
  const [clientPoints, setClientPoints] = useState(null);
  const [clientIsMember, setClientIsMember] = useState(false);
  const [groupMembers, setGroupMembers] = useState([]);

  useEffect(() => {
    if (!booking) return;
    const phone = booking.phone || '';
    const email = booking.email || '';
    if (!phone && !email) { setClientPoints(null); return; }
    getClientLoyaltyPoints({ phone, email }).then(result => {
      setClientPoints(result.points || 0);
      setClientIsMember(result.isMember || false);
    }).catch(() => {});
  }, [booking?.bookingId]);

  useEffect(() => {
    setGroupMembers([]);
    if (!booking?.groupId) return;
    getDocs(query(collection(db, `${getActiveTenant()}/bookings`), where('groupId', '==', booking.groupId)))
      .then(snap => {
        const members = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(m => m.bookingId !== booking.bookingId)
          .sort((a, b) => (a.groupIndex ?? 99) - (b.groupIndex ?? 99));
        setGroupMembers(members);
      })
      .catch(() => {});
  }, [booking?.bookingId]);

  if (!booking) return null;

  if (booking.status === 'BLOCKED') {
    const fmtTime = (val) => {
      if (!val) return '—';
      if (typeof val === 'string') return val;
      if (val?.toDate) return val.toDate().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
      return '—';
    };
    return (
      <div style={{ width:'300px', flexShrink:0, background:T.bg, border:'1px solid rgba(255,82,82,0.25)', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', maxHeight:'calc(100vh - 200px)', boxShadow:'0 8px 32px rgba(0,0,0,0.4)' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,82,82,0.04)', flexShrink:0 }}>
          <span style={{ fontSize:'0.85rem', fontWeight:'700', color:'#ff5252' }}>🚫 Blocked Time</span>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:T.muted, cursor:'pointer', fontSize:'1rem' }}>✕</button>
        </div>
        <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'12px' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {[
              { label: 'Barber', value: (booking.barber || '').toUpperCase() },
              { label: 'Date',   value: booking.date },
              { label: 'From',   value: fmtTime(booking.time || booking.startTime) },
              { label: 'To',     value: fmtTime(booking.endTime) },
              ...(booking.note ? [{ label: 'Reason', value: booking.note }] : []),
            ].map(row => (
              <div key={row.label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 12px', background:'rgba(255,82,82,0.04)', borderRadius:'8px' }}>
                <span style={{ fontSize:'0.72rem', color:T.muted }}>{row.label}</span>
                <span style={{ fontSize:'0.72rem', color:'var(--text)', fontWeight:'600' }}>{row.value}</span>
              </div>
            ))}
          </div>
          <button
            disabled={deleting}
            onClick={async () => {
              if (!window.confirm('Remove this blocked time?')) return;
              setDeleting(true);
              try { await deleteBooking(booking.bookingId); onDelete(booking); }
              catch (err) { alert('Delete failed: ' + (err?.message || 'Unknown error')); }
              finally { setDeleting(false); }
            }}
            style={{ width:'100%', padding:'12px', background:deleting?'rgba(255,82,82,0.1)':'rgba(255,82,82,0.15)', border:'1px solid rgba(255,82,82,0.4)', borderRadius:'8px', color:'#ff5252', cursor:deleting?'not-allowed':'pointer', fontWeight:'700', fontSize:'0.82rem' }}>
            {deleting ? 'Removing…' : 'Remove Block'}
          </button>
        </div>
      </div>
    );
  }

  const color = getBColor(booking.barber, barbers);
  const serviceLabel = getBookingServiceLabel(booking);
  const status = normalizeBookingStatus(booking.status);
  const sourceStyle = SOURCE_COLORS[booking.source] || SOURCE_COLORS['Walk-in'];
  const isWalkIn = !booking.name || booking.name === 'Walk-in';
  const clientKey = booking.phone || booking.email || booking.name;

  const clientMatchedBookings = (!isWalkIn && clientKey && allBookings)
    ? allBookings.filter(b =>
        b.status === 'CHECKED_OUT' &&
        b.bookingId !== booking.bookingId &&
        (booking.phone ? b.phone === booking.phone : booking.email ? b.email === booking.email : b.name === booking.name)
      )
    : [];
  const clientVisits = new Set(clientMatchedBookings.map(b => b.date)).size;
  const allVisitDates = new Set([...clientMatchedBookings.map(b => b.date), ...(status === 'CHECKED_OUT' ? [booking.date] : [])]);
  const totalVisits = allVisitDates.size;
  const isReturning = clientVisits > 0;
  const busy = deleting || cancelling || noShowing || editing;

  const fmtTimestamp = (ts) => {
    if (!ts) return null;
    const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
    if (!d) return null;
    return d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' }).toUpperCase();
  };

  const infoRows = [
    { label: 'Service', value: serviceLabel },
    { label: 'Date', value: booking.date },
    { label: 'Arrived', value: booking.time },
    ...(status === 'CHECKED_OUT' && booking.checkedOutAt
      ? [{ label: 'Checked out', value: fmtTimestamp(booking.checkedOutAt), color: T.green }]
      : []
    ),
    { label: 'Barber', value: (booking.barber || '').toUpperCase() },
    { label: 'Phone', value: booking.phone },
    { label: 'Email', value: booking.email },
    ...(() => {
      const depAmt = safePrice(booking.platformDepositAmount);
      const hasManualDeposit = depAmt > 0 && status !== 'CHECKED_OUT';
      const hasWebDeposit = booking.paymentType === 'DEPOSIT' && booking.paidAmount && status !== 'CHECKED_OUT';
      if (hasManualDeposit) {
        const depLabel = `£${depAmt.toFixed(2)}${booking.depositPaymentMethod ? ' · ' + booking.depositPaymentMethod : ''}`;
        return [
          { label: 'Deposit paid', value: depLabel, color: T.green },
          { label: 'Remaining',    value: `£${Math.max(0, safePrice(booking.price) - depAmt).toFixed(2)}`, color: T.orange },
          { label: 'Total',        value: `£${safePrice(booking.price).toFixed(2)}` },
        ];
      }
      if (hasWebDeposit) {
        return [
          { label: 'Deposit paid', value: `£${safePrice(booking.paidAmount).toFixed(2)}`, color: T.green },
          { label: 'Remaining',    value: `£${Math.max(0, safePrice(booking.price) - safePrice(booking.paidAmount)).toFixed(2)}`, color: T.orange },
          { label: 'Total',        value: `£${safePrice(booking.price).toFixed(2)}` },
        ];
      }
      return [{ label: 'Amount', value: getDisplayedAmount(booking), color: T.green }];
    })(),
    {
      label: 'Source', value: booking.source || 'Website',
      color: (SOURCE_COLORS[booking.source] || {}).dot,
    },
    { label: 'Booking ID', value: booking.bookingId },
  ];

  return (
    <div style={{
      width: '300px', flexShrink: 0,
      background: T.bg,
      border: `1px solid ${T.goldDim}`,
      borderRadius: '16px',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      maxHeight: 'calc(100vh - 40px)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      position: 'relative',
    }}>
      <style>{`@keyframes bd-spin { to { transform: rotate(360deg); } }`}</style>

      {deleting && <Overlay color={T.red} label="Deleting..." />}
      {editing && <Overlay color={T.gold} label="Opening editor..." />}
      {cancelling && <Overlay color={T.red} label="Cancelling..." />}
      {noShowing && <Overlay color={T.purple} label="Marking no show..." />}

      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: T.bg2, flexShrink: 0,
      }}>
        <span style={{ fontSize: '0.58rem', color: T.faint, letterSpacing: '3px', textTransform: 'uppercase', fontWeight: '600' }}>
          Booking detail
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent', border: 'none', color: T.muted,
            cursor: 'pointer', fontSize: '1rem', width: '24px', height: '24px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = T.bg3; e.currentTarget.style.color = T.text; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.muted; }}
        >✕</button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Client card */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '14px', background: T.bg3,
          borderRadius: '12px', border: `1px solid ${T.border}`,
        }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              background: `${color}20`, border: `2px solid ${color}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.2rem', fontWeight: '700', color,
            }}>
              {(booking.name || '?')[0].toUpperCase()}
            </div>
            {isReturning && (
              <div style={{
                position: 'absolute', bottom: '-4px', right: '-6px',
                background: T.gold, borderRadius: '8px',
                padding: '1px 5px', fontSize: '0.5rem', fontWeight: '800', color: '#000',
                whiteSpace: 'nowrap',
              }}>
                {visitOrdinal(clientVisits + 1)} visit
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '0.92rem', fontWeight: '600', color: T.text,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              marginBottom: '6px',
            }}>{booking.name || 'Walk-in'}</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
              <span style={{
                padding: '2px 8px', borderRadius: '4px', fontSize: '0.58rem', fontWeight: '700',
                color: STATUS_COLORS[status] || T.muted,
                background: `${STATUS_COLORS[status] || '#888'}18`,
                letterSpacing: '0.8px',
              }}>{status}</span>

              {booking.source && (
                <span style={{
                  padding: '2px 8px', borderRadius: '4px', fontSize: '0.58rem', fontWeight: '700',
                  letterSpacing: '0.8px', background: sourceStyle.bg, color: sourceStyle.color,
                }}>{booking.source}</span>
              )}

              {status === 'CHECKED_OUT' && (booking.email || booking.clientEmail) && (
                booking.loyaltyEmailSent ? (
                  <span style={{
                    padding: '2px 8px', borderRadius: '4px', fontSize: '0.58rem', fontWeight: '700',
                    color: '#4caf50', background: '#4caf5018', border: '1px solid #4caf5040',
                  }}>📧 Email sent</span>
                ) : (
                  <button
                    onClick={async () => {
                      if (sendingLoyalty || loyaltySent) return;
                      setSendingLoyalty(true);
                      try {
                        const _q = query(collection(db, `${getActiveTenant()}/bookings`), where('bookingId', '==', booking.bookingId));
                        const _snap = await getDocs(_q);
                        if (_snap.empty) throw new Error('Booking not found in database');
                        await updateDoc(_snap.docs[0].ref, {
                          manualLoyaltyEmailTrigger: true,
                          sendLoyaltyEmail: true,
                        });
                        setLoyaltySent(true);
                      } catch (e) {
                        alert('Failed to send: ' + e.message);
                      } finally {
                        setSendingLoyalty(false);
                      }
                    }}
                    style={{
                      padding: '2px 8px', borderRadius: '4px', fontSize: '0.58rem', fontWeight: '700',
                      color: loyaltySent ? '#4caf50' : '#9e9e9e',
                      background: loyaltySent ? '#4caf5018' : 'transparent',
                      border: `1px solid ${loyaltySent ? '#4caf5040' : '#9e9e9e44'}`,
                      cursor: 'pointer',
                    }}
                  >
                    {sendingLoyalty ? '⏳ Sending…' : loyaltySent ? '📧 Sent!' : '📧 Send loyalty email'}
                  </button>
                )
              )}

              {booking.groupId && (
                <span style={{
                  padding: '2px 8px', borderRadius: '4px', fontSize: '0.58rem',
                  fontWeight: '700', letterSpacing: '0.8px',
                  color: T.gold, background: `${T.gold}18`,
                }}>👥 GROUP ×{booking.groupSize || '?'}</span>
              )}

              {clientIsMember && (
                <span style={{
                  padding: '2px 8px', borderRadius: '4px', fontSize: '0.58rem',
                  fontWeight: '700', letterSpacing: '0.8px',
                  color: '#ce93d8', background: '#7b1fa215',
                }}>◆ MEMBER</span>
              )}

              {!clientIsMember && clientPoints > 0 && (
                <span style={{
                  padding: '2px 8px', borderRadius: '4px', fontSize: '0.58rem',
                  fontWeight: '700', color: T.gold, background: `${T.gold}15`,
                }}>⭐ {clientPoints} pts</span>
              )}
            </div>
          </div>
        </div>

        {/* Returning / new customer */}
        {!isWalkIn && totalVisits > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 14px', borderRadius: '10px',
            background: isReturning ? `${T.gold}08` : `${T.green}08`,
            border: `1px solid ${isReturning ? T.goldDim : `${T.green}30`}`,
          }}>
            <span style={{ fontSize: '1.2rem' }}>{isReturning ? '⭐' : '🆕'}</span>
            <div>
              <div style={{
                fontSize: '0.78rem', fontWeight: '700',
                color: isReturning ? T.gold : T.green,
              }}>
                {isReturning ? `Returning · ${totalVisits} visits` : 'New customer'}
              </div>
              {isReturning && status !== 'CHECKED_OUT' && (
                <div style={{ fontSize: '0.62rem', color: T.muted }}>
                  This will be their {visitOrdinal(clientVisits + 1)} visit
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info rows */}
        <div style={{
          borderRadius: '10px',
          border: `1px solid ${T.border}`,
          overflow: 'hidden',
          background: T.bg2,
        }}>
          {infoRows.map((row, i) => (
            <InfoRow key={row.label} label={row.label} value={row.value} color={row.color} even={i % 2 === 0} />
          ))}
        </div>

        {/* Group members */}
        {booking.groupId && groupMembers.length > 0 && (
          <div style={{
            borderRadius: '10px', border: `1px solid ${T.goldDim}`,
            overflow: 'hidden', background: T.bg2,
          }}>
            <div style={{
              padding: '8px 12px', background: `${T.gold}08`,
              borderBottom: `1px solid ${T.goldDim}`,
              fontSize: '0.6rem', color: T.gold, letterSpacing: '2px',
              textTransform: 'uppercase', fontWeight: '700',
            }}>Group Members</div>
            {groupMembers.map((m, i) => {
              const mStart = m.startTime?.toDate ? m.startTime.toDate() : null;
              const mTime = mStart
                ? mStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' })
                : m.time || '–';
              return (
                <div key={m.bookingId || i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 12px',
                  background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                  borderBottom: i < groupMembers.length - 1 ? `1px solid ${T.border}` : 'none',
                }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: T.text, fontWeight: '500' }}>
                      Person {m.groupIndex != null ? m.groupIndex + 1 : i + 2}
                    </div>
                    <div style={{ fontSize: '0.62rem', color: T.muted }}>
                      {(m.barberName || m.barber || '').toUpperCase()} · {mTime}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: T.gold, fontWeight: '600', textAlign: 'right' }}>
                    {getBookingServiceLabel({ service: m.serviceId || m.service }) || m.serviceId || m.service || '–'}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Edit / Delete */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <ActionButton
            onClick={() => { setEditing(true); setTimeout(() => { onEdit(booking); setEditing(false); }, 300); }}
            disabled={busy}
            label="Edit"
            bg={T.goldFaint} border={T.goldDim} color={T.gold} hoverBg={`${T.gold}20`}
          />
          {isAdmin && (
            <ActionButton
              onClick={async () => {
                if (!window.confirm('Delete this booking permanently? This cannot be undone.')) return;
                setDeleting(true);
                let ok = false;
                try { await deleteBooking(booking.bookingId); ok = true; }
                catch (err) { console.error(err); alert('Delete failed: ' + (err?.message || 'Unknown error')); }
                finally { setDeleting(false); if (ok) onDelete(booking); }
              }}
              disabled={busy}
              label="Delete"
              bg={`${T.red}10`} border={`${T.red}30`} color={T.red} hoverBg={`${T.red}20`}
            />
          )}
        </div>

        {/* Cancel / No show */}
        {status !== 'CANCELLED' && status !== 'CHECKED_OUT' && status !== 'NO_SHOW' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {isAdmin && (
              <ActionButton
                onClick={async () => {
                  if (!window.confirm('Cancel this booking?')) return;
                  setCancelling(true);
                  try {
                    await cancelBooking(booking.bookingId);
                    logAudit('CANCEL_BOOKING', { bookingId: booking.bookingId, clientName: booking.clientName || booking.name, service: booking.serviceId || booking.service, date: booking.date, time: booking.time, barber: booking.barberId || booking.barber });
                    if (onStatusChange) onStatusChange(booking.bookingId, 'CANCELLED');
                  }
                  catch (err) { console.error(err); alert('Failed: ' + err.message); }
                  finally { setCancelling(false); }
                }}
                disabled={busy}
                label="Cancel booking"
                bg={`${T.red}06`} border={`${T.red}20`} color="#ff7070" hoverBg={`${T.red}15`}
              />
            )}
            <ActionButton
              onClick={async () => {
                if (!window.confirm('Mark as No Show?')) return;
                setNoShowing(true);
                try {
                  await markNoShow(booking.bookingId);
                  logAudit('NO_SHOW', { bookingId: booking.bookingId, clientName: booking.clientName || booking.name, service: booking.serviceId || booking.service, date: booking.date, time: booking.time, barber: booking.barberId || booking.barber });
                  if (onStatusChange) onStatusChange(booking.bookingId, 'NO_SHOW');
                }
                catch (err) { console.error(err); alert('Failed: ' + err.message); }
                finally { setNoShowing(false); }
              }}
              disabled={busy}
              label="No show"
              bg={`${T.purple}06`} border={`${T.purple}20`} color="#ba68c8" hoverBg={`${T.purple}15`}
            />
          </div>
        )}

        {/* Checkout / Products */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {status !== 'CHECKED_OUT' ? (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={onAddProducts}
                style={{
                  flex: 1, padding: '11px', background: `${T.blue}10`,
                  border: `1px solid ${T.blue}30`, borderRadius: '8px',
                  color: '#64b5f6', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = `${T.blue}20`}
                onMouseLeave={e => e.currentTarget.style.background = `${T.blue}10`}
              >+ Products</button>
              <button
                onClick={onCheckout}
                style={{
                  flex: 2, padding: '11px',
                  background: T.gold, border: 'none',
                  borderRadius: '8px', color: '#000',
                  cursor: 'pointer', fontSize: '0.85rem', fontWeight: '700',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#b8950a'}
                onMouseLeave={e => e.currentTarget.style.background = T.gold}
              >Checkout</button>
            </div>
          ) : (
            <button
              onClick={onViewReceipt}
              style={{
                width: '100%', padding: '11px',
                background: `${T.green}10`, border: `1px solid ${T.green}30`,
                borderRadius: '8px', color: T.green,
                fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = `${T.green}20`}
              onMouseLeave={e => e.currentTarget.style.background = `${T.green}10`}
            >✓ View Receipt</button>
          )}

          <a
            href={`https://wa.me/${String(booking.phone || '').replace(/[\s+\-()]/g, '')}`}
            target="_blank" rel="noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '6px', padding: '10px',
              background: '#25D36610', border: '1px solid #25D36630',
              borderRadius: '8px', color: '#25D366',
              fontSize: '0.75rem', textDecoration: 'none', fontWeight: '600',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#25D36620'}
            onMouseLeave={e => e.currentTarget.style.background = '#25D36610'}
          >WhatsApp</a>

          {booking.email && (
            status === 'CHECKED_OUT' ? (
              <button
                disabled={sendingReceipt}
                onClick={async () => {
                  setSendingReceipt(true);
                  try {
                    const total = parseFloat(String(booking.paidAmount || booking.price || '0').replace('£', '')) || 0;
                    const res = await fetch(config.sendReceiptUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        email: booking.email,
                        name: booking.name,
                        service: serviceLabel,
                        barber: booking.barber,
                        date: booking.date,
                        time: booking.time,
                        total,
                        discount: parseFloat(String(booking.discount || '0').replace('£', '')) || 0,
                        tip: parseFloat(String(booking.tip || '0').replace('£', '')) || 0,
                        paymentMethod: booking.paymentMethod || booking.paymentType || 'Cash',
                        bookingId: booking.bookingId,
                        soldProducts: booking.soldProducts || [],
                        soldAddOns: booking.soldAddOns || [],
                      }),
                    });
                    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Send failed'); }
                    setReceiptSent(true);
                    setTimeout(() => setReceiptSent(false), 3000);
                  } catch (err) {
                    alert('Failed to send: ' + (err.message || 'Unknown error'));
                  } finally {
                    setSendingReceipt(false);
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: '6px', padding: '10px', width: '100%',
                  background: receiptSent ? '#4caf5010' : T.goldFaint,
                  border: `1px solid ${receiptSent ? '#4caf5040' : T.border}`,
                  borderRadius: '8px', color: receiptSent ? '#4caf50' : T.gold,
                  fontSize: '0.75rem', fontWeight: '600', cursor: sendingReceipt ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s', opacity: sendingReceipt ? 0.6 : 1,
                }}
              >
                {sendingReceipt ? 'Sending…' : receiptSent ? '✓ Receipt Sent' : 'Email Receipt'}
              </button>
            ) : (
              <a
                href={`mailto:${booking.email}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: '6px', padding: '10px',
                  background: T.goldFaint, border: `1px solid ${T.border}`,
                  borderRadius: '8px', color: T.gold,
                  fontSize: '0.75rem', textDecoration: 'none', fontWeight: '600',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = `${T.gold}18`}
                onMouseLeave={e => e.currentTarget.style.background = T.goldFaint}
              >Email</a>
            )
          )}
        </div>
      </div>
    </div>
  );
}
