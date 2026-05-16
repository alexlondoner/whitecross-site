import React, { useState } from 'react';
import { normalizeSoldProducts, getProductsTotal } from '../utils/bookingUtils';
import ProductSelector from './ProductSelector';

export default function BookingProductsPanel({ booking, products, initialProducts, onClose, onSave }) {
  const [selectedProducts, setSelectedProducts] = useState(normalizeSoldProducts(initialProducts));
  const total = getProductsTotal(selectedProducts);

  return (
    <div style={{ width:'330px', flexShrink:0, background:'var(--card2)', border:'1px solid rgba(33,150,243,0.35)', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', maxHeight:'calc(100vh - 200px)', boxShadow:'0 8px 32px rgba(0,0,0,0.4)' }}>
      <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(33,150,243,0.05)' }}>
        <span style={{ fontSize:'0.85rem', fontWeight:'700', color:'#8bc4ff' }}>🛒 Add Products</span>
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'1rem' }}>x</button>
      </div>
      <div style={{ overflowY:'auto', flex:1, padding:'16px 20px', display:'flex', flexDirection:'column', gap:'12px' }}>
        <div style={{ fontSize:'0.75rem', color:'var(--muted)' }}>Booking: <span style={{ color:'var(--text)' }}>{booking.name}</span></div>
        <ProductSelector products={products} value={selectedProducts} onChange={setSelectedProducts} />
        <div style={{ padding:'10px 12px', borderRadius:'8px', border:'1px solid rgba(33,150,243,0.25)', background:'rgba(33,150,243,0.06)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:'0.78rem', color:'var(--muted)' }}>Products total</span>
          <span style={{ fontSize:'0.95rem', color:'#8bc4ff', fontWeight:'800' }}>£{total.toFixed(2)}</span>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--muted)', cursor:'pointer', fontSize:'0.82rem' }}>Cancel</button>
          <button onClick={() => onSave(selectedProducts)}
            style={{ flex:2, padding:'11px', background:'linear-gradient(135deg,#2196f3,#1976d2)', border:'none', borderRadius:'8px', color:'#fff', cursor:'pointer', fontWeight:'700', fontSize:'0.82rem' }}>
            Save Products
          </button>
        </div>
      </div>
    </div>
  );
}
