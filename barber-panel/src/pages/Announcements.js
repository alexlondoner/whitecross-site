import React, { useEffect, useRef, useState } from 'react';
import { db } from '../firebase';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';

const TENANT = 'whitecross';

const inp = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text)',
  fontSize: '0.85rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const lbl = {
  display: 'block',
  fontSize: '0.62rem',
  color: 'var(--muted)',
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  marginBottom: '5px',
  fontWeight: '600',
};

const card = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '18px 20px',
};

const blankForm = {
  icon: '📢',
  title: '',
  tag: '',
  content: '',
  active: true,
};

export default function Announcements() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const itemsRef = useRef([]);

  const syncItems = function(next) {
    itemsRef.current = next;
    setItems(next);
  };

  useEffect(function() {
    fetchItems();
  }, []);

  const fetchItems = async function() {
    setLoading(true);
    try {
      var snap;
      try {
        snap = await getDocs(query(collection(db, `tenants/${TENANT}/announcements`), orderBy('order', 'asc')));
      } catch (_) {
        snap = await getDocs(collection(db, `tenants/${TENANT}/announcements`));
      }
      var list = snap.docs.map(function(d) { return { docId: d.id, ...d.data() }; });
      list.sort(function(a, b) {
        var ao = typeof a.order === 'number' ? a.order : 999;
        var bo = typeof b.order === 'number' ? b.order : 999;
        if (ao !== bo) return ao - bo;
        return String(a.title || '').localeCompare(String(b.title || ''));
      });
      syncItems(list);
    } catch (err) {
      console.error('announcements fetch error:', err);
      syncItems([]);
    } finally {
      setLoading(false);
    }
  };

  const openNew = function() {
    setForm({ ...blankForm });
    setEditingId('new');
  };

  const openEdit = function(item) {
    setForm({
      icon: item.icon || '📢',
      title: item.title || '',
      tag: item.tag || '',
      content: item.content || '',
      active: item.active !== false,
    });
    setEditingId(item.docId);
  };

  const cancelEdit = function() {
    setEditingId(null);
    setForm({ ...blankForm });
  };

  const saveItem = async function() {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      var payload = {
        icon: (form.icon || '📢').trim(),
        title: form.title.trim(),
        tag: form.tag.trim(),
        content: form.content,
        active: form.active !== false,
        updatedAt: new Date().toISOString(),
      };

      if (editingId === 'new') {
        payload.order = itemsRef.current.length;
        payload.createdAt = new Date().toISOString();
        var ref = await addDoc(collection(db, `tenants/${TENANT}/announcements`), payload);
        syncItems([...itemsRef.current, { docId: ref.id, ...payload }]);
      } else {
        await updateDoc(doc(db, `tenants/${TENANT}/announcements`, editingId), payload);
        syncItems(itemsRef.current.map(function(it) {
          return it.docId === editingId ? { ...it, ...payload } : it;
        }));
      }
      cancelEdit();
    } catch (err) {
      console.error('announcements save error:', err);
      alert('Could not save announcement.');
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async function(item) {
    if (!window.confirm(`Delete announcement "${item.title}"?`)) return;
    try {
      await deleteDoc(doc(db, `tenants/${TENANT}/announcements`, item.docId));
      syncItems(itemsRef.current.filter(function(it) { return it.docId !== item.docId; }));
    } catch (err) {
      alert('Could not delete announcement.');
    }
  };

  const toggleActive = async function(item) {
    var next = item.active === false;
    try {
      await updateDoc(doc(db, `tenants/${TENANT}/announcements`, item.docId), { active: next, updatedAt: new Date().toISOString() });
      syncItems(itemsRef.current.map(function(it) {
        return it.docId === item.docId ? { ...it, active: next } : it;
      }));
    } catch (err) {
      alert('Could not update status.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text)' }}>Announcements</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
            Manage content for the announcements page.
          </p>
        </div>
        <button
          onClick={openNew}
          style={{
            padding: '10px 18px',
            background: 'linear-gradient(135deg,#d4af37,#b8860b)',
            border: 'none',
            borderRadius: '8px',
            color: '#000',
            fontWeight: '700',
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          + Add Announcement
        </button>
      </div>

      {/* New announcement form — only shown when editingId === 'new' */}
      {editingId === 'new' && (
        <div style={{ ...card, border: '1px solid rgba(212,175,55,0.35)', background: 'rgba(212,175,55,0.04)' }}>
          <div style={{ fontSize: '0.65rem', color: '#d4af37', letterSpacing: '2px', marginBottom: '14px', fontWeight: '700' }}>
            NEW ANNOUNCEMENT
          </div>
          <EditForm form={form} setForm={setForm} saving={saving} onSave={saveItem} onCancel={cancelEdit} inp={inp} lbl={lbl} />
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading announcements...</div>
      ) : items.length === 0 ? (
        <div style={{ ...card, color: 'var(--muted)', textAlign: 'center' }}>No announcements yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {items.map(function(item) {
            var isEditing = editingId === item.docId;
            return (
              <div key={item.docId} style={{ ...card, border: isEditing ? '1px solid rgba(212,175,55,0.35)' : '1px solid var(--border)', background: isEditing ? 'rgba(212,175,55,0.04)' : 'var(--card)' }}>
                {isEditing ? (
                  <>
                    <div style={{ fontSize: '0.65rem', color: '#d4af37', letterSpacing: '2px', marginBottom: '14px', fontWeight: '700' }}>
                      EDIT ANNOUNCEMENT
                    </div>
                    <EditForm form={form} setForm={setForm} saving={saving} onSave={saveItem} onCancel={cancelEdit} inp={inp} lbl={lbl} />
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1rem' }}>{item.icon || '📢'}</span>
                        <div style={{ fontSize: '0.95rem', color: 'var(--text)', fontWeight: '700' }}>{item.title}</div>
                        {!!item.tag && <span style={{ fontSize: '0.63rem', color: '#d4af37', letterSpacing: '1px', textTransform: 'uppercase' }}>{item.tag}</span>}
                      </div>
                      <span style={{ fontSize: '0.68rem', color: item.active === false ? '#ff5252' : '#4caf50', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                        {item.active === false ? 'Hidden' : 'Visible'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: '12px' }}>
                      {item.content}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={function() { toggleActive(item); }} style={{ padding: '8px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.75rem' }}>
                        {item.active === false ? 'Set Visible' : 'Set Hidden'}
                      </button>
                      <button onClick={function() { openEdit(item); }} style={{ padding: '8px 12px', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '8px', color: '#d4af37', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '700' }}>
                        Edit
                      </button>
                      <button onClick={function() { removeItem(item); }} style={{ padding: '8px 11px', background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.25)', borderRadius: '8px', color: '#ff5252', cursor: 'pointer', fontSize: '0.78rem' }}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EditForm({ form, setForm, saving, onSave, onCancel, inp, lbl }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <label style={lbl}>Icon</label>
          <input value={form.icon} onChange={function(e) { setForm(function(f) { return { ...f, icon: e.target.value }; }); }} style={inp} placeholder="📢" />
        </div>
        <div>
          <label style={lbl}>Tag</label>
          <input value={form.tag} onChange={function(e) { setForm(function(f) { return { ...f, tag: e.target.value }; }); }} style={inp} placeholder="Ongoing" />
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={lbl}>Title *</label>
        <input value={form.title} onChange={function(e) { setForm(function(f) { return { ...f, title: e.target.value }; }); }} style={inp} placeholder="Student Discount" />
      </div>

      <div style={{ marginBottom: '14px' }}>
        <label style={lbl}>Content *</label>
        <textarea
          value={form.content}
          onChange={function(e) { setForm(function(f) { return { ...f, content: e.target.value }; }); }}
          rows={9}
          style={{ ...inp, resize: 'vertical', lineHeight: 1.55 }}
          placeholder="Write the full announcement content..."
        />
      </div>

      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          id="announcementActive"
          type="checkbox"
          checked={form.active !== false}
          onChange={function(e) { setForm(function(f) { return { ...f, active: e.target.checked }; }); }}
        />
        <label htmlFor="announcementActive" style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          Visible on website
        </label>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={onCancel} style={{ padding: '10px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer' }}>
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || !form.title.trim() || !form.content.trim()}
          style={{
            padding: '10px 18px',
            background: saving ? 'rgba(212,175,55,0.3)' : 'linear-gradient(135deg,#d4af37,#b8860b)',
            border: 'none',
            borderRadius: '8px',
            color: saving ? 'var(--muted)' : '#000',
            fontWeight: '700',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </>
  );
}
