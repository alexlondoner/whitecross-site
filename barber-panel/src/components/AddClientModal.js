import React from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getActiveTenant } from '../firestoreActions';

export default function AddClientModal({ open, onClose, onAdd }) {
  const [form, setForm] = React.useState({ name: '', phone: '', email: '', birthday: '', notes: '' });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Name is required.');
    if (!form.phone.trim() && !form.email.trim()) return setError('Please enter at least a phone number or email.');
    setSaving(true);
    try {
      const docRef = await addDoc(collection(db, `${getActiveTenant()}/clients`), {
        ...form,
        createdAt: serverTimestamp(),
      });
      if (onAdd) onAdd({ id: docRef.id, ...form });
      setForm({ name: '', phone: '', email: '', birthday: '', notes: '' });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add client');
    } finally {
      setSaving(false);
    }
  };

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const phoneOk = form.phone.trim().length > 0;
  const emailOk = form.email.trim().length > 0;
  const contactMissing = !phoneOk && !emailOk;

  if (!open) return null;

  const inputWrap = {
    display: 'flex', alignItems: 'center', gap: '8px',
    background: 'var(--card2)',
    border: '1px solid var(--border)',
    borderRadius: '8px', padding: '0 12px', height: '40px', transition: 'all 0.15s',
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'16px', width:'100%', maxWidth:'460px', overflow:'hidden', boxShadow:'0 24px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
            <div style={{ width:'40px', height:'40px', borderRadius:'12px', background:'rgba(212,175,55,0.12)', border:'1px solid rgba(212,175,55,0.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px' }}>
              👤
            </div>
            <div>
              <div style={{ fontSize:'15px', fontWeight:'700', color:'var(--text)' }}>Add New Client</div>
              <div style={{ fontSize:'11px', color:'rgba(212,175,55,0.7)', letterSpacing:'0.5px', textTransform:'uppercase', marginTop:'2px' }}>New profile</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width:'28px', height:'28px', borderRadius:'8px', background:'var(--card2)', border:'1px solid var(--border)', color:'var(--muted)', fontSize:'16px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:'14px' }}>

            {/* Name */}
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              <label style={{ fontSize:'10px', fontWeight:'700', color:'rgba(212,175,55,0.8)', letterSpacing:'1.2px', textTransform:'uppercase' }}>
                NAME <span style={{ color:'#ff5252' }}>*</span>
              </label>
              <div style={inputWrap}>
                <span style={{ color:'var(--muted2)', fontSize:'15px' }}>✦</span>
                <input
                  value={form.name} onChange={set('name')} placeholder="Full name"
                  style={{ background:'transparent', border:'none', outline:'none', color:'var(--text)', fontSize:'13px', width:'100%' }} />
              </div>
            </div>

            {/* Phone + Email row */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                <label style={{ fontSize:'10px', fontWeight:'700', letterSpacing:'1.2px', textTransform:'uppercase', color: contactMissing ? '#ff9800' : phoneOk ? '#4caf50' : 'rgba(212,175,55,0.8)' }}>
                  PHONE {!emailOk && <span style={{ color:'#ff9800' }}>*</span>}
                </label>
                <div style={{ ...inputWrap, borderColor: contactMissing ? 'rgba(255,152,0,0.4)' : phoneOk ? 'rgba(76,175,80,0.4)' : 'var(--border)' }}>
                  <span style={{ color:'var(--muted2)', fontSize:'13px' }}>📞</span>
                  <input
                    type="tel" value={form.phone} onChange={set('phone')} placeholder="+44 7..."
                    style={{ background:'transparent', border:'none', outline:'none', color:'var(--text)', fontSize:'13px', width:'100%' }} />
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                <label style={{ fontSize:'10px', fontWeight:'700', letterSpacing:'1.2px', textTransform:'uppercase', color: contactMissing ? '#ff9800' : emailOk ? '#4caf50' : 'rgba(212,175,55,0.8)' }}>
                  EMAIL {!phoneOk && <span style={{ color:'#ff9800' }}>*</span>}
                </label>
                <div style={{ ...inputWrap, borderColor: contactMissing ? 'rgba(255,152,0,0.4)' : emailOk ? 'rgba(76,175,80,0.4)' : 'var(--border)' }}>
                  <span style={{ color:'var(--muted2)', fontSize:'13px' }}>✉</span>
                  <input
                    type="email" value={form.email} onChange={set('email')} placeholder="email@example.com"
                    style={{ background:'transparent', border:'none', outline:'none', color:'var(--text)', fontSize:'13px', width:'100%' }} />
                </div>
              </div>
            </div>

            {/* Contact hint */}
            {contactMissing && (
              <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'rgba(255,152,0,0.08)', border:'1px solid rgba(255,152,0,0.2)', borderRadius:'8px', padding:'8px 12px', fontSize:'11px', color:'#ff9800' }}>
                <span>⚠️</span> At least a phone number or email is required.
              </div>
            )}

            {/* Birthday */}
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              <label style={{ fontSize:'10px', fontWeight:'700', color:'rgba(212,175,55,0.8)', letterSpacing:'1.2px', textTransform:'uppercase', display:'flex', alignItems:'center', gap:'6px' }}>
                🎂 BIRTHDAY <span style={{ fontWeight:'400', color:'var(--muted)', textTransform:'none', letterSpacing:0, fontSize:'10px' }}>optional</span>
              </label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
                <div style={inputWrap}>
                  <input
                    type="number" min="1" max="31" placeholder="DD"
                    value={form.birthday ? form.birthday.split('-')[2] || '' : ''}
                    onChange={e => {
                      const parts = (form.birthday || '--').split('-');
                      setForm(f => ({ ...f, birthday: `${parts[0]||''}-${parts[1]||''}-${e.target.value.padStart(2,'0')}` }));
                    }}
                    style={{ background:'transparent', border:'none', outline:'none', color:'var(--text)', fontSize:'13px', width:'100%', textAlign:'center' }} />
                </div>
                <select
                  value={form.birthday ? form.birthday.split('-')[1] || '' : ''}
                  onChange={e => {
                    const parts = (form.birthday || '--').split('-');
                    setForm(f => ({ ...f, birthday: `${parts[0]||''}-${e.target.value}-${parts[2]||''}` }));
                  }}
                  style={{ background:'var(--card2)', border:'1px solid var(--border)', borderRadius:'8px', color: form.birthday?.split('-')[1] ? 'var(--text)' : 'var(--muted)', fontSize:'13px', padding:'0 8px', height:'40px', outline:'none', cursor:'pointer' }}>
                  <option value="">Month</option>
                  {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i) => (
                    <option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>
                  ))}
                </select>
                <div style={inputWrap}>
                  <input
                    type="number" min="1920" max={new Date().getFullYear()} placeholder="YYYY"
                    value={form.birthday ? form.birthday.split('-')[0] || '' : ''}
                    onChange={e => {
                      const parts = (form.birthday || '--').split('-');
                      setForm(f => ({ ...f, birthday: `${e.target.value}-${parts[1]||''}-${parts[2]||''}` }));
                    }}
                    style={{ background:'transparent', border:'none', outline:'none', color:'var(--text)', fontSize:'13px', width:'100%', textAlign:'center' }} />
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'7px', background:'rgba(255,152,0,0.06)', border:'1px solid rgba(255,152,0,0.15)', borderRadius:'7px', padding:'7px 10px', fontSize:'11px', color:'#ff9800' }}>
                <span>🎁</span> Only used to send special offers on their birthday — never shared.
              </div>
            </div>

            {/* Notes */}
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              <label style={{ fontSize:'10px', fontWeight:'700', color:'rgba(212,175,55,0.8)', letterSpacing:'1.2px', textTransform:'uppercase' }}>NOTES</label>
              <div style={{ background:'var(--card2)', border:'1px solid var(--border)', borderRadius:'8px', padding:'10px 12px' }}>
                <textarea
                  rows={2} value={form.notes} onChange={set('notes')}
                  placeholder="Allergies, preferences, VIP status..."
                  style={{ background:'transparent', border:'none', outline:'none', color:'var(--text)', fontSize:'13px', width:'100%', resize:'none', fontFamily:'inherit', lineHeight:'1.5' }} />
              </div>
            </div>

            {/* Loyalty */}
            <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'rgba(212,175,55,0.07)', border:'1px solid rgba(212,175,55,0.18)', borderRadius:'8px', padding:'8px 12px', fontSize:'11px', color:'rgba(212,175,55,0.85)' }}>
              <span>⭐</span> Loyalty points start tracking automatically after first checkout.
            </div>

            {/* Error */}
            {error && (
              <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'rgba(255,82,82,0.1)', border:'1px solid rgba(255,82,82,0.25)', borderRadius:'8px', padding:'8px 12px', fontSize:'12px', color:'#ff5252' }}>
                <span>⚠️</span> {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding:'14px 24px', borderTop:'1px solid var(--border)', display:'flex', gap:'10px' }}>
            <button type="button" onClick={onClose}
              style={{ flex:1, height:'40px', borderRadius:'8px', background:'transparent', border:'1px solid var(--border)', color:'var(--muted)', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ flex:2, height:'40px', borderRadius:'8px', background: saving ? 'rgba(212,175,55,0.4)' : 'linear-gradient(135deg,#d4af37,#b8860b)', border:'none', color:'#000', fontSize:'13px', fontWeight:'800', cursor: saving ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'7px' }}>
              {saving ? '⏳ Saving…' : '👤 Add Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
