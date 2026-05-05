import React, { useState, useEffect } from 'react';
import config from '../config';
import { db } from '../firebase';
import { doc, getDoc, setDoc, collection, getDocs, query, where, Timestamp, writeBatch, updateDoc, deleteDoc } from 'firebase/firestore';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TENANT = 'whitecross';

const defaultSettings = {
  shopName: config.shopName,
  shopAddress: config.shopAddress,
  shopPhone: config.shopPhone,
  shopEmail: config.shopEmail,
  hours: {
    Monday:    { open: '09:00', close: '19:00', closed: false },
    Tuesday:   { open: '09:00', close: '19:00', closed: false },
    Wednesday: { open: '09:00', close: '19:00', closed: false },
    Thursday:  { open: '09:00', close: '19:00', closed: false },
    Friday:    { open: '09:00', close: '19:00', closed: false },
    Saturday:  { open: '09:00', close: '19:00', closed: false },
    Sunday:    { open: '10:00', close: '16:00', closed: false },
  },
  platforms: {
    booksy: {
      depositEnabled: config.platforms?.booksy?.depositEnabled ?? true,
      depositAmount: config.platforms?.booksy?.depositAmount ?? 10,
    },
    fresha: {
      depositEnabled: config.platforms?.fresha?.depositEnabled ?? false,
      depositAmount: config.platforms?.fresha?.depositAmount ?? 0,
    },
  },
  specialHours: [],
  emailConfirmationEnabled: true,
  products: { enabled: false },
};

function normalizeSpecialHours(list) {
  return (Array.isArray(list) ? list : [])
    .filter(function(item) {
      return item && item.date;
    })
    .map(function(item) {
      return {
        date: item.date,
        open: item.open || '09:00',
        close: item.close || '19:00',
        closed: !!item.closed,
        note: item.note || '',
      };
    })
    .sort(function(a, b) {
      return String(a.date).localeCompare(String(b.date));
    });
}

function toMinutes(value) {
  var parts = String(value || '').split(':').map(Number);
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return NaN;
  return parts[0] * 60 + parts[1];
}

function getLocalDateKey(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

export default function Settings({ theme, onToggleTheme }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [googleReminder, setGoogleReminder] = useState(false);
  const [cleaningPast, setCleaningPast] = useState(false);

  const todayKey = getLocalDateKey(new Date());
  const pastSpecialCount = (settings.specialHours || []).filter(function(item) {
    return item && item.date && item.date < todayKey;
  }).length;

  useEffect(function() { fetchSettings(); }, []);

  const fetchSettings = async function() {
    try {
      const snap = await getDoc(doc(db, `tenants/${TENANT}/settings/settings`));
      if (snap.exists()) {
        const data = snap.data();
        setSettings({
          ...defaultSettings,
          ...data,
          platforms: { ...defaultSettings.platforms, ...(data.platforms || {}) },
          products: { enabled: false, ...(data.products || {}) },
          specialHours: normalizeSpecialHours(data.specialHours),
        });
      }
    } catch (err) {
      console.error('fetchSettings error:', err);
    } finally {
      setLoading(false);
    }
  };

  // O gün booking var mı kontrol et
  const checkBookingsForDay = async function(dayName) {
    try {
      const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const today = new Date();
      const results = [];
      // Önümüzdeki 90 gün içinde o güne denk gelen tarihleri bul
      for (let i = 0; i < 90; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        if (DAY_NAMES[d.getDay()] === dayName) {
          const start = new Date(d); start.setHours(0,0,0,0);
          const end = new Date(d); end.setHours(23,59,59,999);
          const q = query(
            collection(db, `tenants/${TENANT}/bookings`),
            where('startTime', '>=', Timestamp.fromDate(start)),
            where('startTime', '<=', Timestamp.fromDate(end)),
            where('status', '==', 'CONFIRMED')
          );
          const snap = await getDocs(q);
          snap.forEach(d => results.push(d.data()));
        }
      }
      return results;
    } catch(err) {
      console.error('checkBookings error:', err);
      return [];
    }
  };

  // Tüm barber'ların o günkü dayHours'unu güncelle
  const updateAllBarbersDay = async function(dayName, newHours) {
    try {
      const snap = await getDocs(collection(db, `tenants/${TENANT}/barbers`));
      const updates = snap.docs.map(async barberDoc => {
        const barber = barberDoc.data();
        const currentDayHours = barber.dayHours || {};
        const updatedDayHours = {
          ...currentDayHours,
          [dayName]: { ...( currentDayHours[dayName] || {}), ...newHours }
        };
        // workingDays güncelle
        let workingDays = Array.isArray(barber.workingDays) ? [...barber.workingDays] : [];
        if (newHours.closed) {
          workingDays = workingDays.filter(d => d !== dayName);
        } else {
          if (!workingDays.includes(dayName)) workingDays.push(dayName);
        }
        await setDoc(doc(db, `tenants/${TENANT}/barbers`, barberDoc.id), {
          ...barber,
          dayHours: updatedDayHours,
          workingDays,
        });
      });
      await Promise.all(updates);
    } catch(err) {
      console.error('updateAllBarbersDay error:', err);
    }
  };

  const handleToggleClosed = async function(day, currentClosed) {
    const newClosed = !currentClosed;

    if (newClosed) {
      // Kapatmak istiyoruz — önce booking kontrolü
      const bookings = await checkBookingsForDay(day);
      if (bookings.length > 0) {
        setError(`⚠️ ${day} has ${bookings.length} upcoming confirmed booking(s). Please cancel them first before closing this day.`);
        return;
      }
      // Booking yok — confirm
      if (!window.confirm(`Close ${day} for all barbers? This will remove it from available booking days.`)) return;
    } else {
      if (!window.confirm(`Reopen ${day} for all barbers?`)) return;
    }

    // Settings güncelle
    const newHours = { ...settings.hours[day], closed: newClosed };
    const newSettings = {
      ...settings,
      hours: { ...settings.hours, [day]: newHours }
    };
    setSettings(newSettings);

    // Firestore'a kaydet
    await setDoc(doc(db, `tenants/${TENANT}/settings/settings`), newSettings);
    // Tüm barber'ları güncelle
    await updateAllBarbersDay(day, newHours);

    setGoogleReminder(true);
    setError('');
  };

  const handleTimeChange = function(day, key, value) {
    const newHours = { ...settings.hours[day], [key]: value };
    setSettings(s => ({
      ...s,
      hours: { ...s.hours, [day]: newHours }
    }));
  };

  const addSpecialHours = function() {
    const today = new Date();
    const date = new Date(today);
    date.setDate(today.getDate() + 1);
    const dateKey = date.toISOString().slice(0, 10);
    setSettings(function(current) {
      const specialHours = normalizeSpecialHours([
        ...(current.specialHours || []),
        { date: dateKey, open: '10:00', close: '19:00', closed: false, note: '' }
      ]);
      return { ...current, specialHours };
    });
  };

  const updateSpecialHours = function(index, key, value) {
    setSettings(function(current) {
      const specialHours = (current.specialHours || []).map(function(item, itemIndex) {
        if (itemIndex !== index) return item;
        return { ...item, [key]: value };
      });
      return { ...current, specialHours: normalizeSpecialHours(specialHours) };
    });
  };

  const removeSpecialHours = async function(index) {
    setSettings(function(current) {
      const updated = {
        ...current,
        specialHours: (current.specialHours || []).filter(function(_, itemIndex) {
          return itemIndex !== index;
        })
      };
      // Auto-save to Firestore immediately so public site reflects removal
      setDoc(doc(db, `tenants/${TENANT}/settings/settings`), updated).catch(function() {});
      return updated;
    });
  };

  const removePastSpecialHours = async function() {
    if (!pastSpecialCount) return;
    if (!window.confirm('Remove all past one-off dates? This keeps today and future entries only.')) return;

    setCleaningPast(true);
    setError('');
    try {
      const kept = normalizeSpecialHours((settings.specialHours || []).filter(function(item) {
        return item && item.date && item.date >= todayKey;
      }));

      setSettings(function(current) {
        return { ...current, specialHours: kept };
      });
      await setDoc(doc(db, `tenants/${TENANT}/settings/settings`), { specialHours: kept }, { merge: true });
      setSaved(true);
      setTimeout(function() { setSaved(false); }, 3000);
    } catch (err) {
      setError('Could not remove past one-off dates.');
    } finally {
      setCleaningPast(false);
    }
  };

  const SERVICE_PRICES = [
    { id: 'i-cut-royal', price: 65 }, { id: 'i-cut-deluxe', price: 55 },
    { id: 'full-skinfade-beard-luxury', price: 48 }, { id: 'full-experience', price: 40 },
    { id: 'senior-full-experience', price: 35 }, { id: 'skin-fade', price: 32 },
    { id: 'scissor-cut', price: 30 }, { id: 'classic-sbs', price: 28 },
    { id: 'hot-towel-shave', price: 22 }, { id: 'clipper-cut', price: 22 },
    { id: 'senior-haircut', price: 23 }, { id: 'young-gents', price: 20 },
    { id: 'young-gents-skin-fade', price: 24 }, { id: 'full-facial', price: 24 },
    { id: 'beard-dyeing', price: 24 }, { id: 'face-mask', price: 12 },
    { id: 'face-steam', price: 12 }, { id: 'threading', price: 10 },
    { id: 'waxing', price: 10 }, { id: 'shape-up-clean-up', price: 20 },
    { id: 'wash-hot-towel', price: 10 },
  ];
  const KNOWN_SERVICE_IDS = new Set(SERVICE_PRICES.map(s => s.id));
  function closestServiceId(price) {
    if (price >= 24 && price <= 30) return 'classic-sbs';
    let best = SERVICE_PRICES[0], bestDiff = Math.abs(price - best.price);
    for (const s of SERVICE_PRICES) {
      const d = Math.abs(price - s.price);
      if (d < bestDiff) { best = s; bestDiff = d; }
    }
    return best.id;
  }

  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState('');
  const [importingExpenses, setImportingExpenses] = useState(false);
  const [importExpensesResult, setImportExpensesResult] = useState('');
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState(null);
  const [onlineBkList, setOnlineBkList] = useState(null);
  const [deletingIds, setDeletingIds] = useState(new Set());

  const runServiceMigration = async () => {
    if (!window.confirm('Fix service names on imported bookings? This is a one-time operation.')) return;
    setMigrating(true);
    setMigrateResult('');
    try {
      const snap = await getDocs(collection(db, 'tenants/whitecross/bookings'));
      let updated = 0;
      const batch = writeBatch(db);
      let batchCount = 0;
      for (const d of snap.docs) {
        const data = d.data();
        const sid = data.serviceId || '';
        if (KNOWN_SERVICE_IDS.has(sid)) continue;
        const price = parseFloat(String(data.price || '0').replace('£', '')) || 0;
        if (!price) continue;
        batch.update(d.ref, { serviceId: closestServiceId(price) });
        updated++;
        batchCount++;
        if (batchCount === 499) { await batch.commit(); batchCount = 0; }
      }
      if (batchCount > 0) await batch.commit();
      setMigrateResult(`Done — updated ${updated} booking${updated !== 1 ? 's' : ''}.`);
    } catch (err) {
      setMigrateResult('Error: ' + err.message);
    } finally {
      setMigrating(false);
    }
  };

  const EXCEL_EXPENSES = [
    { date: '2026-02-06', cash: 0,    bank: 90    },
    { date: '2026-02-07', cash: 0,    bank: 28    },
    { date: '2026-02-10', cash: 0,    bank: 5     },
    { date: '2026-02-11', cash: 0,    bank: 15    },
    { date: '2026-02-12', cash: 0,    bank: 20    },
    { date: '2026-02-16', cash: 0,    bank: 2     },
    { date: '2026-02-23', cash: 0,    bank: 65    },
    { date: '2026-02-25', cash: 30,   bank: 0     },
    { date: '2026-02-28', cash: 0,    bank: 20    },
    { date: '2026-03-24', cash: 32,   bank: 28    },
    { date: '2026-03-28', cash: 0.01, bank: 0     },
    { date: '2026-03-31', cash: 28,   bank: 0     },
    { date: '2026-04-02', cash: 0,    bank: 92    },
    { date: '2026-04-05', cash: 0,    bank: 80    },
    { date: '2026-04-09', cash: 0,    bank: 17.5  },
    { date: '2026-04-12', cash: 0,    bank: 40    },
    { date: '2026-04-14', cash: 0,    bank: 41    },
    { date: '2026-04-16', cash: 0,    bank: 85.48 },
    { date: '2026-04-18', cash: 0,    bank: 22.98 },
    { date: '2026-04-19', cash: 30,   bank: 0     },
    { date: '2026-04-22', cash: 0,    bank: 104.77},
    { date: '2026-04-23', cash: 0,    bank: 5.48  },
    { date: '2026-04-25', cash: 0,    bank: 6.65  },
    { date: '2026-04-27', cash: 0,    bank: 30    },
    { date: '2026-04-28', cash: 30,   bank: 0     },
    { date: '2026-05-03', cash: 25,   bank: 15    },
  ];

  const runImportExpenses = async () => {
    if (!window.confirm('Import kasa/banka masrafları from Excel into Firestore? Existing entries for the same dates will be merged (not overwritten).')) return;
    setImportingExpenses(true);
    setImportExpensesResult('');
    try {
      const batch = writeBatch(db);
      for (const entry of EXCEL_EXPENSES) {
        const ref = doc(db, `tenants/whitecross/finance_expenses`, entry.date);
        batch.set(ref, {
          date: entry.date,
          month: entry.date.slice(0, 7),
          cashExpense: entry.cash,
          bankExpense: entry.bank,
        }, { merge: true });
      }
      await batch.commit();
      setImportExpensesResult(`Done — ${EXCEL_EXPENSES.length} expense entries imported.`);
    } catch (err) {
      setImportExpensesResult('Error: ' + err.message);
    } finally {
      setImportingExpenses(false);
    }
  };

  const runRevenueRecon = async () => {
    setDiagRunning(true);
    setDiagResult(null);
    setOnlineBkList(null);
    try {
      const snap = await getDocs(collection(db, 'tenants/whitecross/bookings'));
      const parsePrice = v => parseFloat(String(v || '0').replace(/[£,]/g, '').replace('-', '').trim()) || 0;
      const getDate = b => b.startTime?.toDate?.() ?? (b.startTime?.seconds ? new Date(b.startTime.seconds * 1000) : null);
      const toDK = st => st ? `${st.getFullYear()}-${String(st.getMonth()+1).padStart(2,'0')}-${String(st.getDate()).padStart(2,'0')}` : null;

      const aprilBk = snap.docs.map(d => {
        const data = d.data();
        const st = getDate(data);
        const raw = String(data.status || '').trim().toUpperCase().replace(/[-\s]+/g, '_');
        const paid = parsePrice(data.paidAmount); const price = parsePrice(data.price);
        return { docId: d.id, ...data, _st: st, _dk: toDK(st), _status: raw, _rev: paid > 0 ? paid : price, _src: String(data.source || 'manual').toLowerCase() };
      }).filter(b => b._status === 'CHECKED_OUT' && b._st && b._st.getFullYear() === 2026 && b._st.getMonth() === 3);

      // Historical key set for duplicate detection
      const historicalKeys = new Set();
      aprilBk.filter(b => b._src === 'historical').forEach(b => {
        historicalKeys.add(`${String(b.barberName||b.barberId||'').toLowerCase()}|${b._dk}|${b._rev}`);
      });

      let total = 0;
      const bySource = {};
      aprilBk.forEach(b => {
        total += b._rev;
        bySource[b._src] = (bySource[b._src] || 0) + b._rev;
      });

      // Online bookings (non-historical), each flagged if it matches a historical entry
      const onlineSources = ['fresha','booksy','website'];
      const onlineBk = aprilBk
        .filter(b => onlineSources.includes(b._src))
        .map(b => {
          const dupKey = `${String(b.barberName||b.barberId||'').toLowerCase()}|${b._dk}|${b._rev}`;
          return { ...b, isDuplicate: historicalKeys.has(dupKey) };
        })
        .sort((a, b) => (a._dk > b._dk ? 1 : -1));

      setDiagResult({ total: total.toFixed(2), bySource, count: aprilBk.length });
      setOnlineBkList(onlineBk);
    } catch (err) {
      setDiagResult({ error: err.message });
    } finally {
      setDiagRunning(false);
    }
  };

  const deleteOnlineBooking = async (docId) => {
    if (!window.confirm('Delete this booking from Firestore?')) return;
    setDeletingIds(prev => new Set([...prev, docId]));
    try {
      await deleteDoc(doc(db, 'tenants/whitecross/bookings', docId));
      setOnlineBkList(prev => prev.filter(b => b.docId !== docId));
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setDeletingIds(prev => { const n = new Set(prev); n.delete(docId); return n; });
    }
  };

  const runSetBarberOrder = async () => {
    const ORDER = { alex: 1, arda: 2, manoj: 3, kadim: 4 };
    try {
      const snap = await getDocs(collection(db, 'tenants/whitecross/barbers'));
      const batch = writeBatch(db);
      let updated = 0;
      snap.docs.forEach(d => {
        const name = String(d.data().name || '').trim().toLowerCase();
        if (ORDER[name] !== undefined) {
          batch.update(d.ref, { order: ORDER[name] });
          updated++;
        }
      });
      if (updated > 0) await batch.commit();
      alert(`Done — updated order for ${updated} barber(s). Alex=1, Arda=2, Manoj=3, Kadim=4.`);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleSave = async function() {
    setSaving(true);
    setError('');
    try {
      const specialHours = normalizeSpecialHours(settings.specialHours);
      const seen = new Set();
      for (let i = 0; i < specialHours.length; i++) {
        const row = specialHours[i];
        if (seen.has(row.date)) {
          setError('Special Hours cannot contain duplicate dates.');
          setSaving(false);
          return;
        }
        seen.add(row.date);
        if (!row.closed) {
          const openMins = toMinutes(row.open);
          const closeMins = toMinutes(row.close);
          if (!Number.isFinite(openMins) || !Number.isFinite(closeMins) || closeMins <= openMins) {
            setError('In Special Hours, closing time must be later than opening time.');
            setSaving(false);
            return;
          }
        }
      }

      const payload = {
        ...settings,
        specialHours,
      };
      await setDoc(doc(db, `tenants/${TENANT}/settings/settings`), payload);
      // Propagate all hours to every barber
      if (payload.hours) {
        await Promise.all(
          Object.entries(payload.hours).map(([day, hours]) => updateAllBarbersDay(day, hours))
        );
      }
      setSettings(function(current) {
        return { ...current, specialHours: normalizeSpecialHours(current.specialHours) };
      });
      setSaved(true);
      setTimeout(function() { setSaved(false); }, 3000);
    } catch (err) {
      setError('Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const updateShop = function(key, value) {
    setSettings(Object.assign({}, settings, { [key]: value }));
  };

  const updatePlatform = function(platform, key, value) {
    setSettings(s => ({
      ...s,
      platforms: { ...s.platforms, [platform]: { ...s.platforms[platform], [key]: value } }
    }));
  };


  if (loading) {
    return <div style={{ textAlign: 'center', padding: '60px', color: 'var(--muted)' }}>⏳ Loading settings...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '680px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', color: '#c0c0c0', marginBottom: '4px' }}>Settings</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Shop info, opening hours & platform settings</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '12px 28px', background: saving ? 'rgba(180,180,180,0.4)' : 'linear-gradient(135deg, #c0c0c0, #666666)', border: 'none', borderRadius: '8px', color: '#000', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '0.85rem', letterSpacing: '1px' }}>
          {saving ? 'Saving...' : '💾 Save Changes'}
        </button>
      </div>

      {saved && (
        <div style={{ padding: '12px 16px', background: 'rgba(76,175,80,0.15)', border: '1px solid rgba(76,175,80,0.3)', borderRadius: '8px', color: '#4caf50', fontSize: '0.85rem' }}>
          ✅ Settings saved successfully
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(255,82,82,0.15)', border: '1px solid rgba(255,82,82,0.3)', borderRadius: '8px', color: '#ff5252', fontSize: '0.85rem' }}>
          {error}
          <button onClick={() => setError('')} style={{ marginLeft: '12px', background: 'transparent', border: 'none', color: '#ff5252', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
        </div>
      )}

      {/* Google Reminder */}
      {googleReminder && (
        <div style={{ padding: '14px 16px', background: 'rgba(66,133,244,0.12)', border: '1px solid rgba(66,133,244,0.4)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.85rem', color: '#4285f4', fontWeight: '700', marginBottom: '4px' }}>📍 Don't forget Google Business!</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Update your opening hours on Google Business Profile to match.</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            <a href="https://business.google.com" target="_blank" rel="noreferrer"
              style={{ padding: '7px 14px', background: '#4285f4', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '0.72rem', fontWeight: '700', textDecoration: 'none', cursor: 'pointer' }}>
              Open Google
            </a>
            <button onClick={() => setGoogleReminder(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
          </div>
        </div>
      )}

      {/* Theme */}
      <div style={cardStyle}>
        <h2 style={sectionTitle}>Appearance</h2>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:'0.88rem', color:'var(--text)', fontWeight:'600', marginBottom:'4px' }}>
              {theme === 'light' ? '☀️ Light Mode' : '🌙 Dark Mode'}
            </div>
            <div style={{ fontSize:'0.72rem', color:'var(--muted)' }}>Switch between dark and light interface</div>
          </div>
          <div onClick={() => onToggleTheme()}
            style={{ width:'52px', height:'28px', borderRadius:'14px', cursor:'pointer', background: theme === 'light' ? '#c0c0c0' : 'var(--muted)', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
            <div style={{ position:'absolute', top:'4px', left: theme === 'light' ? '27px' : '4px', width:'20px', height:'20px', borderRadius:'50%', background:'#fff', transition:'left 0.2s' }} />
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div style={cardStyle}>
        <h2 style={sectionTitle}>Notifications</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text)', fontWeight: '600', marginBottom: '4px' }}>
              Send Confirmation Email to Clients
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              {settings.emailConfirmationEnabled !== false
                ? 'Clients receive an email when a booking is created'
                : 'Email confirmations are currently disabled'}
            </div>
          </div>
          <div
            onClick={() => setSettings(s => ({ ...s, emailConfirmationEnabled: s.emailConfirmationEnabled === false ? true : false }))}
            style={{ width: '52px', height: '28px', borderRadius: '14px', cursor: 'pointer', background: settings.emailConfirmationEnabled !== false ? '#4caf50' : 'var(--muted)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: '4px', left: settings.emailConfirmationEnabled !== false ? '27px' : '4px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </div>
        </div>
      </div>

      {/* Products */}
      <div style={cardStyle}>
        <h2 style={sectionTitle}>🛒 Products</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text)', fontWeight: '600', marginBottom: '4px' }}>
              {(settings.products && settings.products.enabled) ? 'Products Enabled — Visible on Website' : 'Products Disabled — Hidden from Website'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              {(settings.products && settings.products.enabled)
                ? 'Products page is live. Navigation link appears on the website.'
                : 'Products page is hidden. Toggle on when ready to launch your shop.'}
            </div>
          </div>
          <div
            onClick={() => setSettings(s => ({ ...s, products: { ...(s.products || {}), enabled: !(s.products && s.products.enabled) } }))}
            style={{ width: '52px', height: '28px', borderRadius: '14px', cursor: 'pointer', background: (settings.products && settings.products.enabled) ? '#4caf50' : 'var(--muted)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: '4px', left: (settings.products && settings.products.enabled) ? '27px' : '4px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </div>
        </div>
        <div style={{ marginTop: '14px', padding: '12px 14px', background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '8px', fontSize: '0.72rem', color: 'var(--muted)', lineHeight: '1.6' }}>
          <strong style={{ color: 'var(--text)' }}>How it works:</strong> When enabled, a "Shop" link appears in the website navigation and <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: '4px' }}>products.html</code> becomes publicly accessible. When disabled, the page shows "Coming Soon" and no nav link is shown.
        </div>
      </div>

      {/* Shop Info */}
      <div style={cardStyle}>
        <h2 style={sectionTitle}>Shop Information</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Shop Name</label>
            <input value={settings.shopName || ''} onChange={e => updateShop('shopName', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Address</label>
            <input value={settings.shopAddress || ''} onChange={e => updateShop('shopAddress', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input value={settings.shopPhone || ''} onChange={e => updateShop('shopPhone', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input value={settings.shopEmail || ''} onChange={e => updateShop('shopEmail', e.target.value)} style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Opening Hours */}
      <div style={cardStyle}>
        <h2 style={sectionTitle}>Opening Hours</h2>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '20px' }}>
          Changes apply to all barbers immediately. Closing a day will check for existing bookings first.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {DAYS.map(function(day) {
            const dayHours = (settings.hours && settings.hours[day]) || { open: '09:00', close: '19:00', closed: false };
            const isToday = new Date().toLocaleDateString('en-GB', { weekday: 'long' }) === day;
            return (
              <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '10px', background: dayHours.closed ? 'rgba(255,82,82,0.05)' : 'rgba(180,180,180,0.04)', border: '1px solid ' + (isToday ? 'rgba(180,180,180,0.3)' : 'rgba(180,180,180,0.1)'), flexWrap: 'wrap' }}>
                <div style={{ width: '100px', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: isToday ? '700' : '500', color: isToday ? '#c0c0c0' : 'var(--text)' }}>
                    {isToday ? '▶ ' : ''}{day}
                  </span>
                </div>
                <div onClick={() => handleToggleClosed(day, dayHours.closed)}
                  style={{ width: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer', background: dayHours.closed ? '#ff5252' : '#4caf50', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: '3px', left: dayHours.closed ? '3px' : '23px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: dayHours.closed ? '#ff5252' : '#4caf50', width: '40px', flexShrink: 0 }}>
                  {dayHours.closed ? 'Closed' : 'Open'}
                </span>
                {!dayHours.closed ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                    <input type="time" value={dayHours.open || '09:00'}
                      onChange={e => handleTimeChange(day, 'open', e.target.value)}
                      style={timeInputStyle} />
                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>—</span>
                    <input type="time" value={dayHours.close || '19:00'}
                      onChange={e => handleTimeChange(day, 'close', e.target.value)}
                      style={timeInputStyle} />
                  </div>
                ) : (
                  <div style={{ flex: 1, fontSize: '0.78rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                    Not available for bookings
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '18px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ ...sectionTitle, marginBottom: '6px', paddingBottom: 0, borderBottom: 'none' }}>Special Hours</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0 }}>
              Use this for bank holidays or one-off dates. It applies only to that date, then the normal weekly hours return automatically.
            </p>
            {pastSpecialCount > 0 && (
              <p style={{ fontSize: '0.74rem', color: '#ffb74d', margin: '8px 0 0 0' }}>
                {pastSpecialCount} past override{pastSpecialCount !== 1 ? 's' : ''} can be cleaned up.
              </p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {pastSpecialCount > 0 && (
              <button onClick={removePastSpecialHours} disabled={cleaningPast}
                style={{ padding: '10px 14px', background: 'transparent', border: '1px solid rgba(255,183,77,0.45)', borderRadius: '8px', color: '#ffb74d', cursor: cleaningPast ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '0.74rem' }}>
                {cleaningPast ? 'Cleaning...' : 'Remove Past Overrides'}
              </button>
            )}
            <button onClick={addSpecialHours}
              style={{ padding: '10px 16px', background: 'linear-gradient(135deg, #c0c0c0, #666666)', border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer', fontWeight: '700', fontSize: '0.78rem', letterSpacing: '0.8px' }}>
              + Add One-Off Date
            </button>
          </div>
        </div>

        {(settings.specialHours || []).length === 0 ? (
          <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(180,180,180,0.04)', border: '1px solid rgba(180,180,180,0.1)', color: 'var(--muted)', fontSize: '0.8rem' }}>
            No one-off dates added. Example: tomorrow open at 10:00 without changing the normal weekday hours.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(settings.specialHours || []).map(function(item, index) {
              const isPast = item && item.date && item.date < todayKey;
              return (
                <div key={item.date + '-' + index} style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(180,180,180,0.04)', border: '1px solid rgba(180,180,180,0.1)', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr 0.9fr auto auto', gap: '10px', alignItems: 'center' }}>
                  <div>
                    <label style={labelStyle}>Date</label>
                    <input type="date" value={item.date} onChange={function(e) { updateSpecialHours(index, 'date', e.target.value); }} style={inputStyle} />
                    {isPast && (
                      <div style={{ marginTop: '6px', fontSize: '0.68rem', color: '#ffb74d', fontWeight: '600' }}>
                        Past date
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>Open</label>
                    <input type="time" value={item.open || '09:00'} disabled={item.closed} onChange={function(e) { updateSpecialHours(index, 'open', e.target.value); }} style={timeInputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Close</label>
                    <input type="time" value={item.close || '19:00'} disabled={item.closed} onChange={function(e) { updateSpecialHours(index, 'close', e.target.value); }} style={timeInputStyle} />
                  </div>
                  <div style={{ paddingTop: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input id={'special-hours-closed-' + index} type="checkbox" checked={!!item.closed} onChange={function(e) { updateSpecialHours(index, 'closed', e.target.checked); }} />
                    <label htmlFor={'special-hours-closed-' + index} style={{ fontSize: '0.78rem', color: 'var(--text)' }}>Closed</label>
                  </div>
                  <button onClick={function() { removeSpecialHours(index); }} style={{ marginTop: '20px', padding: '9px 12px', background: 'transparent', border: '1px solid rgba(255,82,82,0.35)', borderRadius: '8px', color: '#ff5252', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600' }}>
                    Remove
                  </button>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Note</label>
                    <input value={item.note || ''} onChange={function(e) { updateSpecialHours(index, 'note', e.target.value); }} placeholder="Bank Holiday, Eid, private event..." style={inputStyle} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Platform Settings */}
      <div style={cardStyle}>
        <h2 style={sectionTitle}>Platform Settings</h2>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '20px' }}>
          Configure deposit settings for each booking platform.
        </p>
        {/* Booksy */}
        <div style={{ marginBottom: '20px', padding: '16px', background: 'rgba(156,39,176,0.06)', border: '1px solid rgba(156,39,176,0.2)', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#9c27b0' }} />
            <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#9c27b0', letterSpacing: '1px' }}>BOOKSY</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div onClick={() => updatePlatform('booksy', 'depositEnabled', !settings.platforms.booksy.depositEnabled)}
                style={{ width: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer', background: settings.platforms.booksy.depositEnabled ? '#9c27b0' : 'var(--muted)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: '3px', left: settings.platforms.booksy.depositEnabled ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text)' }}>Deposit active</span>
            </div>
            {settings.platforms.booksy.depositEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Amount £</span>
                <input type="number" min="0" value={settings.platforms.booksy.depositAmount}
                  onChange={e => updatePlatform('booksy', 'depositAmount', parseFloat(e.target.value) || 0)}
                  style={{ ...inputStyle, width: '80px', padding: '8px 10px' }} />
              </div>
            )}
          </div>
        </div>
        {/* Fresha */}
        <div style={{ padding: '16px', background: 'rgba(33,150,243,0.06)', border: '1px solid rgba(33,150,243,0.2)', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2196f3' }} />
            <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#2196f3', letterSpacing: '1px' }}>FRESHA</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div onClick={() => updatePlatform('fresha', 'depositEnabled', !settings.platforms.fresha.depositEnabled)}
                style={{ width: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer', background: settings.platforms.fresha.depositEnabled ? '#2196f3' : 'var(--muted)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: '3px', left: settings.platforms.fresha.depositEnabled ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text)' }}>Deposit active</span>
            </div>
            {settings.platforms.fresha.depositEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Amount £</span>
                <input type="number" min="0" value={settings.platforms.fresha.depositAmount}
                  onChange={e => updatePlatform('fresha', 'depositAmount', parseFloat(e.target.value) || 0)}
                  style={{ ...inputStyle, width: '80px', padding: '8px 10px' }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* One-time migrations */}
      <div style={{ ...cardStyle, borderColor: 'rgba(212,175,55,0.2)' }}>
        <h2 style={sectionTitle}>Maintenance</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={runServiceMigration} disabled={migrating}
            style={{ padding: '10px 20px', background: migrating ? 'rgba(212,175,55,0.05)' : 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: '8px', color: '#d4af37', cursor: migrating ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: '600' }}>
            {migrating ? 'Running…' : 'Fix Service Names on Imported Bookings'}
          </button>
          {migrateResult && <span style={{ fontSize: '0.82rem', color: migrateResult.startsWith('Error') ? '#ff5252' : '#4caf50' }}>{migrateResult}</span>}
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '10px' }}>Assigns correct service IDs to bookings imported from XLS where the service name was missing. Price 24–30 → Classic Short Back & Sides, others → closest price match. Safe to run multiple times.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '16px' }}>
          <button onClick={runImportExpenses} disabled={importingExpenses}
            style={{ padding: '10px 20px', background: importingExpenses ? 'rgba(212,175,55,0.05)' : 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: '8px', color: '#d4af37', cursor: importingExpenses ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: '600' }}>
            {importingExpenses ? 'Importing…' : 'Import Kasa/Banka Masrafları'}
          </button>
          {importExpensesResult && <span style={{ fontSize: '0.82rem', color: importExpensesResult.startsWith('Error') ? '#ff5252' : '#4caf50' }}>{importExpensesResult}</span>}
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '8px' }}>Imports kasa/banka masrafları from MUHASEBE Excel (Şubat–Mayıs 2026) into Firestore. Uses merge so existing entries are not overwritten. Run once to fix Finance P&L.</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
          <button onClick={runRevenueRecon} disabled={diagRunning}
            style={{ padding: '10px 20px', background: diagRunning ? 'rgba(33,150,243,0.05)' : 'rgba(33,150,243,0.1)', border: '1px solid rgba(33,150,243,0.4)', borderRadius: '8px', color: '#2196f3', cursor: diagRunning ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: '600' }}>
            {diagRunning ? 'Running…' : 'Show April Online Bookings (Fresha/Booksy/Website)'}
          </button>
          <button onClick={runSetBarberOrder}
            style={{ padding: '10px 20px', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: '8px', color: '#d4af37', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '600' }}>
            Set Barber Order (Alex=1, Arda=2, Manoj=3, Kadim=4)
          </button>
        </div>
        {diagResult?.error && <div style={{ fontSize: '0.82rem', color: '#ff5252', marginTop: '8px' }}>Error: {diagResult.error}</div>}
        {diagResult && !diagResult.error && (
          <div style={{ marginTop: '10px', fontSize: '0.78rem', color: 'var(--muted)' }}>
            April totals — historical: £{(diagResult.bySource.historical||0).toFixed(2)} · fresha: £{(diagResult.bySource.fresha||0).toFixed(2)} · booksy: £{(diagResult.bySource.booksy||0).toFixed(2)} · website: £{(diagResult.bySource.website||0).toFixed(2)}
          </div>
        )}
        {onlineBkList && (
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '400px', overflowY: 'auto' }}>
            {onlineBkList.length === 0 && <div style={{ fontSize: '0.82rem', color: '#4caf50' }}>No fresha/booksy/website bookings found for April.</div>}
            {onlineBkList.map(b => (
              <div key={b.docId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: b.isDuplicate ? 'rgba(255,152,0,0.08)' : 'rgba(255,255,255,0.03)', border: '1px solid ' + (b.isDuplicate ? 'rgba(255,152,0,0.3)' : 'rgba(255,255,255,0.08)'), borderRadius: '8px', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--muted)', width: '80px', flexShrink: 0 }}>{b._dk}</span>
                <span style={{ fontWeight: '700', color: 'var(--text)', width: '48px', flexShrink: 0, textTransform: 'capitalize' }}>{String(b.barberName||b.barberId||'?').split(' ')[0]}</span>
                <span style={{ color: 'var(--text)', flex: 1 }}>{b.clientName || b.name || 'Walk-in'}</span>
                <span style={{ color: '#4caf50', width: '44px', textAlign: 'right', flexShrink: 0 }}>£{b._rev}</span>
                <span style={{ padding: '2px 7px', borderRadius: '5px', background: 'rgba(255,255,255,0.06)', color: 'var(--muted)', width: '60px', textAlign: 'center', flexShrink: 0 }}>{b._src}</span>
                {b.isDuplicate && <span style={{ color: '#ff9800', fontSize: '0.7rem', flexShrink: 0 }}>DUPLICATE</span>}
                <button onClick={() => deleteOnlineBooking(b.docId)} disabled={deletingIds.has(b.docId)}
                  style={{ padding: '4px 10px', background: 'rgba(255,82,82,0.12)', border: '1px solid rgba(255,82,82,0.3)', borderRadius: '6px', color: '#ff5252', cursor: deletingIds.has(b.docId) ? 'not-allowed' : 'pointer', fontSize: '0.72rem', flexShrink: 0 }}>
                  {deletingIds.has(b.docId) ? '…' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div style={{ ...cardStyle, borderColor: 'rgba(255,82,82,0.2)' }}>
        <h2 style={{ ...sectionTitle, color: '#ff5252' }}>Danger Zone</h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '16px' }}>These actions cannot be undone.</p>
        <button style={{ padding: '10px 20px', background: 'transparent', border: '1px solid rgba(255,82,82,0.4)', borderRadius: '8px', color: '#ff5252', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '600' }}>
          🗑️ Clear All Pending Bookings
        </button>
      </div>

    </div>
  );
}

const cardStyle = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' };
const sectionTitle = { fontSize: '0.95rem', fontWeight: '700', color: 'var(--text)', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' };
const labelStyle = { display: 'block', fontSize: '0.68rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' };
const inputStyle = { width: '100%', padding: '11px 14px', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.88rem', outline: 'none' };
const timeInputStyle = { padding: '8px 12px', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '0.85rem', outline: 'none' };