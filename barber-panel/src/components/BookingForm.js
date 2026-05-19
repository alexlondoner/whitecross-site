import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import config from '../config';
import { editBooking, createWalkIn } from '../firestoreActions';
import { getAvailableBarbersForDate } from '../utils/bookingUtils';
import { convertTo24, minsToLabel } from '../utils/timeUtils';
import { getEffectiveDayHours } from '../utils/scheduleUtils';
import { hasTimeConflict } from '../utils/conflictUtils';
import AddClientModal from './AddClientModal';

const COUNTRY_CODES = [
  { code: '+44', flag: 'UK' }, { code: '+1', flag: 'US' }, { code: '+90', flag: 'TR' },
  { code: '+49', flag: 'DE' }, { code: '+33', flag: 'FR' }, { code: '+34', flag: 'ES' },
  { code: '+39', flag: 'IT' }, { code: '+31', flag: 'NL' }, { code: '+48', flag: 'PL' },
  { code: '+380', flag: 'UA' }, { code: '+40', flag: 'RO' }, { code: '+92', flag: 'PK' },
  { code: '+91', flag: 'IN' }, { code: '+880', flag: 'BD' }, { code: '+234', flag: 'NG' },
  { code: '+20', flag: 'EG' }, { code: '+212', flag: 'MA' }, { code: '+966', flag: 'SA' },
  { code: '+971', flag: 'AE' },
];

export default function BookingForm({ preBarber, preHour, preMins, preDate, preBooking, barbers, existingBookings, specialHours, onClose, onSaved }) {
  const [showAddClient, setShowAddClient] = useState(false);
  const handleAddClientInline = (client) => {
    let code = '+44', local = String(client.phone || '');
    for (const cc of COUNTRY_CODES) { if(local.startsWith(cc.code)){code=cc.code;local=local.slice(cc.code.length).trim();break;} }
    setForm(f => ({ ...f, name: client.name || '', email: client.email || '', phone: client.phone || '', _countryCode: code, _phoneLocal: local }));
    setShowAddClient(false);
  };
  const isEdit = !!preBooking;
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [form, setForm] = useState(() => {
    if (isEdit) {
      const parts = (preBooking.date || '').split(' ');
      const months2 = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const dy = (parts[0] || '1').padStart(2,'0');
      const mo = String(months2.indexOf(parts[1]) + 1).padStart(2,'0');
      const yr = parts[2] || new Date().getFullYear();
      let existingCode = '+44', existingLocal = String(preBooking.phone || '');
      for (const c of COUNTRY_CODES) {
        if (existingLocal.startsWith(c.code)) { existingCode = c.code; existingLocal = existingLocal.slice(c.code.length).trim(); break; }
      }
      return { name:preBooking.name||'', email:preBooking.email||'', phone:preBooking.phone||'', service:preBooking.service||(config.services?config.services[0].id:''), barber:(preBooking.barber||'').toLowerCase(), date:yr+'-'+mo+'-'+dy, time:preBooking.time||'9:00 AM', paymentType:preBooking.paymentType||'CASH', _countryCode:existingCode, _phoneLocal:existingLocal };
    }
    return { name:'', email:'', phone:'', service:config.services?config.services[0].id:'', barber:preBarber?preBarber.name.toLowerCase():(barbers[0]?barbers[0].name.toLowerCase():''), date:preDate?preDate.toISOString().split('T')[0]:new Date().toISOString().split('T')[0], time:preMins!==undefined?minsToLabel(preMins):(preHour!==undefined?minsToLabel(preHour*60):'9:00 AM'), paymentType:'CASH', _countryCode:'+44', _phoneLocal:'' };
  });
  const [saving, setSaving] = useState(false);
  const [allClients, setAllClients] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const map = {};
    (existingBookings || []).forEach(b => {
      if (!b.name || b.name === 'Walk-in') return;
      const key = b.phone || b.email || b.name;
      if (!map[key]) map[key] = { name: b.name, phone: b.phone || '', email: b.email || '', visits: 0, totalSpent: 0 };
      const c = map[key];
      if (b.status !== 'CANCELLED') {
        c.visits++;
        const _deposit = b.source === 'Booksy' && config.platforms?.booksy?.depositEnabled ? (config.platforms.booksy.depositAmount || 0) : 0;
        const _raw = parseFloat(String(b.paidAmount || b.price || '0').replace('£', '')) || 0;
        c.totalSpent += b.source === 'Booksy' ? (b.status === 'CHECKED_OUT' ? _raw + _deposit : _deposit) : _raw;
      }
    });
    getDocs(collection(db, 'tenants/whitecross/clients'))
      .then(snap => {
        snap.docs.forEach(d => { const m = d.data(); if (m.hidden) return; const key = m.phone || m.email || m.name; if (!map[key]) map[key] = { name: m.name || '', phone: m.phone || '', email: m.email || '', visits: 0, totalSpent: 0 }; });
        setAllClients(Object.values(map));
      })
      .catch(() => setAllClients(Object.values(map)));
  }, [existingBookings]);

  const suggestions = form.name.length > 1
    ? allClients.filter(c => c.name.toLowerCase().includes(form.name.toLowerCase()) || c.phone.includes(form.name))
    : [];

  const handlePhoneChange = (local) => {
    const digits = local.replace(/[^\d\s]/g, '');
    setForm(f => ({ ...f, _phoneLocal:digits, phone:f._countryCode+digits.replace(/\s/g,'') }));
  };
  const handleCountryChange = (code) => {
    setForm(f => ({ ...f, _countryCode:code, phone:code+(f._phoneLocal||'').replace(/\s/g,'') }));
  };
  const validateEmail = (email) => {
    if (!email) return '';
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'Invalid email format';
  };
  const validatePhone = (phone) => {
    const s = String(phone || '').trim();
    if (!s) return '';
    if (!/^[+\d]/.test(s)) return '';
    const digits = s.replace(/[\s+\-()]/g, '');
    return digits.length >= 10 ? '' : 'Phone number too short';
  };

  const now = new Date();
  const [yr, mo, dy] = (form.date || '').split('-');
  const isFormToday = parseInt(yr)===now.getFullYear() && parseInt(mo)-1===now.getMonth() && parseInt(dy)===now.getDate();
  const formDateObj = form.date ? new Date(form.date + 'T00:00:00') : new Date();
  const availableBarbers = getAvailableBarbersForDate(barbers, formDateObj);
  const dayNameForForm = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][formDateObj.getDay()];
  const dayHoursForForm = getEffectiveDayHours(formDateObj, dayNameForForm, config.hours, specialHours);
  const openMins = dayHoursForForm && !dayHoursForForm.closed ? convertTo24(dayHoursForForm.open) : 9 * 60;
  const closeMins = dayHoursForForm && !dayHoursForForm.closed ? convertTo24(dayHoursForForm.close) : 19 * 60;
  const serviceForForm = config.services ? config.services.find(s => s.id === form.service) : null;
  const durationForForm = serviceForForm ? (parseInt(serviceForForm.duration, 10) || 30) : 30;
  const months2 = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const formDateValue = form.date ? (parseInt(dy) + ' ' + months2[parseInt(mo)-1] + ' ' + yr) : '';
  const hours = [];
  if (!dayHoursForForm.closed) {
    for (let mins = openMins; mins <= closeMins; mins += 15) {
      if (mins === closeMins) continue;
      const isBusy = !!form.barber && hasTimeConflict(existingBookings, {
        dateValue: formDateValue,
        barberValue: form.barber,
        startMinutes: mins,
        durationMinutes: durationForForm,
        ignoreBookingId: isEdit ? preBooking?.bookingId : undefined,
      });
      hours.push({ label: minsToLabel(mins), isBusy });
    }
  }

  useEffect(() => {
    if (!availableBarbers.some(b => b.name.toLowerCase() === form.barber)) {
      setForm(current => ({ ...current, barber: availableBarbers[0] ? availableBarbers[0].name.toLowerCase() : '' }));
    }
  }, [availableBarbers, form.barber]);

  const handleSave = async (goCheckout = false) => {
    const eErr = validateEmail(form.email);
    const pErr = validatePhone(form.phone);
    setEmailError(eErr); setPhoneError(pErr);
    if (eErr || pErr) return;
    if (!form.name.trim() || !form.service) return;
    if (!availableBarbers.some(b => b.name.toLowerCase() === form.barber)) {
      alert('Selected barber is not available on this day. Please choose an available barber.');
      return;
    }
    if (dayHoursForForm && dayHoursForForm.closed) { alert('The shop is closed on this day. No bookings can be made.'); return; }
    const _selMinsCheck = convertTo24(form.time);
    if (_selMinsCheck < openMins || _selMinsCheck >= closeMins) { alert('Selected time is outside working hours (' + minsToLabel(openMins) + '–' + minsToLabel(closeMins) + '). Please choose a valid time slot.'); return; }
    const service = serviceForForm;
    const price = service ? service.price : 0;
    const duration = service ? (parseInt(service.duration) || 30) : 30;
    const [yr2, mo2, dy2] = form.date.split('-');
    const dateStr = parseInt(dy2) + ' ' + months2[parseInt(mo2)-1] + ' ' + yr2;
    const today = new Date().toISOString().split('T')[0];
    if (!isEdit && form.date < today) { alert('Cannot book a past date.'); return; }
    const selectedMins = convertTo24(form.time);
    if (hasTimeConflict(existingBookings, {
      dateValue: dateStr,
      barberValue: form.barber,
      startMinutes: selectedMins,
      durationMinutes: duration,
      ignoreBookingId: isEdit ? preBooking?.bookingId : undefined,
    })) { alert('This time slot is already blocked or booked.'); return; }
    setSaving(true);
    const shouldSyncPaidAmount = isEdit && (preBooking?.status === 'CHECKED_OUT' || preBooking?.status === 'UNPAID');
    const bookingData = { name:form.name, email:form.email||'', phone:form.phone||'', date:dateStr, time:form.time, service:form.service, barber:form.barber, paymentType:form.paymentType||'CASH', status:isEdit?(preBooking.status||'CONFIRMED'):'CONFIRMED', bookingId:isEdit?preBooking.bookingId:'WCB-'+Date.now(), price:price, paidAmount:shouldSyncPaidAmount?price:'', discount:shouldSyncPaidAmount?0:(preBooking?.discount||0), tip:shouldSyncPaidAmount?0:(preBooking?.tip||0), splitSecond:shouldSyncPaidAmount?'':(preBooking?.splitSecond||''), splitAmount:shouldSyncPaidAmount?0:(preBooking?.splitAmount||0), remaining:'Fully paid', source:isEdit?(preBooking.source||'Walk-in'):'Walk-in', platformDepositAmount:preBooking?.platformDepositAmount||0 };
    try {
      if (isEdit) {
        await editBooking({ bookingId: bookingData.bookingId, name: bookingData.name, email: bookingData.email, phone: bookingData.phone, date: bookingData.date, time: bookingData.time, service: bookingData.service, barber: bookingData.barber, price, duration });
      } else {
        const newId = await createWalkIn({ name: bookingData.name, email: bookingData.email, phone: bookingData.phone, date: bookingData.date, time: bookingData.time, service: bookingData.service, barber: bookingData.barber, price: bookingData.price, paymentType: bookingData.paymentType, source: 'Walk-in', duration });
        bookingData.bookingId = newId;
      }
      if (onSaved) onSaved(bookingData, goCheckout);
      if (!goCheckout && onClose) onClose();
    } catch (err) {
      console.error('Save booking failed:', err);
      alert('Could not save booking changes. Please try again.');
    } finally { setSaving(false); }
  };

  const inp = { width:'100%', padding:'10px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'0.85rem', outline:'none', boxSizing:'border-box' };
  const lbl = { display:'block', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'5px', fontWeight:'600' };
  const errStyle = { fontSize:'0.62rem', color:'#ff5252', marginTop:'4px' };

  return (
    <div style={{ width:'310px', flexShrink:0, background:'var(--card2)', border:'1px solid rgba(212,175,55,0.25)', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', maxHeight:'calc(100vh - 200px)', boxShadow:'0 8px 32px rgba(0,0,0,0.4)', position:'relative' }}>
      {saving && (
        <div style={{ position:'absolute', inset:0, background:'rgba(10,10,8,0.85)', zIndex:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'12px', borderRadius:'16px' }}>
          <div style={{ width:'36px', height:'36px', border:'3px solid rgba(212,175,55,0.2)', borderTop:'3px solid #d4af37', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
          <span style={{ fontSize:'0.78rem', color:'#d4af37', fontWeight:'600', letterSpacing:'1px' }}>{isEdit ? 'Saving changes...' : 'Booking...'}</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(212,175,55,0.04)', flexShrink:0 }}>
        <span style={{ fontSize:'0.85rem', fontWeight:'700', color:'#d4af37' }}>{isEdit ? 'Edit Booking' : 'New Booking'}</span>
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'1rem', width:'24px', height:'24px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%' }}>x</button>
      </div>
      <div style={{ overflowY:'auto', flex:1, padding:'16px 20px', display:'flex', flexDirection:'column', gap:'12px' }}>
        <div style={{ position:'relative', display:'flex', alignItems:'center', gap:'6px' }}>
          <div style={{ flex:1 }}>
            <label style={lbl}>Customer Name *</label>
            <input value={form.name}
              onChange={e=>{ setForm({...form,name:e.target.value}); setShowSuggestions(true); }}
              onBlur={()=>setTimeout(()=>setShowSuggestions(false),150)}
              placeholder="Full name or search existing..." style={inp} />
            {showSuggestions && suggestions.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', zIndex:30, boxShadow:'0 8px 24px rgba(0,0,0,0.4)', maxHeight:'200px', overflowY:'auto', marginTop:'4px' }}>
                {suggestions.map((c,i) => (
                  <div key={i} onClick={()=>{
                    let code='+44', local=String(c.phone||'');
                    for (const cc of COUNTRY_CODES) { if(local.startsWith(cc.code)){code=cc.code;local=local.slice(cc.code.length).trim();break;} }
                    setForm({...form, name:c.name, email:c.email||'', phone:c.phone||'', _countryCode:code, _phoneLocal:local});
                    setShowSuggestions(false);
                  }}
                  style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(212,175,55,0.08)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div>
                      <div style={{ fontSize:'0.82rem', fontWeight:'600', color:'var(--text)' }}>{c.name}</div>
                      <div style={{ fontSize:'0.62rem', color:'var(--muted)' }}>{c.phone}{c.visits>0?' · '+c.visits+' visits':''}</div>
                    </div>
                    {c.totalSpent>0 && <span style={{ fontSize:'0.68rem', color:'#d4af37', fontWeight:'600' }}>£{c.totalSpent.toFixed(0)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={() => setShowAddClient(true)} title="Add new client"
            style={{ width:'28px', height:'28px', borderRadius:'50%', border:'1px solid var(--border)', background:'transparent', color:'#d4af37', fontSize:'1.2rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', marginTop:'20px' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(212,175,55,0.08)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>+</button>
          <AddClientModal open={showAddClient} onClose={()=>setShowAddClient(false)} onAdd={handleAddClientInline} />
        </div>
        <div>
          <label style={lbl}>Phone</label>
          <div style={{ display:'flex', gap:'6px' }}>
            <select value={form._countryCode} onChange={e=>handleCountryChange(e.target.value)} style={{ ...inp, width:'80px', flexShrink:0, padding:'10px 6px', cursor:'pointer' }}>
              {COUNTRY_CODES.map(c=><option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
            </select>
            <input value={form._phoneLocal} onChange={e=>handlePhoneChange(e.target.value)} placeholder="7700 000000" type="tel" style={{ ...inp, flex:1 }} onBlur={()=>setPhoneError(validatePhone(form.phone))} />
          </div>
          {phoneError && <div style={errStyle}>{phoneError}</div>}
        </div>
        <div>
          <label style={lbl}>Email</label>
          <input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="email@example.com" type="email" style={{ ...inp, borderColor:emailError?'#ff525240':'var(--border)' }} onBlur={()=>setEmailError(validateEmail(form.email))} />
          {emailError && <div style={errStyle}>{emailError}</div>}
        </div>
        <div>
          <label style={lbl}>Service *</label>
          <select value={form.service} onChange={e=>setForm({...form,service:e.target.value})} style={{ ...inp, cursor:'pointer' }}>
            {(config.services||[]).map(s=><option key={s.id} value={s.id}>{s.name} -- {s.price}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Barber</label>
          {availableBarbers.length === 0 && (
            <div style={{ marginBottom:'8px', padding:'10px 12px', background:'rgba(255,82,82,0.08)', border:'1px solid rgba(255,82,82,0.25)', borderRadius:'8px', fontSize:'0.72rem', color:'#ff8a80' }}>
              No barbers are available for this day.
            </div>
          )}
          <div style={{ display:'flex', gap:'6px' }}>
            {availableBarbers.map(b=>(
              <button key={b.id} onClick={()=>setForm({...form,barber:b.name.toLowerCase()})}
                style={{ flex:1, padding:'9px', borderRadius:'8px', border:'1px solid '+(form.barber===b.name.toLowerCase()?b.color:'var(--border)'), background:form.barber===b.name.toLowerCase()?b.color+'20':'transparent', color:form.barber===b.name.toLowerCase()?b.color:'var(--muted)', cursor:'pointer', fontSize:'0.78rem', fontWeight:'600', transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px' }}>
                <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:b.color }} />{b.name}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
          <div>
            <label style={lbl}>Date</label>
            <input type="date" value={form.date} min={isEdit ? undefined : new Date().toISOString().split('T')[0]} onChange={e=>setForm({...form,date:e.target.value})} style={inp} />
          </div>
          <div>
            <label style={lbl}>Time</label>
            <select value={form.time} onChange={e=>setForm({...form,time:e.target.value})} style={{ ...inp, cursor:'pointer' }} disabled={dayHoursForForm.closed || !hours.length}>
              {hours.map(h=><option key={h.label} value={h.label} disabled={h.isBusy}>{h.label}{h.isBusy?' - Busy':''}</option>)}
            </select>
            {dayHoursForForm.closed && <div style={{ fontSize:'0.62rem', color:'#ff5252', marginTop:'4px' }}>This date is closed{dayHoursForForm.note ? ': ' + dayHoursForForm.note : ''}.</div>}
          </div>
        </div>
        <div>
          <label style={lbl}>Payment</label>
        </div>
        <div style={{ display:'flex', gap:'8px', paddingTop:'4px' }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--muted)', cursor:'pointer', fontSize:'0.82rem' }}>Cancel</button>
          <button onClick={()=>handleSave(false)} disabled={saving||!form.name.trim()||!form.barber}
            style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid rgba(212,175,55,0.3)', borderRadius:'8px', color:'#d4af37', cursor:saving||!form.name.trim()||!form.barber?'not-allowed':'pointer', fontWeight:'600', fontSize:'0.82rem' }}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Save'}
          </button>
          {!isEdit && (
            <button onClick={()=>handleSave(true)} disabled={saving||!form.name.trim()||!form.barber}
              style={{ flex:2, padding:'11px', background:saving||!form.name.trim()||!form.barber?'rgba(212,175,55,0.25)':'linear-gradient(135deg,#d4af37,#b8860b)', border:'none', borderRadius:'8px', color:saving||!form.name.trim()||!form.barber?'var(--muted)':'#000', cursor:saving||!form.name.trim()||!form.barber?'not-allowed':'pointer', fontWeight:'700', fontSize:'0.82rem' }}>
              Checkout
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
