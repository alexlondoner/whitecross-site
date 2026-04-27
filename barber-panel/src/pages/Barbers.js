import React, { useState, useEffect } from 'react';
import config from '../config';
import { db } from '../firebase';
import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const COLORS = ['#d4af37', '#4caf50', '#2196f3', '#e91e63', '#ff9800', '#9c27b0', '#00bcd4'];

const defaultBarber = {
  id: '',
  name: '',
  color: '#d4af37',
  photo: '',
  workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  hours: { open: '09:00', close: '19:00' },
};

export default function Barbers() {
  // config.barbers yerine boş dizi [] ile başlatıyoruz
  const [barbers, setBarbers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(Object.assign({}, defaultBarber));
  const [saved, setSaved] = useState(false);

  // Sayfa açıldığında verileri Cloud'dan (Sheets) çek
 const fetchBarbers = async function() {
  try {
    setLoading(true);
    const snap = await getDocs(collection(db, 'tenants/whitecross/barbers'));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (list.length > 0) setBarbers(list);
    else setBarbers(config.barbers);
  } catch (err) {
    setBarbers(config.barbers);
  } finally {
    setLoading(false);
  }
};

useEffect(function() { fetchBarbers(); }, []);

  const openAdd = function() {
    setForm(Object.assign({}, defaultBarber, { id: 'barber-' + Date.now() }));
    setEditId(null);
    setShowAdd(true);
  };

  const openEdit = function(barber) {
    setForm(Object.assign({}, defaultBarber, barber));
    setEditId(barber.id);
    setShowAdd(true);
  };

const handleSave = async function() {
    if (!form.name.trim()) return;
    try {
      const barberId = form.id || 'barber-' + Date.now();
      await setDoc(doc(db, 'tenants/whitecross/barbers', barberId), {
        id: barberId,
        name: form.name,
        color: form.color,
        photo: form.photo || '',
        workingDays: form.workingDays,
        hours: form.hours,
        active: true,
      });
      await fetchBarbers();
      setShowAdd(false);
      setSaved(true);
      setTimeout(function() { setSaved(false); }, 2000);
    } catch (err) {
      console.error('Save error:', err);
      alert('Error saving barber.');
    }
  };

 const handleDelete = async function(id) {
  if (!window.confirm('Remove this barber?')) return;
  try {
    await deleteDoc(doc(db, 'tenants/whitecross/barbers', id));
    await fetchBarbers();
  } catch (err) {
    alert('Error deleting barber.');
  }
};

  const toggleDay = function(day) {
    var days = form.workingDays || [];
    if (days.includes(day)) {
      setForm(Object.assign({}, form, { workingDays: days.filter(function(d) { return d !== day; }) }));
    } else {
      setForm(Object.assign({}, form, { workingDays: [...days, day] }));
    }
  };

  const handlePhoto = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      setForm(Object.assign({}, form, { photo: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', color: '#d4af37', marginBottom: '4px' }}>Barbers</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{barbers.length} barber{barbers.length !== 1 ? 's' : ''} on your team</p>
        </div>
        <button onClick={openAdd} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #d4af37, #b8860b)', border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem', letterSpacing: '1px' }}>
          + Add Barber
        </button>
      </div>

      {saved && (
        <div style={{ padding: '12px 16px', background: 'rgba(76,175,80,0.15)', border: '1px solid rgba(76,175,80,0.3)', borderRadius: '8px', color: '#4caf50', fontSize: '0.85rem' }}>
          ✅ Changes saved successfully to Google Sheets
        </div>
      )}

      {/* Barber cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {loading ? (
          <div style={{ color: 'var(--muted)', padding: '20px' }}>Loading team data...</div>
        ) : barbers.map(function(barber) {
          return (
            <div key={barber.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', transition: 'all 0.2s' }}>
              <div style={{ height: '4px', background: barber.color }} />
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '50%', overflow: 'hidden', background: barber.color + '22', border: '2px solid ' + barber.color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {barber.photo ? (
                      <img src={barber.photo} alt={barber.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '1.8rem' }}>✂️</span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text)', marginBottom: '4px' }}>{barber.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: barber.color }} />
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Active</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <div style={labelStyle}>Working Days</div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {DAYS.map(function(day) {
                      var active = (barber.workingDays || []).includes(day);
                      return (
                        <span key={day} style={{ padding: '3px 7px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '600', background: active ? barber.color + '22' : 'transparent', color: active ? barber.color : 'var(--muted)', border: '1px solid ' + (active ? barber.color + '44' : 'var(--border)') }}>
                          {day.slice(0, 3)}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <div style={labelStyle}>Hours</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text)' }}>
                    {(barber.hours && barber.hours.open) || '09:00'} — {(barber.hours && barber.hours.close) || '19:00'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={function() { openEdit(barber); }} style={{ flex: 1, padding: '10px', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '8px', color: '#d4af37', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}>
                    ✏️ Edit
                  </button>
                  <button onClick={function() { handleDelete(barber.id); }} style={{ padding: '10px 14px', background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.25)', borderRadius: '8px', color: '#ff5252', cursor: 'pointer', fontSize: '0.8rem' }}>
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
              <h2 style={{ fontSize: '1.1rem', color: '#d4af37', fontWeight: '700' }}>{editId ? 'Edit Barber' : 'Add New Barber'}</h2>
              <button onClick={function() { setShowAdd(false); }} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.3rem' }}>✕</button>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', background: form.color + '22', border: '2px solid ' + form.color, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}
                onClick={function() { document.getElementById('photoInput').click(); }}>
                {form.photo ? <img src={form.photo} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '2rem' }}>✂️</span>}
              </div>
              <input id="photoInput" type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
              <button onClick={function() { document.getElementById('photoInput').click(); }} style={{ fontSize: '0.72rem', color: 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Upload photo</button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Name</label>
              <input value={form.name} onChange={function(e) { setForm(Object.assign({}, form, { name: e.target.value })); }} placeholder="Barber name" style={inputStyle} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Calendar Color</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {COLORS.map(function(color) {
                  return (
                    <div key={color} onClick={function() { setForm(Object.assign({}, form, { color: color })); }}
                      style={{ width: '32px', height: '32px', borderRadius: '50%', background: color, cursor: 'pointer', border: form.color === color ? '3px solid #fff' : '3px solid transparent' }} />
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Working Days</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {DAYS.map(function(day) {
                  var active = (form.workingDays || []).includes(day);
                  return (
                    <button key={day} onClick={function() { toggleDay(day); }}
                      style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid ' + (active ? form.color : 'var(--border)'), background: active ? form.color + '22' : 'transparent', color: active ? form.color : 'var(--muted)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600' }}>
                      {day.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: '28px' }}>
              <label style={labelStyle}>Working Hours</label>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input type="time" value={(form.hours && form.hours.open) || '09:00'} onChange={function(e) { setForm(Object.assign({}, form, { hours: Object.assign({}, form.hours, { open: e.target.value }) })); }} style={Object.assign({}, inputStyle, { flex: 1 })} />
                <span style={{ color: 'var(--muted)' }}>—</span>
                <input type="time" value={(form.hours && form.hours.close) || '19:00'} onChange={function(e) { setForm(Object.assign({}, form, { hours: Object.assign({}, form.hours, { close: e.target.value }) })); }} style={Object.assign({}, inputStyle, { flex: 1 })} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={function() { setShowAdd(false); }} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} style={{ flex: 2, padding: '12px', background: 'linear-gradient(135deg, #d4af37, #b8860b)', border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer', fontWeight: '700' }}>{editId ? 'Save Changes' : 'Add Barber'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

var labelStyle = { display: 'block', fontSize: '0.72rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' };
var inputStyle = { width: '100%', padding: '12px 14px', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.9rem', outline: 'none' };