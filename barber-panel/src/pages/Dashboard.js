import { db } from '../firebase';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import config from '../config';
import { checkoutBooking, saveUnpaidBooking, createWalkIn, blockTime, editBooking, deleteBooking } from '../firestoreActions';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const STATUS_COLORS = { CONFIRMED: '#4caf50', PENDING: '#ff9800', CHECKED_OUT: '#2196f3', CANCELLED: '#ff5252' };

function isBarberBookingDisabled(barber) {
  if (!barber) return false;
  return barber.active === false;
}

function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y, m) { let d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }
function getWeekDates(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => { const dd = new Date(d); dd.setDate(d.getDate() + i); return dd; });
}
function formatDateKey(date) {
  return date.getDate() + ' ' + date.toLocaleDateString('en-GB', { month: 'long' }) + ' ' + date.getFullYear();
}
function convertTo24(t) {
  if (!t) return 0;
  const s = String(t);
  const m1 = s.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (m1) {
    let h = parseInt(m1[1]); const min = parseInt(m1[2]); const ap = m1[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  }
  const mPlain = s.match(/^(\d{1,2}):(\d{2})$/);
  if (mPlain) {
    const h = parseInt(mPlain[1], 10);
    const min = parseInt(mPlain[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return h * 60 + min;
  }
  const m2 = s.match(/T(\d+):(\d+)/);
  if (m2) return parseInt(m2[1]) * 60 + parseInt(m2[2]);
  return 0;
}
function minsToLabel(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
  return h12 + ':' + (m === 0 ? '00' : String(m).padStart(2,'0')) + ' ' + ap;
}
function getBColor(barber, barbers) {
  if (barbers) { const f = barbers.find(b => b.name.toLowerCase() === (barber||'').toLowerCase()); if (f) return f.color; }
  return { alex:'#d4af37', arda:'#4caf50' }[(barber||'').toLowerCase()] || '#7a7260';
}
function getBookingName(booking) {
  const firstLast = [booking?.firstName, booking?.lastName].filter(Boolean).join(' ').trim();
  const raw = booking?.name || booking?.customerName || booking?.clientName || booking?.fullName || booking?.customer || firstLast;
  return String(raw || '').trim() || 'Walk-in';
}
function StatPill({ label, value, color, onClick, active }) {
  return (
    <div onClick={onClick} style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'12px 20px', background:active?color+'25':color+'10', border:'1px solid '+(active?color:color+'30'), borderRadius:'10px', minWidth:'90px', cursor:onClick?'pointer':'default', transition:'all 0.15s' }}
      onMouseEnter={e=>{if(onClick)e.currentTarget.style.background=color+'20';}}
      onMouseLeave={e=>{e.currentTarget.style.background=active?color+'25':color+'10';}}>
      <span style={{ fontSize:'1.4rem', fontWeight:'800', color }}>{value}</span>
      <span style={{ fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1px', textTransform:'uppercase', marginTop:'2px' }}>{label}</span>
    </div>
  );
}
function ResizeHandle({ onResize, direction = 'horizontal' }) {
  const isDragging = useRef(false);
  const startPos = useRef(0);
  const handleMouseDown = useCallback((e) => {
    isDragging.current = true;
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const delta = (direction === 'horizontal' ? e.clientX : e.clientY) - startPos.current;
      startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
      onResize(delta);
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onResize, direction]);
  return (
    <div onMouseDown={handleMouseDown}
      style={{ width:direction==='horizontal'?'6px':'100%', height:direction==='horizontal'?'100%':'6px', background:'transparent', cursor:direction==='horizontal'?'col-resize':'row-resize', flexShrink:0, position:'relative', zIndex:10, display:'flex', alignItems:'center', justifyContent:'center' }}
      onMouseEnter={e=>e.currentTarget.querySelector('.handle-line').style.background='rgba(212,175,55,0.6)'}
      onMouseLeave={e=>e.currentTarget.querySelector('.handle-line').style.background='rgba(212,175,55,0.15)'}>
      <div className="handle-line" style={{ width:direction==='horizontal'?'2px':'40px', height:direction==='horizontal'?'40px':'2px', background:'rgba(212,175,55,0.15)', borderRadius:'2px', transition:'background 0.2s' }} />
    </div>
  );
}

const COUNTRY_CODES = [
  { code: '+44', flag: 'UK' }, { code: '+1', flag: 'US' }, { code: '+90', flag: 'TR' },
  { code: '+49', flag: 'DE' }, { code: '+33', flag: 'FR' }, { code: '+34', flag: 'ES' },
  { code: '+39', flag: 'IT' }, { code: '+31', flag: 'NL' }, { code: '+48', flag: 'PL' },
  { code: '+380', flag: 'UA' }, { code: '+40', flag: 'RO' }, { code: '+92', flag: 'PK' },
  { code: '+91', flag: 'IN' }, { code: '+880', flag: 'BD' }, { code: '+234', flag: 'NG' },
  { code: '+20', flag: 'EG' }, { code: '+212', flag: 'MA' }, { code: '+966', flag: 'SA' },
  { code: '+971', flag: 'AE' },
];

// ── CHECKOUT PANEL ────────────────────────────────────────────────────────
function CheckoutPanel({ booking, barbers, onClose, onComplete, isEdit }) {
  const [step, setStep] = useState('cart');
  const [isEditCheckout, setIsEditCheckout] = useState(false);
  const [discountType, setDiscountType] = useState('%');
  const [discountValue, setDiscountValue] = useState('');
  const [discountApplied, setDiscountApplied] = useState(0);
  const [tip, setTip] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [splitSecond, setSplitSecond] = useState('');
  const [splitAmount, setSplitAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [serviceCharge, setServiceCharge] = useState(0);
  const [showQuickActions, setShowQuickActions] = useState(false);

  const svc = config.services ? config.services.find(s => s.id === booking.service) : null;
  const basePrice = svc ? svc.price : (parseInt(String(booking.price || '0').replace('£', '')) || 0);
  const depositAmount = booking.source === 'Booksy'
    ? (config.platforms?.booksy?.depositEnabled ? config.platforms.booksy.depositAmount : 0)
    : booking.source === 'Fresha'
    ? (config.platforms?.fresha?.depositEnabled ? config.platforms.fresha.depositAmount : 0)
    : 0;
  const alreadyPaid = depositAmount;
  const remainingDue = Math.max(0, basePrice - alreadyPaid);
  const startingTotal = alreadyPaid > 0 ? remainingDue : basePrice;
  const discountAmt = discountApplied;
  const subtotal = Math.max(0, startingTotal - discountAmt + serviceCharge);
  const tipAmt = tip;
  const total = subtotal + tipAmt;

  const applyDiscount = () => {
    const val = parseFloat(discountValue) || 0;
    if (discountType === '%') {
      setDiscountApplied(Math.round(basePrice * val / 100 * 100) / 100);
    } else {
      setDiscountApplied(Math.min(val, basePrice));
    }
  };

const handleCheckout = async (method) => {
    setSaving(true);
    const finalMethod = method || paymentMethod;
    try {
      await checkoutBooking({
        bookingId: booking.bookingId,
        paymentMethod: finalMethod,
        total,
        discount: discountAmt,
        tip: tipAmt,
        note,
        splitSecond,
        splitAmount,
      });
    } catch (err) {
      console.error('Checkout error:', err);
    } finally {
      setSaving(false);
      if (onComplete) onComplete({ method: finalMethod, total, discount: discountAmt, tip: tipAmt });
    }
  };
 const handleSaveUnpaid = async () => {
    setSaving(true);
    try {
      await saveUnpaidBooking({ bookingId: booking.bookingId });
    } catch (err) {
      console.error('Save unpaid error:', err);
    } finally {
      setSaving(false);
      if (onComplete) onComplete({ method: 'UNPAID', total, discount: discountAmt, tip: 0 });
    }
  };
  const inp = { padding: '9px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.85rem', outline: 'none' };

  const stepDot = (s, num, label) => {
    const isActive = step === s;
    const isDone = (s === 'cart' && (step === 'tip' || step === 'payment')) || (s === 'tip' && step === 'payment');
    return (
      <div onClick={() => isDone && setStep(s)} style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: isDone ? 'pointer' : 'default' }}>
        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: isActive ? '#d4af37' : isDone ? 'rgba(76,175,80,0.4)' : 'rgba(212,175,55,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: '700', color: isActive ? '#000' : isDone ? '#4caf50' : 'var(--muted)', transition: 'all 0.2s' }}>
          {isDone ? '✓' : num}
        </div>
        <span style={{ fontSize: '0.75rem', color: isActive ? '#d4af37' : isDone ? '#4caf50' : 'var(--muted)', fontWeight: isActive ? '600' : '400' }}>{label}</span>
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: '20px', width: '720px', maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(212,175,55,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {stepDot('cart', '1', 'Cart')}
            <div style={{ width: '28px', height: '1px', background: 'var(--border)' }} />
            {stepDot('tip', '2', 'Tip')}
            <div style={{ width: '28px', height: '1px', background: 'var(--border)' }} />
            {stepDot('payment', '3', 'Payment')}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '50%', color: 'var(--muted)', cursor: 'pointer', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '22px 26px' }}>
            {step === 'cart' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <p style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text)', margin: 0 }}>Cart</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'rgba(212,175,55,0.04)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '4px', height: '36px', background: getBColor(booking.barber, barbers), borderRadius: '2px' }} />
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text)' }}>{svc ? svc.name : booking.service}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '2px' }}>{svc ? svc.duration + 'min' : ''} · {(booking.barber || '').toUpperCase()}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '1rem', fontWeight: '700', color: '#d4af37' }}>£{basePrice}</span>
                </div>
                <div style={{ padding: '14px 16px', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: '0.65rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px', fontWeight: '600' }}>Discount</p>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                      {['%', '£'].map(t => (
                        <button key={t} onClick={() => setDiscountType(t)}
                          style={{ padding: '8px 16px', border: 'none', cursor: 'pointer', background: discountType === t ? 'rgba(212,175,55,0.18)' : 'transparent', color: discountType === t ? '#d4af37' : 'var(--muted)', fontSize: '0.85rem', fontWeight: '700', transition: 'all 0.15s' }}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <input type="number" min="0" value={discountValue} onChange={e => setDiscountValue(e.target.value)}
                      placeholder={discountType === '%' ? '0' : '0.00'} style={{ ...inp, width: '90px' }} />
                    <button onClick={applyDiscount}
                      style={{ padding: '9px 18px', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '8px', color: '#d4af37', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '600' }}>
                      Apply
                    </button>
                    {discountAmt > 0 && <span style={{ fontSize: '0.85rem', color: '#4caf50', fontWeight: '700' }}>-£{discountAmt.toFixed(2)}</span>}
                  </div>
                </div>
                {serviceCharge > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,152,0,0.06)', borderRadius: '10px', border: '1px solid rgba(255,152,0,0.15)' }}>
                    <span style={{ fontSize: '0.78rem', color: '#ff9800' }}>Service charge</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.85rem', color: '#ff9800', fontWeight: '600' }}>+£{serviceCharge.toFixed(2)}</span>
                      <button onClick={() => setServiceCharge(0)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
                    </div>
                  </div>
                )}
                <div>
                  <p style={{ fontSize: '0.65rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 8px', fontWeight: '600' }}>Sale note</p>
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note..." style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setShowQuickActions(!showQuickActions)}
                      style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(212,175,55,0.06)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      ···
                    </button>
                    {showQuickActions && (
                      <div style={{ position: 'absolute', bottom: '44px', left: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '6px', minWidth: '180px', zIndex: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--muted)', padding: '4px 10px 6px', letterSpacing: '1px', textTransform: 'uppercase' }}>Quick actions</div>
                        {[
                          { label: 'Add tip', action: () => { setStep('tip'); setShowQuickActions(false); } },
                          { label: 'Add cart discount', action: () => { setShowQuickActions(false); } },
                          { label: 'Add service charge (12.5%)', action: () => { setServiceCharge(Math.round(basePrice * 0.125 * 100) / 100); setShowQuickActions(false); } },
                          { label: 'Clear note', action: () => { setNote(''); setShowQuickActions(false); } },
                        ].map(item => (
                          <button key={item.label} onClick={item.action}
                            style={{ display: 'flex', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', borderRadius: '6px', fontSize: '0.78rem', textAlign: 'left' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.08)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {item.label}
                          </button>
                        ))}
                        <div style={{ borderTop: '1px solid var(--border)', marginTop: '4px', paddingTop: '4px' }}>
                          <button onClick={handleSaveUnpaid}
                            style={{ display: 'flex', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: '#ff9800', cursor: 'pointer', borderRadius: '6px', fontSize: '0.78rem', textAlign: 'left' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,152,0,0.08)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            Save as draft (unpaid)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button onClick={() => setStep('tip')}
                    style={{ flex: 1, padding: '13px', background: 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '10px', color: '#000', fontWeight: '700', fontSize: '0.92rem', cursor: 'pointer' }}>
                    Continue to Tip →
                  </button>
                </div>
              </div>
            )}

            {step === 'tip' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <p style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text)', margin: 0 }}>Select tip for <span style={{ color: '#d4af37' }}>{(booking.barber || 'barber').toUpperCase()}</span></p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  {[
                    { label: 'No tip', value: 0, sub: '' },
                    { label: '10%', value: Math.round(subtotal * 0.10 * 100) / 100, sub: '£' + (subtotal * 0.10).toFixed(2) },
                    { label: '15%', value: Math.round(subtotal * 0.15 * 100) / 100, sub: '£' + (subtotal * 0.15).toFixed(2) },
                    { label: '20%', value: Math.round(subtotal * 0.20 * 100) / 100, sub: '£' + (subtotal * 0.20).toFixed(2) },
                    { label: '25%', value: Math.round(subtotal * 0.25 * 100) / 100, sub: '£' + (subtotal * 0.25).toFixed(2) },
                    { label: 'Custom', value: -1, sub: '' },
                  ].map(t => (
                    <button key={t.label}
                      onClick={() => { if (t.value === -1) return; setTip(t.value); setCustomTip(''); }}
                      style={{ padding: '16px 8px', borderRadius: '12px', border: '1px solid ' + (tip === t.value && t.value !== -1 ? '#d4af37' : 'var(--border)'), background: tip === t.value && t.value !== -1 ? 'rgba(212,175,55,0.12)' : 'var(--card)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}>
                      <span style={{ fontSize: '0.92rem', fontWeight: '600', color: tip === t.value && t.value !== -1 ? '#d4af37' : 'var(--text)' }}>{t.label}</span>
                      {t.sub && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{t.sub}</span>}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '12px 14px', background: 'var(--card)', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Custom £</span>
                  <input type="number" min="0" value={customTip} onChange={e => setCustomTip(e.target.value)} placeholder="0.00" style={{ ...inp, width: '90px' }} />
                  <button onClick={() => { const v = parseFloat(customTip) || 0; setTip(v); }}
                    style={{ padding: '8px 16px', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '8px', color: '#d4af37', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}>
                    Set
                  </button>
                  {tip > 0 && <span style={{ fontSize: '0.82rem', color: '#4caf50', fontWeight: '600', marginLeft: 'auto' }}>+£{tip.toFixed(2)}</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setStep('cart')} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.85rem' }}>← Back</button>
                  <button onClick={() => setStep('payment')} style={{ flex: 2, padding: '12px', background: 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '10px', color: '#000', fontWeight: '700', fontSize: '0.88rem', cursor: 'pointer' }}>Continue to Payment →</button>
                </div>
              </div>
            )}

            {step === 'payment' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <p style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text)', margin: 0 }}>Select payment</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {[
                    { id: 'CASH', label: 'Cash' },
                    { id: 'CARD', label: 'Card terminal' },
                    { id: 'VOUCHER', label: 'Voucher' },
                    { id: 'SPLIT', label: 'Split payment' },
                  ].map(m => (
                    <button key={m.id} onClick={() => setPaymentMethod(m.id)}
                      style={{ padding: '18px 16px', borderRadius: '12px', border: '2px solid ' + (paymentMethod === m.id ? '#d4af37' : 'var(--border)'), background: paymentMethod === m.id ? 'rgba(212,175,55,0.1)' : 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.15s' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: '600', color: paymentMethod === m.id ? '#d4af37' : 'var(--text)' }}>{m.label}</span>
                    </button>
                  ))}
                </div>
                {paymentMethod === 'SPLIT' && (
                  <div style={{ padding: '14px', background: 'rgba(212,175,55,0.04)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '0 0 10px' }}>Split between Cash and:</p>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <select value={splitSecond} onChange={e => setSplitSecond(e.target.value)} style={{ ...inp, flex: 1 }}>
                        <option value="">Select second method</option>
                        <option value="CARD">Card</option>
                        <option value="VOUCHER">Voucher</option>
                      </select>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Cash £</span>
                        <input type="number" value={splitAmount} onChange={e => setSplitAmount(e.target.value)} placeholder="0" style={{ ...inp, width: '80px' }} />
                      </div>
                      {splitAmount && splitSecond && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{splitSecond}: £{Math.max(0, total - (parseFloat(splitAmount) || 0)).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button onClick={() => setStep('tip')} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.85rem' }}>← Back</button>
                  <button onClick={handleSaveUnpaid} disabled={saving}
                    style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid rgba(255,152,0,0.3)', borderRadius: '10px', color: '#ff9800', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: '600' }}>
                    Save unpaid
                  </button>
                  <button onClick={() => handleCheckout(paymentMethod)} disabled={saving}
                    style={{ flex: 2, padding: '12px', background: saving ? 'rgba(212,175,55,0.2)' : 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '10px', color: saving ? 'var(--muted)' : '#000', fontWeight: '700', fontSize: '0.92rem', cursor: saving ? 'not-allowed' : 'pointer' }}>
                    {saving ? 'Processing...' : 'Checkout £' + total.toFixed(2)}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right summary panel */}
          <div style={{ width: '230px', flexShrink: 0, borderLeft: '1px solid var(--border)', padding: '22px 18px', display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: 'rgba(212,175,55,0.05)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: getBColor(booking.barber, barbers) + '22', border: '2px solid ' + getBColor(booking.barber, barbers) + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: '800', color: getBColor(booking.barber, barbers), flexShrink: 0 }}>
                {(booking.name || '?')[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{booking.name}</div>
                <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: '1px' }}>{booking.time} · {booking.date}</div>
              </div>
            </div>
            <div style={{ padding: '10px 12px', background: 'var(--card)', borderRadius: '10px', borderLeft: '3px solid ' + getBColor(booking.barber, barbers) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text)', fontWeight: '600' }}>{svc ? svc.name : booking.service}</span>
                <span style={{ fontSize: '0.78rem', color: '#d4af37', fontWeight: '700' }}>£{basePrice}</span>
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>{svc ? svc.duration + 'min' : ''} · {(booking.barber || '').toUpperCase()}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.73rem', color: 'var(--muted)' }}>Subtotal</span>
                <span style={{ fontSize: '0.73rem', color: 'var(--text)' }}>£{basePrice}</span>
              </div>
              {alreadyPaid > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.73rem', color: 'var(--muted)' }}>Deposit paid</span>
                  <span style={{ fontSize: '0.73rem', color: '#4caf50', fontWeight: '600' }}>-£{alreadyPaid.toFixed(2)} ✓</span>
                </div>
              )}
              {discountAmt > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.73rem', color: 'var(--muted)' }}>Discount</span>
                  <span style={{ fontSize: '0.73rem', color: '#4caf50', fontWeight: '600' }}>-£{discountAmt.toFixed(2)}</span>
                </div>
              )}
              {serviceCharge > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.73rem', color: 'var(--muted)' }}>Service charge</span>
                  <span style={{ fontSize: '0.73rem', color: '#ff9800' }}>+£{serviceCharge.toFixed(2)}</span>
                </div>
              )}
              {tipAmt > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.73rem', color: 'var(--muted)' }}>Tip</span>
                  <span style={{ fontSize: '0.73rem', color: 'var(--text)' }}>£{tipAmt.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)', marginTop: '2px' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text)' }}>Total</span>
                <span style={{ fontSize: '1rem', fontWeight: '800', color: '#d4af37' }}>£{total.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.73rem', color: 'var(--muted)' }}>{alreadyPaid > 0 ? 'Remaining to pay' : 'To pay'}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#d4af37' }}>£{total.toFixed(2)}</span>
              </div>
            </div>
            {note && (
              <div style={{ padding: '8px 10px', background: 'rgba(212,175,55,0.04)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '1px' }}>Note</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text)' }}>{note}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BookingDetail({ booking, barbers, onClose, onEdit, onDelete, onCheckout, onViewReceipt, allBookings }) {
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  if (!booking) return null;
  const color = getBColor(booking.barber, barbers);

  const clientKey = booking.phone || booking.email || booking.name;
  const isWalkIn = !booking.name || booking.name === 'Walk-in';
  const clientMatchedBookings = (!isWalkIn && clientKey && allBookings)
    ? allBookings.filter(b =>
        b.status === 'CHECKED_OUT' &&
        b.bookingId !== booking.bookingId &&
        (booking.phone ? b.phone === booking.phone : booking.email ? b.email === booking.email : b.name === booking.name)
      )
    : [];
  // Count unique dates — same-day checkouts (e.g. test duplicates) count as one visit
  const clientVisits = new Set(clientMatchedBookings.map(b => b.date)).size;
  const currentDate = booking.status === 'CHECKED_OUT' ? booking.date : null;
  const allVisitDates = new Set([...clientMatchedBookings.map(b => b.date), ...(currentDate ? [currentDate] : [])]);
  const totalVisits = allVisitDates.size;
  const isReturning = clientVisits > 0;
  const visitOrdinal = n => { if(n===1)return '1st'; if(n===2)return '2nd'; if(n===3)return '3rd'; return n+'th'; };
  const serviceLabel = config.services ? (config.services.find(s => s.id === booking.service) || {}).name || booking.service : booking.service;
  return (
    <div style={{ width:'300px', flexShrink:0, background:'var(--card2)', border:'1px solid rgba(212,175,55,0.25)', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', maxHeight:'calc(100vh - 200px)', boxShadow:'0 8px 32px rgba(0,0,0,0.4)', position:'relative' }}>
      {deleting && (
        <div style={{ position:'absolute', inset:0, background:'rgba(10,10,8,0.88)', zIndex:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'12px', borderRadius:'16px' }}>
          <div style={{ width:'36px', height:'36px', border:'3px solid rgba(255,82,82,0.2)', borderTop:'3px solid #ff5252', borderRadius:'50%', animation:'spin2 0.8s linear infinite' }} />
          <span style={{ fontSize:'0.78rem', color:'#ff5252', fontWeight:'600', letterSpacing:'1px' }}>Deleting...</span>
          <style>{`@keyframes spin2 { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {editing && (
        <div style={{ position:'absolute', inset:0, background:'rgba(10,10,8,0.88)', zIndex:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'12px', borderRadius:'16px' }}>
          <div style={{ width:'36px', height:'36px', border:'3px solid rgba(212,175,55,0.2)', borderTop:'3px solid #d4af37', borderRadius:'50%', animation:'spin2 0.8s linear infinite' }} />
          <span style={{ fontSize:'0.78rem', color:'#d4af37', fontWeight:'600', letterSpacing:'1px' }}>Opening editor...</span>
        </div>
      )}
      <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(212,175,55,0.04)', flexShrink:0 }}>
        <span style={{ fontSize:'0.65rem', color:'var(--muted)', letterSpacing:'3px', textTransform:'uppercase', fontWeight:'600' }}>Booking Detail</span>
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'1rem', width:'24px', height:'24px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%' }}
          onMouseEnter={e=>{ e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.color='var(--text)'; }}
          onMouseLeave={e=>{ e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--muted)'; }}>x</button>
      </div>
      <div style={{ overflowY:'auto', flex:1, padding:'16px 20px', display:'flex', flexDirection:'column', gap:'12px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'14px', background:'rgba(212,175,55,0.05)', borderRadius:'12px', border:'1px solid var(--border)' }}>
          <div style={{ position:'relative', flexShrink:0 }}>
            <div style={{ width:'44px', height:'44px', borderRadius:'50%', background:color+'22', border:'2px solid '+color+'44', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', fontWeight:'800', color }}>
              {(booking.name||'?')[0].toUpperCase()}
            </div>
            {isReturning && (
              <div style={{ position:'absolute', bottom:'-4px', right:'-4px', background:'#d4af37', borderRadius:'8px', padding:'1px 5px', fontSize:'0.52rem', fontWeight:'800', color:'#000', whiteSpace:'nowrap' }}>
                {visitOrdinal(clientVisits+1)} visit
              </div>
            )}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'0.9rem', fontWeight:'700', color:'var(--text)', marginBottom:'6px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{booking.name||'Walk-in'}</div>
          <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
            <span style={{ padding:'2px 8px', borderRadius:'4px', fontSize:'0.58rem', fontWeight:'700', color:STATUS_COLORS[booking.status]||'var(--muted)', background:(STATUS_COLORS[booking.status]||'#888')+'18', letterSpacing:'1px' }}>{booking.status}</span>
            {booking.source && (
              <span style={{ padding:'2px 8px', borderRadius:'4px', fontSize:'0.58rem', fontWeight:'700', letterSpacing:'1px',
                color: booking.source==='Booksy'?'#9c27b0': booking.source==='Fresha'?'#2196f3': booking.source==='Walk-in'?'#ff9800':'#4caf50',
                background: booking.source==='Booksy'?'rgba(156,39,176,0.15)': booking.source==='Fresha'?'rgba(33,150,243,0.15)': booking.source==='Walk-in'?'rgba(255,152,0,0.15)':'rgba(76,175,80,0.15)'
              }}>{booking.source}</span>
            )}
            {booking.status === 'CHECKED_OUT' && (
              <button onClick={onViewReceipt} style={{ padding:'2px 8px', background:'rgba(212,175,55,0.1)', border:'1px solid rgba(212,175,55,0.3)', borderRadius:'6px', color:'#d4af37', fontSize:'0.6rem', fontWeight:'600', cursor:'pointer' }}>Receipt</button>
            )}
          </div>
          </div>
        </div>
        {!isWalkIn && totalVisits > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', background: isReturning?'rgba(212,175,55,0.08)':'rgba(76,175,80,0.08)', borderRadius:'10px', border:'1px solid '+(isReturning?'rgba(212,175,55,0.25)':'rgba(76,175,80,0.25)') }}>
            <span style={{ fontSize:'1.4rem' }}>{isReturning ? '⭐' : '🆕'}</span>
            <div>
              <div style={{ fontSize:'0.78rem', fontWeight:'700', color: isReturning?'#d4af37':'#4caf50' }}>
                {isReturning ? `Returning customer · ${totalVisits} visits` : 'New customer'}
              </div>
              {isReturning && booking.status !== 'CHECKED_OUT' && (
                <div style={{ fontSize:'0.65rem', color:'var(--muted)' }}>This will be their {visitOrdinal(clientVisits+1)} visit</div>
              )}
            </div>
          </div>
        )}
        <div style={{ display:'flex', flexDirection:'column', gap:'1px', background:'rgba(212,175,55,0.06)', borderRadius:'10px', overflow:'hidden' }}>
          {[
            { label:'Service', value:serviceLabel },
            { label:'Date', value:booking.date },
            { label:'Time', value:booking.time },
            { label:'Barber', value:(booking.barber||'').toUpperCase() },
            { label:'Phone', value:booking.phone },
            { label:'Email', value:booking.email },
            { label:'Paid', value:booking.paidAmount||booking.price, color:'#4caf50' },
            { label:'Source', value:booking.source||'Website', color: booking.source==='Booksy'?'#9c27b0': booking.source==='Fresha'?'#2196f3': booking.source==='Manual'?'#ff9800':'#4caf50' },
            { label:'ID', value:booking.bookingId||('WCB-'+Math.random().toString(36).substr(2,6).toUpperCase()) },
          ].map((item,i)=>(
            <div key={item.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:i%2===0?'rgba(0,0,0,0.1)':'transparent', gap:'8px' }}>
              <span style={{ fontSize:'0.68rem', color:'var(--muted)', flexShrink:0 }}>{item.label}</span>
              <span style={{ fontSize:'0.72rem', color:item.color||'var(--text)', fontWeight:'500', textAlign:'right', wordBreak:'break-all' }}>{item.value||'--'}</span>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={()=>{ setEditing(true); setTimeout(()=>{ onEdit(booking); setEditing(false); }, 300); }} disabled={editing||deleting}
            style={{ flex:1, padding:'10px', background:'rgba(212,175,55,0.1)', border:'1px solid rgba(212,175,55,0.3)', borderRadius:'8px', color:'#d4af37', cursor:editing||deleting?'not-allowed':'pointer', fontSize:'0.75rem', fontWeight:'600', transition:'all 0.2s' }}
            onMouseEnter={e=>{ if(!editing&&!deleting) e.currentTarget.style.background='rgba(212,175,55,0.2)'; }}
            onMouseLeave={e=>{ if(!editing&&!deleting) e.currentTarget.style.background='rgba(212,175,55,0.1)'; }}>Edit</button>
         <button onClick={async()=>{
              if(!window.confirm('Delete this booking?')) return;
              setDeleting(true);
              try {
                await deleteBooking(booking.bookingId);
              } catch(err) {
                console.error('Delete error:', err);
              } finally {
                setDeleting(false);
                onDelete(booking);
              }
            }} disabled={deleting||editing}
            style={{ flex:1, padding:'10px', background:'rgba(255,82,82,0.1)', border:'1px solid rgba(255,82,82,0.3)', borderRadius:'8px', color:'#ff5252', cursor:deleting||editing?'not-allowed':'pointer', fontSize:'0.75rem', fontWeight:'600', transition:'all 0.2s' }}
            onMouseEnter={e=>{ if(!deleting&&!editing) e.currentTarget.style.background='rgba(255,82,82,0.2)'; }}
            onMouseLeave={e=>{ if(!deleting&&!editing) e.currentTarget.style.background='rgba(255,82,82,0.1)'; }}>Delete</button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
          {booking.status !== 'CHECKED_OUT' ? (
            <button onClick={onCheckout}
              style={{ width:'100%', padding:'11px', background:'linear-gradient(135deg,#d4af37,#b8860b)', border:'none', borderRadius:'8px', color:'#000', cursor:'pointer', fontSize:'0.82rem', fontWeight:'700', marginBottom:'2px' }}
              onMouseEnter={e=>e.currentTarget.style.opacity='0.9'}
              onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
              Checkout
            </button>
          ) : (
            <div style={{ width:'100%', padding:'11px', background:'rgba(76,175,80,0.1)', border:'1px solid rgba(76,175,80,0.3)', borderRadius:'8px', color:'#4caf50', fontSize:'0.82rem', fontWeight:'700', textAlign:'center', marginBottom:'2px' }}>
              Checked Out
            </div>
          )}
          <a href={'https://wa.me/'+String(booking.phone||'').replace(/[\s+\-()]/g,'')} target="_blank" rel="noreferrer"
            style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'10px', background:'#25D36610', border:'1px solid #25D36630', borderRadius:'8px', color:'#25D366', fontSize:'0.75rem', textDecoration:'none', fontWeight:'600' }}
            onMouseEnter={e=>e.currentTarget.style.background='#25D36620'}
            onMouseLeave={e=>e.currentTarget.style.background='#25D36610'}>WhatsApp</a>
          <a href={'mailto:'+booking.email}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'10px', background:'rgba(212,175,55,0.06)', border:'1px solid var(--border)', borderRadius:'8px', color:'#d4af37', fontSize:'0.75rem', textDecoration:'none', fontWeight:'600' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(212,175,55,0.12)'}
            onMouseLeave={e=>e.currentTarget.style.background='rgba(212,175,55,0.06)'}>Email</a>
        </div>
      </div>
    </div>
  );
}

function BookingForm({ preBarber, preHour, preMins, preDate, preBooking, barbers, existingBookings, onClose, onSaved }) {
  const isEdit = !!preBooking;
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [form, setForm] = useState(() => {
    if (isEdit) {
      const parts = (preBooking.date || '').split(' ');
      const months2 = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const dy = (parts[0] || '1').padStart(2,'0');
      const mo = String(months2.indexOf(parts[1]) + 1).padStart(2,'0');
      const yr = parts[2] || new Date().getFullYear();
      let existingCode = '+44', existingLocal = String(preBooking.phone || '');
      for (const c of COUNTRY_CODES) {
        if (existingLocal.startsWith(c.code)) { existingCode = c.code; existingLocal = existingLocal.slice(c.code.length).trim(); break; }
      }
      return { name:preBooking.name||'', email:preBooking.email||'', phone:preBooking.phone||'', service:preBooking.service||(config.services?config.services[0].id:''), barber:(preBooking.barber||'').toLowerCase(), date:yr+'-'+mo+'-'+dy, time:preBooking.time||'9:00 AM', paymentType:preBooking.paymentType||'CASH', _countryCode:existingCode, _phoneLocal:existingLocal };
    }
    return { name:'', email:'', phone:'', service:config.services?config.services[0].id:'', barber:preBarber?preBarber.name.toLowerCase():(barbers[0]?barbers[0].name.toLowerCase():''), date:preDate?preDate.toISOString().split('T')[0]:new Date().toISOString().split('T')[0], time:preHour!==undefined?minsToLabel(preHour*60+(preMins||0)):'9:00 AM', paymentType:'CASH', _countryCode:'+44', _phoneLocal:'' };
  });
  const [saving, setSaving] = useState(false);
  const [allClients, setAllClients] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const map = {};
    (existingBookings || []).forEach(b => {
      if (!b.name || b.name === 'Walk-in') return;
      const key = b.phone || b.email || b.name;
      if (!map[key]) map[key] = { name: b.name, phone: b.phone || '', email: b.email || '', visits: 0, totalSpent: 0 };
      const c = map[key];
      if (b.status !== 'CANCELLED') {
        c.visits++;
        const _deposit = b.source === 'Booksy' && config.platforms?.booksy?.depositEnabled ? (config.platforms.booksy.depositAmount || 0) : 0;
        const _raw = parseFloat(String(b.paidAmount || b.price || '0').replace('£', '')) || 0;
        c.totalSpent += b.source === 'Booksy' ? (b.status === 'CHECKED_OUT' ? _raw + _deposit : _deposit) : _raw;
      }
    });
    getDocs(collection(db, 'tenants/whitecross/clients'))
      .then(snap => {
        snap.docs.forEach(d => { const m = d.data(); if (m.hidden) return; const key = m.phone || m.email || m.name; if (!map[key]) map[key] = { name: m.name || '', phone: m.phone || '', email: m.email || '', visits: 0, totalSpent: 0 }; });
        setAllClients(Object.values(map));
      })
      .catch(() => setAllClients(Object.values(map)));
  }, [existingBookings]);

  const suggestions = !isEdit && form.name.length > 1
    ? allClients.filter(c => c.name.toLowerCase().includes(form.name.toLowerCase()) || c.phone.includes(form.name))
    : [];

  const handlePhoneChange = (local) => {
    const digits = local.replace(/[^\d\s]/g, '');
    setForm(f => ({ ...f, _phoneLocal:digits, phone:f._countryCode+digits.replace(/\s/g,'') }));
  };
  const handleCountryChange = (code) => {
    setForm(f => ({ ...f, _countryCode:code, phone:code+(f._phoneLocal||'').replace(/\s/g,'') }));
  };
  const validateEmail = (email) => {
    if (!email) return '';
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'Invalid email format';
  };
  const validatePhone = (phone) => {
    if (!phone) return '';
    const digits = String(phone).replace(/[\s+\-()]/g, '');
    return digits.length >= 10 ? '' : 'Phone number too short';
  };

  const busySlots = (existingBookings || []).filter(b => {
    if (b.status === 'CANCELLED') return false;
    if (isEdit && b.bookingId === preBooking?.bookingId) return false;
    const [yr2, mo2, dy2] = (form.date || '').split('-');
    const months2 = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const formDateStr = parseInt(dy2) + ' ' + months2[parseInt(mo2)-1] + ' ' + yr2;
    if (b.date !== formDateStr) return false;
    if ((b.barber||'').toLowerCase() !== form.barber) return false;
    return true;
  }).map(b => {
    const svc = config.services ? config.services.find(s => s.id === b.service) : null;
    const duration = (svc && svc.duration) || 30;
    return { start: convertTo24(b.time), end: convertTo24(b.time) + duration };
  });

  const now = new Date();
  const [yr, mo, dy] = (form.date || '').split('-');
  const isFormToday = parseInt(yr)===now.getFullYear() && parseInt(mo)-1===now.getMonth() && parseInt(dy)===now.getDate();
  const hours = [];
for (let h = 9; h <= 19; h++) {
  [0, 15, 30, 45].forEach(m => {
    if (h === 19 && m > 0) return;
    hours.push({ label: minsToLabel(h * 60 + m) });
  });
}
const handleSave = async (goCheckout = false) => {
  const eErr = validateEmail(form.email);
  const pErr = validatePhone(form.phone);
  setEmailError(eErr); setPhoneError(pErr);
  if (eErr || pErr) return;
  if (!form.name.trim() || !form.service) return;
  const today = new Date().toISOString().split('T')[0];
  if (!isEdit && form.date < today) { alert('Cannot book a past date.'); return; }
  const selectedMins = convertTo24(form.time);
  if (!isEdit && busySlots.some(slot => selectedMins >= slot.start && selectedMins < slot.end)) { alert('This time slot is already booked.'); return; }
  setSaving(true);
  const service = config.services ? config.services.find(s => s.id === form.service) : null;
  const price = service ? service.price : 0;
  const duration = service ? (parseInt(service.duration) || 30) : 30;
  const [yr2, mo2, dy2] = form.date.split('-');
  const months2 = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dateStr = parseInt(dy2) + ' ' + months2[parseInt(mo2)-1] + ' ' + yr2;
  const bookingData = { name:form.name, email:form.email||'', phone:form.phone||'Walk-in', date:dateStr, time:form.time, service:form.service, barber:form.barber, paymentType:form.paymentType||'CASH', status:'CONFIRMED', bookingId:isEdit?preBooking.bookingId:'WCB-'+Date.now(), price:price, paidAmount:isEdit?(preBooking.paidAmount||''):'', remaining:'Fully paid', source:isEdit?(preBooking.source||'Walk-in'):'Walk-in' };
  try {
    if (isEdit) {
      await editBooking({
        bookingId: bookingData.bookingId,
        name: bookingData.name,
        email: bookingData.email,
        phone: bookingData.phone,
        date: bookingData.date,
        time: bookingData.time,
        service: bookingData.service,
        barber: bookingData.barber,
        duration,
      });
    } else {
      const newId = await createWalkIn({
        name: bookingData.name,
        email: bookingData.email,
        phone: bookingData.phone,
        date: bookingData.date,
        time: bookingData.time,
        service: bookingData.service,
        barber: bookingData.barber,
        price: bookingData.price,
        paymentType: bookingData.paymentType,
        source: 'Walk-in',
        duration,
      });
      bookingData.bookingId = newId;
    }
    if (onSaved) onSaved(bookingData, goCheckout);
    if (!goCheckout && onClose) onClose();
  } catch (err) {
    console.log('Save note:', err);
    if (onSaved) onSaved(bookingData, goCheckout);
    if (!goCheckout && onClose) onClose();
  } finally { setSaving(false); }
};
  const inp = { width:'100%', padding:'10px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'0.85rem', outline:'none', boxSizing:'border-box' };
  const lbl = { display:'block', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'5px', fontWeight:'600' };
  const errStyle = { fontSize:'0.62rem', color:'#ff5252', marginTop:'4px' };

  return (
    <div style={{ width:'310px', flexShrink:0, background:'var(--card2)', border:'1px solid rgba(212,175,55,0.25)', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', maxHeight:'calc(100vh - 200px)', boxShadow:'0 8px 32px rgba(0,0,0,0.4)', position:'relative' }}>
      {saving && (
        <div style={{ position:'absolute', inset:0, background:'rgba(10,10,8,0.85)', zIndex:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'12px', borderRadius:'16px' }}>
          <div style={{ width:'36px', height:'36px', border:'3px solid rgba(212,175,55,0.2)', borderTop:'3px solid #d4af37', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
          <span style={{ fontSize:'0.78rem', color:'#d4af37', fontWeight:'600', letterSpacing:'1px' }}>{isEdit ? 'Saving changes...' : 'Booking...'}</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(212,175,55,0.04)', flexShrink:0 }}>
        <span style={{ fontSize:'0.85rem', fontWeight:'700', color:'#d4af37' }}>{isEdit ? 'Edit Booking' : 'New Booking'}</span>
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'1rem', width:'24px', height:'24px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%' }}>x</button>
      </div>
      <div style={{ overflowY:'auto', flex:1, padding:'16px 20px', display:'flex', flexDirection:'column', gap:'12px' }}>
        <div style={{ position:'relative' }}>
          <label style={lbl}>Customer Name *</label>
          <input value={form.name}
            onChange={e=>{ setForm({...form,name:e.target.value}); setShowSuggestions(true); }}
            onBlur={()=>setTimeout(()=>setShowSuggestions(false),150)}
            placeholder="Full name or search existing..." style={inp} />
          {showSuggestions && suggestions.length > 0 && (
            <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', zIndex:30, boxShadow:'0 8px 24px rgba(0,0,0,0.4)', maxHeight:'200px', overflowY:'auto', marginTop:'4px' }}>
              {suggestions.map((c,i) => (
                <div key={i} onClick={()=>{
                  let code='+44', local=String(c.phone||'');
                  for (const cc of COUNTRY_CODES) { if(local.startsWith(cc.code)){code=cc.code;local=local.slice(cc.code.length).trim();break;} }
                  setForm({...form, name:c.name, email:c.email||'', phone:c.phone||'', _countryCode:code, _phoneLocal:local});
                  setShowSuggestions(false);
                }}
                style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(212,175,55,0.08)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div>
                    <div style={{ fontSize:'0.82rem', fontWeight:'600', color:'var(--text)' }}>{c.name}</div>
                    <div style={{ fontSize:'0.62rem', color:'var(--muted)' }}>{c.phone}{c.visits>0?' · '+c.visits+' visits':''}</div>
                  </div>
                  {c.totalSpent>0 && <span style={{ fontSize:'0.68rem', color:'#d4af37', fontWeight:'600' }}>£{c.totalSpent.toFixed(0)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <label style={lbl}>Phone</label>
          <div style={{ display:'flex', gap:'6px' }}>
            <select value={form._countryCode} onChange={e=>handleCountryChange(e.target.value)} style={{ ...inp, width:'80px', flexShrink:0, padding:'10px 6px', cursor:'pointer' }}>
              {COUNTRY_CODES.map(c=><option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
            </select>
            <input value={form._phoneLocal} onChange={e=>handlePhoneChange(e.target.value)} placeholder="7700 000000" type="tel" style={{ ...inp, flex:1 }} onBlur={()=>setPhoneError(validatePhone(form.phone))} />
          </div>
          {phoneError && <div style={errStyle}>{phoneError}</div>}
        </div>
        <div>
          <label style={lbl}>Email</label>
          <input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="email@example.com" type="email" style={{ ...inp, borderColor:emailError?'#ff525240':'var(--border)' }} onBlur={()=>setEmailError(validateEmail(form.email))} />
          {emailError && <div style={errStyle}>{emailError}</div>}
        </div>
        <div>
          <label style={lbl}>Service *</label>
          <select value={form.service} onChange={e=>setForm({...form,service:e.target.value})} style={{ ...inp, cursor:'pointer' }}>
            {(config.services||[]).map(s=><option key={s.id} value={s.id}>{s.name} -- {s.price}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Barber</label>
          <div style={{ display:'flex', gap:'6px' }}>
            {barbers.map(b=>(
              <button key={b.id} onClick={()=>setForm({...form,barber:b.name.toLowerCase()})}
                style={{ flex:1, padding:'9px', borderRadius:'8px', border:'1px solid '+(form.barber===b.name.toLowerCase()?b.color:'var(--border)'), background:form.barber===b.name.toLowerCase()?b.color+'20':'transparent', color:form.barber===b.name.toLowerCase()?b.color:'var(--muted)', cursor:'pointer', fontSize:'0.78rem', fontWeight:'600', transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px' }}>
                <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:b.color }} />{b.name}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
          <div>
            <label style={lbl}>Date</label> 
        <input type="date" value={form.date} min={isEdit ? undefined : new Date().toISOString().split('T')[0]} onChange={e=>setForm({...form,date:e.target.value})} style={inp} />
          </div>
          <div>
            <label style={lbl}>Time</label>
            <select value={form.time} onChange={e=>setForm({...form,time:e.target.value})} style={{ ...inp, cursor:'pointer' }}>
              {hours.map(h=><option key={h.label} value={h.label} disabled={h.isBusy}>{h.label}{h.isBusy?' - Busy':''}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={lbl}>Payment</label>
        </div>
        <div style={{ display:'flex', gap:'8px', paddingTop:'4px' }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--muted)', cursor:'pointer', fontSize:'0.82rem' }}>Cancel</button>
            <button onClick={()=>handleSave(false)} disabled={saving||!form.name.trim()}            
            style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid rgba(212,175,55,0.3)', borderRadius:'8px', color:'#d4af37', cursor:saving||!form.name.trim()?'not-allowed':'pointer', fontWeight:'600', fontSize:'0.82rem' }}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Save'}
          </button>
          {!isEdit && (
              <button onClick={()=>handleSave(true)} disabled={saving||!form.name.trim()}
              style={{ flex:2, padding:'11px', background:saving||!form.name.trim()?'rgba(212,175,55,0.25)':'linear-gradient(135deg,#d4af37,#b8860b)', border:'none', borderRadius:'8px', color:saving||!form.name.trim()?'var(--muted)':'#000', cursor:saving||!form.name.trim()?'not-allowed':'pointer', fontWeight:'700', fontSize:'0.82rem' }}>
              Checkout
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
function SlotPopup({ popup, onNewBooking, onWalkIn, onBlockTime, onClose }) {
  if (!popup) return null;
  return (
    <div style={{ position:'fixed', top:popup.y, left:popup.x, zIndex:1000, background:'var(--card)', border:'1px solid rgba(212,175,55,0.3)', borderRadius:'10px', padding:'6px', minWidth:'170px', boxShadow:'0 8px 24px rgba(0,0,0,0.6)' }}
      onMouseLeave={onClose}>
      <div style={{ fontSize:'0.62rem', color:'var(--muted)', padding:'4px 10px 6px', letterSpacing:'1px', borderBottom:'1px solid var(--border)', marginBottom:'4px' }}>
      {minsToLabel(popup.mins || popup.hour * 60)} -- {popup.barber.name}
      </div>
      {[
        { label:'📅 New Booking', action: onNewBooking },
        { label:'🚶 Walk-in', action: onWalkIn },
        { label:'🚫 Block Time', action: onBlockTime },
      ].map(item => (
        <button key={item.label} onClick={item.action}
          style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'8px 10px', background:'transparent', border:'none', color:'var(--text)', cursor:'pointer', borderRadius:'6px', fontSize:'0.78rem', textAlign:'left' }}
          onMouseEnter={e=>e.currentTarget.style.background='rgba(212,175,55,0.1)'}
          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
function BlockTimeForm({ preBarber, preHour, preDate, barbers, onClose, onSaved }) {
  const [barber, setBarber] = useState(preBarber ? preBarber.name.toLowerCase() : (barbers[0] ? barbers[0].name.toLowerCase() : ''));
  const [saving, setSaving] = useState(false);
  const date = preDate ? (preDate.getDate() + ' ' + preDate.toLocaleDateString('en-GB', {month:'long'}) + ' ' + preDate.getFullYear()) : formatDateKey(new Date());
  const defaultTime = preHour !== undefined ? minsToLabel(preHour * 60) : '9:00 AM';
  const [startTime, setStartTime] = useState(defaultTime);
  const [endTime, setEndTime] = useState(preHour !== undefined ? minsToLabel((preHour + 1) * 60) : '10:00 AM');

  const hours = [];
  for (let h = 9; h <= 19; h++) {
  [0, 15, 30, 45].forEach(m => {
  if (h === 19 && m > 0) return;
  hours.push({ label: minsToLabel(h * 60 + m) });
    });
  }

const handleSave = async () => {
    const startMins = convertTo24(startTime);
    const endMins = convertTo24(endTime);
    if (endMins <= startMins) {
      alert('End time must be after start time');
      return;
    }
    setSaving(true);
    try {
      const blockId = await blockTime({
        date,
        startTime,
        endTime,
        barber,
        note: '',
      });
      if (onSaved) onSaved({ bookingId: blockId, status: 'BLOCKED', barber, date, time: startTime, endTime });
      if (onClose) onClose();
    } catch(err) {
      console.error('BlockTime error:', err);
    } finally {
      setSaving(false);
    }
  };

  const inp = { width:'100%', padding:'10px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'0.85rem', outline:'none', boxSizing:'border-box' };
  const lbl = { display:'block', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'5px', fontWeight:'600' };

  return (
    <div style={{ width:'310px', flexShrink:0, background:'var(--card2)', border:'1px solid rgba(212,175,55,0.25)', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', maxHeight:'calc(100vh - 200px)', boxShadow:'0 8px 32px rgba(0,0,0,0.4)', position:'relative' }}>
      {saving && (
        <div style={{ position:'absolute', inset:0, background:'rgba(10,10,8,0.85)', zIndex:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'12px', borderRadius:'16px' }}>
          <div style={{ width:'36px', height:'36px', border:'3px solid rgba(212,175,55,0.2)', borderTop:'3px solid #d4af37', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
          <span style={{ fontSize:'0.78rem', color:'#d4af37', fontWeight:'600', letterSpacing:'1px' }}>Blocking...</span>
        </div>
      )}
      <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(212,175,55,0.04)', flexShrink:0 }}>
        <span style={{ fontSize:'0.85rem', fontWeight:'700', color:'#d4af37' }}>🚫 Block Time</span>
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'1rem' }}>x</button>
      </div>
      <div style={{ overflowY:'auto', flex:1, padding:'16px 20px', display:'flex', flexDirection:'column', gap:'14px' }}>
        <div>
          <label style={lbl}>Barber</label>
          <div style={{ display:'flex', gap:'6px' }}>
            {barbers.map(b => (
              <button key={b.id} onClick={() => setBarber(b.name.toLowerCase())}
                style={{ flex:1, padding:'9px', borderRadius:'8px', border:'1px solid '+(barber===b.name.toLowerCase()?b.color:'var(--border)'), background:barber===b.name.toLowerCase()?b.color+'20':'transparent', color:barber===b.name.toLowerCase()?b.color:'var(--muted)', cursor:'pointer', fontSize:'0.78rem', fontWeight:'600', transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px' }}>
                <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:b.color }} />{b.name}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
          <div>
            <label style={lbl}>From</label>
            <select value={startTime} onChange={e => setStartTime(e.target.value)} style={{ ...inp, cursor:'pointer' }}>
              {hours.map(h => <option key={h.label} value={h.label}>{h.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>To</label>
            <select value={endTime} onChange={e => setEndTime(e.target.value)} style={{ ...inp, cursor:'pointer' }}>
              {hours.map(h => <option key={h.label} value={h.label}>{h.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ padding:'10px 12px', background:'rgba(255,82,82,0.06)', borderRadius:'8px', border:'1px solid rgba(255,82,82,0.2)' }}>
          <span style={{ fontSize:'0.75rem', color:'var(--muted)' }}>Blocking: <span style={{ color:'#ff5252', fontWeight:'600' }}>{startTime} - {endTime}</span></span>
        </div>
        <div style={{ display:'flex', gap:'8px', paddingTop:'4px' }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--muted)', cursor:'pointer', fontSize:'0.82rem' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex:2, padding:'11px', background:saving?'rgba(212,175,55,0.25)':'linear-gradient(135deg,#d4af37,#b8860b)', border:'none', borderRadius:'8px', color:saving?'var(--muted)':'#000', cursor:saving?'not-allowed':'pointer', fontWeight:'700', fontSize:'0.82rem' }}>
            {saving ? 'Blocking...' : 'Block'}
          </button>
        </div>
      </div>
    </div>
  );
}

function WalkInForm({ preBarber, preHour, preMins, preDate, barbers, existingBookings, onClose, onSaved }) {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [showClientList, setShowClientList] = useState(false);
  const [service, setService] = useState(config.services ? config.services[0].id : '');
  const [barber, setBarber] = useState(preBarber ? preBarber.name.toLowerCase() : (barbers[0] ? barbers[0].name.toLowerCase() : ''));
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const defaultTime = minsToLabel(preHour !== undefined ? preHour * 60 + (preMins || 0) : Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15);
  const [time, setTime] = useState(defaultTime);
  const date = preDate ? (preDate.getDate() + ' ' + preDate.toLocaleDateString('en-GB', {month:'long'}) + ' ' + preDate.getFullYear()) : formatDateKey(new Date());

  useEffect(() => {
    const map = {};
    (existingBookings || []).forEach(b => {
      if (!b.name || b.name === 'Walk-in') return;
      const key = b.phone || b.email || b.name;
      if (!map[key]) map[key] = { name: b.name, phone: b.phone || '', email: b.email || '', visits: 0, totalSpent: 0, lastService: '' };
      const c = map[key];
      if (b.status !== 'CANCELLED') {
        c.visits++;
        const _deposit = b.source === 'Booksy' && config.platforms?.booksy?.depositEnabled ? (config.platforms.booksy.depositAmount || 0) : 0;
        const _raw = parseFloat(String(b.paidAmount || b.price || '0').replace('£', '')) || 0;
        c.totalSpent += b.source === 'Booksy' ? (b.status === 'CHECKED_OUT' ? _raw + _deposit : _deposit) : _raw;
        c.lastService = b.service || c.lastService;
      }
    });
    getDocs(collection(db, 'tenants/whitecross/clients'))
      .then(snap => {
        snap.docs.forEach(d => { const m = d.data(); if (m.hidden) return; const key = m.phone || m.email || m.name; if (!map[key]) map[key] = { name: m.name || '', phone: m.phone || '', email: m.email || '', visits: 0, totalSpent: 0, lastService: '' }; });
        setClients(Object.values(map));
      })
      .catch(() => setClients(Object.values(map)));
  }, [existingBookings]);

  const filteredClients = clients.filter(c =>
    search.length > 1 && (
      (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
      String(c.phone || '').includes(search)
    )
  );

  const selectClient = (client) => {
    setSelectedClient(client);
    setSearch(client.name);
    setShowClientList(false);
  };

  const svc = config.services ? config.services.find(s => s.id === service) : null;
  const price = svc ? svc.price : 0;

  const hours = [];
  for (let h = 9; h <= 19; h++) {
    [0, 30].forEach(m => {
      if (h === 19 && m > 0) return;
      hours.push({ label: minsToLabel(h * 60 + m) });
    });
  }

  const handleSave = async (goCheckout = false) => {
    if (!service) return;
    setSaving(true);
    const svc = config.services ? config.services.find(s => s.id === service) : null;
    const price = svc ? svc.price : 0;
    const duration = svc ? (parseInt(svc.duration) || 30) : 30;
    const bookingData = {
      name: selectedClient ? selectedClient.name : (search.trim() || 'Walk-in'),
      email: selectedClient ? selectedClient.email : email.trim(),
      phone: selectedClient ? selectedClient.phone : phone.trim(),
      date,
      time,
      service,
      barber,
      price,
      duration,
      paymentType: 'CASH',
      status: 'CONFIRMED',
      source: 'Walk-in',
    };
    try {
      const bookingId = await createWalkIn(bookingData);
      bookingData.bookingId = bookingId;
      if (onSaved) onSaved(bookingData, goCheckout);
      if (!goCheckout && onClose) onClose();
    } catch(err) {
      console.error('WalkIn error:', err);
      if (onSaved) onSaved(bookingData, goCheckout);
      if (!goCheckout && onClose) onClose();
    } finally {
      setSaving(false);
    }
  };

  const inp = { width:'100%', padding:'10px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'0.85rem', outline:'none', boxSizing:'border-box' };
  const lbl = { display:'block', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'5px', fontWeight:'600' };

  return (
    <div style={{ width:'310px', flexShrink:0, background:'var(--card2)', border:'1px solid rgba(212,175,55,0.25)', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', maxHeight:'calc(100vh - 200px)', boxShadow:'0 8px 32px rgba(0,0,0,0.4)', position:'relative' }}>
      {saving && (
        <div style={{ position:'absolute', inset:0, background:'rgba(10,10,8,0.85)', zIndex:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'12px', borderRadius:'16px' }}>
          <div style={{ width:'36px', height:'36px', border:'3px solid rgba(212,175,55,0.2)', borderTop:'3px solid #d4af37', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
          <span style={{ fontSize:'0.78rem', color:'#d4af37', fontWeight:'600', letterSpacing:'1px' }}>Saving...</span>
        </div>
      )}
      <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(212,175,55,0.04)', flexShrink:0 }}>
        <span style={{ fontSize:'0.85rem', fontWeight:'700', color:'#d4af37' }}>🚶 Walk-in</span>
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'1rem' }}>x</button>
      </div>

      <div style={{ overflowY:'auto', flex:1, padding:'16px 20px', display:'flex', flexDirection:'column', gap:'14px' }}>

        {/* Client search */}
        <div style={{ position:'relative' }}>
          <label style={lbl}>Client (optional)</label>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setShowClientList(true); setSelectedClient(null); }}
            placeholder="Search name or phone..."
            style={inp}
          />
          {showClientList && filteredClients.length > 0 && (
            <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', zIndex:20, boxShadow:'0 8px 24px rgba(0,0,0,0.3)', maxHeight:'180px', overflowY:'auto', marginTop:'4px' }}>
              {filteredClients.map((c, i) => (
                <div key={i} onClick={() => selectClient(c)}
                  style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(212,175,55,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <div>
                    <div style={{ fontSize:'0.82rem', fontWeight:'600', color:'var(--text)' }}>{c.name}</div>
                    <div style={{ fontSize:'0.65rem', color:'var(--muted)' }}>{c.phone} · {c.visits} visits</div>
                  </div>
                  <div style={{ fontSize:'0.65rem', color:'#d4af37' }}>{c.totalSpent}</div>
                </div>
              ))}
            </div>
          )}
          {selectedClient && (
            <div style={{ marginTop:'8px', padding:'8px 12px', background:'rgba(212,175,55,0.06)', borderRadius:'8px', border:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'0.78rem', fontWeight:'600', color:'var(--text)' }}>{selectedClient.name}</div>
                <div style={{ fontSize:'0.62rem', color:'var(--muted)' }}>{selectedClient.visits} visits · {selectedClient.totalSpent} spent · Last: {selectedClient.lastService}</div>
              </div>
              <button onClick={() => { setSelectedClient(null); setSearch(''); }} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'0.8rem' }}>✕</button>
            </div>
          )}
        </div>

        {/* Phone & Email — only when no existing client selected */}
        {!selectedClient && (
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            <div>
              <label style={lbl}>Phone <span style={{ color:'var(--muted)', fontWeight:'400', textTransform:'none', letterSpacing:0 }}>(optional)</span></label>
              <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+44 7..." style={inp} type="tel" />
            </div>
            <div>
              <label style={lbl}>Email <span style={{ color:'var(--muted)', fontWeight:'400', textTransform:'none', letterSpacing:0 }}>(optional)</span></label>
              <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@..." style={inp} type="email" />
            </div>
          </div>
        )}

        {/* Service */}
        <div>
          <label style={lbl}>Service *</label>
          <select value={service} onChange={e => setService(e.target.value)} style={{ ...inp, cursor:'pointer' }}>
            {(config.services || []).map(s => (
              <option key={s.id} value={s.id}>{s.name} — £{s.price}</option>
            ))}
          </select>
        </div>

        {/* Barber */}
        <div>
          <label style={lbl}>Barber</label>
          <div style={{ display:'flex', gap:'6px' }}>
            {barbers.map(b => (
              <button key={b.id} onClick={() => setBarber(b.name.toLowerCase())}
                style={{ flex:1, padding:'9px', borderRadius:'8px', border:'1px solid '+(barber===b.name.toLowerCase()?b.color:'var(--border)'), background:barber===b.name.toLowerCase()?b.color+'20':'transparent', color:barber===b.name.toLowerCase()?b.color:'var(--muted)', cursor:'pointer', fontSize:'0.78rem', fontWeight:'600', transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px' }}>
                <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:b.color }} />{b.name}
              </button>
            ))}
          </div>
        </div>

        {/* Time */}
        <div>
          <label style={lbl}>Time</label>
          <select value={time} onChange={e => setTime(e.target.value)} style={{ ...inp, cursor:'pointer' }}>
            {hours.map(h => <option key={h.label} value={h.label}>{h.label}</option>)}
          </select>
        </div>

        {/* Price preview */}
        {svc && (
          <div style={{ padding:'10px 14px', background:'rgba(212,175,55,0.06)', borderRadius:'8px', border:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:'0.78rem', color:'var(--muted)' }}>{svc.name} · {svc.duration}min</span>
            <span style={{ fontSize:'0.88rem', fontWeight:'700', color:'#d4af37' }}>£{svc.price}</span>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display:'flex', gap:'8px', paddingTop:'4px' }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--muted)', cursor:'pointer', fontSize:'0.82rem' }}>Cancel</button>
          <button onClick={() => handleSave(false)} disabled={saving || !service}
            style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid rgba(212,175,55,0.3)', borderRadius:'8px', color:'#d4af37', cursor:saving||!service?'not-allowed':'pointer', fontWeight:'600', fontSize:'0.82rem' }}>
            Save
          </button>
          <button onClick={() => handleSave(true)} disabled={saving || !service}
            style={{ flex:2, padding:'11px', background:saving||!service?'rgba(212,175,55,0.25)':'linear-gradient(135deg,#d4af37,#b8860b)', border:'none', borderRadius:'8px', color:saving||!service?'var(--muted)':'#000', cursor:saving||!service?'not-allowed':'pointer', fontWeight:'700', fontSize:'0.82rem' }}>
            Checkout
          </button>
        </div>
      </div>
    </div>
  );
}
// ── RECEIPT PANEL ─────────────────────────────────────────────────────────
function ReceiptPanel({ booking, barbers, clientData, onClose, onEdit }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  if (!booking) return null;

  const svc = config.services ? config.services.find(s => s.id === booking.service) : null;
  const basePrice = svc ? svc.price : (parseInt(String(booking.price || '0').replace('£', '')) || 0);
  const paidAmount = parseFloat(String(booking.paidAmount || booking.price || '0').replace('£', '')) || 0;
  const discount = parseFloat(String(booking.discount || '0').replace('£', '').replace('-', '')) || 0;
  const tip = parseFloat(String(booking.tip || '0').replace('£', '')) || 0;
  const paymentMethod = booking.paymentMethod || booking.paymentType || 'CASH';
  const barberColor = getBColor(booking.barber, barbers);

  const visits = clientData ? (parseInt(clientData.visits) || 0) : 0;
  const totalSpent = clientData ? (parseFloat(String(clientData.totalSpent || '0').replace('£', '')) || 0) : 0;
  const loyaltyTarget = 10;
  const loyaltyProgress = Math.min((visits / loyaltyTarget) * 100, 100);
  const isVIP = visits >= 10 || totalSpent >= 500;
  const nextMilestone = visits < 5 ? 5 : visits < 10 ? 10 : null;
  const discountAtMilestone = visits >= 5 && visits < 10 ? '10% discount active' : visits >= 10 ? 'Free service earned' : nextMilestone ? `${nextMilestone - visits} more visits for ${nextMilestone === 5 ? '10% discount' : 'free service'}` : '';

  const handleSendEmail = async () => {
    if (!booking.email) { alert('No email address for this customer.'); return; }
    setSending(true);
    const params = new URLSearchParams({ action:'sendReceipt', bookingId:booking.bookingId, email:booking.email, name:booking.name, service:svc?svc.name:booking.service, barber:booking.barber, date:booking.date, time:booking.time, total:paidAmount, discount:discount, tip:tip, paymentMethod:paymentMethod, visits:visits });
    try {
      await fetch(config.scriptUrl + '?' + params.toString(), { mode:'no-cors' });
      await new Promise(resolve => setTimeout(resolve, 3000));
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } finally { setSending(false); }
  };

  const handlePrint = () => {
    const receiptHTML = `<!DOCTYPE html><html><head><title>Receipt - ${booking.name}</title><style>body{font-family:'Courier New',monospace;max-width:300px;margin:0 auto;padding:20px;color:#000;}.header{text-align:center;border-bottom:1px dashed #000;padding-bottom:10px;margin-bottom:10px;}.shop-name{font-size:14px;font-weight:bold;}.shop-info{font-size:10px;color:#555;}.row{display:flex;justify-content:space-between;margin:4px 0;font-size:12px;}.total-row{border-top:1px dashed #000;margin-top:8px;padding-top:8px;font-weight:bold;font-size:14px;}.footer{text-align:center;margin-top:16px;font-size:10px;color:#555;border-top:1px dashed #000;padding-top:10px;}.discount{color:#27500A;}</style></head><body><div class="header"><div class="shop-name">I CUT WHITECROSS BARBERS</div><div class="shop-info">136 Whitecross Street, London EC1Y 8QJ</div><div class="shop-info">${booking.date} · ${booking.time}</div></div><div class="row"><span>Customer</span><span>${booking.name}</span></div><div class="row"><span>Barber</span><span>${(booking.barber||'').toUpperCase()}</span></div><div class="row"><span>${svc?svc.name:booking.service}</span><span>£${basePrice.toFixed(2)}</span></div>${discount>0?`<div class="row discount"><span>Discount</span><span>-£${discount.toFixed(2)}</span></div>`:''}${tip>0?`<div class="row"><span>Tip</span><span>£${tip.toFixed(2)}</span></div>`:''}<div class="row total-row"><span>TOTAL</span><span>£${paidAmount.toFixed(2)}</span></div><div class="row"><span>Payment</span><span>${paymentMethod}</span></div><div class="footer"><div>Thank you for visiting!</div><div>whitecrossbarbers.com</div><div>Booking ID: ${booking.bookingId}</div></div></body></html>`;
    const win = window.open('', '_blank');
    win.document.write(receiptHTML);
    win.document.close();
    win.print();
  };

  return (
    <div style={{ width:'280px', flexShrink:0, background:'var(--card2)', border:'1px solid rgba(212,175,55,0.25)', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', maxHeight:'calc(100vh - 200px)', boxShadow:'0 8px 32px rgba(0,0,0,0.4)' }}>
      <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(212,175,55,0.04)', flexShrink:0 }}>
        <span style={{ fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'3px', textTransform:'uppercase', fontWeight:'600' }}>Receipt</span>
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'1rem' }}>x</button>
      </div>
      <div style={{ overflowY:'auto', flex:1, padding:'14px 18px', display:'flex', flexDirection:'column', gap:'12px' }}>
        <div style={{ textAlign:'center', paddingBottom:'12px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:'0.72rem', fontWeight:'700', color:'#d4af37', letterSpacing:'2px' }}>I CUT WHITECROSS BARBERS</div>
          <div style={{ fontSize:'0.6rem', color:'var(--muted)', marginTop:'3px' }}>136 Whitecross Street, London EC1Y 8QJ</div>
          <div style={{ fontSize:'0.6rem', color:'var(--muted)' }}>{booking.date} · {booking.time}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px', background:'rgba(212,175,55,0.04)', borderRadius:'8px' }}>
          <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:barberColor+'22', border:'1px solid '+barberColor+'44', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.85rem', fontWeight:'700', color:barberColor, flexShrink:0 }}>
            {(booking.name||'?')[0].toUpperCase()}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'0.82rem', fontWeight:'600', color:'var(--text)' }}>{booking.name}</div>
            <div style={{ fontSize:'0.62rem', color:'var(--muted)' }}>Barber: {(booking.barber||'').toUpperCase()}</div>
          </div>
          {isVIP && <span style={{ fontSize:'0.6rem', color:'#d4af37', background:'rgba(212,175,55,0.15)', padding:'2px 6px', borderRadius:'8px', fontWeight:'700' }}>VIP</span>}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:'0.78rem', color:'var(--text)' }}>{svc ? svc.name : booking.service}</span>
            <span style={{ fontSize:'0.78rem', color:'var(--text)' }}>£{basePrice.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:'0.72rem', color:'#4caf50' }}>Discount</span>
              <span style={{ fontSize:'0.72rem', color:'#4caf50' }}>-£{discount.toFixed(2)}</span>
            </div>
          )}
          {booking.source === 'Booksy' && paidAmount > 0 && (
            <>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>Deposit paid</span>
                <span style={{ fontSize:'0.72rem', color:'#4caf50' }}>£10.00 ✓</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>Remaining paid</span>
                <span style={{ fontSize:'0.72rem', color:'var(--text)' }}>£{(paidAmount - 10 - tip).toFixed(2)}</span>
              </div>
            </>
          )}
          {tip > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>Tip</span>
              <span style={{ fontSize:'0.72rem', color:'var(--text)' }}>£{tip.toFixed(2)}</span>
            </div>
          )}
        </div>
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:'10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:'0.88rem', fontWeight:'700', color:'var(--text)' }}>Total</span>
          <span style={{ fontSize:'1rem', fontWeight:'800', color:'#d4af37' }}>£{(booking.source === 'Booksy' ? basePrice - discount + tip : paidAmount).toFixed(2)}</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 12px', background:'rgba(212,175,55,0.06)', borderRadius:'8px' }}>
          <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>Payment</span>
          <span style={{ fontSize:'0.72rem', color:'var(--text)', fontWeight:'600' }}>{paymentMethod}</span>
        </div>
        {visits > 0 && (
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:'10px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
              <span style={{ fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1px', textTransform:'uppercase' }}>Loyalty</span>
              <span style={{ fontSize:'0.65rem', color:'#d4af37', fontWeight:'600' }}>{visits} visits · £{totalSpent.toFixed(0)} spent</span>
            </div>
            <div style={{ height:'6px', background:'rgba(212,175,55,0.1)', borderRadius:'3px', overflow:'hidden' }}>
              <div style={{ width:loyaltyProgress+'%', height:'100%', background:'#d4af37', borderRadius:'3px', transition:'width 0.5s' }} />
            </div>
            <div style={{ fontSize:'0.6rem', color:'var(--muted)', marginTop:'4px' }}>{discountAtMilestone}</div>
          </div>
        )}
        <div style={{ fontSize:'0.58rem', color:'var(--muted)', textAlign:'center' }}>ID: {booking.bookingId}</div>
        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
          <div style={{ display:'flex', gap:'6px' }}>
            <button onClick={handleSendEmail} disabled={sending}
              style={{ flex:1, padding:'10px', background:sent?'rgba(76,175,80,0.15)':'rgba(212,175,55,0.1)', border:'1px solid '+(sent?'rgba(76,175,80,0.4)':'rgba(212,175,55,0.3)'), borderRadius:'8px', color:sent?'#4caf50':'#d4af37', cursor:sending?'not-allowed':'pointer', fontSize:'0.72rem', fontWeight:'600', transition:'all 0.2s' }}>
              {sending ? '...' : sent ? 'Sent!' : 'Send Email'}
            </button>
            <button onClick={handlePrint}
              style={{ flex:1, padding:'10px', background:'rgba(212,175,55,0.06)', border:'1px solid var(--border)', borderRadius:'8px', color:'#d4af37', cursor:'pointer', fontSize:'0.72rem', fontWeight:'600' }}>
              Print
            </button>
          </div>
          <button onClick={onEdit}
            style={{ width:'100%', padding:'10px', background:'rgba(212,175,55,0.06)', border:'1px solid var(--border)', borderRadius:'8px', color:'#d4af37', cursor:'pointer', fontSize:'0.72rem', fontWeight:'600' }}>
            ✏️ Edit Checkout
          </button>
        </div>
      </div>
    </div>
  );
}
function TimeGrid({ date, bookings, barbers, slotHeight, onSlotClick, onWalkIn, onBlockTime, onBookingClick, selectedBooking }) {
    const nowRef = useRef(null);
  const [slotPopup, setSlotPopup] = useState(null);
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const dayName = DAYS[date.getDay()];
const savedHours = (() => { try { const h = localStorage.getItem('shopHours'); return h ? JSON.parse(h) : null; } catch { return null; } })();
const hoursConfig = savedHours || config.hours;
const dayHours = hoursConfig && hoursConfig[dayName];
const OPEN = dayHours && !dayHours.closed ? parseInt(dayHours.open.split(':')[0], 10) : 9;
const CLOSE = dayHours && !dayHours.closed ? parseInt(dayHours.close.split(':')[0], 10) : 19;
const IS_CLOSED = dayHours ? dayHours.closed : false;
  const GRID_START = 7, GRID_END = 21;
  const slots = [];
  for (let h = GRID_START; h < GRID_END; h++) {
    [0, 15, 30, 45].forEach(m => {
      slots.push({ h, m, mins: h * 60 + m });
    });
  }
  const isToday = date.toDateString() === new Date().toDateString();
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const TIME_COL = 56;

  const byBarber = {};
  barbers.forEach(b => { byBarber[b.id] = []; byBarber[b.name.toLowerCase()] = byBarber[b.id]; });
  bookings.forEach(b => { const key = (b.barber||'').toLowerCase(); if (byBarber[key]) byBarber[key].push(b); });

  useEffect(() => {
    if (isToday && nowRef.current) nowRef.current.scrollIntoView({ behavior:'smooth', block:'center' });
  }, [isToday]);

  const isPastHour = (h) => isToday && (h * 60 + 59) < nowMins;

  return (
<div style={{ flex:1, overflowY:'auto', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'12px', position:'relative' }}>
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', position:'sticky', top:0, background:'var(--card)', zIndex:10 }}>
        <div style={{ width:TIME_COL, flexShrink:0, borderRight:'1px solid var(--border)' }} />
        {barbers.map((barber, bi) => {
          const bookingDisabled = isBarberBookingDisabled(barber);
          return (
          <div key={barber.id} onClick={(e) => { if (bookingDisabled) return; const rect = e.currentTarget.getBoundingClientRect(); setSlotPopup({ barber, hour: OPEN, mins: OPEN * 60, x: rect.left + 10, y: rect.bottom }); }}
  style={{ flex:1, padding:'12px 16px', display:'flex', alignItems:'center', gap:'10px', borderRight:bi<barbers.length-1?'1px solid var(--border)':'none', cursor:bookingDisabled?'not-allowed':'pointer', opacity:bookingDisabled?0.6:1 }}
  onMouseEnter={e=>{ if (!bookingDisabled) e.currentTarget.style.background='rgba(212,175,55,0.04)'; }}
  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{ width:'30px', height:'30px', borderRadius:'50%', background:barber.color+'22', border:'1px solid '+barber.color+'44', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.82rem', fontWeight:'700', color:barber.color, flexShrink:0 }}>{barber.name[0]}</div>
            <div>
              <div style={{ fontSize:'0.85rem', fontWeight:'700', color:'var(--text)' }}>{barber.name}</div>
              <div style={{ fontSize:'0.62rem', color:'var(--muted)' }}>{bookingDisabled ? 'Booking Passive' : '9:00 -- 19:00'}</div>
            </div>
            <span style={{ fontSize:'0.65rem', color:'var(--muted)', marginLeft:'auto', background:'rgba(212,175,55,0.08)', padding:'2px 7px', borderRadius:'8px' }}>
              {bookingDisabled ? 'Locked' : (byBarber[barber.name.toLowerCase()]||[]).filter(b=>b.status!=='CANCELLED').length + ' appts'}
            </span>
          </div>
        );
        })}
      </div>
      <div style={{ display:'flex', position:'relative' }}>
        <div style={{ width:TIME_COL, flexShrink:0, borderRight:'1px solid var(--border)' }}>
          {slots.map(slot => (
            <div key={slot.mins} style={{ height:slotHeight, borderBottom:slot.m===0?'1px solid var(--border)':'1px solid rgba(212,175,55,0.06)', background:'transparent', position:'relative', display:'flex', alignItems:'flex-start', justifyContent:'flex-end', paddingRight:'6px' }}>
              {slot.m === 0 && (
                <span style={{ fontSize:'0.6rem', color:'var(--muted)', lineHeight:'1', marginTop:'2px', whiteSpace:'nowrap' }}>
                  {slot.h < 12 ? slot.h + ':00' : slot.h === 12 ? '12:00' : (slot.h - 12) + ':00'}{slot.h < 12 ? 'am' : 'pm'}
                </span>
              )}
            </div>
          ))}
        </div>
        {barbers.map((barber, bi) => {
          const bookingDisabled = isBarberBookingDisabled(barber);
          const barberBs = (byBarber[barber.name.toLowerCase()]||[]).filter(b=>b.status!=='CANCELLED');
          return (
            <div key={barber.id} style={{ flex:1, position:'relative', borderRight:bi<barbers.length-1?'1px solid var(--border)':'none' }}>
              {slots.map(slot => {
                const isOutsideHours = IS_CLOSED || slot.mins < OPEN * 60 || slot.mins >= CLOSE * 60;
                const past = isToday && slot.mins < nowMins;
                const inactive = past || isOutsideHours || bookingDisabled;
                return (
                  <div key={slot.mins}
                    onClick={(e) => { if (!inactive) { const rect = e.currentTarget.getBoundingClientRect(); setSlotPopup({ barber, hour: slot.h, mins: slot.mins, x: rect.left + 10, y: rect.top }); } }}
                    style={{ height:slotHeight, borderBottom:slot.m===0?'1px solid var(--border)':'1px solid rgba(212,175,55,0.06)', cursor:inactive?'default':'pointer', background:inactive?'var(--slot-past)':'var(--slot-bg)', transition:'background 0.1s', position:'relative' }}
                    onMouseEnter={e=>{ if(!inactive) e.currentTarget.style.background='var(--slot-hover)'; }}
                    onMouseLeave={e=>e.currentTarget.style.background=inactive?'var(--slot-past)':'var(--slot-bg)'}>
                    {inactive && <div style={{ position:'absolute', inset:0, background:'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.03) 4px, rgba(0,0,0,0.03) 8px)', pointerEvents:'none' }} />}
                  </div>
                );
              })}
              {barberBs.map((b,i) => {
                if (b.status === 'BLOCKED') {
                  const startMins = convertTo24(b.time || b.startTime);
                  if (!startMins) return null;
                  const endMins = b.endTime ? convertTo24(b.endTime) : startMins + 60;
                  const duration = Math.max(endMins - startMins, 30);
                  const top = (startMins - GRID_START*60) * slotHeight / 15;
                const height = Math.max(duration * slotHeight / 15 - 4, slotHeight * 2 );
                  return (
                    <div key={i} onClick={e => e.stopPropagation()}
                      style={{ position:'absolute', top:top+2, left:4, right:4, height, background:'rgba(255,82,82,0.1)', border:'1px solid rgba(255,82,82,0.3)', borderLeft:'3px solid #ff5252', borderRadius:'6px', padding:'4px 8px', overflow:'hidden', zIndex:2, cursor:'default' }}>
                      <div style={{ fontSize:'0.68rem', fontWeight:'700', color:'#ff5252', marginBottom:'1px' }}>🚫 {(b.time || b.startTime)}{b.endTime ? ' → ' + b.endTime : ''}</div>
                      <div style={{ fontSize:'0.65rem', color:'rgba(255,82,82,0.7)' }}>{b.service || 'Blocked'}</div>
                    </div>
                  );
                }
                const startMins = convertTo24(b.time || b.startTime);
                if (!startMins) return null;
                const top = (startMins - GRID_START*60) * slotHeight / 15;
                const svc = config.services ? config.services.find(s=>s.id===b.service) : null;
                const duration = (svc&&svc.duration) || 30;
              const height = Math.max(duration * slotHeight / 15 - 4, slotHeight * 2);
                const isSel = selectedBooking && selectedBooking.bookingId===b.bookingId;
                const displayName = getBookingName(b);
                const compactName = height < 34 ? displayName.split(' ')[0] || displayName : displayName;
                return (
                  <div key={i} onClick={e=>{e.stopPropagation();onBookingClick(b);}}
                    style={{ position:'absolute', top:top+2, left:4, right:4, height, background:isSel?barber.color+'35':barber.color+'18', border:'1px solid '+barber.color+(isSel?'bb':'45'), borderLeft:'3px solid '+barber.color, borderRadius:'6px', padding:'4px 8px', cursor:'pointer', overflow:'hidden', transition:'all 0.15s', zIndex:2 }}
                    onMouseEnter={e=>e.currentTarget.style.background=barber.color+'28'}
                    onMouseLeave={e=>e.currentTarget.style.background=isSel?barber.color+'35':barber.color+'18'}>
                    <div style={{ fontSize:'0.68rem', fontWeight:'700', color:barber.color, lineHeight:'1.2' }}>{b.time}</div>
                    <div title={displayName} style={{ fontSize:'0.72rem', fontWeight:'600', color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', lineHeight:'1.2' }}>{compactName}</div>
                    <div style={{ fontSize:'0.62rem', color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', lineHeight:'1.2' }}>{svc ? svc.name : b.service}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
        {isToday && (
          <div ref={nowRef} style={{ position:'absolute', left:0, right:0, top:(nowMins-GRID_START*60)*slotHeight/15, zIndex:5, pointerEvents:'none' }}>
            <div style={{ position:'absolute', left:TIME_COL-6, right:0, height:'2px', background:'#ff5252' }}>
              <div style={{ position:'absolute', left:-4, top:-4, width:'10px', height:'10px', borderRadius:'50%', background:'#ff5252' }} />
            </div>
          </div>
        )}
      </div>
     <SlotPopup
  popup={slotPopup}
  onNewBooking={() => { onSlotClick && onSlotClick(slotPopup.barber, slotPopup.hour, slotPopup.mins); setSlotPopup(null); }}
  onWalkIn={() => { onWalkIn && onWalkIn(slotPopup.barber, slotPopup.hour, slotPopup.mins); setSlotPopup(null); }}
  onBlockTime={() => { onBlockTime && onBlockTime(slotPopup.barber, slotPopup.hour, slotPopup.mins); setSlotPopup(null); }}
  onClose={() => setSlotPopup(null)}
/>

    </div>
  );
}

export default function Dashboard() {
  const [bookings, setBookings] = useState([]); 
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showBlockTime, setShowBlockTime] = useState(false);
  const [isEditCheckout, setIsEditCheckout] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [clientData, setClientData] = useState(null);
  const [view, setView] = useState('day');
  const [pillFilter, setPillFilter] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [barberFilter, setBarberFilter] = useState('all');
  const [barbers, setBarbers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formPreset, setFormPreset] = useState({});
  const [leftPanelWidth, setLeftPanelWidth] = useState(240);
  const [slotHeight, setSlotHeight] = useState(24);
  const [fabOpen, setFabOpen] = useState(false);
  const [customRange, setCustomRange] = useState({ start: null, end: null });
  const today = new Date(); today.setHours(0,0,0,0);

useEffect(() => {
  fetchAll();
  const interval = setInterval(() => { fetchAll(); }, 10000);
  return () => clearInterval(interval);
}, []);

  const fetchAll = async () => {
    try {
      const [snapshot, barbersSnap] = await Promise.all([
        getDocs(query(collection(db, 'tenants/whitecross/bookings'), orderBy('startTime', 'desc'))),
        getDocs(collection(db, 'tenants/whitecross/barbers')),
      ]);

      const fetchedBarbers = barbersSnap.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
      setBarbers(fetchedBarbers);

      const barberNameById = fetchedBarbers.reduce((acc, b) => {
        if (!b?.name) return acc;
        const keys = [b.docId, b.id].filter(Boolean);
        keys.forEach((k) => { acc[String(k).toLowerCase()] = b.name; });
        return acc;
      }, {});

      const fetchedBookings = snapshot.docs.map(doc => {
        const d = doc.data();
        const startTime = d.startTime?.toDate();
        const date = startTime ? startTime.toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric'
        }) : '';
        const time = startTime ? startTime.toLocaleTimeString('en-GB', {
          hour: 'numeric', minute: '2-digit', hour12: true
        }).toUpperCase() : '';
        const rawBarber = String(d.barberId || '').trim();
        const barber = d.barberName || barberNameById[rawBarber.toLowerCase()] || rawBarber;
        return {
          ...d,
          name: d.clientName || 'Walk-in',
          email: d.clientEmail || '',
          phone: d.clientPhone || '',
          barber,
          service: d.serviceId || '',
          date,
          time,
          bookingId: d.bookingId || doc.id,
          source: d.source || 'website',
          paidAmount: d.paidAmount || '',
          price: d.price || '',
        };
      });

      const normalizedBookings = fetchedBookings.map(b => ({ ...b, name: getBookingName(b) }));
      setBookings(normalizedBookings);
    } catch (err) {
      console.error('fetchAll error:', err);
    } finally {
      setLoading(false);
      setSelectedDate(d => new Date(d));
    }
  };

  const bookingsByDate = React.useMemo(() => bookings.reduce((acc, b) => {
    if (!acc[b.date]) acc[b.date] = [];
    acc[b.date].push(b);
    return acc;
  }, {}), [bookings]);

  const getForDate = (date) => {
    const list = bookingsByDate[formatDateKey(date)] || [];
    return list
    .filter(b => b.status !== 'CANCELLED' && b.status !== 'BLOCKED')     
    .filter(b => {
        if (barberFilter === 'all') return true;
        const sel = barbers.find(bar => bar.id === barberFilter);
        if (!sel) return true;
        return (b.barber||'').toLowerCase() === sel.name.toLowerCase();
      })
      .sort((a,b) => convertTo24(a.time) - convertTo24(b.time));
  };

const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const activeBarbersForDay = barbers.filter(b => {
  if (!b.workingDays || b.workingDays.length === 0) return true;
  const dayName = DAYS_FULL[selectedDate.getDay()];
  if (!b.workingDays.includes(dayName)) return false;
  if (b.dayHours && b.dayHours[dayName] && b.dayHours[dayName].closed) return false;
  return true;
});

const activeBarbers = barberFilter === 'all'
  ? activeBarbersForDay
  : activeBarbersForDay.filter(b => b.id === barberFilter);
  const statsBookings = view === 'day' ? getForDate(selectedDate)
    : view === 'week' ? getWeekDates(selectedDate).flatMap(d => getForDate(d))
    : view === 'custom' && customRange.start && customRange.end ? (() => {
        const days = [];
        const cur = new Date(customRange.start); cur.setHours(0,0,0,0);
        const end = new Date(customRange.end); end.setHours(23,59,59,999);
        while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate()+1); }
        return days.flatMap(d => getForDate(d));
      })()
    : (() => { const y=currentMonth.getFullYear(), m=currentMonth.getMonth(); return Array.from({length:getDaysInMonth(y,m)},(_,i)=>new Date(y,m,i+1)).flatMap(d=>getForDate(d)); })();
  const checkedOutCount = statsBookings.filter(b => b.status === 'CHECKED_OUT').length;
  const revenue = statsBookings
    .filter(b => b.status === 'CHECKED_OUT')
    .reduce((s, b) => {
      const pp = v => parseFloat(String(v||'0').replace('£',''))||0;
      const price = pp(b.price) > 0 ? pp(b.price) : Math.max(0, pp(b.paidAmount) - pp(b.tip));
      return s + Math.max(0, price - pp(b.discount));
    }, 0);
  const now = new Date();
  const needsCheckoutBookings = statsBookings.filter(b => {
    if (b.status !== 'CONFIRMED' && b.status !== 'PENDING') return false;
    const dateKey = b.date || '';
    const timeStr = b.time || '';
    if (!dateKey || !timeStr) return false;
    const mins = convertTo24(timeStr);
    const parts = dateKey.match(/(\d+)\s+(\w+)\s+(\d{4})/);
    if (!parts) return false;
    const bDate = new Date(parts[3], MONTHS.indexOf(parts[2]), parseInt(parts[1]), Math.floor(mins/60), mins%60);
    return bDate < now;
  });
  const needsCheckoutCount = needsCheckoutBookings.length;

  const year = currentMonth.getFullYear(), month = currentMonth.getMonth();
  const calDays = [...Array(getFirstDay(year,month)).fill(null), ...Array.from({length:getDaysInMonth(year,month)},(_,i)=>i+1)];
  const isToday = (d) => { if(!d) return false; const t=new Date(year,month,d); t.setHours(0,0,0,0); return t.getTime()===today.getTime(); };
  const isSel = (d) => d && selectedDate.getDate()===d && selectedDate.getMonth()===month && selectedDate.getFullYear()===year;
  const dayCount = (d) => { if(!d) return 0; return (bookingsByDate[formatDateKey(new Date(year,month,d))]||[]).filter(b=>b.status!=='CANCELLED'&&b.status!=='BLOCKED').length; };

  const navPrev = () => {
    if (view==='day') setSelectedDate(new Date(selectedDate.getTime()-86400000));
    else if (view==='week') setSelectedDate(new Date(selectedDate.getTime()-7*86400000));
    else setCurrentMonth(new Date(year,month-1,1));
  };
  const navNext = () => {
    if (view==='day') setSelectedDate(new Date(selectedDate.getTime()+86400000));
    else if (view==='week') setSelectedDate(new Date(selectedDate.getTime()+7*86400000));
    else setCurrentMonth(new Date(year,month+1,1));
  };

  const periodLabel = view==='day'
    ? selectedDate.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})
    : view==='week'
      ? (()=>{const w=getWeekDates(selectedDate);return w[0].toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' - '+w[6].toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});})()
    : view==='custom' && customRange.start && customRange.end
      ? (()=>{const fmt=d=>d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});return fmt(customRange.start)+' – '+fmt(customRange.end);})()
      : MONTHS[month]+' '+year;

  const weekDates = getWeekDates(selectedDate);
  const openNewBooking = (barber, hour, mins) => { setFormPreset({ barber, hour, mins, date: selectedDate }); setSelectedBooking(null); setShowForm(true); setShowWalkIn(false); setShowBlockTime(false); };
  const handleBookingClick = (b) => { setShowForm(false); setSelectedBooking(selectedBooking?.bookingId === b.bookingId ? null : b); };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'14px', height:'calc(100vh - 64px)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
        <div style={{ display:'flex', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden' }}>
          {['day','week','month','custom'].map(v=>(
            <button key={v} onClick={()=>{setView(v);setSelectedBooking(null);setShowForm(false);}}
              style={{ padding:'8px 16px', border:'none', cursor:'pointer', background:view===v?'#d4af37':'transparent', color:view===v?'#000':'var(--muted)', fontWeight:view===v?'700':'400', fontSize:'0.82rem', textTransform:'capitalize', transition:'all 0.2s' }}>{v}</button>
          ))}
        </div>
        {view !== 'custom' && <>
          <button onClick={navPrev} style={{ background:'transparent', border:'1px solid var(--border)', borderRadius:'6px', color:'#d4af37', width:'30px', height:'30px', cursor:'pointer', fontSize:'1rem' }}>&#8249;</button>
          <span style={{ fontSize:'0.9rem', fontWeight:'600', color:'var(--text)', minWidth:'180px', textAlign:'center' }}>{periodLabel}</span>
          <button onClick={navNext} style={{ background:'transparent', border:'1px solid var(--border)', borderRadius:'6px', color:'#d4af37', width:'30px', height:'30px', cursor:'pointer', fontSize:'1rem' }}>&#8250;</button>
        </>}
        {view === 'custom' && (
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <input type="date" value={customRange.start ? customRange.start.toISOString().slice(0,10) : ''} onChange={e=>{ const d=e.target.value?new Date(e.target.value):null; setCustomRange(r=>({...r,start:d})); }}
              style={{ padding:'6px 10px', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--card)', color:'var(--text)', fontSize:'0.82rem', cursor:'pointer' }} />
            <span style={{ color:'var(--muted)', fontSize:'0.82rem' }}>→</span>
            <input type="date" value={customRange.end ? customRange.end.toISOString().slice(0,10) : ''} onChange={e=>{ const d=e.target.value?new Date(e.target.value):null; setCustomRange(r=>({...r,end:d})); }}
              style={{ padding:'6px 10px', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--card)', color:'var(--text)', fontSize:'0.82rem', cursor:'pointer' }} />
            {customRange.start && customRange.end && <span style={{ fontSize:'0.78rem', color:'var(--muted)' }}>{periodLabel}</span>}
          </div>
        )}
        <button onClick={()=>{setSelectedDate(new Date());setCurrentMonth(new Date());setSelectedBooking(null);setShowForm(false);}}
          style={{ padding:'7px 14px', background:'rgba(212,175,55,0.1)', border:'1px solid rgba(212,175,55,0.3)', borderRadius:'6px', color:'#d4af37', fontSize:'0.78rem', cursor:'pointer' }}>Today</button>
        <div style={{ flex:1 }} />
        <div style={{ display:'flex', alignItems:'center', gap:'6px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', padding:'4px 8px' }}>
          <button onClick={()=>setSlotHeight(h=>Math.max(8,h-2))} style={{ background:'transparent', border:'none', color:'#d4af37', cursor:'pointer', fontSize:'1.1rem', width:'24px', height:'24px' }}>-</button>
          <span style={{ fontSize:'0.68rem', color:'var(--muted)', minWidth:'30px', textAlign:'center' }}>{slotHeight}px</span>
          <button onClick={()=>setSlotHeight(h=>Math.min(36,h+2))} style={{ background:'transparent', border:'none', color:'#d4af37', cursor:'pointer', fontSize:'1.1rem', width:'24px', height:'24px' }}>+</button>
        </div>
        <div style={{ display:'flex', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', overflow:'hidden' }}>
          <button onClick={()=>setBarberFilter('all')} style={{ padding:'8px 12px', border:'none', cursor:'pointer', background:barberFilter==='all'?'rgba(212,175,55,0.2)':'transparent', color:barberFilter==='all'?'#d4af37':'var(--muted)', fontSize:'0.78rem', fontWeight:'600' }}>All</button>
          {barbers.map(b=>(
            <button key={b.id} onClick={()=>setBarberFilter(b.id)}
              style={{ padding:'8px 12px', border:'none', cursor:'pointer', background:barberFilter===b.id?b.color+'20':'transparent', color:barberFilter===b.id?b.color:'var(--muted)', fontSize:'0.78rem', fontWeight:'600', display:'flex', alignItems:'center', gap:'5px', opacity:isBarberBookingDisabled(b)?0.6:1 }}>
              <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:b.color }} />{b.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
        <StatPill label="Total" value={statsBookings.length} color="#d4af37" active={pillFilter==='total'} onClick={()=>setPillFilter(pillFilter==='total'?null:'total')} />
        <StatPill label="Confirmed" value={statsBookings.filter(b=>b.status==='CONFIRMED').length} color="#4caf50" active={pillFilter==='confirmed'} onClick={()=>setPillFilter(pillFilter==='confirmed'?null:'confirmed')} />
        <StatPill label="Pending" value={statsBookings.filter(b=>b.status==='PENDING').length} color="#ff9800" active={pillFilter==='pending'} onClick={()=>setPillFilter(pillFilter==='pending'?null:'pending')} />
        <StatPill label="Checked Out" value={checkedOutCount} color="#2196f3" active={pillFilter==='checkedout'} onClick={()=>setPillFilter(pillFilter==='checkedout'?null:'checkedout')} />
        <StatPill label="Needs Checkout" value={needsCheckoutCount} color="#ff5252" active={pillFilter==='needscheckout'} onClick={()=>setPillFilter(pillFilter==='needscheckout'?null:'needscheckout')} />
        <StatPill label="Revenue" value={'£'+revenue} color="#d4af37" active={pillFilter==='revenue'} onClick={()=>setPillFilter(pillFilter==='revenue'?null:'revenue')} />
        <div style={{ width:'1px', background:'var(--border)', margin:'0 4px', alignSelf:'stretch' }} />
        <StatPill label="Booksy" value={statsBookings.filter(b=>(b.source||'').toLowerCase()==='booksy').length} color="#9c27b0" active={pillFilter==='booksy'} onClick={()=>setPillFilter(pillFilter==='booksy'?null:'booksy')} />
        <StatPill label="Fresha" value={statsBookings.filter(b=>(b.source||'').toLowerCase()==='fresha').length} color="#2196f3" active={pillFilter==='fresha'} onClick={()=>setPillFilter(pillFilter==='fresha'?null:'fresha')} />
        <StatPill label="Website" value={statsBookings.filter(b=>(b.source||'').toLowerCase()==='website').length} color="#4caf50" active={pillFilter==='website'} onClick={()=>setPillFilter(pillFilter==='website'?null:'website')} />
        <StatPill label="Walk-in" value={statsBookings.filter(b=>(b.source||'').toLowerCase()==='walk-in').length} color="#ff9800" active={pillFilter==='walkin'} onClick={()=>setPillFilter(pillFilter==='walkin'?null:'walkin')} />
      </div>

      {pillFilter && (()=>{
        const filterMap = {
          total: ()=>true,
          confirmed: b=>b.status==='CONFIRMED',
          pending: b=>b.status==='PENDING',
          checkedout: b=>b.status==='CHECKED_OUT',
          needscheckout: b=>{
            if(b.status!=='CONFIRMED'&&b.status!=='PENDING') return false;
            const mins=convertTo24(b.time||'');
            const parts=(b.date||'').match(/(\d+)\s+(\w+)\s+(\d{4})/);
            if(!parts) return false;
            const bDate=new Date(parts[3],MONTHS.indexOf(parts[2]),parseInt(parts[1]),Math.floor(mins/60),mins%60);
            return bDate<now;
          },
          revenue: b=>b.status==='CHECKED_OUT',
          booksy: b=>(b.source||'').toLowerCase()==='booksy',
          fresha: b=>(b.source||'').toLowerCase()==='fresha',
          website: b=>(b.source||'').toLowerCase()==='website',
          walkin: b=>(b.source||'').toLowerCase()==='walk-in',
        };
        const pillColors = { total:'#d4af37', confirmed:'#4caf50', pending:'#ff9800', checkedout:'#2196f3', needscheckout:'#ff5252', revenue:'#d4af37', booksy:'#9c27b0', fresha:'#2196f3', website:'#4caf50', walkin:'#ff9800' };
        const filtered = pillFilter === 'needscheckout' ? needsCheckoutBookings : statsBookings.filter(filterMap[pillFilter]||filterMap.total);
        const pillColor = pillColors[pillFilter]||'#d4af37';
        return (
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'12px', overflow:'hidden' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderBottom:'1px solid var(--border)', background:pillColor+'08' }}>
              <span style={{ fontSize:'0.72rem', fontWeight:'700', color:pillColor, letterSpacing:'1px', textTransform:'uppercase' }}>{pillFilter.toUpperCase()} — {filtered.length} booking{filtered.length!==1?'s':''}</span>
              <button onClick={()=>setPillFilter(null)} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'1.1rem', lineHeight:1 }}>✕</button>
            </div>
            <div style={{ maxHeight:'260px', overflowY:'auto' }}>
              {filtered.length===0 ? (
                <div style={{ padding:'20px', textAlign:'center', color:'var(--muted)', fontSize:'0.82rem' }}>No bookings</div>
              ) : filtered.map((b,i)=>{
                const svcObj = config.services ? config.services.find(s=>s.id===b.service) : null;
                const svcName = svcObj ? svcObj.name : (b.service||'—');
                const statusColors = { CONFIRMED:'#4caf50', PENDING:'#ff9800', CHECKED_OUT:'#2196f3', CANCELLED:'#ff5252' };
                const amt = parseFloat(String(b.paidAmount||b.price||'0').replace('£',''))||0;
                return (
                  <div key={i} onClick={()=>{ if(b.startTime){ const d=b.startTime?.toDate ? b.startTime.toDate() : new Date(b.startTime); setSelectedDate(d); setView('day'); } setSelectedBooking(b); setPillFilter(null); }}
                    style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background 0.15s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:getBColor(b.barber,barbers), flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'0.82rem', fontWeight:'600', color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.name}</div>
                      <div style={{ fontSize:'0.68rem', color:'var(--muted)' }}>{b.date} {b.time} · {svcName}</div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:'0.75rem', fontWeight:'700', color:'#d4af37' }}>{amt>0?'£'+amt.toFixed(0):''}</div>
                      <div style={{ fontSize:'0.6rem', color:statusColors[b.status]||'var(--muted)', fontWeight:'600' }}>{b.status}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div style={{ flex:1, display:'flex', gap:'0', overflow:'hidden', position:'relative' }}>
        {/* SHARED LEFT PANEL */}
        <div style={{ width:leftPanelWidth, flexShrink:0, display:'flex', flexDirection:'column', gap:'12px', overflow:'hidden' }}>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'12px', padding:'14px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
              <button onClick={()=>setCurrentMonth(new Date(year,month-1,1))} style={{ background:'transparent', border:'none', color:'#d4af37', cursor:'pointer', fontSize:'1rem' }}>&#8249;</button>
              <span style={{ fontSize:'0.8rem', fontWeight:'600', color:'var(--text)' }}>{MONTHS[month]} {year}</span>
              <button onClick={()=>setCurrentMonth(new Date(year,month+1,1))} style={{ background:'transparent', border:'none', color:'#d4af37', cursor:'pointer', fontSize:'1rem' }}>&#8250;</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'1px', marginBottom:'4px' }}>
              {DAYS_SHORT.map(d=><div key={d} style={{ textAlign:'center', fontSize:'0.55rem', color:'var(--muted)' }}>{d}</div>)}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'1px' }}>
              {calDays.map((d,i)=>{
                const cnt=dayCount(d), sel=isSel(d), tod=isToday(d);
                return (
                  <div key={i} onClick={()=>{if(d){setSelectedDate(new Date(year,month,d));setView('day');setSelectedBooking(null);setShowForm(false);}}}
                    style={{ height:'26px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', borderRadius:'4px', cursor:d?'pointer':'default', background:sel?'#d4af37':tod?'rgba(212,175,55,0.15)':'transparent', position:'relative' }}
                    onMouseEnter={e=>{if(d&&!sel)e.currentTarget.style.background='rgba(212,175,55,0.08)';}}
                    onMouseLeave={e=>{if(d&&!sel)e.currentTarget.style.background=tod?'rgba(212,175,55,0.15)':'transparent';}}>
                    {d&&<>
                      <span style={{ fontSize:'0.68rem', color:sel?'#000':tod?'#d4af37':'var(--text)', fontWeight:(sel||tod)?'700':'400', lineHeight:1 }}>{d}</span>
                      {cnt>0&&<div style={{ position:'absolute', bottom:'1px', width:'3px', height:'3px', borderRadius:'50%', background:sel?'#000':'#d4af37' }} />}
                    </>}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'12px', padding:'14px', flex:1 }}>
            <div style={{ fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'10px' }}>
              {periodLabel}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'10px' }}>
              <div style={{ textAlign:'center', padding:'10px', background:'rgba(212,175,55,0.06)', borderRadius:'8px' }}>
                <div style={{ fontSize:'1.5rem', fontWeight:'700', color:'#d4af37' }}>{statsBookings.length}</div>
                <div style={{ fontSize:'0.58rem', color:'var(--muted)' }}>BOOKINGS</div>
              </div>
              <div style={{ textAlign:'center', padding:'10px', background:'rgba(76,175,80,0.06)', borderRadius:'8px' }}>
                <div style={{ fontSize:'1.2rem', fontWeight:'700', color:'#4caf50' }}>£{revenue.toFixed(0)}</div>
                <div style={{ fontSize:'0.58rem', color:'var(--muted)' }}>REVENUE</div>
              </div>
            </div>
            {activeBarbers.map(barber=>{
              const cnt=statsBookings.filter(b=>(b.barber||'').toLowerCase()===barber.name.toLowerCase()).length;
              return (
                <div key={barber.id} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                    <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:barber.color }} />
                    <span style={{ fontSize:'0.75rem', color:'var(--text)' }}>{barber.name}</span>
                  </div>
                  <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>{cnt}</span>
                </div>
              );
            })}
          </div>
        </div>
        <ResizeHandle onResize={(delta) => setLeftPanelWidth(w => Math.max(180, Math.min(400, w + delta)))} />

        {/* RIGHT PANEL */}
        <div style={{ flex:1, display:'flex', gap:'0', overflow:'hidden', marginLeft:'8px' }}>
          {view === 'day' && (
            <>
              {loading ? (
                <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}>Loading...</div>
              ) : (
                <TimeGrid date={selectedDate} bookings={getForDate(selectedDate)} barbers={activeBarbers} slotHeight={slotHeight} onSlotClick={openNewBooking} onWalkIn={(barber, hour, mins) => { setFormPreset({barber, hour, mins, date: selectedDate}); setShowWalkIn(true); setShowBlockTime(false); setShowForm(false); }} onBlockTime={(barber, hour, mins) => { setFormPreset({barber, hour, mins, date: selectedDate}); setShowBlockTime(true); setShowWalkIn(false); setShowForm(false); }} onBookingClick={handleBookingClick} selectedBooking={selectedBooking} />
              )}
              {(selectedBooking || showForm || showWalkIn || showBlockTime) && <ResizeHandle onResize={() => {}} />}
              {selectedBooking && !showForm && !showWalkIn && !showBlockTime && (
                <BookingDetail
                  booking={selectedBooking} barbers={barbers} allBookings={bookings}
                  onClose={()=>setSelectedBooking(null)}
                  onEdit={(b)=>{ setFormPreset({booking:b,date:selectedDate}); setShowForm(true); setShowWalkIn(false); setShowBlockTime(false); }}
                  onDelete={(b)=>{ fetchAll(); setSelectedBooking(null); }}
                  onCheckout={()=>{ setIsEditCheckout(false); setShowCheckout(true); }}
                  onViewReceipt={()=>setShowReceipt(true)}
                />
              )}
              {showForm && (
                <BookingForm
                  existingBookings={bookings} preBarber={formPreset.barber} preHour={formPreset.hour} preMins={formPreset.mins}
                  preDate={formPreset.date} preBooking={formPreset.booking} barbers={barbers}
                  onClose={()=>setShowForm(false)}
                  onSaved={(savedBooking, goCheckout)=>{
                    setTimeout(()=>fetchAll(),2000); setTimeout(()=>fetchAll(),5000);
                    if (goCheckout && savedBooking) { setSelectedBooking(savedBooking); setShowForm(false); setIsEditCheckout(false); setShowCheckout(true); }
                  }}
                />
              )}
              {showWalkIn && (
                <WalkInForm
                  preBarber={formPreset.barber} preHour={formPreset.hour} preMins={formPreset.mins} preDate={formPreset.date} barbers={barbers} existingBookings={bookings}
                  onClose={() => setShowWalkIn(false)}
                  onSaved={(savedBooking, goCheckout) => {
                    setTimeout(() => fetchAll(), 2000); setTimeout(() => fetchAll(), 5000);
                    if (goCheckout && savedBooking) { setSelectedBooking(savedBooking); setShowWalkIn(false); setIsEditCheckout(false); setShowCheckout(true); }
                  }}
                />
              )}
              {showBlockTime && (
                <BlockTimeForm
                  preBarber={formPreset.barber} preHour={formPreset.hour} preDate={formPreset.date} barbers={barbers}
                  onClose={() => setShowBlockTime(false)}
                  onSaved={() => { setTimeout(() => fetchAll(), 2000); setTimeout(() => fetchAll(), 5000); setShowBlockTime(false); }}
                />
              )}
              {showCheckout && selectedBooking && (
                <CheckoutPanel booking={selectedBooking} barbers={barbers} isEdit={isEditCheckout} onClose={()=>setShowCheckout(false)} onComplete={()=>{ setShowCheckout(false); setSelectedBooking(null); setIsEditCheckout(false); setTimeout(()=>fetchAll(),2000); }} />
              )}
              {showReceipt && selectedBooking && (
                <ReceiptPanel booking={selectedBooking} barbers={barbers} clientData={clientData} onClose={()=>setShowReceipt(false)} onEdit={()=>{ setShowReceipt(false); setIsEditCheckout(true); setShowCheckout(true); }} />
              )}
            </>
          )}
          {view === 'week' && (
          <div style={{ flex:1, background:'var(--card)', border:'1px solid var(--border)', borderRadius:'12px', overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid var(--border)' }}>
              {weekDates.map((wd,i)=>{
                const isWToday=wd.toDateString()===new Date().toDateString();
                const cnt=getForDate(wd).length;
                return (
                  <div key={i} onClick={()=>{setSelectedDate(wd);setView('day');}}
                    style={{ padding:'12px 8px', textAlign:'center', cursor:'pointer', background:isWToday?'rgba(212,175,55,0.08)':'transparent', borderRight:i<6?'1px solid var(--border)':'none' }}
                    onMouseEnter={e=>{if(!isWToday)e.currentTarget.style.background='rgba(212,175,55,0.04)';}}
                    onMouseLeave={e=>{if(!isWToday)e.currentTarget.style.background='transparent';}}>
                    <div style={{ fontSize:'0.6rem', color:'var(--muted)', letterSpacing:'1px', marginBottom:'4px' }}>{DAYS_SHORT[i]}</div>
                    <div style={{ fontSize:'1.1rem', fontWeight:'700', color:isWToday?'#d4af37':'var(--text)', marginBottom:'4px' }}>{wd.getDate()}</div>
                    {cnt>0&&<div style={{ fontSize:'0.6rem', color:'#d4af37', background:'rgba(212,175,55,0.15)', borderRadius:'8px', padding:'1px 5px', display:'inline-block' }}>{cnt}</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ flex:1, display:'grid', gridTemplateColumns:'repeat(7,1fr)', overflowY:'auto' }}>
              {weekDates.map((wd,i)=>{
                const dayBs=getForDate(wd);
                return (
                  <div key={i} style={{ padding:'8px 6px', borderRight:i<6?'1px solid var(--border)':'none', minHeight:'160px' }}>
                    {dayBs.map((b,j)=>(
                      <div key={j} onClick={()=>{setSelectedDate(wd);setSelectedBooking(b);setView('day');}}
                        style={{ padding:'5px 7px', borderRadius:'5px', background:getBColor(b.barber,barbers)+'15', borderLeft:'3px solid '+getBColor(b.barber,barbers), marginBottom:'4px', cursor:'pointer' }}
                        onMouseEnter={e=>e.currentTarget.style.background=getBColor(b.barber,barbers)+'25'}
                        onMouseLeave={e=>e.currentTarget.style.background=getBColor(b.barber,barbers)+'15'}>
                        <div style={{ fontSize:'0.62rem', color:'#d4af37', fontWeight:'700' }}>{b.time}</div>
                        <div style={{ fontSize:'0.68rem', color:'var(--text)', fontWeight:'600', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{getBookingName(b)}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === 'month' && (
          <div style={{ flex:1, background:'var(--card)', border:'1px solid var(--border)', borderRadius:'12px', overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid var(--border)' }}>
              {DAYS_SHORT.map(d=><div key={d} style={{ padding:'10px', textAlign:'center', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1px' }}>{d}</div>)}
            </div>
            <div style={{ flex:1, display:'grid', gridTemplateColumns:'repeat(7,1fr)', gridAutoRows:'1fr', overflowY:'auto' }}>
              {calDays.map((d,i)=>{
                const tod=isToday(d);
                const dayBs=d?(bookingsByDate[formatDateKey(new Date(year,month,d))]||[]).filter(b=>b.status!=='CANCELLED'&&b.status!=='BLOCKED').filter(b=>barberFilter==='all'||(b.barber||'').toLowerCase()===(barbers.find(bar=>bar.id===barberFilter)||{name:''}).name.toLowerCase()):[];
                return (
                  <div key={i} onClick={()=>{if(d){setSelectedDate(new Date(year,month,d));setView('day');setSelectedBooking(null);}}}
                    style={{ padding:'5px', borderRight:(i+1)%7!==0?'1px solid var(--border)':'none', borderBottom:'1px solid var(--border)', cursor:d?'pointer':'default', background:tod?'rgba(212,175,55,0.04)':'transparent', minHeight:'68px' }}
                    onMouseEnter={e=>{if(d&&!tod)e.currentTarget.style.background='rgba(212,175,55,0.02)';}}
                    onMouseLeave={e=>{if(d&&!tod)e.currentTarget.style.background='transparent';}}>
                    {d&&<>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'3px' }}>
                        <span style={{ fontSize:'0.72rem', fontWeight:tod?'800':'500', color:tod?'#d4af37':'var(--text)', width:'20px', height:'20px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', background:tod?'rgba(212,175,55,0.2)':'transparent' }}>{d}</span>
                        {dayBs.length>0&&<span style={{ fontSize:'0.58rem', color:'#d4af37', background:'rgba(212,175,55,0.15)', borderRadius:'8px', padding:'1px 4px' }}>{dayBs.length}</span>}
                      </div>
                      {dayBs.slice(0,2).map((b,j)=>(
                        <div key={j} style={{ fontSize:'0.6rem', color:'var(--text)', background:getBColor(b.barber,barbers)+'15', borderLeft:'2px solid '+getBColor(b.barber,barbers), padding:'1px 4px', borderRadius:'3px', marginBottom:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {b.time} {getBookingName(b)}
                        </div>
                      ))}
                      {dayBs.length>2&&<div style={{ fontSize:'0.56rem', color:'var(--muted)', paddingLeft:'3px' }}>+{dayBs.length-2} more</div>}
                    </>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ position:'fixed', bottom:'32px', right:'32px', display:'flex', flexDirection:'column', gap:'8px', alignItems:'flex-end', zIndex:200 }}>
          {fabOpen && (
            <>
              <button onClick={()=>{ setFabOpen(false); setView('day'); setSelectedBooking(null); setShowWalkIn(false); setShowBlockTime(false); setFormPreset({date:selectedDate}); setShowForm(true); }}
                style={{ padding:'10px 20px', borderRadius:'24px', background:'var(--card)', border:'1px solid rgba(212,175,55,0.4)', color:'#d4af37', fontSize:'0.8rem', cursor:'pointer', fontWeight:'700', boxShadow:'0 4px 12px rgba(0,0,0,0.3)', whiteSpace:'nowrap' }}>
                📅 Booking
              </button>
              <button onClick={()=>{ setFabOpen(false); setView('day'); setSelectedBooking(null); setShowForm(false); setShowBlockTime(false); setFormPreset({date:selectedDate}); setShowWalkIn(true); }}
                style={{ padding:'10px 20px', borderRadius:'24px', background:'var(--card)', border:'1px solid rgba(255,152,0,0.4)', color:'#ff9800', fontSize:'0.8rem', cursor:'pointer', fontWeight:'700', boxShadow:'0 4px 12px rgba(0,0,0,0.3)', whiteSpace:'nowrap' }}>
                🚶 Walk-in
              </button>
              <button onClick={()=>{ setFabOpen(false); setView('day'); setSelectedBooking(null); setShowForm(false); setShowWalkIn(false); setFormPreset({date:selectedDate}); setShowBlockTime(true); }}
                style={{ padding:'10px 20px', borderRadius:'24px', background:'var(--card)', border:'1px solid rgba(255,82,82,0.4)', color:'#ff5252', fontSize:'0.8rem', cursor:'pointer', fontWeight:'700', boxShadow:'0 4px 12px rgba(0,0,0,0.3)', whiteSpace:'nowrap' }}>
                🚫 Block Time
              </button>
            </>
          )}
          <button
            onClick={()=>setFabOpen(o=>!o)}
            style={{ width:'52px', height:'52px', borderRadius:'50%', background:'linear-gradient(135deg,#d4af37,#b8860b)', border:'none', color:'#000', fontSize:'1.6rem', cursor:'pointer', boxShadow:'0 4px 20px rgba(212,175,55,0.4)', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.2s', transform: fabOpen?'rotate(45deg)':'rotate(0deg)' }}
            onMouseEnter={e=>e.currentTarget.style.boxShadow='0 6px 24px rgba(212,175,55,0.6)'}
            onMouseLeave={e=>e.currentTarget.style.boxShadow='0 4px 20px rgba(212,175,55,0.4)'}>+</button>
        </div>
        </div>
      </div>
    </div>
  );
}