import React, { useState } from 'react';

export default function Cart({ cartItems, onCheckout, onRemove }) {
  const total = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  return (
    <div style={{ maxWidth: 400, margin: '40px auto', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
      <h2 style={{ fontWeight: 800, color: '#d4af37', marginBottom: 18 }}>🛒 Sepet</h2>
      {cartItems.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>Sepetiniz boş.</div>
      ) : (
        <>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {cartItems.map((item, i) => (
              <li key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span>
                  {item.name} <span style={{ color: 'var(--muted)', fontSize: '0.85em' }}>x{item.qty}</span>
                </span>
                <span>£{(item.price * item.qty).toFixed(2)}</span>
                <button onClick={() => onRemove(item.id)} style={{ marginLeft: 10, background: 'none', border: 'none', color: '#ff5252', cursor: 'pointer' }}>✕</button>
              </li>
            ))}
          </ul>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', margin: '18px 0 10px', color: '#d4af37' }}>Toplam: £{total.toFixed(2)}</div>
          <button onClick={onCheckout} style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: 8, color: '#000', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>
            Ödeme Yap
          </button>
        </>
      )}
    </div>
  );
}
