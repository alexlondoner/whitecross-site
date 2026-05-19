import React, { useState, useEffect } from 'react';
import { checkoutBooking, saveUnpaidBooking, getClientLoyaltyPoints } from '../firestoreActions';
import { logAudit } from '../utils/auditLogger';
import {
  findServiceByBookingValue,
  getBookingServiceLabel,
  getBColor,
  normalizeSoldProducts,
  getProductsTotal,
  pp,
} from '../utils/bookingUtils';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:       'var(--bg)',
  bg2:      'var(--card)',
  bg3:      'var(--card2)',
  border:   'var(--border)',
  border2:  'var(--border-hover)',
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
};

// ─── Shared style helpers ─────────────────────────────────────────────────────
const S = {
  label: {
    display: 'block',
    fontSize: '0.6rem',
    color: T.faint,
    letterSpacing: '1.8px',
    textTransform: 'uppercase',
    marginBottom: '6px',
    fontWeight: '600',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    background: T.bg3,
    border: `1px solid ${T.border}`,
    borderRadius: '8px',
    color: T.text,
    fontSize: '0.85rem',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  card: {
    background: T.bg2,
    border: `1px solid ${T.border}`,
    borderRadius: '12px',
    padding: '14px 16px',
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepDot({ step, current, done, onClick, num, label }) {
  const isActive = current === step;
  const isDone = done.includes(step);
  return (
    <div
      onClick={() => isDone && onClick(step)}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDone ? 'pointer' : 'default' }}
    >
      <div style={{
        width: '24px', height: '24px', borderRadius: '50%',
        background: isActive ? T.gold : isDone ? `${T.green}30` : `${T.gold}15`,
        border: `1px solid ${isActive ? T.gold : isDone ? T.green : T.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.6rem', fontWeight: '700',
        color: isActive ? '#000' : isDone ? T.green : T.muted,
        transition: 'all 0.2s',
      }}>
        {isDone ? '✓' : num}
      </div>
      <span style={{
        fontSize: '0.72rem',
        color: isActive ? T.gold : isDone ? T.green : T.muted,
        fontWeight: isActive ? '600' : '400',
        letterSpacing: '0.3px',
      }}>{label}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ width: '24px', height: '1px', background: T.border, margin: '0 2px' }} />;
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '0.58rem', color: T.faint,
      letterSpacing: '2px', textTransform: 'uppercase',
      fontWeight: '600', marginBottom: '10px',
    }}>{children}</div>
  );
}

function LineItem({ label, value, color, sub }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
      <span style={{ fontSize: '0.72rem', color: T.muted }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: '0.75rem', color: color || T.text, fontWeight: '500' }}>{value}</span>
        {sub && <div style={{ fontSize: '0.6rem', color: T.faint }}>{sub}</div>}
      </div>
    </div>
  );
}

function GoldButton({ onClick, disabled, children, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '12px 18px',
        background: disabled ? `${T.gold}25` : T.gold,
        border: 'none',
        borderRadius: '10px',
        color: disabled ? T.muted : '#000',
        fontWeight: '700',
        fontSize: '0.88rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing: '0.3px',
        transition: 'all 0.15s',
        ...style,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#b8950a'; }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = T.gold; }}
    >
      {children}
    </button>
  );
}

function GhostButton({ onClick, disabled, children, color, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '12px 18px',
        background: 'transparent',
        border: `1px solid ${color ? `${color}40` : T.border}`,
        borderRadius: '10px',
        color: color || T.muted,
        fontSize: '0.85rem',
        fontWeight: '500',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
        ...style,
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = color ? `${color}12` : `${T.gold}08`; e.currentTarget.style.borderColor = color || T.gold; e.currentTarget.style.color = color || T.gold; } }}
      onMouseLeave={e => { if (!disabled) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = color ? `${color}40` : T.border; e.currentTarget.style.color = color || T.muted; } }}
    >
      {children}
    </button>
  );
}

// ─── Product Selector ─────────────────────────────────────────────────────────
function ProductSelector({ products, value, onChange }) {
  const [query, setQuery] = useState('');
  const normalized = normalizeSoldProducts(value);
  const qtyById = normalized.reduce((acc, p) => { acc[p.productId] = p.qty; return acc; }, {});

  const shown = (products || []).filter(p => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return String(p.name || '').toLowerCase().includes(q) || String(p.category || '').toLowerCase().includes(q);
  });

  const setQty = (product, qty) => {
    const next = normalizeSoldProducts([
      ...normalized.filter(p => p.productId !== product.id),
      ...(qty > 0 ? [{ productId: product.id, name: product.name, price: parseFloat(product.price) || 0, qty }] : []),
    ]);
    onChange(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search products..."
        style={{ ...S.input, fontSize: '0.8rem', padding: '8px 12px' }}
      />
      <div style={{
        maxHeight: '200px', overflowY: 'auto',
        border: `1px solid ${T.border}`, borderRadius: '10px',
        background: T.bg,
      }}>
        {shown.length === 0 && (
          <div style={{ padding: '14px', fontSize: '0.75rem', color: T.muted, textAlign: 'center' }}>
            No products found
          </div>
        )}
        {shown.map(p => {
          const qty = qtyById[p.id] || 0;
          const disabled = p.active === false || p.inStock === false;
          return (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', borderBottom: `1px solid ${T.border}`,
              opacity: disabled ? 0.4 : 1,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', color: T.text, fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontSize: '0.65rem', color: T.muted }}>£{(parseFloat(p.price) || 0).toFixed(2)}{p.category ? ` · ${p.category}` : ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button
                  type="button"
                  disabled={disabled || qty <= 0}
                  onClick={() => setQty(p, Math.max(0, qty - 1))}
                  style={{
                    width: '24px', height: '24px', borderRadius: '6px',
                    border: `1px solid ${T.border}`, background: 'transparent',
                    color: T.muted, cursor: disabled || qty <= 0 ? 'not-allowed' : 'pointer',
                    fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >−</button>
                <span style={{
                  minWidth: '18px', textAlign: 'center', fontSize: '0.82rem',
                  color: qty > 0 ? T.gold : T.muted, fontWeight: '700',
                }}>{qty}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setQty(p, qty + 1)}
                  style={{
                    width: '24px', height: '24px', borderRadius: '6px',
                    border: `1px solid ${T.goldDim}`, background: T.goldFaint,
                    color: T.gold, cursor: disabled ? 'not-allowed' : 'pointer',
                    fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >+</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Collapsible panel ────────────────────────────────────────────────────────
function Collapsible({ title, color = T.gold, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      borderRadius: '10px',
      border: `1px solid ${color}25`,
      background: open ? `${color}06` : 'transparent',
      overflow: 'hidden',
      transition: 'background 0.2s',
    }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '11px 14px', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{
          fontSize: '0.65rem', color,
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.2s', display: 'inline-block',
        }}>▶</span>
        <span style={{ fontSize: '0.82rem', fontWeight: '600', color, letterSpacing: '0.3px' }}>{title}</span>
      </div>
      {open && (
        <div style={{ padding: '0 14px 14px' }}>{children}</div>
      )}
    </div>
  );
}

// ─── Summary panel (right column) ────────────────────────────────────────────
function SummaryPanel({ booking, barbers, svc, serviceLabel, basePrice, localProducts, alreadyPaid, discountAmt, pointsApplied, serviceCharge, tipAmt, total, note, LOYALTY_REDEEM_RATE }) {
  const productsTotal = getProductsTotal(localProducts);
  const barberColor = getBColor(booking.barber, barbers);

  return (
    <div style={{
      width: '220px', flexShrink: 0,
      borderLeft: `1px solid ${T.border}`,
      padding: '20px 16px',
      display: 'flex', flexDirection: 'column', gap: '14px',
      background: T.bg2,
      overflowY: 'auto',
    }}>
      <div style={{
        ...S.card,
        display: 'flex', alignItems: 'center', gap: '10px',
        background: T.bg3,
      }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          background: `${barberColor}20`,
          border: `1px solid ${barberColor}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.9rem', fontWeight: '700', color: barberColor, flexShrink: 0,
        }}>
          {(booking.name || '?')[0].toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: '600', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{booking.name}</div>
          <div style={{ fontSize: '0.62rem', color: T.muted, marginTop: '2px' }}>{booking.time} · {booking.date}</div>
        </div>
      </div>

      <div style={{
        padding: '10px 12px', background: T.bg3,
        borderRadius: '8px', borderLeft: `3px solid ${barberColor}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span style={{ fontSize: '0.8rem', color: T.text, fontWeight: '500' }}>{serviceLabel}</span>
          <span style={{ fontSize: '0.8rem', color: T.gold, fontWeight: '700' }}>£{basePrice}</span>
        </div>
        <div style={{ fontSize: '0.62rem', color: T.muted }}>
          {svc ? `${svc.duration}min` : ''} · {(booking.barber || '').toUpperCase()}
        </div>
      </div>

      {localProducts.length > 0 && (
        <div style={{ padding: '10px 12px', background: `${T.blue}08`, borderRadius: '8px', borderLeft: `3px solid ${T.blue}` }}>
          {localProducts.map((p, i) => (
            <div key={p.productId + i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: i === localProducts.length - 1 ? 0 : '4px' }}>
              <span style={{ fontSize: '0.72rem', color: T.text }}>{p.name} × {p.qty}</span>
              <span style={{ fontSize: '0.72rem', color: '#64b5f6', fontWeight: '600' }}>£{(p.price * p.qty).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        <LineItem label="Subtotal" value={`£${(basePrice + productsTotal).toFixed(2)}`} />
        {alreadyPaid > 0 && <LineItem label="Deposit paid" value={`-£${alreadyPaid.toFixed(2)} ✓`} color={T.green} />}
        {discountAmt > 0 && <LineItem label="Discount" value={`-£${discountAmt.toFixed(2)}`} color={T.green} />}
        {pointsApplied > 0 && <LineItem label="Points redeemed ⭐" value={`-£${pointsApplied.toFixed(2)}`} color={T.gold} />}
        {serviceCharge > 0 && <LineItem label="Service charge" value={`+£${serviceCharge.toFixed(2)}`} color={T.orange} />}
        {tipAmt > 0 && <LineItem label="Tip" value={`£${tipAmt.toFixed(2)}`} />}

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: '10px', marginTop: '6px',
          borderTop: `1px solid ${T.border}`,
        }}>
          <span style={{ fontSize: '0.88rem', fontWeight: '600', color: T.text }}>Total</span>
          <span style={{ fontSize: '1.1rem', fontWeight: '700', color: T.gold }}>£{total.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span style={{ fontSize: '0.7rem', color: T.muted }}>{alreadyPaid > 0 ? 'Remaining due' : 'To pay'}</span>
          <span style={{ fontSize: '0.82rem', fontWeight: '700', color: T.gold }}>£{total.toFixed(2)}</span>
        </div>
      </div>

      {note && (
        <div style={{ padding: '8px 10px', background: T.bg3, borderRadius: '8px', border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: '0.58rem', color: T.faint, marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '1px' }}>Note</div>
          <div style={{ fontSize: '0.72rem', color: T.text }}>{note}</div>
        </div>
      )}
    </div>
  );
}

// ─── STEP 1: Cart ─────────────────────────────────────────────────────────────
function CartStep({
  booking, barbers, svc, serviceLabel, basePrice,
  retailProducts, extrasList,
  localProducts, setLocalProducts,
  localExtras, setLocalExtras,
  discountType, setDiscountType,
  discountValue, setDiscountValue,
  discountAmt, setDiscountApplied,
  startingTotal,
  serviceCharge, setServiceCharge,
  note, setNote,
  pointsApplied, setPointsApplied,
  pointsInput, setPointsInput,
  effectiveClientPoints,
  clientIsMember, clientMemberTier,
  matchedClientName,
  welcomeOffer,
  LOYALTY_REDEEM_RATE,
  onSaveUnpaid, onContinue,
  saving,
}) {
  const [showQuick, setShowQuick] = useState(false);
  const barberColor = getBColor(booking.barber, barbers);
  const productsTotal = getProductsTotal(localProducts);
  const extrasTotal = getProductsTotal(localExtras);

  const applyDiscount = () => {
    const val = parseFloat(discountValue) || 0;
    if (discountType === '%') {
      setDiscountApplied(Math.round(startingTotal * val / 100 * 100) / 100);
    } else {
      setDiscountApplied(Math.min(val, startingTotal));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: '1rem', fontWeight: '600', color: T.text, letterSpacing: '0.3px' }}>Cart</div>

      <div style={{
        ...S.card,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: T.bg3,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '4px', height: '36px', background: barberColor, borderRadius: '2px' }} />
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: T.text }}>{serviceLabel}</div>
            <div style={{ fontSize: '0.65rem', color: T.muted, marginTop: '2px' }}>
              {svc ? `${svc.duration}min` : ''} · {(booking.barber || '').toUpperCase()}
            </div>
          </div>
        </div>
        <span style={{ fontSize: '1rem', fontWeight: '700', color: T.gold }}>£{basePrice}</span>
      </div>

      <Collapsible title="Retail products (optional)" color="#64b5f6">
        <ProductSelector products={retailProducts} value={localProducts} onChange={setLocalProducts} />
        {productsTotal > 0 && (
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${T.blue}25`, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: T.muted }}>Products total</span>
            <span style={{ fontSize: '0.78rem', color: '#64b5f6', fontWeight: '700' }}>£{productsTotal.toFixed(2)}</span>
          </div>
        )}
      </Collapsible>

      <Collapsible title="Add-ons & extras (optional)" color={T.orange}>
        <ProductSelector products={extrasList} value={localExtras} onChange={setLocalExtras} />
        {extrasTotal > 0 && (
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${T.orange}25`, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: T.muted }}>Add-ons total</span>
            <span style={{ fontSize: '0.78rem', color: T.orange, fontWeight: '700' }}>£{extrasTotal.toFixed(2)}</span>
          </div>
        )}
      </Collapsible>

      <div style={S.card}>
        <SectionLabel>Discount</SectionLabel>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ display: 'flex', border: `1px solid ${T.border}`, borderRadius: '8px', overflow: 'hidden' }}>
            {['%', '£'].map(t => (
              <button key={t} onClick={() => setDiscountType(t)} style={{
                padding: '8px 14px', border: 'none', cursor: 'pointer',
                background: discountType === t ? `${T.gold}20` : 'transparent',
                color: discountType === t ? T.gold : T.muted,
                fontSize: '0.85rem', fontWeight: '700', transition: 'all 0.15s',
              }}>{t}</button>
            ))}
          </div>
          <input
            type="number" min="0"
            value={discountValue}
            onChange={e => setDiscountValue(e.target.value)}
            placeholder="0"
            style={{ ...S.input, width: '80px' }}
          />
          <button onClick={applyDiscount} style={{
            padding: '9px 16px', background: T.goldFaint,
            border: `1px solid ${T.goldDim}`, borderRadius: '8px',
            color: T.gold, cursor: 'pointer', fontSize: '0.82rem', fontWeight: '600',
          }}>Apply</button>
          {discountAmt > 0 && (
            <span style={{ fontSize: '0.85rem', color: T.green, fontWeight: '700' }}>-£{discountAmt.toFixed(2)}</span>
          )}
        </div>
      </div>

      {clientIsMember ? (
        <div style={{
          padding: '10px 14px', borderRadius: '10px',
          background: clientMemberTier === 'student' ? '#0288d110' : '#7b1fa210',
          border: `1px solid ${clientMemberTier === 'student' ? '#0288d130' : '#7b1fa225'}`,
          fontSize: '0.7rem', fontWeight: '600',
          color: clientMemberTier === 'student' ? '#29b6f6' : '#ce93d8',
        }}>
          {clientMemberTier === 'student' ? '🎓 Student — discount active · loyalty paused' : '◆ MemberZone — loyalty paused'}
        </div>
      ) : effectiveClientPoints > 0 && (
        <div style={{ ...S.card, background: T.bg3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: pointsApplied > 0 ? '0' : '10px' }}>
            <SectionLabel>Loyalty points</SectionLabel>
            <span style={{ fontSize: '0.72rem', color: T.gold, fontWeight: '700' }}>⭐ {effectiveClientPoints} pts</span>
          </div>
          {matchedClientName && matchedClientName.toLowerCase() !== (booking.clientName || booking.name || '').toLowerCase() && (
            <div style={{
              fontSize: '0.65rem', color: T.orange, fontWeight: '600',
              marginBottom: '8px', padding: '4px 8px',
              background: `${T.orange}10`, borderRadius: '6px',
              border: `1px solid ${T.orange}25`,
            }}>
              ⚠ Points matched to: <strong>{matchedClientName}</strong> — confirm before redeeming
            </div>
          )}
          {pointsApplied > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: T.green, fontWeight: '600' }}>
                -£{pointsApplied.toFixed(2)} off ({Math.round(pointsApplied * LOYALTY_REDEEM_RATE)} pts)
              </span>
              <button onClick={() => { setPointsApplied(0); setPointsInput(''); }}
                style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer', fontSize: '1rem' }}>✕</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="number" min="0" max={effectiveClientPoints}
                  value={pointsInput}
                  onChange={e => setPointsInput(e.target.value)}
                  placeholder="pts"
                  style={{ ...S.input, width: '80px', borderColor: parseInt(pointsInput) > effectiveClientPoints ? T.red : undefined }}
                />
                <button onClick={() => {
                  const pts = Math.min(parseInt(pointsInput) || 0, effectiveClientPoints);
                  if (pts >= 20) { setPointsApplied(pts / LOYALTY_REDEEM_RATE); setPointsInput(String(pts)); }
                }} style={{
                  padding: '9px 14px', background: T.goldFaint, border: `1px solid ${T.goldDim}`,
                  borderRadius: '8px', color: T.gold, cursor: 'pointer', fontSize: '0.82rem', fontWeight: '600',
                }}>Redeem</button>
                {effectiveClientPoints >= 20 && (
                  <button onClick={() => { setPointsInput(String(effectiveClientPoints)); setPointsApplied(effectiveClientPoints / LOYALTY_REDEEM_RATE); }}
                    style={{
                      padding: '9px 14px', background: `${T.gold}20`, border: `1px solid ${T.goldDim}`,
                      borderRadius: '8px', color: T.gold, cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700',
                    }}>Use all · £{(effectiveClientPoints / LOYALTY_REDEEM_RATE).toFixed(2)}</button>
                )}
              </div>
              {parseInt(pointsInput) >= 20 && parseInt(pointsInput) <= effectiveClientPoints && (
                <span style={{ fontSize: '0.65rem', color: T.green }}>= £{((parseInt(pointsInput) || 0) / LOYALTY_REDEEM_RATE).toFixed(2)} off</span>
              )}
              {parseInt(pointsInput) > 0 && parseInt(pointsInput) < 20 && (
                <span style={{ fontSize: '0.65rem', color: T.orange }}>Min 20 pts to redeem</span>
              )}
            </div>
          )}
        </div>
      )}

      {welcomeOffer && welcomeOffer.value && (
        <div style={{
          padding: '10px 14px', borderRadius: '10px',
          background: 'rgba(212,175,55,0.07)',
          border: '1px solid rgba(212,175,55,0.25)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
        }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: '700', color: T.gold, letterSpacing: '0.5px' }}>
              ♛ {welcomeOffer.value}% Welcome Offer
            </div>
            <div style={{ fontSize: '0.62rem', color: T.muted, marginTop: '2px' }}>
              Website sign-up discount — active
            </div>
          </div>
          <button
            onClick={() => {
              setDiscountType('%');
              setDiscountValue(String(welcomeOffer.value));
              setDiscountApplied(Math.round(startingTotal * welcomeOffer.value / 100 * 100) / 100);
            }}
            style={{
              padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(212,175,55,0.3)',
              background: 'rgba(212,175,55,0.12)', color: T.gold,
              fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Apply {welcomeOffer.value}% off
          </button>
        </div>
      )}

      {serviceCharge > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px', background: `${T.orange}08`,
          borderRadius: '10px', border: `1px solid ${T.orange}20`,
        }}>
          <span style={{ fontSize: '0.78rem', color: T.orange }}>Service charge (12.5%)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: T.orange, fontWeight: '600' }}>+£{serviceCharge.toFixed(2)}</span>
            <button onClick={() => setServiceCharge(0)}
              style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer' }}>✕</button>
          </div>
        </div>
      )}

      <div>
        <label style={S.label}>Sale note</label>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Add a note..."
          style={S.input}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowQuick(v => !v)}
            style={{
              width: '38px', height: '38px', borderRadius: '50%',
              background: T.bg3, border: `1px solid ${T.border}`,
              color: T.muted, cursor: 'pointer', fontSize: '1.2rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >···</button>
          {showQuick && (
            <div style={{
              position: 'absolute', bottom: '44px', left: 0,
              background: T.bg2, border: `1px solid ${T.border}`,
              borderRadius: '12px', padding: '6px', minWidth: '200px',
              zIndex: 10,
            }}>
              <div style={{ fontSize: '0.58rem', color: T.faint, padding: '4px 10px 6px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Quick actions</div>
              {[
                { label: 'Add service charge (12.5%)', action: () => { setServiceCharge(Math.round(startingTotal * 0.125 * 100) / 100); setShowQuick(false); } },
                { label: 'Clear note', action: () => { setNote(''); setShowQuick(false); } },
              ].map(item => (
                <button key={item.label} onClick={item.action} style={{
                  display: 'flex', width: '100%', padding: '8px 12px',
                  background: 'transparent', border: 'none', color: T.text,
                  cursor: 'pointer', borderRadius: '6px', fontSize: '0.78rem', textAlign: 'left',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = T.goldFaint}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >{item.label}</button>
              ))}
              <div style={{ borderTop: `1px solid ${T.border}`, marginTop: '4px', paddingTop: '4px' }}>
                <button onClick={() => { onSaveUnpaid(); setShowQuick(false); }} style={{
                  display: 'flex', width: '100%', padding: '8px 12px',
                  background: 'transparent', border: 'none', color: T.orange,
                  cursor: 'pointer', borderRadius: '6px', fontSize: '0.78rem', textAlign: 'left',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = `${T.orange}10`}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >Save as draft (unpaid)</button>
              </div>
            </div>
          )}
        </div>
        <GoldButton onClick={onContinue} disabled={saving} style={{ flex: 1 }}>
          Continue to tip →
        </GoldButton>
      </div>
    </div>
  );
}

// ─── STEP 2: Tip ──────────────────────────────────────────────────────────────
function TipStep({ booking, subtotal, tip, setTip, customTip, setCustomTip, tipPaymentMethod, setTipPaymentMethod, onBack, onContinue }) {
  const presets = [
    { label: 'No tip', value: 0 },
    { label: '10%', value: Math.round(subtotal * 0.10 * 100) / 100 },
    { label: '15%', value: Math.round(subtotal * 0.15 * 100) / 100 },
    { label: '20%', value: Math.round(subtotal * 0.20 * 100) / 100 },
    { label: '25%', value: Math.round(subtotal * 0.25 * 100) / 100 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ fontSize: '1rem', fontWeight: '600', color: T.text }}>
        Tip for <span style={{ color: T.gold }}>{(booking.barber || 'barber').toUpperCase()}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
        {presets.map(p => (
          <button key={p.label} onClick={() => { setTip(p.value); setCustomTip(''); }} style={{
            padding: '14px 8px', borderRadius: '10px',
            border: `1px solid ${tip === p.value ? T.gold : T.border}`,
            background: tip === p.value ? `${T.gold}15` : T.bg3,
            cursor: 'pointer', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: '4px', transition: 'all 0.15s',
          }}>
            <span style={{ fontSize: '0.92rem', fontWeight: '600', color: tip === p.value ? T.gold : T.text }}>{p.label}</span>
            {p.value > 0 && <span style={{ fontSize: '0.7rem', color: T.muted }}>£{p.value.toFixed(2)}</span>}
          </button>
        ))}
      </div>

      <div style={{
        display: 'flex', gap: '10px', alignItems: 'center',
        padding: '12px 14px', background: T.bg3, borderRadius: '10px',
        border: `1px solid ${T.border}`,
      }}>
        <span style={{ fontSize: '0.82rem', color: T.muted }}>Custom £</span>
        <input
          type="number" min="0"
          value={customTip}
          onChange={e => setCustomTip(e.target.value)}
          placeholder="0.00"
          style={{ ...S.input, width: '90px' }}
        />
        <button onClick={() => { const v = parseFloat(customTip) || 0; setTip(v); }} style={{
          padding: '8px 16px', background: T.goldFaint,
          border: `1px solid ${T.goldDim}`, borderRadius: '8px',
          color: T.gold, cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600',
        }}>Set</button>
        {tip > 0 && <span style={{ fontSize: '0.85rem', color: T.green, fontWeight: '700', marginLeft: 'auto' }}>+£{tip.toFixed(2)}</span>}
      </div>

      {tip > 0 && (
        <div style={{ padding: '14px 16px', background: T.bg3, borderRadius: '12px', border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: '0.62rem', color: T.faint, letterSpacing: '1.8px', textTransform: 'uppercase', fontWeight: '600', marginBottom: '10px' }}>
            Tip paid by
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[['', 'Same as payment'], ['CASH', '💷 Cash'], ['CARD', '💳 Card']].map(([val, label]) => (
              <button key={val} onClick={() => setTipPaymentMethod(val)} style={{
                flex: 1, padding: '10px 6px', borderRadius: '10px',
                border: `1.5px solid ${tipPaymentMethod === val ? T.gold : T.border}`,
                background: tipPaymentMethod === val ? `${T.gold}14` : T.bg,
                color: tipPaymentMethod === val ? T.gold : T.muted,
                fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s',
              }}>{label}</button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <GhostButton onClick={onBack} style={{ flex: 1 }}>← Back</GhostButton>
        <GoldButton onClick={onContinue} style={{ flex: 2 }}>Continue to payment →</GoldButton>
      </div>
    </div>
  );
}

// ─── STEP 3: Payment ──────────────────────────────────────────────────────────
function PaymentStep({ paymentMethod, setPaymentMethod, splitSecond, setSplitSecond, splitAmount, setSplitAmount, total, saving, onBack, onSaveUnpaid, onCheckout, isPlatformBooking, isEditCheckoutMode, sendLoyaltyEmail, setSendLoyaltyEmail }) {
  const methods = [
    { id: 'CASH', label: 'Cash', icon: '💷' },
    { id: 'CARD', label: 'Card terminal', icon: '💳' },
    { id: 'VOUCHER', label: 'Voucher', icon: '🎟' },
    { id: 'SPLIT', label: 'Split payment', icon: '⚡' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ fontSize: '1rem', fontWeight: '600', color: T.text }}>Payment method</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {methods.map(m => (
          <button key={m.id} onClick={() => setPaymentMethod(m.id)} style={{
            padding: '16px 14px', borderRadius: '12px',
            border: `${paymentMethod === m.id ? '2px' : '1px'} solid ${paymentMethod === m.id ? T.gold : T.border}`,
            background: paymentMethod === m.id ? `${T.gold}12` : T.bg3,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
            transition: 'all 0.15s',
          }}>
            <span style={{ fontSize: '1.1rem' }}>{m.icon}</span>
            <span style={{ fontSize: '0.88rem', fontWeight: '600', color: paymentMethod === m.id ? T.gold : T.text }}>{m.label}</span>
          </button>
        ))}
      </div>

      {paymentMethod === 'SPLIT' && (
        <div style={{ padding: '14px', background: T.bg3, borderRadius: '12px', border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: '0.72rem', color: T.muted, marginBottom: '10px' }}>Split between Cash and:</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={splitSecond} onChange={e => setSplitSecond(e.target.value)}
              style={{ ...S.input, flex: 1 }}>
              <option value="">Second method</option>
              <option value="CARD">Card</option>
              <option value="VOUCHER">Voucher</option>
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.78rem', color: T.muted }}>Cash £</span>
              <input type="number" value={splitAmount} onChange={e => setSplitAmount(e.target.value)}
                placeholder="0" style={{ ...S.input, width: '80px' }} />
            </div>
            {splitAmount && splitSecond && (
              <span style={{ fontSize: '0.75rem', color: T.muted }}>
                {splitSecond}: £{Math.max(0, total - (parseFloat(splitAmount) || 0)).toFixed(2)}
              </span>
            )}
          </div>
        </div>
      )}

      {isPlatformBooking && !isEditCheckoutMode && (
        <div
          onClick={() => setSendLoyaltyEmail(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: T.bg3, borderRadius: '10px', border: `1px solid ${sendLoyaltyEmail ? T.gold + '55' : T.border}`, cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${sendLoyaltyEmail ? T.gold : T.muted}`, background: sendLoyaltyEmail ? T.gold : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
            {sendLoyaltyEmail && <span style={{ color: '#000', fontSize: '11px', fontWeight: '900', lineHeight: 1 }}>✓</span>}
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: sendLoyaltyEmail ? T.gold : T.text }}>Send loyalty card email</div>
            <div style={{ fontSize: '0.68rem', color: T.muted, marginTop: '1px' }}>Send receipt + loyalty card to client after checkout</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <GhostButton onClick={onBack} disabled={saving} style={{ flex: 1 }}>← Back</GhostButton>
        <GhostButton onClick={onSaveUnpaid} disabled={saving} color={T.orange} style={{ flex: 1 }}>
          Save unpaid
        </GhostButton>
        <GoldButton onClick={() => onCheckout(paymentMethod)} disabled={saving} style={{ flex: 2 }}>
          {saving ? 'Processing...' : `Checkout £${total.toFixed(2)}`}
        </GoldButton>
      </div>
    </div>
  );
}

// ─── MAIN CheckoutPanel ───────────────────────────────────────────────────────
export default function CheckoutPanel({ booking, barbers, products, extras, isEdit, onClose, onComplete }) {
  const [step, setStep] = useState('cart');
  const [discountType, setDiscountType] = useState('%');
  const [discountValue, setDiscountValue] = useState('');
  const [discountApplied, setDiscountApplied] = useState(0);
  const [tip, setTip] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [tipPaymentMethod, setTipPaymentMethod] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [splitSecond, setSplitSecond] = useState('');
  const [splitAmount, setSplitAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [serviceCharge, setServiceCharge] = useState(0);
  const [sendLoyaltyEmail, setSendLoyaltyEmail] = useState(false);
  const [clientPoints, setClientPoints] = useState(0);
  const [clientIsMember, setClientIsMember] = useState(false);
  const [clientMemberTier, setClientMemberTier] = useState('');
  const [matchedClientName, setMatchedClientName] = useState('');
  const [pointsInput, setPointsInput] = useState('');
  const [pointsApplied, setPointsApplied] = useState(0);
  const [welcomeOffer, setWelcomeOffer] = useState(null);

  const LOYALTY_REDEEM_RATE = 20;
  const isPlatformBooking = ['Booksy', 'Fresha', 'Treatwell'].includes(booking.source);

  const svc = findServiceByBookingValue(booking.service);
  const serviceLabel = getBookingServiceLabel(booking);
  const priceFromBooking = parseFloat(String(booking.price ?? booking.paidAmount ?? '0').replace('£', '')) || 0;
  const basePrice = priceFromBooking > 0 ? priceFromBooking : (svc ? svc.price : 0);

  const retailProducts = Array.isArray(products) ? products : [];
  const extrasList = Array.isArray(extras) ? extras : [];

  const [localProducts, setLocalProducts] = useState(() =>
    normalizeSoldProducts((booking.soldProducts || []).filter(p => retailProducts.find(ap => ap.id === (p.productId || p.id))))
  );
  const [localExtras, setLocalExtras] = useState(() =>
    normalizeSoldProducts((booking.soldAddOns || []).filter(p => extrasList.find(ap => ap.id === (p.productId || p.id))))
  );

  const WEBSITE_DEPOSITS = { 'i-cut-royal': 10, 'i-cut-deluxe': 10, 'full-skinfade-beard-luxury': 10, 'full-experience': 10 };
  // Booksy stores a real deposit in platformDepositAmount — use it directly.
  // Fresha/Treatwell store the service price in paidAmount, NOT a pre-paid deposit — never subtract it.
  const depositAmount = booking.source === 'Booksy'
    ? (booking.platformDepositAmount || parseFloat(String(booking.paidAmount || 0).replace(/[£,]/g, '')) || 0)
    : ['Fresha', 'Treatwell'].includes(booking.source)
      ? (booking.platformDepositAmount || 0)
      : (booking.paymentType === 'DEPOSIT' ? (WEBSITE_DEPOSITS[booking.service] || 10) : 0);

  const alreadyPaid = depositAmount;
  const productsTotal = getProductsTotal(localProducts);
  const addOnsTotal = getProductsTotal(localExtras);
  const startingTotal = (alreadyPaid > 0 ? Math.max(0, basePrice - alreadyPaid) : basePrice) + productsTotal + addOnsTotal;
  const discountAmt = discountApplied;
  const subtotal = Math.max(0, startingTotal - discountAmt - pointsApplied + serviceCharge);
  const total = subtotal + tip;

  const isEditCheckoutMode = String(booking.status || '').toUpperCase() === 'CHECKED_OUT';
  const prevEarnedPts = isEditCheckoutMode ? (booking.loyaltyPointsEarned || 0) : 0;
  const prevRedeemedPts = isEditCheckoutMode ? (booking.loyaltyPointsRedeemed || 0) : 0;
  const effectiveClientPoints = Math.max(0, clientPoints - prevEarnedPts + prevRedeemedPts);

  useEffect(() => {
    const phone = booking.phone || booking.clientPhone || '';
    const email = booking.email || booking.clientEmail || '';
    if (!phone && !email) return;
    getClientLoyaltyPoints({ phone, email }).then(result => {
      setClientPoints(result.points || 0);
      setClientIsMember(result.isMember || false);
      setClientMemberTier(result.membershipTier || '');
      setMatchedClientName(result.clientName || '');
      setWelcomeOffer(result.welcomeOffer || null);
    }).catch(() => {});
  }, [booking.bookingId]);

  const handleCheckout = async (method) => {
    setSaving(true);
    try {
      await checkoutBooking({
        bookingId: booking.bookingId,
        paymentMethod: method,
        total,
        discount: discountAmt,
        tip,
        tipPaymentMethod: tip > 0 ? (tipPaymentMethod || method) : '',
        note,
        splitSecond,
        splitAmount,
        soldProducts: localProducts,
        soldAddOns: localExtras,
        serviceCharge,
        loyaltyPointsRedeemed: pointsApplied > 0 ? Math.round(pointsApplied * LOYALTY_REDEEM_RATE) : 0,
        sendLoyaltyEmail: isPlatformBooking ? sendLoyaltyEmail : true,
      });
      logAudit('CHECKOUT', { bookingId: booking.bookingId, clientName: booking.clientName || booking.name, service: booking.serviceId || booking.service, date: booking.date, time: booking.time, barber: booking.barberId || booking.barber, total, paymentMethod: method });
    } catch (err) {
      console.error('Checkout error:', err);
    } finally {
      setSaving(false);
      if (onComplete) onComplete({
        method, total, discount: discountAmt, tip,
        splitSecond, splitAmount: parseFloat(splitAmount) || 0,
        soldProducts: localProducts, soldAddOns: localExtras, serviceCharge,
      });
    }
  };

  const handleSaveUnpaid = async () => {
    setSaving(true);
    try {
      await saveUnpaidBooking({
        bookingId: booking.bookingId,
        soldProducts: localProducts,
        soldAddOns: localExtras,
        serviceCharge,
        discount: discountAmt,
      });
    } catch (err) {
      console.error('Save unpaid error:', err);
    } finally {
      setSaving(false);
      if (onComplete) onComplete({
        method: 'UNPAID', total, discount: discountAmt, tip: 0,
        splitSecond: '', splitAmount: 0,
        soldProducts: localProducts, soldAddOns: localExtras, serviceCharge,
      });
    }
  };

  const donSteps = step === 'tip' ? ['cart'] : step === 'payment' ? ['cart', 'tip'] : [];

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.75)',
        zIndex: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: T.bg,
        border: `1px solid ${T.border}`,
        borderRadius: '20px',
        width: '740px',
        maxWidth: '96vw',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
      }}>
        <div style={{
          padding: '16px 24px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: T.bg2,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <StepDot step="cart" current={step} done={donSteps} onClick={setStep} num="1" label="Cart" />
            <Divider />
            <StepDot step="tip" current={step} done={donSteps} onClick={setStep} num="2" label="Tip" />
            <Divider />
            <StepDot step="payment" current={step} done={donSteps} onClick={setStep} num="3" label="Payment" />
          </div>
          <button
            onClick={onClose}
            style={{
              width: '30px', height: '30px', borderRadius: '50%',
              background: T.bg3, border: `1px solid ${T.border}`,
              color: T.muted, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.border2; e.currentTarget.style.color = T.text; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
          >✕</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '22px 26px' }}>
            {step === 'cart' && (
              <CartStep
                booking={booking} barbers={barbers} svc={svc}
                serviceLabel={serviceLabel} basePrice={basePrice}
                retailProducts={retailProducts} extrasList={extrasList}
                localProducts={localProducts} setLocalProducts={setLocalProducts}
                localExtras={localExtras} setLocalExtras={setLocalExtras}
                discountType={discountType} setDiscountType={setDiscountType}
                discountValue={discountValue} setDiscountValue={setDiscountValue}
                discountAmt={discountAmt} setDiscountApplied={setDiscountApplied}
                startingTotal={startingTotal}
                serviceCharge={serviceCharge} setServiceCharge={setServiceCharge}
                note={note} setNote={setNote}
                pointsApplied={pointsApplied} setPointsApplied={setPointsApplied}
                pointsInput={pointsInput} setPointsInput={setPointsInput}
                effectiveClientPoints={effectiveClientPoints}
                clientIsMember={clientIsMember} clientMemberTier={clientMemberTier}
                matchedClientName={matchedClientName}
                welcomeOffer={welcomeOffer}
                LOYALTY_REDEEM_RATE={LOYALTY_REDEEM_RATE}
                onSaveUnpaid={handleSaveUnpaid}
                onContinue={() => setStep('tip')}
                saving={saving}
              />
            )}
            {step === 'tip' && (
              <TipStep
                booking={booking}
                subtotal={subtotal}
                tip={tip} setTip={setTip}
                customTip={customTip} setCustomTip={setCustomTip}
                tipPaymentMethod={tipPaymentMethod} setTipPaymentMethod={setTipPaymentMethod}
                onBack={() => setStep('cart')}
                onContinue={() => setStep('payment')}
              />
            )}
            {step === 'payment' && (
              <PaymentStep
                paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
                splitSecond={splitSecond} setSplitSecond={setSplitSecond}
                splitAmount={splitAmount} setSplitAmount={setSplitAmount}
                total={total}
                saving={saving}
                onBack={() => setStep('tip')}
                onSaveUnpaid={handleSaveUnpaid}
                onCheckout={handleCheckout}
                isPlatformBooking={isPlatformBooking}
                isEditCheckoutMode={isEditCheckoutMode}
                sendLoyaltyEmail={sendLoyaltyEmail}
                setSendLoyaltyEmail={setSendLoyaltyEmail}
              />
            )}
          </div>

          <SummaryPanel
            booking={booking} barbers={barbers}
            svc={svc} serviceLabel={serviceLabel} basePrice={basePrice}
            localProducts={localProducts}
            alreadyPaid={alreadyPaid}
            discountAmt={discountAmt}
            pointsApplied={pointsApplied}
            serviceCharge={serviceCharge}
            tipAmt={tip}
            total={total}
            note={note}
            LOYALTY_REDEEM_RATE={LOYALTY_REDEEM_RATE}
          />
        </div>
      </div>
    </div>
  );
}
