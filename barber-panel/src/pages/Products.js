import React, { useState, useEffect, useCallback } from 'react';
import { getProducts, addProduct, updateProduct, deleteProduct, toggleProductField } from '../firestoreActions';

const CATEGORIES = ['Hair Care', 'Beard Care', 'Accessories', 'Other'];
const CAT_EMOJI  = { 'Hair Care': '💇', 'Beard Care': '🧔', 'Accessories': '✂️', 'Other': '📦' };
const CAT_COLOR  = { 'Hair Care': '#d4af37', 'Beard Care': '#4caf50', 'Accessories': '#2196f3', 'Other': '#9c27b0' };

function emptyForm() {
  return { name: '', price: '', description: '', imageUrl: '', category: 'Hair Care', inStock: true, active: true, order: 0 };
}

function Toggle({ value, onChange, color = '#4caf50', size = 'md' }) {
  const w = size === 'sm' ? 36 : 44, h = size === 'sm' ? 20 : 24, r = size === 'sm' ? 3 : 3, d = size === 'sm' ? 14 : 18;
  return (
    <div onClick={e => { e.stopPropagation(); onChange(); }}
      style={{ width: w, height: h, borderRadius: h/2, cursor: 'pointer', background: value ? color : 'rgba(180,180,180,0.25)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: r, left: value ? w - d - r : r, width: d, height: d, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </div>
  );
}

export default function Products() {
  const [products, setProducts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filterCat, setFilterCat] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editProd, setEditProd]   = useState(null);
  const [form, setForm]           = useState(emptyForm());
  const [saving, setSaving]       = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [searchQ, setSearchQ]     = useState('');
  const [error, setError]         = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const list = await getProducts();
      setProducts(list);
    } catch (e) {
      console.error('fetchProducts:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Modal helpers ──────────────────────────────────────────────────────
  const openAdd = () => {
    setEditProd(null);
    setForm(emptyForm());
    setError('');
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditProd(p);
    setForm({
      name: p.name || '', price: String(p.price ?? ''), description: p.description || '',
      imageUrl: p.imageUrl || '', category: p.category || 'Hair Care',
      inStock: p.inStock !== false, active: p.active !== false, order: p.order ?? 0,
    });
    setError('');
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditProd(null); setError(''); };

  const f = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  // ── Save ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) { setError('Product name is required.'); return; }
    if (!form.price || isNaN(parseFloat(form.price))) { setError('Valid price is required.'); return; }
    setSaving(true); setError('');
    try {
      const data = { name: form.name.trim(), price: form.price, description: form.description.trim(), imageUrl: form.imageUrl.trim(), category: form.category, inStock: form.inStock, active: form.active, order: form.order };
      if (editProd) {
        await updateProduct(editProd.id, data);
        setProducts(prev => prev.map(p => p.id === editProd.id ? { ...p, ...data, price: parseFloat(data.price) || 0 } : p));
      } else {
        const newId = await addProduct(data);
        setProducts(prev => [...prev, { id: newId, ...data, price: parseFloat(data.price) || 0 }]);
      }
      closeModal();
      fetchAll();
    } catch (e) {
      setError('Could not save product. Please try again.');
      console.error('save product:', e);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────
  const handleDelete = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    setDeletingId(p.id);
    try {
      await deleteProduct(p.id);
      setProducts(prev => prev.filter(x => x.id !== p.id));
    } catch (e) {
      console.error('delete product:', e);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Toggle active / inStock ────────────────────────────────────────────
  const handleToggle = async (p, field) => {
    const newVal = !p[field];
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, [field]: newVal } : x));
    setTogglingId(p.id + field);
    try {
      await toggleProductField(p.id, field, newVal);
    } catch (e) {
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, [field]: !newVal } : x));
    } finally {
      setTogglingId(null);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────
  const q = searchQ.toLowerCase().trim();
  const bySearch = q ? products.filter(p => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)) : products;
  const filtered = filterCat === 'All' ? bySearch : bySearch.filter(p => p.category === filterCat);
  const totalActive  = products.filter(p => p.active).length;
  const totalInStock = products.filter(p => p.inStock).length;

  // ── Styles ─────────────────────────────────────────────────────────────
  const card   = { background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: '14px' };
  const inp    = { width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' };
  const lbl    = { display: 'block', fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '5px', fontWeight: '600' };

  return (
    <div style={{ maxWidth: '1100px' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>🛒 Products</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '4px 0 0' }}>Manage shop products — sell in-store or add to client checkouts</p>
        </div>
        <button onClick={openAdd}
          style={{ padding: '11px 22px', background: 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '10px', color: '#000', cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem', letterSpacing: '0.5px', boxShadow: '0 4px 14px rgba(212,175,55,0.35)' }}>
          + Add Product
        </button>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total',      value: products.length,  color: '#d4af37' },
          { label: 'Active',     value: totalActive,       color: '#4caf50' },
          { label: 'In Stock',   value: totalInStock,      color: '#2196f3' },
          { label: 'Categories', value: CATEGORIES.length, color: '#9c27b0' },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: '16px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.7rem', fontWeight: '800', color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        {['All', ...CATEGORIES].map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)}
            style={{ padding: '7px 15px', borderRadius: '20px', border: '1px solid ' + (filterCat === cat ? '#d4af37' : 'var(--border)'), background: filterCat === cat ? 'rgba(212,175,55,0.14)' : 'transparent', color: filterCat === cat ? '#d4af37' : 'var(--muted)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: filterCat === cat ? '700' : '400', transition: 'all 0.15s' }}>
            {cat !== 'All' ? `${CAT_EMOJI[cat]} ` : ''}{cat}
            {cat !== 'All' && <span style={{ marginLeft: '5px', fontSize: '0.65rem', opacity: 0.7 }}>({products.filter(p => p.category === cat).length})</span>}
          </button>
        ))}
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search products..."
          style={{ marginLeft: 'auto', padding: '7px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', color: 'var(--text)', fontSize: '0.78rem', outline: 'none', minWidth: '180px' }} />
      </div>

      {/* ── Product Grid ───────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '80px 20px', fontSize: '0.85rem' }}>Loading products...</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🛒</div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: '600', marginBottom: '6px' }}>
            {q ? `No products match "${searchQ}"` : filterCat === 'All' ? 'No products yet' : `No products in ${filterCat}`}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
            {q || filterCat !== 'All' ? 'Try a different filter or search.' : 'Click "Add Product" to get started.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', gap: '16px' }}>
          {filtered.map(p => {
            const catColor = CAT_COLOR[p.category] || '#d4af37';
            return (
              <div key={p.id} style={{ ...card, overflow: 'hidden', opacity: p.active ? 1 : 0.58, transition: 'opacity 0.2s, box-shadow 0.2s', boxShadow: p.active ? '0 2px 12px rgba(0,0,0,0.15)' : 'none' }}>
                {/* Product image / placeholder */}
                <div style={{ width: '100%', height: '105px', background: `${catColor}10`, borderBottom: `1px solid ${catColor}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                  ) : null}
                  <div style={{ fontSize: '2.8rem', display: p.imageUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                    {CAT_EMOJI[p.category] || '📦'}
                  </div>
                  {/* Category badge */}
                  <div style={{ position: 'absolute', top: '8px', left: '8px', padding: '3px 9px', borderRadius: '12px', background: `${catColor}22`, border: `1px solid ${catColor}44`, fontSize: '0.6rem', color: catColor, fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                    {p.category}
                  </div>
                  {/* Out of stock badge */}
                  {!p.inStock && (
                    <div style={{ position: 'absolute', top: '8px', right: '8px', padding: '3px 9px', borderRadius: '12px', background: 'rgba(255,82,82,0.18)', border: '1px solid rgba(255,82,82,0.4)', fontSize: '0.6rem', color: '#ff5252', fontWeight: '700' }}>OUT OF STOCK</div>
                  )}
                </div>

                <div style={{ padding: '14px 16px' }}>
                  {/* Name + Price */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', gap: '8px' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text)', lineHeight: 1.3 }}>{p.name}</span>
                    <span style={{ fontSize: '1rem', fontWeight: '800', color: '#d4af37', flexShrink: 0 }}>£{Number(p.price).toFixed(2)}</span>
                  </div>
                  {/* Description */}
                  {p.description ? (
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)', lineHeight: 1.45, marginBottom: '14px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</div>
                  ) : <div style={{ marginBottom: '14px' }} />}

                  {/* Controls */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="In Stock">
                      <Toggle value={p.inStock} onChange={() => handleToggle(p, 'inStock')} color="#2196f3" size="sm" />
                      <span style={{ fontSize: '0.65rem', color: p.inStock ? '#2196f3' : 'var(--muted)', fontWeight: '600' }}>Stock</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="Active / Visible">
                      <Toggle value={p.active} onChange={() => handleToggle(p, 'active')} color="#4caf50" size="sm" />
                      <span style={{ fontSize: '0.65rem', color: p.active ? '#4caf50' : 'var(--muted)', fontWeight: '600' }}>Active</span>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                      <button onClick={() => openEdit(p)}
                        style={{ padding: '5px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: '600' }}>
                        Edit
                      </button>
                      <button onClick={() => handleDelete(p)} disabled={deletingId === p.id}
                        style={{ padding: '5px 10px', background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.3)', borderRadius: '6px', color: '#ff5252', cursor: 'pointer', fontSize: '0.75rem', opacity: deletingId === p.id ? 0.5 : 1 }}>
                        {deletingId === p.id ? '…' : '🗑'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Modal ────────────────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={{ background: 'var(--card2)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>

            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#d4af37' }}>
                {editProd ? '✏️ Edit Product' : '➕ Add Product'}
              </h2>
              <button onClick={closeModal} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>✕</button>
            </div>

            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.3)', borderRadius: '8px', color: '#ff5252', fontSize: '0.8rem', marginBottom: '16px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Name + Price */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: '12px' }}>
                <div>
                  <label style={lbl}>Product Name *</label>
                  <input value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Layrite Pomade" style={inp} autoFocus />
                </div>
                <div>
                  <label style={lbl}>Price £ *</label>
                  <input type="number" min="0" step="0.01" value={form.price} onChange={e => f('price', e.target.value)} placeholder="12.99" style={inp} />
                </div>
              </div>

              {/* Category */}
              <div>
                <label style={lbl}>Category</label>
                <select value={form.category} onChange={e => f('category', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{CAT_EMOJI[c]} {c}</option>)}
                </select>
              </div>

              {/* Description */}
              <div>
                <label style={lbl}>Description <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: '400' }}>(optional)</span></label>
                <textarea value={form.description} onChange={e => f('description', e.target.value)} placeholder="Short product description shown on receipts and website..." style={{ ...inp, height: '76px', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.5' }} />
              </div>

              {/* Image URL */}
              <div>
                <label style={lbl}>Image URL <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: '400' }}>(optional)</span></label>
                <input value={form.imageUrl} onChange={e => f('imageUrl', e.target.value)} placeholder="https://example.com/image.jpg" style={inp} />
                {form.imageUrl && (
                  <div style={{ marginTop: '8px', width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <img src={form.imageUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                  </div>
                )}
              </div>

              {/* Order + Toggles */}
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '16px', alignItems: 'center' }}>
                <div>
                  <label style={lbl}>Display Order</label>
                  <input type="number" min="0" value={form.order} onChange={e => f('order', e.target.value)} style={inp} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
                    <Toggle value={form.inStock} onChange={() => f('inStock', !form.inStock)} color="#2196f3" />
                    <div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text)', fontWeight: '600' }}>In Stock</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{form.inStock ? 'Available for sale' : 'Marked as out of stock'}</div>
                    </div>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
                    <Toggle value={form.active} onChange={() => f('active', !form.active)} color="#4caf50" />
                    <div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text)', fontWeight: '600' }}>Active</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{form.active ? 'Shown in dashboard & website' : 'Hidden everywhere'}</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button onClick={closeModal}
                style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.price}
                style={{ flex: 2, padding: '11px', background: saving || !form.name.trim() || !form.price ? 'rgba(212,175,55,0.25)' : 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '8px', color: saving || !form.name.trim() || !form.price ? 'var(--muted)' : '#000', cursor: saving || !form.name.trim() || !form.price ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '0.85rem' }}>
                {saving ? 'Saving…' : editProd ? 'Save Changes' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
