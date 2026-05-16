import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import config from '../config';
import { createWalkIn } from '../firestoreActions';
import { getAvailableBarbersForDate, normalizeSoldProducts } from '../utils/bookingUtils';
import { convertTo24, minsToLabel, formatDateKey } from '../utils/timeUtils';
import { getEffectiveDayHours } from '../utils/scheduleUtils';
import { hasTimeConflict } from '../utils/conflictUtils';
import AddClientModal from './AddClientModal';
import ProductSelector from './ProductSelector';

export default function WalkInForm({ preBarber, preHour, preMins, preDate, barbers, existingBookings, specialHours, products, onClose, onSaved }) {
  const [showAddClient, setShowAddClient] = useState(false);
  const handleAddClientInline = (client) => {
    setSearch(client.name || '');
    setSelectedClient({ name: client.name || '', phone: client.phone || '', email: client.email || '' });
    setShowAddClient(false);
  };
  const formDate = preDate || new Date();
  const availableBarbers = getAvailableBarbersForDate(barbers, formDate);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [showClientList, setShowClientList] = useState(false);
  const [service, setService] = useState(config.services ? config.services[0].id : '');
  const [barber, setBarber] = useState(() => {
    const preferredBarber = preBarber ? preBarber.name.toLowerCase() : '';
    const hasPreferredBarber = availableBarbers.some(b => b.name.toLowerCase() === preferredBarber);
    if (hasPreferredBarber) return preferredBarber;
    return availableBarbers[0] ? availableBarbers[0].name.toLowerCase() : '';
  });
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [walkInProducts, setWalkInProducts] = useState([]);

  const now = new Date();
  const defaultTime = minsToLabel(preMins !== undefined ? preMins : (preHour !== undefined ? preHour * 60 : Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15));
  const [time, setTime] = useState(defaultTime);
  const date = preDate ? (preDate.getDate() + ' ' + preDate.toLocaleDateString('en-GB', {month:'long'}) + ' ' + preDate.getFullYear()) : formatDateKey(new Date());

  useEffect(() => {
    if (!availableBarbers.some(b => b.name.toLowerCase() === barber)) {
      setBarber(availableBarbers[0] ? availableBarbers[0].name.toLowerCase() : '');
    }
  }, [availableBarbers, barber]);

  useEffect(() => {
    const map = {};
    (existingBookings || []).forEach(b => {
      if (!b.name || b.name === 'Walk-in') return;
      const key = b.phone || b.email || b.name;
      if (!map[key]) map[key] = { name: b.name, phone: b.phone || '', email: b.email || '', visits: 0, totalSpent: 0, lastService: '' };
      const c = map[key];
      if (b.status !== 'CANCELLED') {
        c.visits++;
        const _deposit = b.source === 'Booksy' && config.platforms?.booksy?.depositEnabled ? (config.platforms.booksy.depositAmount || 0) : 0;
        const _raw = parseFloat(String(b.paidAmount || b.price || '0').replace('£', '')) || 0;
        c.totalSpent += b.source === 'Booksy' ? (b.status === 'CHECKED_OUT' ? _raw + _deposit : _deposit) : _raw;
        c.lastService = b.service || c.lastService;
      }
    });
    getDocs(collection(db, 'tenants/whitecross/clients'))
      .then(snap => {
        snap.docs.forEach(d => { const m = d.data(); if (m.hidden) return; const key = m.phone || m.email || m.name; if (!map[key]) map[key] = { name: m.name || '', phone: m.phone || '', email: m.email || '', visits: 0, totalSpent: 0, lastService: '' }; });
        setClients(Object.values(map));
      })
      .catch(() => setClients(Object.values(map)));
  }, [existingBookings]);

  const filteredClients = clients.filter(c =>
    search.length > 1 && (
      (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
      String(c.phone || '').includes(search)
    )
  );

  const selectClient = (client) => {
    setSelectedClient(client);
    setSearch(client.name);
    setShowClientList(false);
  };

  const svc = config.services ? config.services.find(s => s.id === service) : null;

  const dayNameForForm = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][(preDate || new Date()).getDay()];
  const dayHoursForForm = getEffectiveDayHours((preDate || new Date()), dayNameForForm, config.hours, specialHours);
  const openMins = dayHoursForForm && !dayHoursForForm.closed ? convertTo24(dayHoursForForm.open) : 9 * 60;
  const closeMins = dayHoursForForm && !dayHoursForForm.closed ? convertTo24(dayHoursForForm.close) : 19 * 60;
  const hours = [];
  if (!dayHoursForForm.closed) {
    for (let mins = openMins; mins <= closeMins; mins += 15) {
      if (mins === closeMins) continue;
      const serviceForSlot = config.services ? config.services.find(s => s.id === service) : null;
      const durationForSlot = serviceForSlot ? (parseInt(serviceForSlot.duration, 10) || 30) : 30;
      const isBusy = !!barber && hasTimeConflict(existingBookings, { dateValue: date, barberValue: barber, startMinutes: mins, durationMinutes: durationForSlot });
      hours.push({ label: minsToLabel(mins), isBusy });
    }
  }

  const handleSave = async (goCheckout = false) => {
    if (!service || !barber) return;
    if (dayHoursForForm && dayHoursForForm.closed) { alert('The shop is closed on this day. No bookings can be made.'); return; }
    const _wchk = convertTo24(time);
    if (_wchk < openMins || _wchk >= closeMins) { alert('Selected time is outside working hours (' + minsToLabel(openMins) + '–' + minsToLabel(closeMins) + '). Please choose a valid time.'); return; }
    setSaving(true);
    const svcObj = config.services ? config.services.find(s => s.id === service) : null;
    const price = svcObj ? svcObj.price : 0;
    const duration = svcObj ? (parseInt(svcObj.duration) || 30) : 30;
    const selectedMins = convertTo24(time);
    if (hasTimeConflict(existingBookings, { dateValue: date, barberValue: barber, startMinutes: selectedMins, durationMinutes: duration })) {
      setSaving(false);
      alert('This time slot is already blocked or booked.');
      return;
    }
    const bookingData = {
      name: selectedClient ? selectedClient.name : (search.trim() || 'Walk-in'),
      email: selectedClient ? selectedClient.email : email.trim(),
      phone: selectedClient ? selectedClient.phone : phone.trim(),
      date, time, service, barber, price, duration,
      paymentType: 'CASH', status: 'CONFIRMED', source: 'Walk-in',
      soldProducts: walkInProducts.filter(p => p.qty > 0),
    };
    try {
      const bookingId = await createWalkIn(bookingData);
      bookingData.bookingId = bookingId;
      if (onSaved) onSaved(bookingData, goCheckout);
      if (!goCheckout && onClose) onClose();
    } catch(err) {
      console.error('WalkIn error:', err);
      if (onSaved) onSaved(bookingData, goCheckout);
      if (!goCheckout && onClose) onClose();
    } finally {
      setSaving(false);
    }
  };

  const inp = { width:'100%', padding:'10px 12px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'0.85rem', outline:'none', boxSizing:'border-box' };
  const lbl = { display:'block', fontSize:'0.62rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:'5px', fontWeight:'600' };

  return (
    <div style={{ width:'310px', flexShrink:0, background:'var(--card2)', border:'1px solid rgba(212,175,55,0.25)', borderRadius:'16px', display:'flex', flexDirection:'column', overflow:'hidden', maxHeight:'calc(100vh - 200px)', boxShadow:'0 8px 32px rgba(0,0,0,0.4)', position:'relative' }}>
      {saving && (
        <div style={{ position:'absolute', inset:0, background:'rgba(10,10,8,0.85)', zIndex:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'12px', borderRadius:'16px' }}>
          <div style={{ width:'36px', height:'36px', border:'3px solid rgba(212,175,55,0.2)', borderTop:'3px solid #d4af37', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
          <span style={{ fontSize:'0.78rem', color:'#d4af37', fontWeight:'600', letterSpacing:'1px' }}>Saving...</span>
        </div>
      )}
      <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(212,175,55,0.04)', flexShrink:0 }}>
        <span style={{ fontSize:'0.85rem', fontWeight:'700', color:'#d4af37' }}>🚶 Walk-in</span>
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'1rem' }}>x</button>
      </div>
      <div style={{ overflowY:'auto', flex:1, padding:'16px 20px', display:'flex', flexDirection:'column', gap:'14px' }}>
        <div style={{ position:'relative', display:'flex', alignItems:'center', gap:'6px' }}>
          <div style={{ flex:1 }}>
            <label style={lbl}>Client (optional)</label>
            <input value={search} onChange={e => { setSearch(e.target.value); setShowClientList(true); setSelectedClient(null); }}
              placeholder="Search name or phone..." style={inp} />
            {showClientList && filteredClients.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--card)', border:'1px solid var(--border)', borderRadius:'8px', zIndex:20, boxShadow:'0 8px 24px rgba(0,0,0,0.3)', maxHeight:'180px', overflowY:'auto', marginTop:'4px' }}>
                {filteredClients.map((c, i) => (
                  <div key={i} onClick={() => selectClient(c)}
                    style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(212,175,55,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <div>
                      <div style={{ fontSize:'0.82rem', fontWeight:'600', color:'var(--text)' }}>{c.name}</div>
                      <div style={{ fontSize:'0.65rem', color:'var(--muted)' }}>{c.phone} · {c.visits} visits</div>
                    </div>
                    <div style={{ fontSize:'0.65rem', color:'#d4af37' }}>{c.totalSpent}</div>
                  </div>
                ))}
              </div>
            )}
            {selectedClient && (
              <div style={{ marginTop:'8px', padding:'8px 12px', background:'rgba(212,175,55,0.06)', borderRadius:'8px', border:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:'0.78rem', fontWeight:'600', color:'var(--text)' }}>{selectedClient.name}</div>
                  <div style={{ fontSize:'0.62rem', color:'var(--muted)' }}>{selectedClient.visits} visits · {selectedClient.totalSpent} spent · Last: {selectedClient.lastService}</div>
                </div>
                <button onClick={() => { setSelectedClient(null); setSearch(''); }} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'0.8rem' }}>✕</button>
              </div>
            )}
          </div>
          <button type="button" onClick={() => setShowAddClient(true)} title="Add new client"
            style={{ width:'28px', height:'28px', borderRadius:'50%', border:'1px solid var(--border)', background:'transparent', color:'#d4af37', fontSize:'1.2rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', marginTop:'20px' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(212,175,55,0.08)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>+</button>
          <AddClientModal open={showAddClient} onClose={()=>setShowAddClient(false)} onAdd={handleAddClientInline} />
        </div>
        {!selectedClient && (
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            <div>
              <label style={lbl}>Phone <span style={{ color:'var(--muted)', fontWeight:'400', textTransform:'none', letterSpacing:0 }}>(optional)</span></label>
              <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+44 7..." style={inp} type="tel" />
            </div>
            <div>
              <label style={lbl}>Email <span style={{ color:'var(--muted)', fontWeight:'400', textTransform:'none', letterSpacing:0 }}>(optional)</span></label>
              <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@..." style={inp} type="email" />
            </div>
          </div>
        )}
        <div>
          <label style={lbl}>Service *</label>
          <select value={service} onChange={e => setService(e.target.value)} style={{ ...inp, cursor:'pointer' }}>
            {(config.services || []).map(s => <option key={s.id} value={s.id}>{s.name} — £{s.price}</option>)}
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
            {availableBarbers.map(b => (
              <button key={b.id} onClick={() => setBarber(b.name.toLowerCase())}
                style={{ flex:1, padding:'9px', borderRadius:'8px', border:'1px solid '+(barber===b.name.toLowerCase()?b.color:'var(--border)'), background:barber===b.name.toLowerCase()?b.color+'20':'transparent', color:barber===b.name.toLowerCase()?b.color:'var(--muted)', cursor:'pointer', fontSize:'0.78rem', fontWeight:'600', transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px' }}>
                <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:b.color }} />{b.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={lbl}>Time</label>
          <select value={time} onChange={e => setTime(e.target.value)} style={{ ...inp, cursor:'pointer' }} disabled={dayHoursForForm.closed || !hours.length}>
            {hours.map(h => <option key={h.label} value={h.label} disabled={h.isBusy}>{h.label}{h.isBusy ? ' - Busy' : ''}</option>)}
          </select>
        </div>
        {svc && (
          <div style={{ padding:'10px 14px', background:'rgba(212,175,55,0.06)', borderRadius:'8px', border:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:'0.78rem', color:'var(--muted)' }}>{svc.name} · {svc.duration}min</span>
            <span style={{ fontSize:'0.88rem', fontWeight:'700', color:'#d4af37' }}>£{svc.price}</span>
          </div>
        )}
        <div style={{ display:'flex', gap:'8px', paddingTop:'4px' }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--muted)', cursor:'pointer', fontSize:'0.82rem' }}>Cancel</button>
          <button onClick={() => handleSave(false)} disabled={saving || !service || !barber}
            style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid rgba(212,175,55,0.3)', borderRadius:'8px', color:'#d4af37', cursor:saving||!service||!barber?'not-allowed':'pointer', fontWeight:'600', fontSize:'0.82rem' }}>
            Save
          </button>
          <button onClick={() => handleSave(true)} disabled={saving || !service || !barber}
            style={{ flex:2, padding:'11px', background:saving||!service||!barber?'rgba(212,175,55,0.25)':'linear-gradient(135deg,#d4af37,#b8860b)', border:'none', borderRadius:'8px', color:saving||!service||!barber?'var(--muted)':'#000', cursor:saving||!service||!barber?'not-allowed':'pointer', fontWeight:'700', fontSize:'0.82rem' }}>
            Checkout
          </button>
        </div>
      </div>
    </div>
  );
}
