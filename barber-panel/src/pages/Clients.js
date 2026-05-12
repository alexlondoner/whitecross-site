import React, { useState, useEffect, useMemo } from 'react';
import config from '../config';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';

const TENANT = 'whitecross';

function getBColor(barber) {
  const map = { alex: '#d4af37', arda: '#4caf50', manoj: '#9c27b0' };
  return map[(barber || '').toLowerCase()] || '#7a7260';
}

const inp = { width: '100%', padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' };
const lbl = { display: 'block', fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '5px', fontWeight: '600' };

const MEMBERSHIP_TIERS = [
  { key: 'standard', label: 'Standard', color: '#7b1fa2', desc: 'Priority booking + monthly perks' },
  { key: 'premium',  label: 'Premium',  color: '#d4af37', desc: 'All Standard benefits + exclusive slots + free monthly service' },
];

const SEGMENT_DEFS = [
  { key: 'members',      label: 'MemberZone',            color: '#7b1fa2', desc: 'Active MemberZone subscribers' },
  { key: 'new',          label: 'New clients',            color: '#4caf50', desc: 'Clients added in the last 30 days' },
  { key: 'recent',       label: 'Recent clients',         color: '#2196f3', desc: 'Clients with appointments in the last 30 days' },
  { key: 'firstVisit',   label: 'First visit',            color: '#ff9800', desc: 'Clients with no past appointments, but with appointments in the future' },
  { key: 'loyal',        label: 'Loyal clients',          color: '#d4af37', desc: 'Clients with 2 or more visits in the last 5 months' },
  { key: 'lapsed',       label: 'Lapsed clients',         color: '#ff5252', desc: 'Clients with 3 or more visits in the last 12 months, and no visits in the last 2 months' },
  { key: 'highSpenders', label: 'High spenders',          color: '#9c27b0', desc: 'Clients with more than £81 in sales in the last 12 months' },
  { key: 'highPoints',   label: 'High points',            color: '#d4af37', desc: 'Clients with 50 or more loyalty points — £5+ available to redeem' },
  { key: 'birthdays',    label: 'Upcoming birthdays',     color: '#e91e63', desc: 'Clients with birthdays in the next 30 days' },
];

export default function Clients() {
  const [bookings, setBookings] = useState([]);
  const [manualClients, setManualClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('list');
  const [search, setSearch] = useState('');
  const [segSearch, setSegSearch] = useState('');
  const [sortBy, setSortBy] = useState('registeredAt');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedClient, setSelectedClient] = useState(null);
  const [filterBarber, setFilterBarber] = useState('all');
  const [barbers, setBarbers] = useState([]);
  const [activeSegment, setActiveSegment] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', phone: '', email: '', birthday: '', notes: '' });
  const [addSaving, setAddSaving] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', birthday: '', notes: '' });
  const [noteInput, setNoteInput] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [detailTab, setDetailTab] = useState('overview');
  const [memberTierSelect, setMemberTierSelect] = useState('');
  const [memberSaving, setMemberSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editingClient, setEditingClient] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [bookingsSnap, barbersSnap, clientsSnap] = await Promise.all([
          getDocs(query(collection(db, `tenants/${TENANT}/bookings`), orderBy('startTime', 'desc'))),
          getDocs(collection(db, `tenants/${TENANT}/barbers`)),
          getDocs(collection(db, `tenants/${TENANT}/clients`)).catch(() => ({ docs: [] })),
        ]);

        const fetchedBarbers = barbersSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
        setBarbers(fetchedBarbers);

        const barberNameById = fetchedBarbers.reduce((acc, b) => {
          if (!b?.name) return acc;
          const keys = [b.docId, b.id].filter(Boolean);
          keys.forEach((k) => { acc[String(k).toLowerCase()] = b.name; });
          return acc;
        }, {});

        const fetchedBookings = bookingsSnap.docs.map(doc => {
          const d = doc.data();
          const startTime = d.startTime?.toDate() || null;
          const date = startTime ? startTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
          const time = startTime ? startTime.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase() : '';
          const rawBarber = String(d.barberId || '').trim();
          const barber = d.barberName || barberNameById[rawBarber.toLowerCase()] || rawBarber;
          return { ...d, name: d.clientName || 'Walk-in', email: d.clientEmail || '', phone: d.clientPhone || '', barber, service: d.serviceId || '', date, time, startTimeRaw: startTime, bookingId: d.bookingId || doc.id, source: d.source || 'website', paidAmount: d.paidAmount || '', price: d.price || '' };
        });
        setBookings(fetchedBookings);
        setManualClients(clientsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const bookingClients = useMemo(() => {
    const map = {};
    bookings.forEach(b => {
      if (!b.name || b.name === 'Walk-in') return;
      const key = b.phone || b.email || b.name;
      if (!map[key]) {
        map[key] = { name: b.name, phone: b.phone || '', email: b.email || '', visits: 0, totalSpent: 0, totalTip: 0, totalDiscount: 0, services: {}, barbers: {}, sources: {}, bookings: [], firstVisit: null, lastVisit: null, firstVisitRaw: null, lastVisitRaw: null, lastService: '', lastBarber: '', paymentMethods: {}, checkedOut: 0, cancelled: 0 };
      }
      const c = map[key];
      c.bookings.push(b);
      if (b.status !== 'CANCELLED') {
        c.visits++;
        const booksyDeposit = b.source === 'Booksy' && config.platforms?.booksy?.depositEnabled ? (config.platforms.booksy.depositAmount || 0) : 0;
        const rawAmount = parseFloat(String(b.paidAmount || b.price || '0').replace('£', '')) || 0;
        const price = b.source === 'Booksy'
          ? (b.status === 'CHECKED_OUT' ? rawAmount + booksyDeposit : booksyDeposit)
          : rawAmount;
        const tip = parseFloat(String(b.tip || '0').replace('£', '')) || 0;
        const discount = parseFloat(String(b.discount || '0').replace('£', '').replace('-', '')) || 0;
        c.totalSpent += price;
        c.totalTip += tip;
        c.totalDiscount += discount;
        c.services[b.service] = (c.services[b.service] || 0) + 1;
        c.barbers[b.barber] = (c.barbers[b.barber] || 0) + 1;
        c.sources[b.source] = (c.sources[b.source] || 0) + 1;
        if (b.paymentMethod || b.paymentType) { const pm = b.paymentMethod || b.paymentType; c.paymentMethods[pm] = (c.paymentMethods[pm] || 0) + 1; }
        if (b.status === 'CHECKED_OUT') c.checkedOut++;
        const bRaw = b.startTimeRaw;
        if (!c.firstVisitRaw || (bRaw && bRaw < c.firstVisitRaw)) { c.firstVisit = b.date; c.firstVisitRaw = bRaw; }
        if (!c.lastVisitRaw || (bRaw && bRaw > c.lastVisitRaw)) { c.lastVisit = b.date; c.lastVisitRaw = bRaw; c.lastService = b.service; c.lastBarber = b.barber; }
      } else {
        c.cancelled++;
      }
    });
    return Object.values(map);
  }, [bookings]);

  const allClients = useMemo(() => {
    const hiddenKeys = new Set(
      manualClients.filter(m => m.hidden)
        .flatMap(m => [m.phone, m.email, m.name?.toLowerCase()].filter(Boolean))
    );
    const merged = bookingClients
      .filter(c => !hiddenKeys.has(c.phone) && !hiddenKeys.has(c.email) && !hiddenKeys.has(c.name?.toLowerCase()))
      .map(c => {
        const manual = manualClients.find(m => !m.hidden && ((m.phone && m.phone === c.phone) || (m.email && m.email === c.email) || m.name?.toLowerCase() === c.name.toLowerCase()));
        const manualAddedAt = manual?.createdAt?.toDate ? manual.createdAt.toDate() : (manual?.createdAt ? new Date(manual.createdAt) : null);
        return {
          ...c,
          phone: manual?.phone || c.phone,
          email: manual?.email || c.email,
          birthday: manual?.birthday || '',
          notes: manual?.notes || '',
          manualId: manual?.id,
          loyaltyPoints: manual?.loyaltyPoints || 0,
          isMember: manual?.isMember || false,
          membershipTier: manual?.membershipTier || '',
          memberSince: manual?.memberSince || null,
          registeredAt: manualAddedAt || c.firstVisitRaw || new Date(0),
        };
      });
    manualClients.filter(m => !m.hidden).forEach(m => {
      const exists = bookingClients.some(c => (m.phone && m.phone === c.phone) || (m.email && m.email === c.email) || m.name?.toLowerCase() === c.name?.toLowerCase());
      if (!exists) {
        const addedAt = m.createdAt?.toDate ? m.createdAt.toDate() : (m.createdAt ? new Date(m.createdAt) : new Date());
        merged.push({ name: m.name || '', phone: m.phone || '', email: m.email || '', birthday: m.birthday || '', notes: m.notes || '', visits: 0, totalSpent: 0, totalTip: 0, totalDiscount: 0, services: {}, barbers: {}, sources: {}, bookings: [], firstVisit: null, lastVisit: null, firstVisitRaw: null, lastVisitRaw: null, lastService: '', lastBarber: '', paymentMethods: {}, checkedOut: 0, cancelled: 0, manualId: m.id, isManualOnly: true, addedAt, registeredAt: addedAt, loyaltyPoints: m.loyaltyPoints || 0, isMember: m.isMember || false, membershipTier: m.membershipTier || '', memberSince: m.memberSince || null });
      }
    });
    return merged;
  }, [bookingClients, manualClients]);

  const segments = useMemo(() => {
    const now = new Date();
    const ago = (days) => new Date(now - days * 24 * 3600 * 1000);
    return {
      members: allClients.filter(c => c.isMember),
      new: allClients.filter(c => c.isManualOnly ? (c.addedAt && c.addedAt >= ago(30)) : (c.firstVisitRaw && c.firstVisitRaw >= ago(30))),
      recent: allClients.filter(c => c.lastVisitRaw && c.lastVisitRaw >= ago(30)),
      firstVisit: allClients.filter(c => {
        const past = c.bookings.filter(b => b.startTimeRaw && b.startTimeRaw < now && b.status !== 'CANCELLED');
        const future = c.bookings.filter(b => b.startTimeRaw && b.startTimeRaw > now);
        return past.length === 0 && future.length > 0;
      }),
      loyal: allClients.filter(c => c.bookings.filter(b => b.startTimeRaw && b.startTimeRaw >= ago(150) && b.status !== 'CANCELLED').length >= 2),
      lapsed: allClients.filter(c => {
        const yr = c.bookings.filter(b => b.startTimeRaw && b.startTimeRaw >= ago(365) && b.status !== 'CANCELLED').length;
        const rec = c.bookings.filter(b => b.startTimeRaw && b.startTimeRaw >= ago(60) && b.status !== 'CANCELLED').length;
        return yr >= 3 && rec === 0;
      }),
      highSpenders: allClients.filter(c => c.bookings.filter(b => b.startTimeRaw && b.startTimeRaw >= ago(365) && b.status !== 'CANCELLED').reduce((s, b) => s + (parseFloat(String(b.paidAmount || b.price || '0').replace('£', '')) || 0), 0) > 81),
      highPoints: allClients.filter(c => (c.loyaltyPoints || 0) >= 50),
      birthdays: allClients.filter(c => {
        if (!c.birthday) return false;
        try {
          const bd = new Date(c.birthday);
          if (isNaN(bd)) return false;
          const next = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
          if (next < now) next.setFullYear(now.getFullYear() + 1);
          const diff = next - now;
          return diff >= 0 && diff <= 30 * 24 * 3600 * 1000;
        } catch { return false; }
      }),
    };
  }, [allClients]);

  const filtered = useMemo(() => {
    let list = allClients;
    if (activeSegment && segments[activeSegment]) {
      const keys = new Set(segments[activeSegment].map(c => c.phone || c.email || c.name));
      list = list.filter(c => keys.has(c.phone || c.email || c.name));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.email.toLowerCase().includes(q));
    }
    if (filterBarber !== 'all') {
      list = list.filter(c => Object.keys(c.barbers).some(b => b.toLowerCase() === filterBarber.toLowerCase()));
    }
    list = [...list].sort((a, b) => {
      let av = a[sortBy], bv = b[sortBy];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      return sortDir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
    });
    return list;
  }, [allClients, search, sortBy, sortDir, filterBarber, activeSegment, segments]);

  const handleAddClient = async () => {
    if (!addForm.name.trim()) return;
    setAddSaving(true);
    try {
      const data = { name: addForm.name.trim(), phone: addForm.phone.trim(), email: addForm.email.trim(), birthday: addForm.birthday, notes: addForm.notes.trim(), createdAt: serverTimestamp() };
      const ref = await addDoc(collection(db, `tenants/${TENANT}/clients`), data);
      setManualClients(prev => [...prev, { id: ref.id, ...data, createdAt: new Date() }]);
      setAddForm({ name: '', phone: '', email: '', birthday: '', notes: '' });
      setShowAddForm(false);
    } catch (e) { console.error(e); }
    finally { setAddSaving(false); }
  };

  useEffect(() => {
    setNoteInput(selectedClient?.notes || '');
    setDetailTab('overview');
    setMemberTierSelect(selectedClient?.isMember ? (selectedClient.membershipTier || 'standard') : '');
  }, [selectedClient?.name]);

  const saveNote = async () => {
    if (!selectedClient) return;
    setNoteSaving(true);
    try {
      const clientsRef = collection(db, `tenants/${TENANT}/clients`);
      const noteVal = noteInput.trim();
      const normalizePhone = (p) => String(p || '').replace(/[\s\-().+]/g, '').toLowerCase();

      let targetId = selectedClient.manualId || null;
      if (!targetId) {
        const snap = await getDocs(clientsRef);
        const origPhone = normalizePhone(selectedClient.phone);
        const origEmail = (selectedClient.email || '').toLowerCase().trim();
        const origName  = (selectedClient.name  || '').toLowerCase().trim();
        snap.forEach(d => {
          if (targetId) return;
          const dd = d.data();
          const dp = normalizePhone(dd.phone);
          const de = (dd.email || '').toLowerCase().trim();
          const dn = (dd.name  || '').toLowerCase().trim();
          if (origPhone && dp && origPhone === dp) targetId = d.id;
          else if (origEmail && de && origEmail === de) targetId = d.id;
          else if (origName && dn && origName === dn) targetId = d.id;
        });
      }

      if (targetId) {
        await updateDoc(doc(db, `tenants/${TENANT}/clients`, targetId), { notes: noteVal });
        setManualClients(prev => prev.map(m => m.id === targetId ? { ...m, notes: noteVal } : m));
      } else {
        const ref = await addDoc(clientsRef, {
          name: selectedClient.name, phone: selectedClient.phone, email: selectedClient.email,
          notes: noteVal, createdAt: serverTimestamp(),
        });
        setManualClients(prev => [...prev, { id: ref.id, name: selectedClient.name, phone: selectedClient.phone, email: selectedClient.email, notes: noteVal, createdAt: new Date() }]);
      }
      setSelectedClient(prev => prev ? { ...prev, notes: noteVal } : null);
    } catch (e) { console.error('saveNote error:', e); }
    finally { setNoteSaving(false); }
  };

  const resolveMemberDocId = async (client) => {
    if (client.manualId) return client.manualId;
    const clientsRef = collection(db, `tenants/${TENANT}/clients`);
    const norm = (p) => String(p || '').replace(/[\s\-().+]/g, '').toLowerCase();
    const snap = await getDocs(clientsRef);
    let found = null;
    snap.forEach(d => {
      if (found) return;
      const dd = d.data();
      if (client.phone && norm(dd.phone) === norm(client.phone)) found = d.id;
      else if (client.email && (dd.email || '').toLowerCase() === client.email.toLowerCase()) found = d.id;
      else if (client.name && (dd.name || '').toLowerCase() === client.name.toLowerCase()) found = d.id;
    });
    if (found) return found;
    const ref = await addDoc(clientsRef, { name: client.name, phone: client.phone, email: client.email, createdAt: serverTimestamp() });
    return ref.id;
  };

  const promoteMember = async (client, tier) => {
    if (!window.confirm(`Promote ${client.name} to MemberZone (${tier})? Their loyalty points (${client.loyaltyPoints || 0} pts) will be reset to 0.`)) return;
    setMemberSaving(true);
    try {
      const docId = await resolveMemberDocId(client);
      await updateDoc(doc(db, `tenants/${TENANT}/clients`, docId), {
        isMember: true, membershipTier: tier, memberSince: serverTimestamp(), loyaltyPoints: 0,
      });
      const update = { isMember: true, membershipTier: tier, memberSince: new Date(), loyaltyPoints: 0, manualId: docId };
      setManualClients(prev => prev.map(m => m.id === docId ? { ...m, ...update } : m));
      setSelectedClient(prev => prev ? { ...prev, ...update } : null);
    } catch (e) { console.error('promoteMember error:', e); }
    finally { setMemberSaving(false); }
  };

  const demoteMember = async (client) => {
    if (!window.confirm(`Remove ${client.name} from MemberZone?`)) return;
    setMemberSaving(true);
    try {
      const docId = await resolveMemberDocId(client);
      await updateDoc(doc(db, `tenants/${TENANT}/clients`, docId), { isMember: false, membershipTier: '' });
      const update = { isMember: false, membershipTier: '' };
      setManualClients(prev => prev.map(m => m.id === docId ? { ...m, ...update } : m));
      setSelectedClient(prev => prev ? { ...prev, ...update } : null);
    } catch (e) { console.error('demoteMember error:', e); }
    finally { setMemberSaving(false); }
  };

  // Store original identifying fields for edit lookup
  const openEditClient = (client) => {
    setEditingClient({
      ...client,
      _origPhone: client.phone,
      _origEmail: client.email,
      _origName: client.name,
    });
    setEditForm({ name: client.name, phone: client.phone, email: client.email, birthday: client.birthday || '', notes: client.notes || '' });
    setShowEditForm(true);
  };

  const handleEditClient = async () => {
    if (!editForm.name.trim()) return;
    setEditSaving(true);
    try {
      const data = { name: editForm.name.trim(), phone: editForm.phone.trim(), email: editForm.email.trim(), birthday: editForm.birthday, notes: editForm.notes.trim() };
      const clientsRef = collection(db, `tenants/${TENANT}/clients`);

      if (editingClient.manualId) {
        // Already have the doc ID — update directly
        await updateDoc(doc(db, `tenants/${TENANT}/clients`, editingClient.manualId), data);
        setManualClients(prev => prev.map(m => m.id === editingClient.manualId ? { ...m, ...data } : m));
      } else {
        // Booking-only client — search by ORIGINAL values to find any existing doc
        const normalizePhone = (p) => String(p || '').replace(/[\s\-().+]/g, '').toLowerCase();
        const origPhone = normalizePhone(editingClient._origPhone);
        const origEmail = (editingClient._origEmail || '').trim().toLowerCase();
        const origName  = (editingClient._origName || '').trim().toLowerCase();
        const snap = await getDocs(clientsRef);
        let foundId = null;
        snap.forEach(docSnap => {
          if (foundId) return; // stop once matched
          const d = docSnap.data();
          const docPhone = normalizePhone(d.phone);
          const docEmail = (d.email || '').trim().toLowerCase();
          const docName  = (d.name  || '').trim().toLowerCase();
          if (origPhone && docPhone && origPhone === docPhone) { foundId = docSnap.id; }
          else if (origEmail && docEmail && origEmail === docEmail) { foundId = docSnap.id; }
          else if (origName  && docName  && origName  === docName)  { foundId = docSnap.id; }
        });
        if (foundId) {
          await updateDoc(doc(db, `tenants/${TENANT}/clients`, foundId), data);
          setManualClients(prev => prev.map(m => m.id === foundId ? { ...m, ...data } : m));
        } else {
          const ref = await addDoc(clientsRef, { ...data, createdAt: serverTimestamp() });
          setManualClients(prev => [...prev, { id: ref.id, ...data, createdAt: new Date() }]);
        }
      }
      setSelectedClient(prev => prev ? { ...prev, ...data } : null);
      setShowEditForm(false);
      setEditingClient(null);
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  const handleDeleteClient = async (client) => {
    if (!window.confirm(`Delete "${client.name}" permanently?\n\nThis will delete:\n• The client record\n• ALL their bookings\n\nThis cannot be undone.`)) return;
    try {
      const bookingsRef = collection(db, `tenants/${TENANT}/bookings`);
      const batch = writeBatch(db);

      // Find and delete all bookings matching by phone or email
      const matchedBookingRefs = new Set();
      if (client.phone) {
        const byPhone = await getDocs(query(bookingsRef, where('clientPhone', '==', client.phone)));
        byPhone.forEach(d => matchedBookingRefs.add(d.ref));
      }
      if (client.email) {
        const byEmail = await getDocs(query(bookingsRef, where('clientEmail', '==', client.email)));
        byEmail.forEach(d => matchedBookingRefs.add(d.ref));
      }
      matchedBookingRefs.forEach(ref => batch.delete(ref));

      // Delete the client doc (active + any lingering hidden docs with same phone/email)
      const clientsRef = collection(db, `tenants/${TENANT}/clients`);
      const clientDocRefs = new Set();
      if (client.manualId) clientDocRefs.add(client.manualId);
      if (client.phone) {
        const byPhone = await getDocs(query(clientsRef, where('phone', '==', client.phone)));
        byPhone.forEach(d => clientDocRefs.add(d.id));
      }
      if (client.email) {
        const byEmail = await getDocs(query(clientsRef, where('email', '==', client.email)));
        byEmail.forEach(d => clientDocRefs.add(d.id));
      }
      clientDocRefs.forEach(id => batch.delete(doc(db, `tenants/${TENANT}/clients`, id)));

      await batch.commit();

      // Update local state
      if (client.manualId) {
        setManualClients(prev => prev.filter(m => m.id !== client.manualId));
      }
      setSelectedClient(null);
    } catch (e) { console.error(e); alert('Delete failed: ' + e.message); }
  };

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const getSvcLabel = (id) => {
    const s = config.services ? config.services.find(s => s.id === id) : null;
    return s ? s.name : id;
  };

  const viewSegment = (key) => { setActiveSegment(key); setTab('list'); setSearch(''); };

  const totalRevenue = allClients.reduce((s, c) => s + c.totalSpent, 0);
  const totalVisits = allClients.reduce((s, c) => s + c.visits, 0);
  const avgSpend = allClients.length ? totalRevenue / allClients.length : 0;
  const vipCount = allClients.filter(c => c.visits >= 5).length;

  const col = { fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: '600', cursor: 'pointer', userSelect: 'none', padding: '10px 14px', whiteSpace: 'nowrap' };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--muted)' }}>Loading clients...</div>;

  return (

    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: 'calc(100vh - 64px)' }}>
      {/* Header + Tabs + Add Client in one row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '1.4rem', color: '#d4af37', margin: 0, fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1 }}>Clients</h1>
            <span style={{ display: 'inline-block', width: '32px', height: '6px', borderRadius: '4px', background: 'linear-gradient(90deg,#d4af37,#b8860b)', marginTop: '8px' }} />
          </div>
          <div style={{ fontSize: '0.92rem', color: '#d4af37', fontWeight: 700, marginTop: '2px', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: 'var(--muted)', fontWeight: 500, fontSize: '0.95rem' }}>{allClients.length} total clients · {totalVisits} visits</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginRight: '8px' }}>
            <button onClick={() => setTab('list')} style={{ padding: '8px 18px', border: 'none', background: tab === 'list' ? 'rgba(212,175,55,0.15)' : 'transparent', color: tab === 'list' ? '#d4af37' : 'var(--muted)', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' }}>All Clients</button>
            <button onClick={() => setTab('segments')} style={{ padding: '8px 18px', border: 'none', background: tab === 'segments' ? 'rgba(212,175,55,0.15)' : 'transparent', color: tab === 'segments' ? '#d4af37' : 'var(--muted)', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' }}>Segments</button>
          </div>
          <button onClick={() => setShowAddForm(true)}
            style={{ padding: '10px 20px', background: 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '8px', color: '#000', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(212,175,55,0.3)' }}>
            Add Client
          </button>
        </div>
      </div>

        {/* Active segment banner */}
        {activeSegment && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: SEGMENT_DEFS.find(s => s.key === activeSegment)?.color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text)', fontWeight: '600' }}>
              {SEGMENT_DEFS.find(s => s.key === activeSegment)?.label}
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>· {segments[activeSegment]?.length || 0} clients</span>
            <button onClick={() => setActiveSegment(null)}
              style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--muted)', fontSize: '0.68rem', padding: '3px 10px', cursor: 'pointer' }}>
              Clear ×
            </button>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Row 1: search + count */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: '0.82rem', pointerEvents: 'none' }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email..."
                style={{ width: '100%', padding: '8px 12px 8px 30px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap', padding: '0 4px' }}>{filtered.length} clients</span>
          </div>

          {/* Row 2: Sort */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', flexShrink: 0, marginRight: '2px' }}>Sort</span>
            {[
              { key: 'registeredAt', label: 'Recently Added' },
              { key: 'lastVisitRaw',  label: 'Last Visit' },
              { key: 'totalSpent',   label: 'Spent' },
              { key: 'visits',       label: 'Visits' },
              { key: 'loyaltyPoints', label: 'Points' },
              { key: 'totalTip',     label: 'Tips' },
              { key: 'name',         label: 'Name' },
            ].map(opt => {
              const active = sortBy === opt.key;
              return (
                <button key={opt.key} onClick={() => toggleSort(opt.key)}
                  style={{ padding: '5px 10px', border: '1px solid ' + (active ? 'rgba(212,175,55,0.5)' : 'var(--border)'), borderRadius: '6px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: active ? '700' : '500', background: active ? 'rgba(212,175,55,0.12)' : 'transparent', color: active ? '#d4af37' : 'var(--muted)', transition: 'all 0.15s' }}>
                  {opt.label}{active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                </button>
              );
            })}
          </div>

          {/* Row 3: Barber filter */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', flexShrink: 0, marginRight: '2px' }}>Barber</span>
            <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <button onClick={() => setFilterBarber('all')} style={{ padding: '6px 12px', border: 'none', cursor: 'pointer', background: filterBarber === 'all' ? 'rgba(212,175,55,0.2)' : 'transparent', color: filterBarber === 'all' ? '#d4af37' : 'var(--muted)', fontSize: '0.75rem', fontWeight: '600' }}>All</button>
              {barbers.map(b => (
                <button key={b.id} onClick={() => setFilterBarber(filterBarber === b.name ? 'all' : b.name)}
                  style={{ padding: '6px 12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: '600', transition: 'all 0.15s',
                    background: filterBarber === b.name ? (b.color || '#d4af37') + '22' : 'transparent',
                    color: filterBarber === b.name ? (b.color || '#d4af37') : 'var(--muted)' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: filterBarber === b.name ? (b.color || '#d4af37') : 'var(--muted)', transition: 'background 0.15s' }} />
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '14px', flex: 1, overflow: 'hidden' }}>
          {/* Table */}
          <div style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ overflowX: 'auto', flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 5 }}>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {[
                      { label: 'Client',      key: 'name' },
                      { label: 'Visits',      key: 'visits' },
                      { label: 'Total Spent', key: 'totalSpent' },
                      { label: 'Avg/Visit',   key: null },
                      { label: 'Tips',        key: 'totalTip' },
                      { label: 'Points',      key: 'loyaltyPoints' },
                      { label: 'Last Visit',  key: 'lastVisitRaw' },
                      { label: 'Added',       key: 'registeredAt' },
                      { label: 'Fav Service', key: null },
                      { label: 'Barber',      key: null },
                    ].map(h => (
                      <th key={h.label} onClick={() => h.key && toggleSort(h.key)}
                        style={{ ...col, textAlign: 'left', cursor: h.key ? 'pointer' : 'default',
                          color: sortBy === h.key ? '#d4af37' : 'var(--muted)',
                          userSelect: 'none' }}>
                        {h.label}{sortBy === h.key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : (h.key ? ' ·' : '')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => {
                    const favSvc = Object.entries(c.services).sort((a, b) => b[1] - a[1])[0];
                    const favBarber = Object.entries(c.barbers).sort((a, b) => b[1] - a[1])[0];
                    const isVIP = c.visits >= 5;
                    const isNew = c.visits === 1;
                    const isSel = selectedClient?.phone === c.phone && selectedClient?.name === c.name;
                    return (
                      <tr key={i} onClick={() => setSelectedClient(isSel ? null : c)}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isSel ? 'rgba(212,175,55,0.06)' : 'transparent', transition: 'background 0.15s' }}
                        onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(212,175,55,0.03)'; }}
                        onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: getBColor(favBarber?.[0]) + '22', border: '1px solid ' + getBColor(favBarber?.[0]) + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem', fontWeight: '700', color: getBColor(favBarber?.[0]), flexShrink: 0 }}>
                              {(c.name[0] || '?').toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                {c.name}
                                {isVIP && <span style={{ fontSize: '0.55rem', background: 'rgba(212,175,55,0.2)', color: '#d4af37', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>VIP</span>}
                                {isNew && !isVIP && <span style={{ fontSize: '0.55rem', background: 'rgba(76,175,80,0.2)', color: '#4caf50', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>NEW</span>}
                                {c.isManualOnly && <span style={{ fontSize: '0.55rem', background: 'rgba(33,150,243,0.15)', color: '#2196f3', padding: '1px 5px', borderRadius: '4px', fontWeight: '700' }}>ADDED</span>}
                              </div>
                              <div style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>{c.phone || c.email || '--'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '0.82rem', color: 'var(--text)', fontWeight: '600' }}>{c.visits}</td>
                        <td style={{ padding: '12px 14px', fontSize: '0.85rem', color: '#d4af37', fontWeight: '700' }}>£{c.totalSpent.toFixed(2)}</td>
                        <td style={{ padding: '12px 14px', fontSize: '0.78rem', color: 'var(--muted)' }}>£{c.visits ? (c.totalSpent / c.visits).toFixed(0) : '0'}</td>
                        <td style={{ padding: '12px 14px', fontSize: '0.78rem', color: c.totalTip > 0 ? '#4caf50' : 'var(--muted)' }}>{c.totalTip > 0 ? '£' + c.totalTip.toFixed(2) : '--'}</td>
                        <td style={{ padding: '12px 14px' }}>
                          {c.loyaltyPoints > 0
                            ? <span style={{ fontSize: '0.75rem', color: '#d4af37', fontWeight: '700' }}>⭐ {c.loyaltyPoints}</span>
                            : <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>--</span>}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '0.75rem', color: 'var(--muted)' }}>{c.lastVisit || '--'}</td>
                        <td style={{ padding: '12px 14px', fontSize: '0.72rem', color: 'var(--muted)' }}>
                          {c.registeredAt && c.registeredAt > new Date(1000)
                            ? c.registeredAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
                            : '--'}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '0.72rem', color: 'var(--text)' }}>{favSvc ? getSvcLabel(favSvc[0]) : '--'}</td>
                        <td style={{ padding: '12px 14px' }}>
                          {favBarber && <span style={{ fontSize: '0.68rem', color: getBColor(favBarber[0]), background: getBColor(favBarber[0]) + '18', padding: '2px 7px', borderRadius: '4px', fontWeight: '600' }}>{favBarber[0]?.toUpperCase()}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.82rem' }}>No clients found</div>}
            </div>
          </div>

          {/* ── CLIENT DETAIL PANEL ── */}
          {selectedClient && (() => {
            const pts = selectedClient.loyaltyPoints || 0;
            const milestones = [100, 250, 500, 1000];
            const nextMilestone = milestones.find(m => pts < m) || milestones[milestones.length - 1];
            const prevMilestone = milestones[milestones.indexOf(nextMilestone) - 1] || 0;
            const progress = Math.min(((pts - prevMilestone) / (nextMilestone - prevMilestone)) * 100, 100);
            const topBarber = Object.entries(selectedClient.barbers || {}).sort((a,b) => b[1]-a[1])[0];
            const topBarberColor = topBarber ? getBColor(topBarber[0]) : '#d4af37';
            return (
              <div style={{ width: '360px', flexShrink: 0, background: 'var(--card2)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: 'calc(100vh - 200px)' }}>

                {/* Header */}
                <div style={{ padding: '18px 18px 0', background: 'rgba(212,175,55,0.03)', flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: topBarberColor + '22', border: '3px solid ' + topBarberColor + '66', boxShadow: '0 0 0 4px ' + topBarberColor + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', fontWeight: '800', color: topBarberColor, flexShrink: 0 }}>
                        {selectedClient.name[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text)', marginBottom: '5px' }}>{selectedClient.name}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {selectedClient.visits >= 10 && <span style={{ fontSize: '0.55rem', background: 'rgba(212,175,55,0.25)', color: '#d4af37', padding: '2px 7px', borderRadius: '20px', fontWeight: '700', letterSpacing: '0.5px' }}>VIP</span>}
                          {selectedClient.isMember && <span style={{ fontSize: '0.55rem', background: 'rgba(123,31,162,0.2)', color: '#ce93d8', padding: '2px 7px', borderRadius: '20px', fontWeight: '700', letterSpacing: '0.5px' }}>◆ {(selectedClient.membershipTier || 'member').toUpperCase()}</span>}
                          {!selectedClient.isMember && selectedClient.visits >= 10 && <span style={{ fontSize: '0.55rem', background: 'rgba(212,175,55,0.25)', color: '#d4af37', padding: '2px 7px', borderRadius: '20px', fontWeight: '700', letterSpacing: '0.5px' }}>VIP</span>}
                          {selectedClient.isManualOnly && <span style={{ fontSize: '0.55rem', background: 'rgba(33,150,243,0.15)', color: '#2196f3', padding: '2px 7px', borderRadius: '20px', fontWeight: '700' }}>ADDED</span>}
                          {!selectedClient.isManualOnly && selectedClient.visits === 1 && <span style={{ fontSize: '0.55rem', background: 'rgba(76,175,80,0.15)', color: '#4caf50', padding: '2px 7px', borderRadius: '20px', fontWeight: '700' }}>NEW</span>}
                          {!selectedClient.isMember && pts >= 20 && <span style={{ fontSize: '0.55rem', background: 'rgba(212,175,55,0.15)', color: '#d4af37', padding: '2px 7px', borderRadius: '20px', fontWeight: '700' }}>⭐ £{Math.floor(pts/20)}</span>}
                        </div>
                        {selectedClient.phone && <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: '5px' }}>{selectedClient.phone}</div>}
                        {selectedClient.email && <div style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>{selectedClient.email}</div>}
                        {selectedClient.birthday && <div style={{ fontSize: '0.62rem', color: '#e91e63', marginTop: '2px' }}>🎂 {new Date(selectedClient.birthday).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</div>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                      <button onClick={() => setSelectedClient(null)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}>×</button>
                      <button onClick={() => openEditClient(selectedClient)} style={{ padding: '3px 8px', background: 'transparent', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '5px', color: '#d4af37', cursor: 'pointer', fontSize: '0.65rem', fontWeight: '600' }}>Edit</button>
                      <button onClick={() => handleDeleteClient(selectedClient)} style={{ padding: '3px 8px', background: 'transparent', border: '1px solid rgba(255,82,82,0.25)', borderRadius: '5px', color: '#ff5252', cursor: 'pointer', fontSize: '0.65rem' }}>Delete</button>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    {selectedClient.phone && (
                      <a href={'https://wa.me/' + String(selectedClient.phone).replace(/[\s+\-()]/g, '')} target="_blank" rel="noreferrer"
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '8px 4px', background: '#25D36612', border: '1px solid #25D36630', borderRadius: '10px', color: '#25D366', textDecoration: 'none' }}>
                        <span style={{ fontSize: '1rem' }}>💬</span>
                        <span style={{ fontSize: '0.58rem', fontWeight: '600' }}>WhatsApp</span>
                      </a>
                    )}
                    {selectedClient.email && (
                      <a href={'mailto:' + selectedClient.email}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '8px 4px', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', color: '#d4af37', textDecoration: 'none' }}>
                        <span style={{ fontSize: '1rem' }}>✉️</span>
                        <span style={{ fontSize: '0.58rem', fontWeight: '600' }}>Email</span>
                      </a>
                    )}
                    {selectedClient.phone && (
                      <a href={'tel:' + selectedClient.phone}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '8px 4px', background: 'rgba(33,150,243,0.07)', border: '1px solid rgba(33,150,243,0.2)', borderRadius: '10px', color: '#2196f3', textDecoration: 'none' }}>
                        <span style={{ fontSize: '1rem' }}>📞</span>
                        <span style={{ fontSize: '0.58rem', fontWeight: '600' }}>Call</span>
                      </a>
                    )}
                  </div>

                  {/* Tabs */}
                  <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginLeft: '-18px', marginRight: '-18px', paddingLeft: '18px', gap: '0' }}>
                    {['overview','history','loyalty'].map(t => (
                      <button key={t} onClick={() => setDetailTab(t)}
                        style={{ padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: detailTab === t ? '2px solid #d4af37' : '2px solid transparent', color: detailTab === t ? '#d4af37' : 'var(--muted)', cursor: 'pointer', fontSize: '0.68rem', fontWeight: '600', textTransform: 'capitalize', letterSpacing: '0.5px', marginBottom: '-1px' }}>
                        {t === 'overview' ? 'Overview' : t === 'history' ? 'History' : 'Loyalty'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab content */}
                <div style={{ overflowY: 'auto', flex: 1, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                  {/* ── OVERVIEW TAB ── */}
                  {detailTab === 'overview' && (<>
                    {/* Stats grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '7px' }}>
                      {[
                        { label: 'Visits', value: selectedClient.visits, color: '#d4af37' },
                        { label: 'Total', value: '£' + selectedClient.totalSpent.toFixed(0), color: '#4caf50' },
                        { label: 'Avg/Visit', value: '£' + (selectedClient.visits ? (selectedClient.totalSpent / selectedClient.visits).toFixed(0) : '0'), color: '#2196f3' },
                        { label: 'Tips', value: selectedClient.totalTip > 0 ? '£' + selectedClient.totalTip.toFixed(0) : '--', color: '#4caf50' },
                        { label: 'Discounts', value: selectedClient.totalDiscount > 0 ? '£' + selectedClient.totalDiscount.toFixed(0) : '--', color: '#ff9800' },
                        { label: 'Cancelled', value: selectedClient.cancelled || 0, color: '#ff5252' },
                      ].map(s => (
                        <div key={s.label} style={{ padding: '9px 10px', background: s.color + '0a', border: '1px solid ' + s.color + '22', borderRadius: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.92rem', fontWeight: '700', color: s.color }}>{s.value}</div>
                          <div style={{ fontSize: '0.56rem', color: 'var(--muted)', letterSpacing: '0.5px', marginTop: '2px' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* MemberZone */}
                    {selectedClient.isMember ? (
                      <div style={{ padding: '14px', background: 'rgba(123,31,162,0.08)', borderRadius: '10px', border: '1px solid rgba(123,31,162,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontSize: '0.6rem', color: '#ce93d8', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '600', marginBottom: '4px' }}>◆ MemberZone</div>
                            <div style={{ fontSize: '0.88rem', color: '#ce93d8', fontWeight: '700', textTransform: 'capitalize' }}>{selectedClient.membershipTier || 'Standard'}</div>
                            {selectedClient.memberSince && (
                              <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginTop: '3px' }}>
                                Since {(selectedClient.memberSince?.toDate ? selectedClient.memberSince.toDate() : new Date(selectedClient.memberSince)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                            )}
                          </div>
                          <button onClick={() => demoteMember(selectedClient)} disabled={memberSaving}
                            style={{ padding: '4px 10px', background: 'transparent', border: '1px solid rgba(255,82,82,0.3)', borderRadius: '6px', color: '#ff5252', cursor: 'pointer', fontSize: '0.62rem', fontWeight: '600' }}>
                            Remove
                          </button>
                        </div>
                        <div style={{ marginTop: '10px', padding: '8px', background: 'rgba(123,31,162,0.08)', borderRadius: '6px', fontSize: '0.62rem', color: '#ce93d8' }}>
                          Loyalty points paused — member benefits apply
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '14px', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '600', marginBottom: '10px' }}>Promote to MemberZone</div>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                          {MEMBERSHIP_TIERS.map(t => (
                            <button key={t.key} onClick={() => setMemberTierSelect(t.key)}
                              style={{ flex: 1, padding: '8px', background: memberTierSelect === t.key ? t.color + '22' : 'transparent', border: '1px solid ' + (memberTierSelect === t.key ? t.color : 'var(--border)'), borderRadius: '8px', color: memberTierSelect === t.key ? t.color : 'var(--muted)', cursor: 'pointer', fontSize: '0.7rem', fontWeight: '700' }}>
                              {t.label}
                              <div style={{ fontSize: '0.55rem', fontWeight: '400', marginTop: '2px', opacity: 0.8 }}>{t.desc}</div>
                            </button>
                          ))}
                        </div>
                        <button onClick={() => promoteMember(selectedClient, memberTierSelect)} disabled={memberSaving || !memberTierSelect}
                          style={{ width: '100%', padding: '9px', background: (!memberTierSelect || memberSaving) ? 'transparent' : 'rgba(123,31,162,0.15)', border: '1px solid ' + (!memberTierSelect ? 'var(--border)' : 'rgba(123,31,162,0.4)'), borderRadius: '8px', color: !memberTierSelect ? 'var(--muted)' : '#ce93d8', cursor: (!memberTierSelect || memberSaving) ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: '700' }}>
                          {memberSaving ? 'Saving...' : !memberTierSelect ? 'Select a tier first' : '◆ Add to MemberZone'}
                        </button>
                      </div>
                    )}

                    {/* Services */}
                    {Object.keys(selectedClient.services).length > 0 && (
                      <div style={{ padding: '12px', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px', fontWeight: '600' }}>Services</div>
                        {Object.entries(selectedClient.services).sort((a,b) => b[1]-a[1]).slice(0,5).map(([id, count]) => {
                          const maxCount = Math.max(...Object.values(selectedClient.services));
                          return (
                            <div key={id} style={{ marginBottom: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text)' }}>{getSvcLabel(id)}</span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: '600' }}>{count}x</span>
                              </div>
                              <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ width: (count/maxCount*100) + '%', height: '100%', background: topBarberColor, borderRadius: '2px' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Barber breakdown */}
                    {Object.keys(selectedClient.barbers || {}).length > 0 && (
                      <div style={{ padding: '12px', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px', fontWeight: '600' }}>Barbers</div>
                        {Object.entries(selectedClient.barbers).sort((a,b) => b[1]-a[1]).map(([barber, count]) => (
                          <div key={barber} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getBColor(barber) }} />
                              <span style={{ fontSize: '0.72rem', color: 'var(--text)', fontWeight: '600' }}>{barber}</span>
                            </div>
                            <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{count} visit{count !== 1 ? 's' : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Notes */}
                    <div style={{ padding: '12px', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px', fontWeight: '600' }}>Notes</div>
                      <textarea value={noteInput} onChange={e => setNoteInput(e.target.value)} placeholder="Preferences, allergies, anything to remember..." rows={2}
                        style={{ width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--text)', fontSize: '0.78rem', outline: 'none', resize: 'vertical', lineHeight: '1.5', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                      <button onClick={saveNote} disabled={noteSaving || noteInput.trim() === (selectedClient.notes || '').trim()}
                        style={{ marginTop: '6px', padding: '5px 14px', background: (noteSaving || noteInput.trim() === (selectedClient.notes || '').trim()) ? 'transparent' : 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px', color: '#d4af37', fontSize: '0.72rem', fontWeight: '600', cursor: (noteSaving || noteInput.trim() === (selectedClient.notes || '').trim()) ? 'default' : 'pointer', opacity: (noteSaving || noteInput.trim() === (selectedClient.notes || '').trim()) ? 0.4 : 1 }}>
                        {noteSaving ? 'Saving...' : 'Save Note'}
                      </button>
                    </div>
                  </>)}

                  {/* ── HISTORY TAB ── */}
                  {detailTab === 'history' && (<>
                    {selectedClient.bookings.length === 0
                      ? <div style={{ color: 'var(--muted)', fontSize: '0.78rem', textAlign: 'center', marginTop: '24px' }}>No booking history</div>
                      : selectedClient.bookings.slice().reverse().map((b, i) => {
                          const statusColor = b.status === 'CHECKED_OUT' ? '#4caf50' : b.status === 'CANCELLED' ? '#ff5252' : '#ff9800';
                          const amount = b.paidAmount ? '£' + b.paidAmount : (b.price ? '£' + b.price : '--');
                          return (
                            <div key={i} style={{ padding: '12px', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                <div>
                                  <div style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text)' }}>{getSvcLabel(b.service)}</div>
                                  <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: '2px' }}>{b.date} · {(b.barber || '').toUpperCase()}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#d4af37' }}>{amount}</div>
                                  {b.tip && parseFloat(String(b.tip).replace('£','')) > 0 && <div style={{ fontSize: '0.58rem', color: '#4caf50' }}>+£{b.tip} tip</div>}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.58rem', color: statusColor, background: statusColor + '18', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>{b.status.replace('_',' ')}</span>
                                {b.discount && parseFloat(String(b.discount).replace('£','')) > 0 && <span style={{ fontSize: '0.58rem', color: '#ff9800', background: 'rgba(255,152,0,0.1)', padding: '2px 6px', borderRadius: '4px' }}>-£{b.discount} off</span>}
                              </div>
                            </div>
                          );
                        })
                    }
                  </>)}

                  {/* ── LOYALTY TAB ── */}
                  {detailTab === 'loyalty' && (<>
                    {/* Big counter */}
                    <div style={{ padding: '24px 16px', background: 'rgba(212,175,55,0.06)', borderRadius: '14px', border: '1px solid rgba(212,175,55,0.2)', textAlign: 'center' }}>
                      <div style={{ fontSize: '3rem', fontWeight: '800', color: '#d4af37', lineHeight: 1 }}>⭐ {pts}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '6px', fontWeight: '600' }}>LOYALTY POINTS</div>
                      <div style={{ fontSize: '0.85rem', color: pts >= 20 ? '#4caf50' : 'var(--muted)', marginTop: '8px', fontWeight: '700' }}>
                        {pts >= 20 ? `£${Math.floor(pts/20)} available to redeem` : `${20 - pts} pts until first £1 off`}
                      </div>
                    </div>

                    {/* Progress to next milestone */}
                    <div style={{ padding: '14px', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: '600' }}>{prevMilestone} pts</span>
                        <span style={{ fontSize: '0.65rem', color: '#d4af37', fontWeight: '700' }}>Next: {nextMilestone} pts</span>
                      </div>
                      <div style={{ height: '8px', background: 'rgba(212,175,55,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: progress + '%', height: '100%', background: 'linear-gradient(90deg,#d4af37,#b8860b)', borderRadius: '4px', transition: 'width 0.6s' }} />
                      </div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginTop: '6px', textAlign: 'center' }}>
                        {nextMilestone - pts} pts to next milestone
                      </div>
                    </div>

                    {/* Milestones */}
                    <div style={{ padding: '12px', background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px', fontWeight: '600' }}>Milestones</div>
                      {[
                        { pts: 100, label: '£5 reward', icon: '🥉' },
                        { pts: 250, label: '£12.50 reward', icon: '🥈' },
                        { pts: 500, label: '£25 reward', icon: '🥇' },
                        { pts: 1000, label: '£50 reward', icon: '👑' },
                      ].map(m => (
                        <div key={m.pts} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', opacity: pts >= m.pts ? 1 : 0.45 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1rem' }}>{m.icon}</span>
                            <div>
                              <div style={{ fontSize: '0.72rem', color: pts >= m.pts ? 'var(--text)' : 'var(--muted)', fontWeight: '600' }}>{m.pts} pts</div>
                              <div style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>{m.label}</div>
                            </div>
                          </div>
                          {pts >= m.pts
                            ? <span style={{ fontSize: '0.65rem', color: '#4caf50', fontWeight: '700' }}>✓ Reached</span>
                            : <span style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>{m.pts - pts} pts away</span>
                          }
                        </div>
                      ))}
                    </div>

                    <div style={{ fontSize: '0.62rem', color: 'var(--muted)', textAlign: 'center' }}>20 pts = £1 · Earn 1pt per £1 spent · Min 20pts to redeem</div>
                  </>)}

                </div>
              </div>
            );
          })()}
        </div>
      

      {/* ── SEGMENTS TAB ── */}
      {tab === 'segments' && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input value={segSearch} onChange={e => setSegSearch(e.target.value)} placeholder="Search by client name across all segments..."
            style={{ padding: '9px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.85rem', outline: 'none', maxWidth: '400px' }} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
            {SEGMENT_DEFS.map(seg => {
              const list = segSearch
                ? (segments[seg.key] || []).filter(c => c.name.toLowerCase().includes(segSearch.toLowerCase()))
                : (segments[seg.key] || []);
              const count = list.length;
              return (
                <div key={seg.key} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: seg.color, fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>{seg.label}</div>
                      <div style={{ fontSize: '2rem', fontWeight: '800', color: seg.color, lineHeight: 1 }}>{count}</div>
                    </div>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: seg.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '1.1rem' }}>
                        {{ new: '🆕', recent: '🕐', firstVisit: '✨', loyal: '⭐', lapsed: '💤', highSpenders: '💎', highPoints: '🏆', birthdays: '🎂' }[seg.key]}
                      </span>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: 0, lineHeight: '1.5' }}>{seg.desc}</p>

                  {count > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {list.slice(0, 3).map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: seg.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', color: seg.color, fontWeight: '700', flexShrink: 0 }}>
                            {(c.name[0] || '?').toUpperCase()}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text)' }}>{c.name}</span>
                          {c.loyaltyPoints > 0 && <span style={{ fontSize: '0.6rem', color: '#d4af37', marginLeft: 'auto' }}>⭐{c.loyaltyPoints}</span>}
                          {!c.loyaltyPoints && c.visits > 0 && <span style={{ fontSize: '0.62rem', color: 'var(--muted)', marginLeft: 'auto' }}>{c.visits}v</span>}
                        </div>
                      ))}
                      {count > 3 && <div style={{ fontSize: '0.65rem', color: 'var(--muted)', paddingLeft: '30px' }}>+{count - 3} more clients</div>}
                    </div>
                  )}

                  <button onClick={() => viewSegment(seg.key)}
                    style={{ padding: '8px 0', background: count > 0 ? seg.color + '15' : 'transparent', border: '1px solid ' + seg.color + (count > 0 ? '35' : '20'), borderRadius: '8px', color: count > 0 ? seg.color : 'var(--muted)', fontSize: '0.75rem', fontWeight: '600', cursor: count > 0 ? 'pointer' : 'default', marginTop: 'auto' }}>
                    {count > 0 ? 'View Clients →' : 'No clients'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── EDIT CLIENT MODAL ── */}
      {showEditForm && editingClient && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowEditForm(false); setEditingClient(null); } }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', width: '420px', maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px' }}>✦ EDIT CLIENT</span>
              <button onClick={() => { setShowEditForm(false); setEditingClient(null); }} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={lbl}>Full Name *</label>
                <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Client name" style={inp} autoFocus />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={lbl}>Phone</label>
                  <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="+44..." style={inp} />
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder="email@..." style={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>Birthday</label>
                <input type="date" value={editForm.birthday} onChange={e => setEditForm(f => ({ ...f, birthday: e.target.value }))} style={{ ...inp, colorScheme: 'dark' }} />
              </div>
              <div>
                <label style={lbl}>Notes</label>
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Preferences, allergies, any notes..." rows={3} style={{ ...inp, resize: 'vertical', lineHeight: '1.5' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button onClick={() => { setShowEditForm(false); setEditingClient(null); }}
                style={{ padding: '10px 18px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.82rem' }}>
                Cancel
              </button>
              <button onClick={handleEditClient} disabled={editSaving || !editForm.name.trim()}
                style={{ padding: '10px 22px', background: (editSaving || !editForm.name.trim()) ? 'rgba(212,175,55,0.25)' : 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '8px', color: (editSaving || !editForm.name.trim()) ? 'var(--muted)' : '#000', fontWeight: '700', fontSize: '0.82rem', cursor: (editSaving || !editForm.name.trim()) ? 'not-allowed' : 'pointer' }}>
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD CLIENT MODAL ── */}
      {showAddForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddForm(false); }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', width: '420px', maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px' }}>✦ NEW CLIENT</span>
              <button onClick={() => setShowAddForm(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={lbl}>Full Name *</label>
                <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Client name" style={inp} autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleAddClient()} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={lbl}>Phone</label>
                  <input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="+44..." style={inp} />
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="email@..." style={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>Birthday</label>
                <input type="date" value={addForm.birthday} onChange={e => setAddForm(f => ({ ...f, birthday: e.target.value }))} style={{ ...inp, colorScheme: 'dark' }} />
              </div>
              <div>
                <label style={lbl}>Notes</label>
                <textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="Preferences, allergies, any notes..." rows={3} style={{ ...inp, resize: 'vertical', lineHeight: '1.5' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button onClick={() => setShowAddForm(false)}
                style={{ padding: '10px 18px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.82rem' }}>
                Cancel
              </button>
              <button onClick={handleAddClient} disabled={addSaving || !addForm.name.trim()}
                style={{ padding: '10px 22px', background: (addSaving || !addForm.name.trim()) ? 'rgba(212,175,55,0.25)' : 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '8px', color: (addSaving || !addForm.name.trim()) ? 'var(--muted)' : '#000', fontWeight: '700', fontSize: '0.82rem', cursor: (addSaving || !addForm.name.trim()) ? 'not-allowed' : 'pointer' }}>
                {addSaving ? 'Saving...' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* The main flex column container closes here */}
    </div>
  );
}
