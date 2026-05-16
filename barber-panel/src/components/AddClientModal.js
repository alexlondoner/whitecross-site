import React from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function AddClientModal({ open, onClose, onAdd }) {
  const [form, setForm] = React.useState({ name: '', phone: '', email: '', notes: '' });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (!form.name.trim()) throw new Error('Name is required');
      const docRef = await addDoc(collection(db, 'tenants/whitecross/clients'), {
        ...form,
        createdAt: serverTimestamp(),
      });
      if (onAdd) onAdd({ id: docRef.id, ...form });
      setForm({ name: '', phone: '', email: '', notes: '' });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add client');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div style={{ position: 'fixed', top:0, left:0, width:'100vw', height:'100vh', background:'rgba(0,0,0,0.18)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:'12px', boxShadow:'0 2px 24px #0002', padding:'32px 28px', minWidth:'320px', maxWidth:'90vw', position:'relative' }}>
        <button onClick={onClose} style={{ position:'absolute', top:10, right:12, background:'none', border:'none', color:'#888', fontSize:'1.3rem', cursor:'pointer' }}>×</button>
        <h2 style={{ fontSize:'1.1rem', marginBottom:'18px', color:'#d4af37' }}>Add New Client</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:'0.8rem', color:'#888', fontWeight:600 }}>Name*</label>
            <input style={{ width:'100%', padding:'8px', borderRadius:'6px', border:'1px solid #ccc', marginTop:4 }}
              value={form.name} onChange={e=>setForm(f=>({...f, name:e.target.value}))} required />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:'0.8rem', color:'#888', fontWeight:600 }}>Phone</label>
            <input style={{ width:'100%', padding:'8px', borderRadius:'6px', border:'1px solid #ccc', marginTop:4 }}
              value={form.phone} onChange={e=>setForm(f=>({...f, phone:e.target.value}))} />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:'0.8rem', color:'#888', fontWeight:600 }}>Email</label>
            <input style={{ width:'100%', padding:'8px', borderRadius:'6px', border:'1px solid #ccc', marginTop:4 }}
              value={form.email} onChange={e=>setForm(f=>({...f, email:e.target.value}))} />
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:'0.8rem', color:'#888', fontWeight:600 }}>Notes</label>
            <textarea style={{ width:'100%', padding:'8px', borderRadius:'6px', border:'1px solid #ccc', marginTop:4, minHeight:40 }}
              value={form.notes} onChange={e=>setForm(f=>({...f, notes:e.target.value}))} />
          </div>
          {error && <div style={{ color:'#ff5252', marginBottom:10 }}>{error}</div>}
          <button type="submit" disabled={saving} style={{ background:'#d4af37', color:'#222', fontWeight:700, border:'none', borderRadius:'6px', padding:'10px 22px', fontSize:'1rem', cursor:'pointer' }}>{saving ? 'Saving…' : 'Add Client'}</button>
        </form>
      </div>
    </div>
  );
}
