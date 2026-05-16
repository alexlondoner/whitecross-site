import React, { useState } from 'react';
import config from '../config';
import { findServiceByBookingValue, getBookingServiceLabel, normalizeSoldProducts, getProductsTotal, getBColor } from '../utils/bookingUtils';

export default function ReceiptPanel({ booking, barbers, clientData, onClose, onEdit }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  if (!booking) return null;

  const svc = findServiceByBookingValue(booking.service);
  const serviceLabel = getBookingServiceLabel(booking);
  const basePrice = svc ? svc.price : (parseInt(String(booking.price || '0').replace('£', '')) || 0);
  const soldProducts = normalizeSoldProducts(booking.soldProducts);
  const soldAddOns = normalizeSoldProducts(booking.soldAddOns);
  const productsTotal = getProductsTotal(soldProducts);
  const addOnsTotal = getProductsTotal(soldAddOns);
  const discount = parseFloat(String(booking.discount || '0').replace('£', '').replace('-', '')) || 0;
  const tip = parseFloat(String(booking.tip || '0').replace('£', '')) || 0;
  const calculatedTotal = Math.max(0, (basePrice - discount) + productsTotal + addOnsTotal + tip + (parseFloat(booking.serviceCharge || 0) || 0));
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
    try {
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
          total: calculatedTotal,
          discount,
          tip,
          paymentMethod,
          bookingId: booking.bookingId,
          basePrice,
          soldProducts,
          soldAddOns,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Send failed');
      }
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      alert('Failed to send email: ' + (err.message || 'Unknown error'));
    } finally {
      setSending(false);
    }
  };

  const handlePrint = () => {
    const scCharge = parseFloat(booking.serviceCharge || 0) || 0;
    const productRows = soldProducts.length
      ? soldProducts.map(p => `<div class="row"><span>${p.name}${p.qty > 1 ? ` x${p.qty}` : ''}</span><span>£${(parseFloat(p.price) * (parseInt(p.qty,10)||1)).toFixed(2)}</span></div>`).join('')
      : '';
    const addOnRows = soldAddOns.length
      ? soldAddOns.map(p => `<div class="row"><span>${p.name}${p.qty > 1 ? ` x${p.qty}` : ''}</span><span>£${(parseFloat(p.price) * (parseInt(p.qty,10)||1)).toFixed(2)}</span></div>`).join('')
      : '';
    const receiptHTML = `<!DOCTYPE html><html><head><title>Receipt - ${booking.name}</title><style>body{font-family:'Courier New',monospace;max-width:300px;margin:0 auto;padding:20px;color:#000;}.header{text-align:center;border-bottom:1px dashed #000;padding-bottom:10px;margin-bottom:10px;}.shop-name{font-size:14px;font-weight:bold;}.shop-info{font-size:10px;color:#555;}.row{display:flex;justify-content:space-between;margin:4px 0;font-size:12px;}.total-row{border-top:1px dashed #000;margin-top:8px;padding-top:8px;font-weight:bold;font-size:14px;}.footer{text-align:center;margin-top:16px;font-size:10px;color:#555;border-top:1px dashed #000;padding-top:10px;}.discount{color:#27500A;}.surcharge{color:#b36200;}</style></head><body><div class="header"><div class="shop-name">I CUT WHITECROSS BARBERS</div><div class="shop-info">136 Whitecross Street, London EC1Y 8QJ</div><div class="shop-info">${booking.date} · ${booking.time}</div></div><div class="row"><span>Customer</span><span>${booking.name}</span></div><div class="row"><span>Barber</span><span>${(booking.barber||'').toUpperCase()}</span></div>${basePrice>0?`<div class="row"><span>${serviceLabel}</span><span>£${basePrice.toFixed(2)}</span></div>`:''}${productRows}${addOnRows}${scCharge>0?`<div class="row surcharge"><span>Service Charge (12.5%)</span><span>£${scCharge.toFixed(2)}</span></div>`:''}${discount>0?`<div class="row discount"><span>Discount</span><span>-£${discount.toFixed(2)}</span></div>`:''}${tip>0?`<div class="row"><span>Tip</span><span>£${tip.toFixed(2)}</span></div>`:''}<div class="row total-row"><span>TOTAL</span><span>£${calculatedTotal.toFixed(2)}</span></div><div class="row"><span>Payment</span><span>${paymentMethod}</span></div><div class="footer"><div>Thank you for visiting!</div><div>whitecrossbarbers.com</div><div>Booking ID: ${booking.bookingId}</div></div></body></html>`;
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
            <span style={{ fontSize:'0.78rem', color:'var(--text)' }}>{serviceLabel}</span>
            <span style={{ fontSize:'0.78rem', color:'var(--text)' }}>£{basePrice.toFixed(2)}</span>
          </div>
          {soldProducts.map((p, i) => (
            <div key={p.productId + i} style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>{p.name} × {p.qty}</span>
              <span style={{ fontSize:'0.72rem', color:'#8bc4ff' }}>£{(p.price * p.qty).toFixed(2)}</span>
            </div>
          ))}
          {soldAddOns.map((p, i) => (
            <div key={p.productId + i} style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>{p.name} × {p.qty}</span>
              <span style={{ fontSize:'0.72rem', color:'#ff9800' }}>£{(p.price * p.qty).toFixed(2)}</span>
            </div>
          ))}
          {productsTotal > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>Products subtotal</span>
              <span style={{ fontSize:'0.72rem', color:'#8bc4ff' }}>£{productsTotal.toFixed(2)}</span>
            </div>
          )}
          {addOnsTotal > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>Add-ons subtotal</span>
              <span style={{ fontSize:'0.72rem', color:'#ff9800' }}>£{addOnsTotal.toFixed(2)}</span>
            </div>
          )}
          {discount > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:'0.72rem', color:'#4caf50' }}>Discount</span>
              <span style={{ fontSize:'0.72rem', color:'#4caf50' }}>-£{discount.toFixed(2)}</span>
            </div>
          )}
          {(parseFloat(booking.serviceCharge || 0) || 0) > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>Service charge</span>
              <span style={{ fontSize:'0.72rem', color:'#ff9800' }}>£{(parseFloat(booking.serviceCharge || 0) || 0).toFixed(2)}</span>
            </div>
          )}
          {booking.source === 'Booksy' && calculatedTotal > 0 && (
            <>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>Deposit paid</span>
                <span style={{ fontSize:'0.72rem', color:'#4caf50' }}>£10.00 ✓</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>Remaining paid</span>
                <span style={{ fontSize:'0.72rem', color:'var(--text)' }}>£{Math.max(0, calculatedTotal - 10 - tip).toFixed(2)}</span>
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
          <span style={{ fontSize:'1rem', fontWeight:'800', color:'#d4af37' }}>£{calculatedTotal.toFixed(2)}</span>
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
