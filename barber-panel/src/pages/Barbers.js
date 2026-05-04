import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

const TENANT = 'whitecross';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const COLORS = ['#d4af37', '#4caf50', '#2196f3', '#e91e63', '#ff9800', '#9c27b0', '#00bcd4'];
const DEFAULT_WORKING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_HOURS = { open: '09:00', close: '19:00' };

const defaultActiveByName = function(name) {
  var n = String(name || '').trim().toLowerCase();
  if (n === 'kadim' || n === 'manoj') return false;
  return true;
};

const createDayHours = function(sharedHours) {
  return DAYS.reduce(function(acc, day) {
    acc[day] = Object.assign({}, DEFAULT_HOURS, sharedHours || {});
    return acc;
  }, {});
};

const defaultBarber = {
  id: '',
  name: '',
  color: '#d4af37',
  photo: '',
  active: true,
  order: '',
  workingDays: DEFAULT_WORKING_DAYS,
  hours: DEFAULT_HOURS,
  dayHours: createDayHours(DEFAULT_HOURS),
};

const normalizeBarberForm = function(barber) {
  var workingDays = Array.isArray(barber && barber.workingDays) && barber.workingDays.length ? barber.workingDays : DEFAULT_WORKING_DAYS;
  var hours = Object.assign({}, DEFAULT_HOURS, barber && barber.hours ? barber.hours : {});
  var dayHours = createDayHours(hours);
  DAYS.forEach(function(day) {
    if (barber && barber.dayHours && barber.dayHours[day]) {
      dayHours[day] = Object.assign({}, dayHours[day], barber.dayHours[day]);
    }
  });
  return Object.assign({}, defaultBarber, barber, { workingDays, hours, dayHours });
};

export default function Barbers() {
  const [barbers, setBarbers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(Object.assign({}, defaultBarber));
  const [saved, setSaved] = useState(false);

  const fetchBarbers = async function() {
    try {
      setLoading(true);
      var snap = await getDocs(collection(db, `tenants/${TENANT}/barbers`));
      var list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      list.sort(function(a, b) {
        var ao = typeof a.order === 'number' ? a.order : 999;
        var bo = typeof b.order === 'number' ? b.order : 999;
        if (ao !== bo) return ao - bo;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });

      setBarbers(list);
    } catch (err) {
      setBarbers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(function() { fetchBarbers(); }, []);

  const openAdd = function() {
    setForm(normalizeBarberForm(Object.assign({}, defaultBarber, { id: 'barber-' + Date.now() })));
    setEditId(null);
    setShowAdd(true);
  };

  const openEdit = function(barber) {
    setForm(normalizeBarberForm(barber));
    setEditId(barber.id);
    setShowAdd(true);
  };

  const handleSave = async function() {
    if (!form.name.trim()) return;
    try {
      const barberId = form.id || 'barber-' + Date.now();
      var active = typeof form.active === 'boolean' ? form.active : defaultActiveByName(form.name);
      var primaryDay = (form.workingDays || [])[0];
      var primaryHours = primaryDay && form.dayHours && form.dayHours[primaryDay]
        ? form.dayHours[primaryDay]
        : Object.assign({}, DEFAULT_HOURS, form.hours || {});
      const orderVal = parseInt(form.order, 10);
      await setDoc(doc(db, `tenants/${TENANT}/barbers`, barberId), {
        id: barberId,
        name: form.name,
        color: form.color,
        photo: form.photo || '',
        workingDays: form.workingDays,
        hours: { open: primaryHours.open, close: primaryHours.close },
        dayHours: form.dayHours,
        active: active,
        ...(Number.isFinite(orderVal) ? { order: orderVal } : {}),
      });
      await fetchBarbers();
      setShowAdd(false);
      setSaved(true);
      setTimeout(function() { setSaved(false); }, 2000);
    } catch (err) {
      console.error('Save error:', err);
      alert('Error saving team member.');
    }
  };

  const handleDelete = async function(id) {
    if (!window.confirm('Remove this team member?')) return;
    try {
      await deleteDoc(doc(db, `tenants/${TENANT}/barbers`, id));
      await fetchBarbers();
    } catch (err) {
      alert('Error deleting team member.');
    }
  };

  const toggleBarberActive = async function(barber) {
    try {
      const nextActive = barber.active === false ? true : false;
      await updateDoc(doc(db, `tenants/${TENANT}/barbers`, barber.id), { active: nextActive });
      await fetchBarbers();
      setSaved(true);
      setTimeout(function() { setSaved(false); }, 1500);
    } catch (err) {
      alert('Error updating barber status.');
    }
  };

  const toggleDay = function(day) {
    var days = form.workingDays || [];
    var nextDayHours = Object.assign({}, form.dayHours || createDayHours(form.hours));
    if (days.includes(day)) {
      setForm(Object.assign({}, form, {
        workingDays: days.filter(function(d) { return d !== day; }),
        dayHours: nextDayHours,
      }));
    } else {
      nextDayHours[day] = Object.assign({}, DEFAULT_HOURS, form.hours || {}, nextDayHours[day] || {});
      setForm(Object.assign({}, form, {
        workingDays: DAYS.filter(function(d) { return d === day || days.includes(d); }),
        dayHours: nextDayHours,
      }));
    }
  };

  const updateDayHours = function(day, key, value) {
    var nextDayHours = Object.assign({}, form.dayHours || createDayHours(form.hours));
    nextDayHours[day] = Object.assign({}, DEFAULT_HOURS, form.hours || {}, nextDayHours[day] || {}, { [key]: value });
    setForm(Object.assign({}, form, { dayHours: nextDayHours }));
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', color: '#d4af37', marginBottom: '4px' }}>Team Members</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{barbers.length} team member{barbers.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openAdd} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #d4af37, #b8860b)', border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem', letterSpacing: '1px' }}>
          + Add Team Member
        </button>
      </div>

      {saved && (
        <div style={{ padding: '12px 16px', background: 'rgba(76,175,80,0.15)', border: '1px solid rgba(76,175,80,0.3)', borderRadius: '8px', color: '#4caf50', fontSize: '0.85rem' }}>
          ✅ Changes saved successfully
        </div>
      )}

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
                    <div style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text)', marginBottom: '4px' }}>{barber.name}{typeof barber.order === 'number' ? <span style={{ fontSize: '0.65rem', color: 'var(--muted)', marginLeft: '6px', fontWeight: '400' }}>#{barber.order}</span> : null}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: barber.active === false ? '#ff5252' : '#4caf50' }} />
                      <span style={{ fontSize: '0.72rem', color: barber.active === false ? '#ff5252' : '#4caf50', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>
                        {barber.active === false ? 'Passive' : 'Active'}
                      </span>
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {((barber.workingDays || []).length ? barber.workingDays : []).map(function(day) {
                      var dh = Object.assign({}, DEFAULT_HOURS, barber.hours || {}, barber.dayHours && barber.dayHours[day] ? barber.dayHours[day] : {});
                      return (
                        <div key={day} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '0.8rem', color: 'var(--text)' }}>
                          <span style={{ color: 'var(--muted)' }}>{day.slice(0, 3)}</span>
                          <span>{dh.open || '09:00'} — {dh.close || '19:00'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={function() { toggleBarberActive(barber); }}
                    style={{ padding: '10px 12px', background: barber.active === false ? 'rgba(255,82,82,0.12)' : 'rgba(76,175,80,0.12)', border: '1px solid ' + (barber.active === false ? 'rgba(255,82,82,0.35)' : 'rgba(76,175,80,0.35)'), borderRadius: '8px', color: barber.active === false ? '#ff5252' : '#4caf50', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700' }}>
                    {barber.active === false ? 'Set Active' : 'Set Passive'}
                  </button>
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

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
              <h2 style={{ fontSize: '1.1rem', color: '#d4af37', fontWeight: '700' }}>{editId ? 'Edit Team Member' : 'Add New Team Member'}</h2>
              <button onClick={function() { setShowAdd(false); }} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.3rem' }}>✕</button>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', background: form.color + '22', border: '2px solid ' + form.color, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                onClick={function() { document.getElementById('photoInput').click(); }}>
                {form.photo ? <img src={form.photo} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '2rem' }}>✂️</span>}
              </div>
              <input id="photoInput" type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
              <button onClick={function() { document.getElementById('photoInput').click(); }} style={{ fontSize: '0.72rem', color: 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Upload photo</button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Name</label>
              <input value={form.name} onChange={function(e) {
                var nextName = e.target.value;
                var next = Object.assign({}, form, { name: nextName });
                if (!editId) next.active = defaultActiveByName(nextName);
                setForm(next);
              }} placeholder="Team member name" style={inputStyle} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Display Order (1 = first)</label>
              <input type="number" min="1" max="99" value={form.order} onChange={function(e) { setForm(Object.assign({}, form, { order: e.target.value })); }} placeholder="e.g. 1" style={{ ...inputStyle, width: '80px' }} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Booking Status</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={function() { setForm(Object.assign({}, form, { active: true })); }}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid rgba(76,175,80,0.35)', background: form.active === true ? 'rgba(76,175,80,0.2)' : 'transparent', color: '#4caf50', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '700' }}>
                  Active
                </button>
                <button onClick={function() { setForm(Object.assign({}, form, { active: false })); }}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,82,82,0.35)', background: form.active === false ? 'rgba(255,82,82,0.2)' : 'transparent', color: '#ff5252', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '700' }}>
                  Passive
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Calendar Color</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {COLORS.map(function(color) {
                  return (
                    <div key={color} onClick={function() { setForm(Object.assign({}, form, { color })); }}
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
              <label style={labelStyle}>Working Hours By Day</label>
              {(form.workingDays || []).length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(form.workingDays || []).map(function(day) {
                    var dh = Object.assign({}, DEFAULT_HOURS, form.hours || {}, form.dayHours && form.dayHours[day] ? form.dayHours[day] : {});
                    return (
                      <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.12)' }}>
                        <div style={{ width: '92px', color: 'var(--text)', fontSize: '0.82rem', fontWeight: '600', flexShrink: 0 }}>{day}</div>
                        <input type="time" value={dh.open} onChange={function(e) { updateDayHours(day, 'open', e.target.value); }} style={Object.assign({}, inputStyle, { flex: 1, marginBottom: 0 })} />
                        <span style={{ color: 'var(--muted)' }}>—</span>
                        <input type="time" value={dh.close} onChange={function(e) { updateDayHours(day, 'close', e.target.value); }} style={Object.assign({}, inputStyle, { flex: 1, marginBottom: 0 })} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)', color: 'var(--muted)', fontSize: '0.82rem' }}>
                  Select at least one working day to set hours.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={function() { setShowAdd(false); }} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} style={{ flex: 2, padding: '12px', background: 'linear-gradient(135deg, #d4af37, #b8860b)', border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer', fontWeight: '700' }}>{editId ? 'Save Changes' : 'Add Team Member'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: '0.72rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' };
const inputStyle = { width: '100%', padding: '12px 14px', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.9rem', outline: 'none' };