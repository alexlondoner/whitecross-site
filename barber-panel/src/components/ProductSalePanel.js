import React, { useState } from 'react';
import { getProductsTotal } from '../utils/bookingUtils';
import { formatDateKey } from '../utils/timeUtils';
import { createProductSale } from '../firestoreActions';
import AddClientModal from './AddClientModal';
import ProductSelector from './ProductSelector';

export default function ProductSalePanel({ barbers, products, onClose, onSaved }) {
  const [clientName, setClientName] = useState('Walk-in');
  const [clientPhone, setClientPhone] = useState('');
  const [showAddClient, setShowAddClient] = useState(false);
  const handleAddClientInline = (client) => {
    setClientName(client.name || '');
    setClientPhone(client.phone || '');
    setShowAddClient(false);
  };
  const [barber, setBarber] = useState(barbers[0] ? barbers[0].name.toLowerCase() : '');
  const [soldProducts, setSoldProducts] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saleTime, setSaleTime] = useState(() => new Date().toTimeString().slice(0, 5));

  const total = getProductsTotal(soldProducts);

  const handleSave = async () => {
    if (!soldProducts.length || total <= 0) return;
    setSaving(true);
    try {
      const saleDateObj = new Date(saleDate + 'T' + saleTime + ':00');
      const bookingId = await createProductSale({
        clientName: clientName.trim() || 'Walk-in',
        clientPhone: clientPhone.trim(),
        barber,
        soldProducts,
        paymentMethod,
        note: note.trim(),
        saleDate: saleDateObj,
      });
      if (onSaved) {
        onSaved({
          bookingId,
          name: clientName.trim() || 'Walk-in',
          phone: clientPhone.trim(),
          barber,
          service: '',
          price: 0,
          paidAmount: total,
          soldProducts,
          status: 'CHECKED_OUT',
          paymentMethod,
          source: 'Product Sale',
          date: formatDateKey(saleDateObj),
          time: saleDateObj.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase(),
        });
      }
      onClose();
    } catch (err) {
      console.error('Product sale save error:', err);
      alert('Could not save product sale.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ width:'340px', flexShrink:0, background:'var(--card2)', border:'1px solid rgba(212,175,55,0.25)', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', maxHeight:'calc(100vh - 200px)', boxShadow:'0 8px 32px rgba(0,0,0,0.4)' }}>
      <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(212,175,55,0.04)' }}>
        <span style={{ fontSize:'0.85rem', fontWeight:'700', color:'#d4af37' }}>🛒 Product Sale</span>
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'1rem' }}>x</button>
      </div>
      <div style={{ overflowY:'auto', flex:1, padding:'16px 20px', display:'flex', flexDirection:'column', gap:'12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display:'block', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'5px', fontWeight:'600' }}>Sale Date</label>
            <input type="date" value={saleDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setSaleDate(e.target.value)}
              style={{ width:'100%', padding:'10px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'0.85rem', outline:'none', boxSizing:'border-box' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display:'block', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'5px', fontWeight:'600' }}>Sale Time</label>
            <input type="time" value={saleTime} onChange={e => setSaleTime(e.target.value)}
              style={{ width:'100%', padding:'10px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'0.85rem', outline:'none', boxSizing:'border-box' }} />
          </div>
        </div>
        <div>
          <label style={{ display:'block', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'5px', fontWeight:'600' }}>Client</label>
          <AddClientModal open={showAddClient} onClose={()=>setShowAddClient(false)} onAdd={handleAddClientInline} />
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input value={clientName} onChange={(e)=>setClientName(e.target.value)} style={{ width:'100%', padding:'10px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'0.85rem', outline:'none', boxSizing:'border-box' }} />
            <button type="button" onClick={()=>setShowAddClient(true)}
              style={{ padding:'0 8px', background:'none', color:'#d4af37', border:'1px solid #d4af37', borderRadius:'50%', fontWeight:'700', fontSize:'1.2rem', cursor:'pointer', height:'28px', width:'28px', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:'1' }}
              title="Add new client">+</button>
          </div>
        </div>
        <div>
          <label style={{ display:'block', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'5px', fontWeight:'600' }}>Phone (optional)</label>
          <input value={clientPhone} onChange={(e)=>setClientPhone(e.target.value)} style={{ width:'100%', padding:'10px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'0.85rem', outline:'none', boxSizing:'border-box' }} />
        </div>
        <div>
          <label style={{ display:'block', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'5px', fontWeight:'600' }}>Sold by</label>
          <select value={barber} onChange={(e)=>setBarber(e.target.value)} style={{ width:'100%', padding:'10px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'0.85rem', outline:'none', boxSizing:'border-box', cursor:'pointer' }}>
            {barbers.map((b)=><option key={b.id} value={b.name.toLowerCase()}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display:'block', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'5px', fontWeight:'600' }}>Products</label>
          <ProductSelector products={products} value={soldProducts} onChange={setSoldProducts} />
        </div>
        <div>
          <label style={{ display:'block', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'5px', fontWeight:'600' }}>Payment</label>
          <select value={paymentMethod} onChange={(e)=>setPaymentMethod(e.target.value)} style={{ width:'100%', padding:'10px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'0.85rem', outline:'none', boxSizing:'border-box', cursor:'pointer' }}>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="VOUCHER">Voucher</option>
          </select>
        </div>
        <div>
          <label style={{ display:'block', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'5px', fontWeight:'600' }}>Note (optional)</label>
          <input value={note} onChange={(e)=>setNote(e.target.value)} style={{ width:'100%', padding:'10px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'0.85rem', outline:'none', boxSizing:'border-box' }} />
        </div>
        <div style={{ padding:'10px 12px', borderRadius:'8px', border:'1px solid rgba(212,175,55,0.25)', background:'rgba(212,175,55,0.06)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:'0.78rem', color:'var(--muted)' }}>Total</span>
          <span style={{ fontSize:'0.95rem', color:'#d4af37', fontWeight:'800' }}>£{total.toFixed(2)}</span>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--muted)', cursor:'pointer', fontSize:'0.82rem' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || total <= 0}
            style={{ flex:2, padding:'11px', background:saving || total <= 0 ? 'rgba(212,175,55,0.25)' : 'linear-gradient(135deg,#d4af37,#b8860b)', border:'none', borderRadius:'8px', color:saving || total <= 0 ? 'var(--muted)' : '#000', cursor:saving || total <= 0 ? 'not-allowed' : 'pointer', fontWeight:'700', fontSize:'0.82rem' }}>
            {saving ? 'Saving...' : 'Complete Sale'}
          </button>
        </div>
      </div>
    </div>
  );
}
