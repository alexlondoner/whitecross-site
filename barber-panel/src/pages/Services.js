import React, { useState, useEffect } from 'react';
import config, { seedServices } from '../config';
import { db } from '../firebase';
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';

const TENANT = 'whitecross';
const CATEGORIES = ['Exclusive Bundles', 'Standard', 'Extras'];
const inp = { width:'100%', padding:'10px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'0.85rem', outline:'none', boxSizing:'border-box' };
const lbl = { display:'block', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'5px', fontWeight:'600' };
const card = { background:'var(--card)', border:'1px solid var(--border)', borderRadius:'12px', padding:'20px 24px' };

export default function Services() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null); // docId or 'new'
  const [form, setForm] = useState({ name:'', price:'', duration:'', category: CATEGORIES[0], description:'', stripeUrl:'', depositUrl:'' });
  const [saving, setSaving] = useState(false);
  const dragItem = React.useRef(null);
  const dragCategory = React.useRef(null);
  const servicesRef = React.useRef([]);

  const syncServices = (svcs) => {
    servicesRef.current = svcs;
    setServices(svcs);
  };

  useEffect(() => { fetchServices(); }, []);

  const fetchServices = async () => {
    try {
      const snap = await getDocs(query(collection(db, `tenants/${TENANT}/services`), orderBy('order', 'asc')));
      if (!snap.empty) {
        const svcs = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
        const needsBackfill = svcs.filter(s => !s.description || !s.stripeUrl || !s.category);
        if (needsBackfill.length > 0) {
          await Promise.all(needsBackfill.map(s => {
            const seed = seedServices.find(c => c.id === (s.id || s.docId));
            if (!seed) return Promise.resolve();
            const updates = {};
            if (!s.description && seed.description) updates.description = seed.description;
            if (!s.stripeUrl && seed.stripeUrl) updates.stripeUrl = seed.stripeUrl;
            if (s.depositUrl === undefined && seed.depositUrl !== undefined) updates.depositUrl = seed.depositUrl;
            if (!s.category && seed.category) updates.category = seed.category;
            if (Object.keys(updates).length > 0) return updateDoc(doc(db, `tenants/${TENANT}/services`, s.docId), updates);
            return Promise.resolve();
          }));
          needsBackfill.forEach(s => {
            const seed = seedServices.find(c => c.id === (s.id || s.docId));
            if (seed) {
              if (!s.description && seed.description) s.description = seed.description;
              if (!s.stripeUrl && seed.stripeUrl) s.stripeUrl = seed.stripeUrl;
              if (s.depositUrl === undefined && seed.depositUrl !== undefined) s.depositUrl = seed.depositUrl;
              if (!s.category && seed.category) s.category = seed.category;
            }
          });
        }
        syncServices(svcs);
        config.services = svcs.map(s => ({ id: s.id || s.docId, name: s.name, price: s.price, duration: s.duration, category: s.category, description: s.description || '', stripeUrl: s.stripeUrl || '', depositUrl: s.depositUrl || '' }));
      } else {
        const seeded = await Promise.all(
          config.services.map(async (s, i) => {
            const ref = await addDoc(collection(db, `tenants/${TENANT}/services`), { ...s, order: i, active: true });
            return { docId: ref.id, ...s, order: i, active: true };
          })
        );
        syncServices(seeded);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const openNew = () => {
    setForm({ name:'', price:'', duration:'', category: CATEGORIES[0], description:'', stripeUrl:'', depositUrl:'' });
    setEditingId('new');
  };

  const openEdit = (svc) => {
    setForm({ name: svc.name, price: svc.price, duration: svc.duration, category: svc.category || CATEGORIES[1], description: svc.description || '', stripeUrl: svc.stripeUrl || '', depositUrl: svc.depositUrl || '' });
    setEditingId(svc.docId);
  };

  const cancelEdit = () => setEditingId(null);

  const handleSave = async () => {
    if (!form.name.trim() || !form.price) return;
    setSaving(true);
    try {
      const data = {
        id: form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: form.name.trim(),
        price: parseFloat(form.price) || 0,
        duration: parseInt(form.duration) || 30,
        category: form.category || CATEGORIES[1],
        description: form.description.trim(),
        stripeUrl: form.stripeUrl.trim(),
        depositUrl: form.depositUrl.trim(),
        active: true,
      };
      let updated;
      if (editingId === 'new') {
        data.order = servicesRef.current.length;
        const ref = await addDoc(collection(db, `tenants/${TENANT}/services`), data);
        updated = [...servicesRef.current, { docId: ref.id, ...data }];
      } else {
        await updateDoc(doc(db, `tenants/${TENANT}/services`, editingId), data);
        updated = servicesRef.current.map(s => s.docId === editingId ? { ...s, ...data } : s);
      }
      syncServices(updated);
      config.services = updated.map(s => ({ id: s.id || s.docId, name: s.name, price: s.price, duration: s.duration, category: s.category, description: s.description || '', stripeUrl: s.stripeUrl || '', depositUrl: s.depositUrl || '' }));
      setEditingId(null);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleDelete = async (svc) => {
    if (!window.confirm(`Delete "${svc.name}"? This won't affect existing bookings.`)) return;
    try {
      await deleteDoc(doc(db, `tenants/${TENANT}/services`, svc.docId));
      const updated = servicesRef.current.filter(s => s.docId !== svc.docId);
      syncServices(updated);
      config.services = updated.map(s => ({ id: s.id || s.docId, name: s.name, price: s.price, duration: s.duration, category: s.category, description: s.description || '', stripeUrl: s.stripeUrl || '', depositUrl: s.depositUrl || '' }));
    } catch (e) { console.error(e); }
  };

  const handleDragStart = (docId, cat) => {
    dragItem.current = docId;
    dragCategory.current = cat;
  };

  const handleDragEnter = (targetDocId, cat) => {
    if (dragCategory.current !== cat) return;
    if (dragItem.current === targetDocId) return;
    const updated = [...servicesRef.current];
    const fromIdx = updated.findIndex(s => s.docId === dragItem.current);
    const toIdx = updated.findIndex(s => s.docId === targetDocId);
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    dragItem.current = targetDocId;
    syncServices(updated);
  };

  const handleDragEnd = async () => {
    dragItem.current = null;
    dragCategory.current = null;
    const latest = servicesRef.current;
    const ordered = [
      ...latest.filter(s => (s.category || CATEGORIES[1]) === 'Exclusive Bundles'),
      ...latest.filter(s => (s.category || CATEGORIES[1]) === 'Standard'),
      ...latest.filter(s => (s.category || CATEGORIES[1]) === 'Extras'),
    ];
    syncServices(ordered);
    config.services = ordered.map(s => ({ id: s.id || s.docId, name: s.name, price: s.price, duration: s.duration, category: s.category, description: s.description || '', stripeUrl: s.stripeUrl || '', depositUrl: s.depositUrl || '' }));
    await Promise.all(
      ordered.map((s, i) => updateDoc(doc(db, `tenants/${TENANT}/services`, s.docId), { order: i }))
    );
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--muted)' }}>Loading services...</div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <h1 style={{ fontSize:'1.4rem', fontWeight:'800', color:'var(--text)', margin:0 }}>Services</h1>
          <p style={{ fontSize:'0.72rem', color:'var(--muted)', margin:'4px 0 0' }}>{services.length} services · manage pricing & duration</p>
        </div>
        <button onClick={openNew}
          style={{ padding:'10px 20px', background:'linear-gradient(135deg,#d4af37,#b8860b)', border:'none', borderRadius:'8px', color:'#000', fontWeight:'700', fontSize:'0.82rem', cursor:'pointer', boxShadow:'0 4px 12px rgba(212,175,55,0.3)' }}>
          + Add Service
        </button>
      </div>

      {/* Add / Edit form */}
      {editingId !== null && (
        <div style={{ ...card, border:'1px solid rgba(212,175,55,0.35)', background:'rgba(212,175,55,0.04)' }}>
          <div style={{ fontSize:'0.7rem', color:'#d4af37', fontWeight:'700', letterSpacing:'2px', marginBottom:'16px' }}>
            {editingId === 'new' ? '✦ NEW SERVICE' : '✦ EDIT SERVICE'}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'14px' }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Service Name *</label>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Skin Fade Cut" style={inp} autoFocus />
            </div>
            <div>
              <label style={lbl}>Price (£) *</label>
              <input type="number" min="0" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="30" style={inp} />
            </div>
            <div>
              <label style={lbl}>Duration (min)</label>
              <input type="number" min="5" step="5" value={form.duration} onChange={e=>setForm(f=>({...f,duration:e.target.value}))} placeholder="30" style={inp} />
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Category</label>
              <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={{ ...inp, cursor:'pointer' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Description</label>
              <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Describe what's included in this service..." rows={4} style={{ ...inp, resize:'vertical', lineHeight:'1.5' }} />
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Stripe Payment URL</label>
              <input value={form.stripeUrl} onChange={e=>setForm(f=>({...f,stripeUrl:e.target.value}))} placeholder="https://buy.stripe.com/..." style={inp} />
            </div>
            {form.category !== 'Extras' && (
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Stripe Deposit URL</label>
                <input value={form.depositUrl} onChange={e=>setForm(f=>({...f,depositUrl:e.target.value}))} placeholder="https://buy.stripe.com/... (leave empty if no deposit option)" style={inp} />
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={cancelEdit}
              style={{ padding:'10px 18px', background:'transparent', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--muted)', cursor:'pointer', fontSize:'0.82rem' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.price}
              style={{ padding:'10px 22px', background: saving?'rgba(212,175,55,0.3)':'linear-gradient(135deg,#d4af37,#b8860b)', border:'none', borderRadius:'8px', color: saving?'var(--muted)':'#000', fontWeight:'700', fontSize:'0.82rem', cursor: saving?'not-allowed':'pointer' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Service list by category */}
      {CATEGORIES.map(cat => {
        const catSvcs = services.filter(s => (s.category || CATEGORIES[1]) === cat);
        if (!catSvcs.length) return null;
        return (
          <div key={cat} style={card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
              <div style={{ fontSize:'0.6rem', color:'#d4af37', letterSpacing:'2.5px', textTransform:'uppercase', fontWeight:'700' }}>{cat}</div>
              <div style={{ fontSize:'0.6rem', color:'var(--muted)', letterSpacing:'1px' }}>✋ drag to reorder</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              {catSvcs.map(svc => (
                <div key={svc.docId}
                  draggable
                  onDragStart={() => handleDragStart(svc.docId, cat)}
                  onDragEnter={() => handleDragEnter(svc.docId, cat)}
                  onDragEnd={handleDragEnd}
                  onDragOver={e => e.preventDefault()}
                  style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 14px', background:'rgba(255,255,255,0.02)', border:'1px solid var(--border)', borderRadius:'10px', cursor:'grab', transition:'background 0.15s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(212,175,55,0.04)'}
                  onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}>
                  <span style={{ color:'var(--muted)', fontSize:'0.8rem', flexShrink:0, cursor:'grab' }}>⠿</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'0.88rem', fontWeight:'600', color:'var(--text)' }}>{svc.name}</div>
                    <div style={{ fontSize:'0.65rem', color:'var(--muted)', marginTop:'3px' }}>{svc.duration} min</div>
                    {svc.description && (
                      <div style={{ fontSize:'0.72rem', color:'var(--muted)', marginTop:'5px', lineHeight:'1.45', opacity:0.8 }}>
                        {svc.description.length > 120 ? svc.description.slice(0, 120) + '…' : svc.description}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize:'1rem', fontWeight:'800', color:'#d4af37', flexShrink:0 }}>£{svc.price}</span>
                  <div style={{ display:'flex', gap:'5px', flexShrink:0 }}>
                    <button onClick={()=>openEdit(svc)} title="Edit"
                      style={{ width:'28px', height:'28px', background:'transparent', border:'1px solid rgba(212,175,55,0.35)', borderRadius:'6px', color:'#d4af37', cursor:'pointer', fontSize:'0.8rem' }}>✏️</button>
                    <button onClick={()=>handleDelete(svc)} title="Delete"
                      style={{ width:'28px', height:'28px', background:'transparent', border:'1px solid rgba(255,82,82,0.35)', borderRadius:'6px', color:'#ff5252', cursor:'pointer', fontSize:'0.8rem' }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
