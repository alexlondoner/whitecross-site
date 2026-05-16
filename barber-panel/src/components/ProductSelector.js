import React, { useState } from 'react';
import { normalizeSoldProducts } from '../utils/bookingUtils';

export default function ProductSelector({ products, value, onChange }) {
  const [query, setQuery] = useState('');
  const normalized = normalizeSoldProducts(value);
  const qtyById = normalized.reduce((acc, p) => {
    acc[p.productId] = p.qty;
    return acc;
  }, {});

  const shown = (products || []).filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return String(p.name || '').toLowerCase().includes(q) || String(p.category || '').toLowerCase().includes(q);
  });

  const setQty = (product, qty) => {
    const next = normalizeSoldProducts([
      ...normalized.filter((p) => p.productId !== product.id),
      ...(qty > 0 ? [{ productId: product.id, name: product.name, price: parseFloat(product.price) || 0, qty }] : []),
    ]);
    onChange(next);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products..."
        style={{ width:'100%', padding:'8px 10px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'0.78rem', outline:'none', boxSizing:'border-box' }}
      />
      <div style={{ maxHeight:'220px', overflowY:'auto', border:'1px solid var(--border)', borderRadius:'10px', background:'var(--card)' }}>
        {shown.length === 0 && (
          <div style={{ padding:'12px', fontSize:'0.75rem', color:'var(--muted)', textAlign:'center' }}>No products found</div>
        )}
        {shown.map((p) => {
          const qty = qtyById[p.id] || 0;
          const disabled = p.active === false || p.inStock === false;
          return (
            <div key={p.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 10px', borderBottom:'1px solid var(--border)', opacity:disabled?0.45:1 }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:'0.78rem', color:'var(--text)', fontWeight:'600', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                <div style={{ fontSize:'0.65rem', color:'var(--muted)' }}>£{(parseFloat(p.price) || 0).toFixed(2)}{p.category ? ' · ' + p.category : ''}</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                <button type="button" disabled={disabled || qty <= 0} onClick={() => setQty(p, Math.max(0, qty - 1))}
                  style={{ width:'22px', height:'22px', borderRadius:'6px', border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor:disabled||qty<=0?'not-allowed':'pointer' }}>-</button>
                <span style={{ minWidth:'16px', textAlign:'center', fontSize:'0.78rem', color: qty > 0 ? '#d4af37' : 'var(--muted)', fontWeight:'700' }}>{qty}</span>
                <button type="button" disabled={disabled} onClick={() => setQty(p, qty + 1)}
                  style={{ width:'22px', height:'22px', borderRadius:'6px', border:'1px solid rgba(212,175,55,0.3)', background:'rgba(212,175,55,0.1)', color:'#d4af37', cursor:disabled?'not-allowed':'pointer' }}>+</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
