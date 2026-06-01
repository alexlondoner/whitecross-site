import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

const TENANT = 'whitecross';
const BARBER_COLORS = {
  Alex: '#d4af37', Arda: '#2196f3', Kadim: '#ff9800', Manoj: '#e91e63', Tuncay: '#b39ddb',
};
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const AVATAR_COLORS = ['#d4af37','#2196f3','#ff9800','#e91e63','#b39ddb','#4caf50','#00bcd4','#ff5722'];

function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function pp(v) {
  return parseFloat(String(v||'0').replace(/[£,\-]/g,'').trim()) || 0;
}
function soldProductsTotal(b) {
  const list = Array.isArray(b?.soldProducts) ? b.soldProducts : [];
  return list.reduce((s, p) => s + pp(p?.price) * (parseInt(p?.qty,10)||0), 0);
}
function serviceGross(b) {
  const src = String(b?.source||'').trim().toLowerCase();
  if (src === 'product sale' || src === 'product_sale') return 0;
  const explicit = pp(b.price) + pp(b.serviceCharge);
  if (explicit > 0) return explicit;
  const hasProd = soldProductsTotal(b) > 0;
  if (hasProd && !b.serviceId && !b.service) return 0;
  return Math.max(0, pp(b.paidAmount) - pp(b.tip) - soldProductsTotal(b));
}
// matches Reports.js bookingNetWithoutTip exactly
function soldAddOnsTotal(b) {
  const list = Array.isArray(b?.soldAddOns) ? b.soldAddOns : [];
  return list.reduce((s, p) => s + pp(p?.price) * (parseInt(p?.qty,10)||1), 0);
}
function effectiveRevenue(b) {
  return Math.max(0,
    serviceGross(b)
    + soldProductsTotal(b)
    + soldAddOnsTotal(b)
    - pp(b.discount)
    - (pp(b.loyaltyPointsRedeemed) / 20)
  );
}
function startOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  x.setHours(0,0,0,0);
  return x;
}
function initials(name) {
  return (name||'').split(' ').slice(0,2).map(w => w[0]||'').join('').toUpperCase() || '?';
}
function fmt(n) {
  const v = Math.round(n || 0);
  return '£' + v.toLocaleString();
}
function avatarColor(name) {
  const hash = (name||'').split('').reduce((a,c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
function capitalizeName(name) {
  return (name||'').split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ClientRankRow({ c, i, accentColor, barColor }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 16px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:'1.1rem', fontWeight:'700', color: i < 3 ? accentColor : 'var(--muted2)', minWidth:'18px', textAlign:'center' }}>{i+1}</div>
      <div style={{ width:'30px', height:'30px', borderRadius:'50%', background:avatarColor(c.name), display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.65rem', fontWeight:'700', color:'#0a0705', flexShrink:0 }}>
        {initials(c.name)}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'0.76rem', fontWeight:'600', color:'var(--text)' }}>{c.name}</div>
        <div style={{ fontSize:'0.57rem', color:'var(--muted)', marginTop:'1px' }}>{c.visits} visits</div>
      </div>
      <div style={{ minWidth:'65px' }}>
        <div style={{ height:'4px', borderRadius:'99px', background:'rgba(255,255,255,0.06)' }}>
          <div style={{ height:'100%', borderRadius:'99px', background:barColor, width:`${c.pct}%`, opacity:0.8 }} />
        </div>
        <div style={{ fontSize:'0.6rem', fontWeight:'700', color:accentColor, marginTop:'2px', textAlign:'right' }}>{fmt(c.spent)}</div>
      </div>
    </div>
  );
}

function SectionDivider({ label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 16px' }}>
      <div style={{ flex:1, height:'1px', background:'rgba(255,255,255,0.04)' }} />
      <div style={{ fontSize:'0.5rem', color:'var(--muted2)', letterSpacing:'2px', textTransform:'uppercase', fontWeight:'700' }}>{label}</div>
      <div style={{ flex:1, height:'1px', background:'rgba(255,255,255,0.04)' }} />
    </div>
  );
}

function ReminderItem({ icon, iconBg, iconBorder, name, sub, actionLabel, actionClass, onAction }) {
  const ac = {
    gold:  { bg:'rgba(212,175,55,0.08)',  border:'rgba(212,175,55,0.3)',  color:'var(--gold)' },
    blue:  { bg:'rgba(45,106,159,0.1)',   border:'rgba(45,106,159,0.25)', color:'#2196f3' },
    green: { bg:'rgba(61,139,94,0.1)',    border:'rgba(61,139,94,0.25)',  color:'#4caf50' },
  }[actionClass] || { bg:'rgba(212,175,55,0.08)', border:'rgba(212,175,55,0.3)', color:'var(--gold)' };

  return (
    <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'11px 16px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ width:'34px', height:'34px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0, background:iconBg, border:`1px solid ${iconBorder}` }}>
        {icon}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'0.82rem', fontWeight:'700', color:'var(--text)' }}>{name}</div>
        <div style={{ fontSize:'0.62rem', color:'var(--muted)', marginTop:'2px', lineHeight:'1.3' }}>{sub}</div>
      </div>
      <button onClick={onAction}
        style={{ fontSize:'0.6rem', fontWeight:'700', padding:'4px 9px', borderRadius:'6px', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0, background:ac.bg, border:`1px solid ${ac.border}`, color:ac.color }}>
        {actionLabel}
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Home({ tenantId, setActivePage, authUser, role }) {
  const isOwner = role === 'owner' || role === 'admin';
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [clients, setClients] = useState([]);

  const now = useMemo(() => new Date(), []);
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [bookSnap, clientSnap] = await Promise.all([
          getDocs(collection(db, `tenants/${TENANT}/bookings`)),
          getDocs(collection(db, `tenants/${TENANT}/clients`)),
        ]);
        const fetchedClients = clientSnap.docs.map(d => ({ id:d.id, ...d.data() }));
        setClients(fetchedClients);

        const fetchedBookings = bookSnap.docs.map(d => {
          const data = d.data();
          let startTime = data.startTime?.toDate?.();
          if (!startTime && data.date) {
            const raw = data.time ? data.date + ' ' + data.time : data.date;
            const parsed = new Date(raw);
            if (!isNaN(parsed.getTime())) startTime = parsed;
          }
          const rawStatus = String(data.status||'').trim().toUpperCase().replace(/[-\s]+/g,'_');
          const status = ['CONFIRMED','PENDING','CHECKED_OUT','CANCELLED','BLOCKED','NO_SHOW'].includes(rawStatus)
            ? rawStatus : (rawStatus || 'CONFIRMED');
          const barber = data.barberName || data.barberId || '';
          const dateKey = startTime ? toDateKey(startTime) : null;
          return { ...data, status, barber, startTime, dateKey };
        }).filter(b => b.dateKey && b.status !== 'CANCELLED');

        setBookings(fetchedBookings);
      } catch(e) { console.error('Home fetch error:', e); }
      setLoading(false);
    };
    fetchData();
  }, []);

  // ── Computed ──────────────────────────────────────────────────────────────
  const todayKey  = toDateKey(now);
  const monthKey  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  const todayBookings = useMemo(() =>
    bookings
      .filter(b => b.dateKey === todayKey && b.status !== 'BLOCKED')
      .sort((a,b) => (a.startTime||0) - (b.startTime||0)),
  [bookings, todayKey]);

  const todayKpi = useMemo(() => {
    const checkedOut = todayBookings.filter(b => b.status === 'CHECKED_OUT').length;
    const estRevenue = todayBookings.reduce((s,b) => s + effectiveRevenue(b), 0);
    return { total: todayBookings.length, checkedOut, remaining: todayBookings.length - checkedOut, estRevenue };
  }, [todayBookings]);

  const totalClients = useMemo(() => {
    const names = new Set(bookings.map(b => String(b.clientName||b.name||'').trim().toLowerCase()).filter(Boolean));
    return Math.max(names.size, clients.length);
  }, [bookings, clients]);

  const upcomingBirthdays = useMemo(() => {
    const results = [];
    for (let i = 0; i <= 3; i++) {
      const target = new Date(now);
      target.setDate(target.getDate() + i);
      clients.forEach(c => {
        if (!c.birthday) return;
        const bd = new Date(c.birthday);
        if (isNaN(bd.getTime())) return;
        if (bd.getMonth() === target.getMonth() && bd.getDate() === target.getDate()) {
          results.push({ ...c, daysUntil: i, age: now.getFullYear() - bd.getFullYear() });
        }
      });
    }
    return results.sort((a,b) => a.daysUntil - b.daysUntil);
  }, [clients, now]);

  const lapsedClients = useMemo(() => {
    const lastVisit = {};
    const skip = ['walk-in','walk_in','walkin','unknown','guest'];
    bookings.filter(b => b.status === 'CHECKED_OUT').forEach(b => {
      const raw  = String(b.clientName||b.name||'').trim();
      const key  = raw.toLowerCase();
      if (!key || skip.includes(key)) return;
      const t = b.startTime?.getTime?.() || 0;
      if (!lastVisit[key] || t > lastVisit[key].time) {
        lastVisit[key] = { time: t, displayName: capitalizeName(raw) };
      }
    });
    const cutoff = Date.now() - 30*24*60*60*1000;
    return Object.values(lastVisit)
      .filter(v => v.time < cutoff && v.time > 0)
      .map(v => ({ ...v, days: Math.floor((Date.now() - v.time) / (1000*60*60*24)) }))
      .sort((a,b) => b.days - a.days)
      .slice(0, 4);
  }, [bookings]);

  const vipToday = useMemo(() => {
    const todayNames = new Set(todayBookings.map(b => String(b.clientName||b.name||'').trim().toLowerCase()));
    return clients
      .filter(c => {
        const isMember = c.isMember === true || c.isMember === 'true';
        const isLoyal  = (c.loyaltyPoints||0) >= 100;
        return (isMember || isLoyal) && todayNames.has(String(c.name||'').trim().toLowerCase());
      })
      .slice(0, 2);
  }, [clients, todayBookings]);

  const weeklyRevenue = useMemo(() => {
    const ws = startOfWeek(now);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ws); d.setDate(d.getDate() + i);
      const dk = toDateKey(d);
      const isToday  = dk === todayKey;
      const isFuture = d > now && !isToday;
      const dayBks   = bookings.filter(b => b.dateKey === dk && b.status !== 'BLOCKED' && b.status !== 'CANCELLED');
      const checkedOutRev = dayBks.filter(b => b.status === 'CHECKED_OUT').reduce((s,b) => s + effectiveRevenue(b), 0);
      // future: show booked price as estimate; today+past: only actual CHECKED_OUT
      const revenue = isFuture
        ? dayBks.reduce((s,b) => s + pp(b.price), 0)
        : checkedOutRev;
      return { day: WEEK_DAYS[i], dk, revenue, isToday, isFuture, isPast: !isToday && !isFuture };
    });
  }, [bookings, now, todayKey]);

  const weekTotal   = useMemo(() => weeklyRevenue.filter(d => !d.isFuture).reduce((s,d) => s+d.revenue, 0), [weeklyRevenue]);
  const maxBarRev   = useMemo(() => Math.max(...weeklyRevenue.map(d => d.revenue), 1), [weeklyRevenue]);
  const activeDays  = weeklyRevenue.filter(d => !d.isFuture).length;

  const barberPerf = useMemo(() => {
    const perf = {};
    bookings
      .filter(b => b.status === 'CHECKED_OUT' && String(b.dateKey||'').startsWith(monthKey))
      .forEach(b => {
        const name = capitalizeName((b.barber || b.barberName || 'Unknown').trim());
        if (!perf[name]) perf[name] = { revenue:0, clients: new Set(), days: new Set() };
        perf[name].revenue += effectiveRevenue(b);
        perf[name].clients.add(String(b.clientName||b.name||'').trim().toLowerCase());
        perf[name].days.add(b.dateKey);
      });
    const list = Object.entries(perf)
      .map(([name, p]) => ({ name, revenue: p.revenue, clients: p.clients.size, days: p.days.size, color: BARBER_COLORS[name] || avatarColor(name) }))
      .sort((a,b) => b.revenue - a.revenue);
    const maxRev = list[0]?.revenue || 1;
    return list.map(p => ({ ...p, pct: Math.round((p.revenue/maxRev)*100) }));
  }, [bookings, monthKey]);

  const sourceCounts = useMemo(() => {
    const map = {};
    bookings
      .filter(b => String(b.dateKey||'').startsWith(monthKey) && b.status !== 'BLOCKED')
      .forEach(b => {
        const src = String(b.source||'').trim().toLowerCase() || 'other';
        map[src] = (map[src]||0) + 1;
      });
    const total = Object.values(map).reduce((s,v) => s+v, 0) || 1;
    const SRC_COLOR = { booksy:'#9c27b0', fresha:'#009688', website:'#d4af37', walk_in:'#ff9800', 'walk-in':'#ff9800', walkin:'#ff9800', panel:'#2196f3', other:'#4a4840', historical:'#6b5f43' };
    const SRC_LABEL = { booksy:'Booksy', fresha:'Fresha', website:'Website', walk_in:'Walk-in', 'walk-in':'Walk-in', walkin:'Walk-in', panel:'Panel', other:'Other', historical:'Historical' };
    return Object.entries(map)
      .map(([k,v]) => ({ key:k, label: SRC_LABEL[k]||k, count:v, pct: Math.round((v/total)*100), color: SRC_COLOR[k]||avatarColor(k) }))
      .sort((a,b) => b.count - a.count).slice(0,5);
  }, [bookings, monthKey]);

  // member name set (lowercase) for fast lookup
  const memberNameSet = useMemo(() => {
    const s = new Set();
    clients.forEach(c => {
      if (c.isMember === true || c.isMember === 'true') {
        if (c.name)      s.add(String(c.name).trim().toLowerCase());
        if (c._origName) s.add(String(c._origName).trim().toLowerCase());
        (c._aliases || []).forEach(a => { if (a) s.add(String(a).trim().toLowerCase()); });
      }
    });
    return s;
  }, [clients]);

  const _buildClientList = (bookingList, excludeMembers) => {
    const map = {};
    const display = {};
    const skip = ['walk-in','walk_in','walkin','unknown','guest'];
    bookingList.forEach(b => {
      const raw = String(b.clientName || b.name || '').trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (skip.includes(key)) return;
      if (excludeMembers && memberNameSet.has(key)) return;
      if (!excludeMembers && !memberNameSet.has(key)) return;
      const cap = capitalizeName(raw);
      if (!display[key] || raw[0] === raw[0].toUpperCase()) display[key] = cap;
      if (!map[key]) map[key] = { spent: 0, visits: 0 };
      map[key].spent  += effectiveRevenue(b);
      map[key].visits += 1;
    });
    const list = Object.entries(map)
      .map(([key, v]) => ({ name: display[key] || capitalizeName(key), spent: v.spent, visits: v.visits }))
      .sort((a,b) => b.spent - a.spent)
      .slice(0, 5);
    const maxSpent = list[0]?.spent || 1;
    return list.map(c => ({ ...c, pct: Math.round((c.spent / maxSpent) * 100) }));
  };

  const checkedOutBookings = useMemo(() => bookings.filter(b => b.status === 'CHECKED_OUT'), [bookings]);

  const topClients = useMemo(() => _buildClientList(checkedOutBookings, true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checkedOutBookings, memberNameSet]);

  const topMembers = useMemo(() => _buildClientList(checkedOutBookings, false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checkedOutBookings, memberNameSet]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const card  = { background:'var(--card)', border:'1px solid var(--border)', borderRadius:'14px', overflow:'hidden' };
  const cHead = { padding:'11px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' };
  const cTitle = { fontFamily:"'Cormorant Garamond',serif", fontSize:'1rem', fontWeight:'700', color:'var(--text)' };
  const bdg = (bg, color, border) => ({ padding:'3px 8px', borderRadius:'99px', fontSize:'0.55rem', fontWeight:'700', background:bg, color, border:`1px solid ${border||'transparent'}` });

  if (loading) {
    return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--muted)', fontSize:'0.8rem', letterSpacing:'2px' }}>Loading...</div>;
  }

  const reminderCount = upcomingBirthdays.length + Math.min(3, lapsedClients.length) + vipToday.length;

  return (
    <div style={{ padding:'8px 0', maxWidth:'1600px', margin:'-20px auto 0' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom:'10px' }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:'1.5rem', fontWeight:'700', color:'var(--text)', lineHeight:1 }}>
          {greeting}, <span style={{ color:'var(--gold)' }}>{authUser?.displayName || authUser?.email?.split('@')[0] || 'there'}</span> 👋
        </div>
        <div style={{ fontSize:'0.58rem', color:'var(--muted)', letterSpacing:'1.5px', marginTop:'3px', textTransform:'uppercase' }}>
          {dateStr} · Whitecross Barbers
        </div>
      </div>

      {/* ── Summary Strip ── */}
      <div style={{ display:'grid', gridTemplateColumns:`repeat(${isOwner ? 5 : 3},1fr)`, gap:'10px', marginBottom:'8px' }}>
        {[
          { icon:'📅', val: todayKpi.total,           lbl:"Today's Bookings", sub:`${todayKpi.remaining} remaining`,   subColor:'var(--muted)',   prog: todayKpi.total > 0 ? (todayKpi.checkedOut/todayKpi.total)*100 : 0 },
          isOwner && { icon:'💷', val: fmt(todayKpi.estRevenue), lbl:'Est. Revenue', sub:'Based on today\'s bookings', subColor:'var(--muted)', prog: 80 },
          { icon:'✅', val: todayKpi.checkedOut,       lbl:'Checked Out',       sub:`${todayKpi.remaining} to go`,       subColor:'#4caf50',        prog: todayKpi.total > 0 ? (todayKpi.checkedOut/todayKpi.total)*100 : 0, progColor:'linear-gradient(90deg,#388e3c,#4caf50)' },
          { icon:'🎂', val: upcomingBirthdays.length,  lbl:'Birthdays (3 days)',sub: upcomingBirthdays[0]?.name || 'None this week', subColor:'#e91e63', prog: upcomingBirthdays.length > 0 ? 100 : 0, progColor:'linear-gradient(90deg,#ad1457,#e91e63)' },
          isOwner && { icon:'⭐', val: totalClients, lbl:'Total Clients', sub:'All time', subColor:'var(--muted)', prog: 68 },
        ].filter(Boolean).map((c,i) => (
          <div key={i} style={{ ...card, padding:'10px 14px', position:'relative' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:'1.5px', background:'linear-gradient(90deg,transparent,var(--gold),transparent)', opacity:0.4 }} />
            <div style={{ fontSize:'0.9rem', marginBottom:'6px' }}>{c.icon}</div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:'1.3rem', fontWeight:'700', color:'var(--gold)', lineHeight:1 }}>{c.val}</div>
            <div style={{ fontSize:'0.53rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', fontWeight:'600', marginTop:'3px' }}>{c.lbl}</div>
            <div style={{ fontSize:'0.57rem', fontWeight:'600', marginTop:'4px', color:c.subColor, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.sub}</div>
            <div style={{ height:'3px', background:'var(--border2)', borderRadius:'99px', overflow:'hidden', marginTop:'6px' }}>
              <div style={{ height:'100%', borderRadius:'99px', background: c.progColor || 'linear-gradient(90deg,var(--gold-dark),var(--gold))', width:`${Math.min(100, c.prog||0)}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Main Grid ── */}
      <div style={{ display:'grid', gridTemplateColumns:'300px 1fr 270px', gap:'10px', alignItems:'start' }}>

        {/* ── LEFT: Reminders + Quick Actions ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>

          <div style={card}>
            <div style={cHead}>
              <span style={cTitle}>🔔 Today's Reminders</span>
              {reminderCount > 0 && <span style={bdg('rgba(155,58,58,0.15)','#ff5252','rgba(155,58,58,0.3)')}>{reminderCount} alerts</span>}
            </div>

            {upcomingBirthdays.length > 0 && (
              <>
                <SectionDivider label="Birthdays" />
                {upcomingBirthdays.slice(0,3).map(c => (
                  <ReminderItem key={c.id}
                    icon="🎂"
                    iconBg={c.daysUntil === 0 ? 'rgba(212,175,55,0.12)' : 'rgba(45,106,159,0.1)'}
                    iconBorder={c.daysUntil === 0 ? 'rgba(212,175,55,0.2)' : 'rgba(45,106,159,0.2)'}
                    name={c.name}
                    sub={`${c.daysUntil === 0 ? '🎉 Birthday today' : c.daysUntil === 1 ? '📅 Birthday tomorrow' : `📅 In ${c.daysUntil} days`} · Turning ${c.age}`}
                    actionLabel={c.daysUntil <= 1 ? 'WhatsApp →' : 'View'}
                    actionClass={c.daysUntil === 0 ? 'gold' : 'blue'}
                    onAction={() => setActivePage('clients')}
                  />
                ))}
              </>
            )}

            {lapsedClients.length > 0 && (
              <>
                <SectionDivider label="Lapsed Clients" />
                {lapsedClients.slice(0,3).map((c,i) => (
                  <ReminderItem key={i}
                    icon="💤"
                    iconBg="rgba(155,58,58,0.1)"
                    iconBorder="rgba(155,58,58,0.2)"
                    name={c.displayName}
                    sub={`😴 ${c.days} days since last visit`}
                    actionLabel="Re-engage"
                    actionClass="gold"
                    onAction={() => setActivePage('clients')}
                  />
                ))}
              </>
            )}

            {vipToday.length > 0 && (
              <>
                <SectionDivider label="VIP Today" />
                {vipToday.map(c => (
                  <ReminderItem key={c.id}
                    icon="✦"
                    iconBg="rgba(124,58,237,0.12)"
                    iconBorder="rgba(124,58,237,0.2)"
                    name={c.name}
                    sub={`${c.isMember ? '◆ Member' : '⭐ Loyal'} · ${c.loyaltyPoints||0} pts`}
                    actionLabel="View →"
                    actionClass="green"
                    onAction={() => setActivePage('clients')}
                  />
                ))}
              </>
            )}

            {reminderCount === 0 && (
              <div style={{ padding:'28px 16px', textAlign:'center', color:'var(--muted)', fontSize:'0.75rem' }}>No reminders for today 🎉</div>
            )}
          </div>

          {/* Quick Actions */}
          <div style={card}>
            <div style={cHead}><span style={cTitle}>⚡ Quick Actions</span></div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', padding:'14px' }}>
              {[
                { icon:'🚶', label:'Walk-in',    page:'dashboard' },
                { icon:'📅', label:'New Booking',page:'bookings'  },
                { icon:'👥', label:'Clients',    page:'clients'   },
                { icon:'🗓️', label:'Calendar',   page:'calendar'  },
                { icon:'💰', label:'Finance',    page:'reports'   },
                { icon:'📣', label:'Marketing',  page:'marketing' },
              ].map(q => (
                <button key={q.label} onClick={() => setActivePage(q.page)}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'6px', padding:'14px 10px', borderRadius:'12px', border:'1px solid var(--border2)', background:'var(--card2)', cursor:'pointer', transition:'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(212,175,55,0.3)'; e.currentTarget.style.background='rgba(212,175,55,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border2)'; e.currentTarget.style.background='var(--card2)'; }}>
                  <span style={{ fontSize:'1.3rem' }}>{q.icon}</span>
                  <span style={{ fontSize:'0.62rem', fontWeight:'700', color:'var(--muted)', letterSpacing:'0.5px', textAlign:'center' }}>{q.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── MIDDLE: Charts ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>

          {/* Weekly Revenue */}
          {isOwner && (<div style={card}>
            <div style={cHead}>
              <span style={cTitle}>📊 Weekly Revenue</span>
            </div>
            <div style={{ padding:'16px' }}>
              <div style={{ display:'flex', marginBottom:'16px' }}>
                {[
                  { val: fmt(weekTotal),                                    lbl:'This Week' },
                  { val: fmt(activeDays > 0 ? weekTotal/activeDays : 0),   lbl:'Daily Avg'  },
                  { val: fmt(todayKpi.estRevenue),                          lbl:'Today',     color:'#4caf50' },
                ].map((s,i,arr) => (
                  <div key={i} style={{ flex:1, textAlign:'center', padding:'8px', borderRight: i < arr.length-1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:'1.3rem', fontWeight:'700', color:s.color||'var(--gold)' }}>{s.val}</div>
                    <div style={{ fontSize:'0.5rem', color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginTop:'2px' }}>{s.lbl}</div>
                  </div>
                ))}
              </div>
              {/* Bar chart */}
              <div style={{ display:'flex', alignItems:'flex-end', gap:'8px', height:'120px', paddingBottom:'4px' }}>
                {weeklyRevenue.map(d => {
                  const h = d.revenue > 0 ? Math.max(10, Math.round((d.revenue/maxBarRev)*110)) : 8;
                  return (
                    <div key={d.day} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' }}>
                      <div style={{ fontSize:'0.55rem', fontWeight:'700', color: d.isToday ? 'var(--gold)' : d.isFuture ? 'var(--muted2)' : 'var(--muted)' }}>
                        {d.revenue > 0 ? (d.isFuture ? 'est.' : fmt(d.revenue)) : '–'}
                      </div>
                      <div style={{ width:'100%', height:`${h}px`, borderRadius:'6px 6px 0 0', transition:'height 0.3s',
                        background: d.isToday ? 'linear-gradient(180deg,var(--gold),var(--gold-dark))' : d.isFuture ? 'rgba(212,175,55,0.08)' : 'rgba(212,175,55,0.25)',
                        border: d.isFuture ? '1px dashed rgba(212,175,55,0.2)' : 'none',
                      }} />
                      <div style={{ fontSize:'0.52rem', color: d.isToday ? 'var(--gold)' : 'var(--muted)', fontWeight: d.isToday ? '700' : '400' }}>
                        {d.isToday ? 'Today' : d.day}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>)}

          {/* Barber Performance */}
          {isOwner && barberPerf.length > 0 && (
            <div style={card}>
              <div style={cHead}>
                <span style={cTitle}>✂️ Barber Performance</span>
                <span style={bdg('var(--card2)','var(--muted)','var(--border)')}>
                  {now.toLocaleDateString('en-GB', { month:'long', year:'numeric' })}
                </span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'10px', padding:'14px 16px' }}>
                {barberPerf.map(b => (
                  <div key={b.name} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <div style={{ width:'30px', height:'30px', borderRadius:'50%', background:b.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.65rem', fontWeight:'700', color:'#0a0705', flexShrink:0 }}>
                      {initials(b.name)}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:'0.75rem', fontWeight:'600', color:'var(--text)' }}>{b.name}</span>
                        <span style={{ fontSize:'0.7rem', fontWeight:'700', color:'var(--gold)' }}>{fmt(b.revenue)}</span>
                      </div>
                      <div style={{ height:'5px', background:'var(--border2)', borderRadius:'99px', overflow:'hidden', marginTop:'4px' }}>
                        <div style={{ height:'100%', borderRadius:'99px', width:`${b.pct}%`, background:`linear-gradient(90deg,${b.color}88,${b.color})` }} />
                      </div>
                      <div style={{ fontSize:'0.52rem', color:'var(--muted)', marginTop:'3px' }}>{b.clients} clients · {b.days} days</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Booking Sources */}
          {isOwner && sourceCounts.length > 0 && (
            <div style={card}>
              <div style={cHead}>
                <span style={cTitle}>🔁 Booking Sources</span>
                <span style={bdg('var(--card2)','var(--muted)','var(--border)')}>This month</span>
              </div>
              <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:'8px' }}>
                {sourceCounts.map(s => (
                  <div key={s.key} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <div style={{ fontSize:'0.65rem', fontWeight:'700', color:s.color, minWidth:'70px' }}>{s.label}</div>
                    <div style={{ flex:1, height:'6px', background:'var(--border2)', borderRadius:'99px', overflow:'hidden' }}>
                      <div style={{ width:`${s.pct}%`, height:'100%', background:s.color, borderRadius:'99px', opacity:0.8 }} />
                    </div>
                    <div style={{ fontSize:'0.65rem', fontWeight:'700', color:'var(--muted)', minWidth:'28px', textAlign:'right' }}>{s.pct}%</div>
                    <div style={{ fontSize:'0.65rem', color:'var(--muted)', minWidth:'20px', textAlign:'right' }}>{s.count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Today's Schedule + Top Clients ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>

          <div style={{ ...card, flex:1 }}>
            <div style={cHead}>
              <span style={cTitle}>📋 Today's Schedule</span>
              <span style={bdg('rgba(212,175,55,0.1)','var(--gold)','rgba(212,175,55,0.25)')}>{todayKpi.total} booked</span>
            </div>
            {todayBookings.length === 0 ? (
              <div style={{ padding:'28px 16px', textAlign:'center', color:'var(--muted)', fontSize:'0.75rem' }}>No bookings today</div>
            ) : (
              todayBookings.slice(0,9).map((b,i) => {
                const name = b.clientName || b.name || 'Walk-in';
                const timeStr = b.startTime ? b.startTime.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }) : '--:--';
                const isOut  = b.status === 'CHECKED_OUT';
                const isPend = b.status === 'PENDING';
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'9px 16px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize:'0.72rem', fontWeight:'700', color:'var(--gold)', minWidth:'40px' }}>{timeStr}</div>
                    <div style={{ width:'27px', height:'27px', borderRadius:'50%', background:avatarColor(name), display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.58rem', fontWeight:'700', color:'#0a0705', flexShrink:0 }}>
                      {initials(name)}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'0.74rem', fontWeight:'600', color: isOut ? 'var(--muted)' : 'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', textDecoration: isOut ? 'line-through' : 'none' }}>{name}</div>
                      <div style={{ fontSize:'0.57rem', color:'var(--muted)' }}>{b.service||b.serviceName||'–'} · {capitalizeName(b.barber||b.barberName||'–')}</div>
                    </div>
                    <div style={{ fontSize:'0.5rem', fontWeight:'700', padding:'2px 6px', borderRadius:'99px', whiteSpace:'nowrap',
                      background: isOut ? 'rgba(76,175,80,0.1)' : isPend ? 'rgba(255,152,0,0.1)' : 'rgba(212,175,55,0.1)',
                      color: isOut ? '#4caf50' : isPend ? '#ff9800' : 'var(--gold)',
                    }}>
                      {isOut ? 'Done' : isPend ? 'Pend' : 'Conf'}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {isOwner && topClients.length > 0 && (
            <div style={card}>
              <div style={cHead}>
                <span style={cTitle}>👑 Top Clients</span>
                <span style={bdg('var(--card2)','var(--muted)','var(--border)')}>All time · non-members</span>
              </div>
              {topClients.map((c,i) => (
                <ClientRankRow key={c.name} c={c} i={i} accentColor="var(--gold)" barColor="var(--gold)" />
              ))}
            </div>
          )}

          {isOwner && topMembers.length > 0 && (
            <div style={{ ...card, border:'1px solid rgba(124,58,237,0.25)' }}>
              <div style={{ ...cHead, borderBottomColor:'rgba(124,58,237,0.2)' }}>
                <span style={{ ...cTitle }}>◆ Top Members</span>
                <span style={bdg('rgba(124,58,237,0.1)','#b39ddb','rgba(124,58,237,0.3)')}>All time</span>
              </div>
              {topMembers.map((c,i) => (
                <ClientRankRow key={c.name} c={c} i={i} accentColor="#b39ddb" barColor="#7c3aed" />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
