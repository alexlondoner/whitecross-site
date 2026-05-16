import React, { useState, useEffect } from 'react';
import config from '../config';
import { blockTime } from '../firestoreActions';
import { getAvailableBarbersForDate } from '../utils/bookingUtils';
import { convertTo24, minsToLabel, formatDateKey } from '../utils/timeUtils';
import { getEffectiveDayHours } from '../utils/scheduleUtils';

export default function BlockTimeForm({ preBarber, preHour, preMins, preDate, barbers, specialHours, onClose, onSaved }) {
  const formDate = preDate || new Date();
  const availableBarbers = getAvailableBarbersForDate(barbers, formDate);
  const [barber, setBarber] = useState(() => {
    const preferredBarber = preBarber ? preBarber.name.toLowerCase() : '';
    const hasPreferredBarber = availableBarbers.some(b => b.name.toLowerCase() === preferredBarber);
    if (hasPreferredBarber) return preferredBarber;
    return availableBarbers[0] ? availableBarbers[0].name.toLowerCase() : '';
  });
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [wholeDay, setWholeDay] = useState(false);
  const date = preDate ? (preDate.getDate() + ' ' + preDate.toLocaleDateString('en-GB', {month:'long'}) + ' ' + preDate.getFullYear()) : formatDateKey(new Date());
  const defaultTime = preMins !== undefined ? minsToLabel(preMins) : (preHour !== undefined ? minsToLabel(preHour * 60) : '9:00 AM');
  const [startTime, setStartTime] = useState(defaultTime);
  const [endTime, setEndTime] = useState(preMins !== undefined ? minsToLabel(preMins + 60) : (preHour !== undefined ? minsToLabel(preHour * 60 + 60) : '10:00 AM'));

  useEffect(() => {
    if (!availableBarbers.some(b => b.name.toLowerCase() === barber)) {
      setBarber(availableBarbers[0] ? availableBarbers[0].name.toLowerCase() : '');
    }
  }, [availableBarbers, barber]);

  const dayNameForForm = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][(preDate || new Date()).getDay()];
  const dayHoursForForm = getEffectiveDayHours((preDate || new Date()), dayNameForForm, config.hours, specialHours);
  const openMins = dayHoursForForm && !dayHoursForForm.closed ? convertTo24(dayHoursForForm.open) : 9 * 60;
  const closeMins = dayHoursForForm && !dayHoursForForm.closed ? convertTo24(dayHoursForForm.close) : 19 * 60;
  const hours = [];
  if (!dayHoursForForm.closed) {
    for (let mins = openMins; mins <= closeMins; mins += 15) {
      if (mins === closeMins) continue;
      hours.push({ label: minsToLabel(mins) });
    }
  }

  useEffect(() => {
    if (wholeDay && !dayHoursForForm.closed) {
      setStartTime(minsToLabel(openMins));
      setEndTime(minsToLabel(closeMins));
    }
  }, [wholeDay, openMins, closeMins, dayHoursForForm.closed]);

  const handleSave = async () => {
    const startMins = wholeDay ? openMins : convertTo24(startTime);
    const endMins = wholeDay ? closeMins : convertTo24(endTime);
    if (endMins <= startMins) { alert('End time must be after start time'); return; }
    setSaving(true);
    const resolvedStartTime = wholeDay ? minsToLabel(openMins) : startTime;
    const resolvedEndTime = wholeDay ? minsToLabel(closeMins) : endTime;
    try {
      const blockId = await blockTime({ date, startTime: resolvedStartTime, endTime: resolvedEndTime, barber, note: note.trim() });
      if (onSaved) onSaved({ bookingId: blockId, status: 'BLOCKED', barber, date, time: resolvedStartTime, endTime: resolvedEndTime, note: note.trim() });
      if (onClose) onClose();
    } catch(err) {
      console.error('BlockTime error:', err);
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
          <span style={{ fontSize:'0.78rem', color:'#d4af37', fontWeight:'600', letterSpacing:'1px' }}>Blocking...</span>
        </div>
      )}
      <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(212,175,55,0.04)', flexShrink:0 }}>
        <span style={{ fontSize:'0.85rem', fontWeight:'700', color:'#d4af37' }}>🚫 Block Time</span>
        <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'1rem' }}>x</button>
      </div>
      <div style={{ overflowY:'auto', flex:1, padding:'16px 20px', display:'flex', flexDirection:'column', gap:'14px' }}>
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
          <label style={lbl}>Block Type</label>
          <div style={{ display:'flex', gap:'6px' }}>
            <button type="button" onClick={() => setWholeDay(false)}
              style={{ flex:1, padding:'9px', borderRadius:'8px', border:'1px solid '+(!wholeDay?'#d4af37':'var(--border)'), background:!wholeDay?'rgba(212,175,55,0.12)':'transparent', color:!wholeDay?'#d4af37':'var(--muted)', cursor:'pointer', fontSize:'0.78rem', fontWeight:'600' }}>
              Hours
            </button>
            <button type="button" onClick={() => setWholeDay(true)}
              style={{ flex:1, padding:'9px', borderRadius:'8px', border:'1px solid '+(wholeDay?'#ff5252':'var(--border)'), background:wholeDay?'rgba(255,82,82,0.12)':'transparent', color:wholeDay?'#ff8a80':'var(--muted)', cursor:'pointer', fontSize:'0.78rem', fontWeight:'600' }}>
              Whole Day
            </button>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
          <div>
            <label style={lbl}>From</label>
            <select value={startTime} onChange={e => setStartTime(e.target.value)} style={{ ...inp, cursor:'pointer' }} disabled={wholeDay || dayHoursForForm.closed || !hours.length}>
              {hours.map(h => <option key={h.label} value={h.label}>{h.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>To</label>
            <select value={endTime} onChange={e => setEndTime(e.target.value)} style={{ ...inp, cursor:'pointer' }} disabled={wholeDay || dayHoursForForm.closed || !hours.length}>
              {hours.map(h => <option key={h.label} value={h.label}>{h.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={lbl}>Reason <span style={{ color:'var(--muted)', fontWeight:'400', textTransform:'none', letterSpacing:0 }}>(optional)</span></label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder={wholeDay ? 'Day off, holiday, training...' : 'Break, meeting, late start...'} style={inp} />
        </div>
        <div style={{ padding:'10px 12px', background:'rgba(255,82,82,0.06)', borderRadius:'8px', border:'1px solid rgba(255,82,82,0.2)' }}>
          <span style={{ fontSize:'0.75rem', color:'var(--muted)' }}>Blocking: <span style={{ color:'#ff5252', fontWeight:'600' }}>{wholeDay ? 'Whole day (' + minsToLabel(openMins) + ' - ' + minsToLabel(closeMins) + ')' : startTime + ' - ' + endTime}</span>{note.trim() ? ' · ' + note.trim() : ''}</span>
        </div>
        <div style={{ display:'flex', gap:'8px', paddingTop:'4px' }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--muted)', cursor:'pointer', fontSize:'0.82rem' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !barber || availableBarbers.length === 0}
            style={{ flex:2, padding:'11px', background:saving||!barber||availableBarbers.length===0?'rgba(212,175,55,0.25)':'linear-gradient(135deg,#d4af37,#b8860b)', border:'none', borderRadius:'8px', color:saving||!barber||availableBarbers.length===0?'var(--muted)':'#000', cursor:saving||!barber||availableBarbers.length===0?'not-allowed':'pointer', fontWeight:'700', fontSize:'0.82rem' }}>
            {saving ? 'Blocking...' : wholeDay ? 'Set Day Off' : 'Block'}
          </button>
        </div>
      </div>
    </div>
  );
}
