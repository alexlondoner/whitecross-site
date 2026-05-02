import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, Timestamp, orderBy,
} from 'firebase/firestore';

const TENANT = 'whitecross';

function parsePrice(val) {
  return parseFloat(String(val || '0').replace(/[£,]/g, '').replace('-', '').trim()) || 0;
}

function effectiveRevenue(b) {
  if (b.status === 'CHECKED_OUT') {
    const paid = parsePrice(b.paidAmount);
    if (paid > 0) return paid;
  }
  const p = parsePrice(b.price);
  if (p > 0) return p;
  return parsePrice(b.paidAmount);
}

function isCash(b) {
  const m = (b.paymentMethod || '').toLowerCase();
  if (m === 'cash') return true;
  if (m && m !== '') return false;
  return (b.paymentType || '').toUpperCase() === 'CASH';
}

function isWalkInBooking(b) {
  const source = String(b.source || '').trim().toLowerCase();
  if (source === 'walk_in' || source === 'walk-in' || source === 'walkin' || source === 'historical') return true;
  if (source === '' && String(b.clientName || '').trim().toLowerCase() === 'walk-in') return true;
  return false;
}

function normalizeName(v) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function paymentToDate(v) {
  if (!v) return null;
  if (typeof v?.toDate === 'function') {
    const d = v.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (v?.seconds && Number.isFinite(v.seconds)) {
    const d = new Date(v.seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    const d1 = new Date(s);
    if (!Number.isNaN(d1.getTime())) return d1;
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (m) {
      const d2 = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
      return Number.isNaN(d2.getTime()) ? null : d2;
    }
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthKey(d) {
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function startOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeek(d) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

function toInputDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resolveCanonicalBarberName(rawName, canonicalByName) {
  const n = normalizeName(rawName);
  if (!n) return '';
  if (canonicalByName[n]) return canonicalByName[n];
  if (n.includes('alex') && canonicalByName.alex) return canonicalByName.alex;
  if (n.includes('arda') && canonicalByName.arda) return canonicalByName.arda;
  if (n.includes('kadim') && canonicalByName.kadim) return canonicalByName.kadim;
  if (n.includes('manoj') && canonicalByName.manoj) return canonicalByName.manoj;
  return rawName;
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function fmt(n) {
  if (!n) return '–';
  return '£' + parseFloat(n).toFixed(0);
}

const inp = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,175,55,0.25)',
  borderRadius: '8px', color: 'var(--text)', padding: '9px 12px', fontSize: '0.82rem',
  width: '100%', boxSizing: 'border-box', outline: 'none',
};
const lbl = { fontSize: '0.65rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: '600', marginBottom: '5px', display: 'block' };

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DEFAULT_FINANCE_BARBERS = [
  { name: 'Alex',  color: '#4caf50', order: 1 },
  { name: 'Arda',  color: '#2196f3', order: 2 },
  { name: 'Kadim', color: '#ff9800', order: 3 },
  { name: 'Manoj', color: '#e91e63', order: 4 },
];

export default function Finance() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState('daily');
  const [showEmptyDays, setShowEmptyDays] = useState(false);
  const [monthMode, setMonthMode] = useState('selected');
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );
  const [bookings, setBookings] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [expenses, setExpenses] = useState({});
  const [payments, setPayments] = useState([]);
  const [initialInvestments, setInitialInvestments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summaryView, setSummaryView] = useState('live');
  const [dailyRangeMode, setDailyRangeMode] = useState('month');
  const [selectedDay, setSelectedDay] = useState(() => new Date());

  const [wageRates, setWageRates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('financeWageRates') || '{}'); } catch { return {}; }
  });
  const [fixedDailyRate, setFixedDailyRate] = useState(() =>
    parseFloat(localStorage.getItem('financeFixedRate') || '100')
  );
  const [showSettings, setShowSettings] = useState(false);

  const [payForm, setPayForm] = useState({ date: '', barberName: '', amount: '', method: 'Cash', notes: '' });
  const [payLoading, setPayLoading] = useState(false);
  const [paymentMonthMode, setPaymentMonthMode] = useState('all');
  const [paymentBarberFilter, setPaymentBarberFilter] = useState('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');

  const [investmentForm, setInvestmentForm] = useState({ date: '', amount: '', method: 'Cash', notes: '' });
  const [investmentSaving, setInvestmentSaving] = useState(false);

  const [editingExpense, setEditingExpense] = useState(null);
  const [expenseDraft, setExpenseDraft] = useState({ cashExpense: '', bankExpense: '', notes: '' });
  const [expenseSaving, setExpenseSaving] = useState(false);

  const [year, month] = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    return [y, m - 1];
  }, [selectedMonth]);

  useEffect(() => {
    if (monthMode !== 'selected') return;
    const first = new Date(year, month, 1, 12, 0, 0);
    const last  = new Date(year, month + 1, 0, 12, 0, 0);
    if (selectedDay < first || selectedDay > last) setSelectedDay(first);
  }, [year, month, selectedDay, monthMode]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [bookSnap, barberSnap, expSnap, paySnap, invSnap, advSnap, legacyExpSnap] = await Promise.all([
        getDocs(collection(db, `tenants/${TENANT}/bookings`)),
        getDocs(collection(db, `tenants/${TENANT}/barbers`)),
        getDocs(collection(db, `tenants/${TENANT}/finance_expenses`)),
        getDocs(query(collection(db, `tenants/${TENANT}/finance_payments`), orderBy('date', 'desc'))),
        getDocs(collection(db, `tenants/${TENANT}/finance_initial_investments`)),
        getDocs(collection(db, `tenants/${TENANT}/advances`)),
        getDocs(collection(db, `tenants/${TENANT}/expenses`)),
      ]);

      // Barbers
      const fetchedBarbersRaw = barberSnap.docs
        .map(d => ({ docId: d.id, ...d.data() }))
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

      const existingByName = new Set(fetchedBarbersRaw.map(b => normalizeName(b.name)));
      const missingDefaults = DEFAULT_FINANCE_BARBERS
        .filter(b => !existingByName.has(normalizeName(b.name)))
        .map(b => ({ ...b, active: false, id: b.name.toLowerCase(), docId: `default-${b.name.toLowerCase()}` }));

      const fetchedBarbers = [...fetchedBarbersRaw, ...missingDefaults]
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      setBarbers(fetchedBarbers);

      const canonicalByName = fetchedBarbers.reduce((acc, b) => {
        if (!b?.name) return acc;
        acc[normalizeName(b.name)] = b.name;
        return acc;
      }, {});

      const barberNameById = fetchedBarbers.reduce((acc, b) => {
        if (!b.name) return acc;
        [b.docId, b.id].filter(Boolean).forEach(k => { acc[String(k).toLowerCase()] = b.name; });
        return acc;
      }, {});

      // Bookings
      const fetchedBookings = bookSnap.docs.map(d => {
        const data = d.data();
        const rawBarber = String(data.barberId || '').trim();
        const rawResolvedName = data.barberName || barberNameById[rawBarber.toLowerCase()] || rawBarber;
        const barber = resolveCanonicalBarberName(rawResolvedName, canonicalByName);
        const startTime = data.startTime?.toDate();
        return { ...data, barber, startTime, dateKey: startTime ? toDateKey(startTime) : null };
      }).filter(b => b.status !== 'CANCELLED' && b.dateKey);
      setBookings(fetchedBookings);

      // Expenses — merge legacy `expenses` collection with new `finance_expenses`
      const expMap = {};

      // 1) Seed from legacy imported expenses (CASH = cashExpense, BANK = bankExpense)
      legacyExpSnap.docs.forEach(d => {
        const data = d.data();
        const dt = paymentToDate(data.date);
        if (!dt) return;
        const dateKey = toDateKey(dt);
        if (!expMap[dateKey]) expMap[dateKey] = { cashExpense: 0, bankExpense: 0, notes: '' };
        const amt = parseFloat(data.amount || 0);
        const type = String(data.type || '').toUpperCase();
        if (type === 'CASH' || type === 'KASA') expMap[dateKey].cashExpense += amt;
        else expMap[dateKey].bankExpense += amt;
        if (data.note && !expMap[dateKey].notes) expMap[dateKey].notes = data.note;
      });

      // 2) Overlay with manually-entered finance_expenses (these take precedence)
      expSnap.docs.forEach(d => {
        const data = d.data();
        // Support both old field names (kasaMasraf/bankaMasraf) and new (cashExpense/bankExpense)
        expMap[data.date] = {
          id: d.id,
          cashExpense:  parseFloat(data.cashExpense  ?? data.kasaMasraf  ?? 0),
          bankExpense:  parseFloat(data.bankExpense   ?? data.bankaMasraf ?? 0),
          notes:        data.notes || data.aciklama || '',
          ...data,
        };
      });
      setExpenses(expMap);

      // Payments (finance_payments + legacy advances)
      const fetchedPayments = paySnap.docs.map(d => ({ id: d.id, sourceType: 'finance_payments', ...d.data() }));
      const fetchedLegacyAdvances = advSnap.docs.map(d => {
        const data = d.data() || {};
        return {
          id: d.id,
          sourceType: 'advances',
          date: data.date || null,
          barberName: data.barberName || data.barber || '',
          amount: parseFloat(data.amount || 0) || 0,
          method: data.method || data.paymentMethod || 'Other',
          notes: data.notes || data.note || '',
        };
      });
      const mergedPayments = [...fetchedPayments, ...fetchedLegacyAdvances].sort((a, b) => {
        const ad = paymentToDate(a.date);
        const bd = paymentToDate(b.date);
        return (bd?.getTime() || 0) - (ad?.getTime() || 0);
      });
      setPayments(mergedPayments);

      // Initial investments
      const fetchedInvestments = invSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ad = paymentToDate(a.date);
          const bd = paymentToDate(b.date);
          return (bd?.getTime() || 0) - (ad?.getTime() || 0);
        });
      setInitialInvestments(fetchedInvestments);

    } catch (err) {
      console.error('Finance fetchAll error:', err);
    }
    setLoading(false);
  }, [selectedMonth]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Daily rows
  const dailyData = useMemo(() => {
    const inScope = (dateKey) => monthMode === 'all' || String(dateKey || '').startsWith(selectedMonth);
    const scopedBookings = bookings.filter(b => isWalkInBooking(b) && b.dateKey && inScope(b.dateKey));
    const scopedExpenseKeys = Object.keys(expenses).filter(inScope);

    const dateKeys = monthMode === 'selected'
      ? Array.from({ length: daysInMonth(year, month) }, (_, i) =>
          `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)
      : Array.from(new Set([...scopedBookings.map(b => b.dateKey), ...scopedExpenseKeys])).sort();

    return dateKeys.map((dateKey) => {
      const parts = String(dateKey).split('-').map(Number);
      const day = parts[2] || 1;
      const rowDate = new Date((parts[0] || year), (parts[1] || (month + 1)) - 1, day);
      const dayBookings = scopedBookings.filter(b => b.dateKey === dateKey);
      const exp = expenses[dateKey] || {};
      const cashExpense = parseFloat(exp.cashExpense ?? exp.kasaMasraf ?? 0);
      const bankExpense = parseFloat(exp.bankExpense ?? exp.bankaMasraf ?? 0);
      const expenseNotes = String(exp.notes || exp.aciklama || '').trim();

      const barberRevenue = {};
      barbers.forEach(b => { barberRevenue[b.name] = { cash: 0, card: 0 }; });

      dayBookings.forEach(b => {
        const name = b.barber;
        if (!barberRevenue[name]) barberRevenue[name] = { cash: 0, card: 0 };
        const rev = effectiveRevenue(b);
        if (isCash(b)) barberRevenue[name].cash += rev;
        else barberRevenue[name].card += rev;
      });

      const grossRevenue = Object.values(barberRevenue).reduce((s, v) => s + v.cash + v.card, 0);
      const netRevenue   = grossRevenue - cashExpense - bankExpense;

      const activeBarbersToday = Object.entries(barberRevenue)
        .filter(([, v]) => v.cash + v.card > 0)
        .map(([name]) => name);
      const totalWages = activeBarbersToday.reduce((s, name) => s + parseFloat(wageRates[name] ?? 100), 0);
      const fixedCost  = activeBarbersToday.length > 0 ? fixedDailyRate : 0;
      const netPL      = netRevenue - totalWages - fixedCost;

      const dayOfWeek = rowDate.toLocaleDateString('en-GB', { weekday: 'short' });

      return {
        day, dateKey, dayOfWeek, barberRevenue,
        cashExpense, bankExpense, expenseNotes,
        grossRevenue, netRevenue, totalWages, fixedCost, netPL,
        hasData: grossRevenue > 0 || cashExpense > 0 || bankExpense > 0 || !!expenseNotes,
        exp,
      };
    });
  }, [bookings, barbers, expenses, wageRates, fixedDailyRate, year, month, selectedMonth, monthMode]);

  const monthlySummary = useMemo(() => {
    return barbers.map(b => {
      const bBookings   = bookings.filter(bb => bb.barber === b.name);
      const workedDays  = new Set(bBookings.map(bb => bb.dateKey)).size;
      const totalRev    = bBookings.reduce((s, bb) => s + effectiveRevenue(bb), 0);
      const wages       = workedDays * parseFloat(wageRates[b.name] ?? 100);
      const monthPayments = payments.filter(p => {
        const d   = paymentToDate(p.date);
        return monthKey(d) === selectedMonth && normalizeName(p.barberName) === normalizeName(b.name);
      });
      const totalAdvances = monthPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
      const balance = wages - totalAdvances;
      return { name: b.name, color: b.color, workedDays, totalRev, wages, totalAdvances, balance };
    });
  }, [bookings, barbers, payments, wageRates, selectedMonth]);

  const monthlySummaryTotals = useMemo(() =>
    monthlySummary.reduce((acc, r) => ({
      workedDays:    acc.workedDays    + r.workedDays,
      totalRev:      acc.totalRev      + r.totalRev,
      wages:         acc.wages         + r.wages,
      totalAdvances: acc.totalAdvances + r.totalAdvances,
      balance:       acc.balance       + r.balance,
    }), { workedDays: 0, totalRev: 0, wages: 0, totalAdvances: 0, balance: 0 }),
  [monthlySummary]);

  const paymentRows = useMemo(() => {
    return payments
      .map(p => ({ ...p, __date: paymentToDate(p.date) }))
      .filter(p => p.__date)
      .filter(p => paymentMonthMode === 'all' ? true : monthKey(p.__date) === selectedMonth)
      .filter(p => paymentBarberFilter === 'all' ? true : normalizeName(p.barberName) === normalizeName(paymentBarberFilter))
      .filter(p => paymentMethodFilter === 'all' ? true : normalizeName(p.method) === normalizeName(paymentMethodFilter))
      .sort((a, b) => b.__date.getTime() - a.__date.getTime());
  }, [payments, selectedMonth, paymentMonthMode, paymentBarberFilter, paymentMethodFilter]);

  const selectedMonthInvestments = useMemo(() =>
    initialInvestments.filter(inv => monthKey(paymentToDate(inv.date)) === selectedMonth),
  [initialInvestments, selectedMonth]);

  const initialInvestmentTotal = useMemo(() =>
    selectedMonthInvestments.reduce((s, inv) => s + parseFloat(inv.amount || 0), 0),
  [selectedMonthInvestments]);

  const monthlyTotals = useMemo(() => ({
    grossRevenue: dailyData.reduce((s, d) => s + d.grossRevenue, 0),
    netRevenue:   dailyData.reduce((s, d) => s + d.netRevenue,   0),
    cashExpense:  dailyData.reduce((s, d) => s + d.cashExpense,  0),
    bankExpense:  dailyData.reduce((s, d) => s + d.bankExpense,  0),
    netPL:        dailyData.reduce((s, d) => s + d.netPL,        0),
  }), [dailyData]);

  const visibleDailyRows = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return dailyData.filter(d => {
      const fromKey = String(d.dateKey || '').split('-').map(Number);
      const rowDate = new Date(fromKey[0] || year, (fromKey[1] || (month + 1)) - 1, fromKey[2] || d.day, 12, 0, 0);
      if (rowDate > today) return false;
      if (!showEmptyDays && !d.hasData) return false;
      if (dailyRangeMode === 'day') return d.dateKey === toInputDate(selectedDay);
      if (dailyRangeMode === 'week') {
        const ws = startOfWeek(selectedDay), we = endOfWeek(selectedDay);
        return rowDate >= ws && rowDate <= we;
      }
      if (monthMode === 'all') return true;
      return String(d.dateKey || '').startsWith(selectedMonth);
    });
  }, [dailyData, dailyRangeMode, selectedDay, showEmptyDays, year, month, monthMode, selectedMonth]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const saveExpense = async (dateKey) => {
    setExpenseSaving(true);
    try {
      const data = {
        date:        dateKey,
        month:       String(dateKey).slice(0, 7),
        cashExpense: parseFloat(expenseDraft.cashExpense) || 0,
        bankExpense: parseFloat(expenseDraft.bankExpense) || 0,
        notes:       String(expenseDraft.notes || '').trim(),
      };
      const existing = expenses[dateKey];
      if (existing?.id) {
        await updateDoc(doc(db, `tenants/${TENANT}/finance_expenses`, existing.id), data);
      } else {
        const ref = await addDoc(collection(db, `tenants/${TENANT}/finance_expenses`), data);
        data.id = ref.id;
      }
      setExpenses(prev => ({ ...prev, [dateKey]: { ...data } }));
      setEditingExpense(null);
    } catch (e) { console.error(e); }
    setExpenseSaving(false);
  };

  const addPayment = async () => {
    if (!payForm.barberName || !payForm.amount || !payForm.date) return;
    setPayLoading(true);
    try {
      const dateObj = new Date(payForm.date + 'T12:00:00');
      const docData = {
        date:       Timestamp.fromDate(dateObj),
        barberName: payForm.barberName,
        amount:     parseFloat(payForm.amount),
        method:     payForm.method,
        notes:      payForm.notes || '',
      };
      const ref = await addDoc(collection(db, `tenants/${TENANT}/finance_payments`), docData);
      setPayments(prev => [{ id: ref.id, sourceType: 'finance_payments', ...docData }, ...prev]);
      setPayForm({ date: '', barberName: '', amount: '', method: 'Cash', notes: '' });
    } catch (e) { console.error(e); }
    setPayLoading(false);
  };

  const addInitialInvestment = async () => {
    if (!investmentForm.amount || !investmentForm.date) return;
    setInvestmentSaving(true);
    try {
      const dateObj = new Date(investmentForm.date + 'T12:00:00');
      const docData = {
        date:   Timestamp.fromDate(dateObj),
        amount: parseFloat(investmentForm.amount) || 0,
        method: investmentForm.method,
        notes:  investmentForm.notes || '',
      };
      const ref = await addDoc(collection(db, `tenants/${TENANT}/finance_initial_investments`), docData);
      setInitialInvestments(prev => [{ id: ref.id, ...docData }, ...prev]);
      setInvestmentForm({ date: '', amount: '', method: 'Cash', notes: '' });
    } catch (e) { console.error(e); }
    setInvestmentSaving(false);
  };

  const deleteInitialInvestment = async (id) => {
    if (!window.confirm('Delete this record?')) return;
    await deleteDoc(doc(db, `tenants/${TENANT}/finance_initial_investments`, id));
    setInitialInvestments(prev => prev.filter(x => x.id !== id));
  };

  const deletePayment = async (payment) => {
    if (!window.confirm('Delete this payment record?')) return;
    const col = payment.sourceType === 'advances' ? 'advances' : 'finance_payments';
    await deleteDoc(doc(db, `tenants/${TENANT}/${col}`, payment.id));
    setPayments(prev => prev.filter(p => !(p.id === payment.id && p.sourceType === payment.sourceType)));
  };

  const saveWageSettings = () => {
    localStorage.setItem('financeWageRates', JSON.stringify(wageRates));
    localStorage.setItem('financeFixedRate', String(fixedDailyRate));
    setShowSettings(false);
  };

  // ── Styles ────────────────────────────────────────────────────────────────

  const tabBtn = (id) => ({
    padding: '8px 18px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '700',
    letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer', border: 'none',
    background: activeTab === id ? 'linear-gradient(135deg,#d4af37,#b8860b)' : 'rgba(255,255,255,0.05)',
    color: activeTab === id ? '#000' : 'var(--muted)',
    transition: 'all 0.2s',
  });

  const thS = {
    padding: '8px 10px', fontSize: '0.58rem', color: 'var(--muted)', letterSpacing: '1.5px',
    textTransform: 'uppercase', fontWeight: '700', textAlign: 'right', whiteSpace: 'nowrap',
    borderBottom: '1px solid rgba(212,175,55,0.15)',
  };
  const tdS = (hi) => ({
    padding: '6px 10px', fontSize: '0.75rem', textAlign: 'right', whiteSpace: 'nowrap',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    color: hi === 'green' ? '#4caf50' : hi === 'red' ? '#ff5252' : 'var(--text)',
    fontWeight: hi ? '700' : '400',
  });

  const card = { background: 'var(--card2)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '16px' };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', letterSpacing: '2px', color: '#d4af37' }}>FINANCE</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--muted)', letterSpacing: '1px' }}>
            {MONTH_NAMES[month]} {year} — Revenue / Expenses / Payments
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="month" value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            style={{ ...inp, width: 'auto', colorScheme: 'dark', padding: '7px 12px', opacity: monthMode === 'all' ? 0.5 : 1 }}
            disabled={monthMode === 'all'}
          />
          <select value={monthMode} onChange={e => setMonthMode(e.target.value)} style={{ ...inp, width: 'auto', minWidth: '130px', padding: '7px 10px' }}>
            <option value="selected">This Month</option>
            <option value="all">All Months</option>
          </select>
          <button onClick={() => setShowSettings(s => !s)}
            style={{ padding: '8px 14px', background: showSettings ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', color: showSettings ? '#d4af37' : 'var(--muted)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: '600' }}>
            ⚙ Settings
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div style={{ ...card, padding: '20px', marginBottom: '20px' }}>
          <div style={{ fontSize: '0.65rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px', marginBottom: '14px' }}>WAGE RATES (£/DAY)</div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {barbers.map(b => (
              <div key={b.name} style={{ minWidth: '110px' }}>
                <label style={{ ...lbl, color: b.color }}>{b.name}</label>
                <input type="number" value={wageRates[b.name] ?? 100}
                  onChange={e => setWageRates(r => ({ ...r, [b.name]: e.target.value }))}
                  style={{ ...inp, width: '100px' }} />
              </div>
            ))}
            <div>
              <label style={lbl}>Fixed Daily Cost (£)</label>
              <input type="number" value={fixedDailyRate}
                onChange={e => setFixedDailyRate(parseFloat(e.target.value) || 0)}
                style={{ ...inp, width: '100px' }} />
            </div>
            <button onClick={saveWageSettings}
              style={{ padding: '9px 20px', background: 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '8px', color: '#000', fontWeight: '700', fontSize: '0.78rem', cursor: 'pointer' }}>
              Save
            </button>
          </div>
        </div>
      )}

      {/* Summary KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Gross Revenue',  value: '£' + monthlyTotals.grossRevenue.toFixed(0), color: '#d4af37' },
          { label: 'Net Revenue',    value: '£' + monthlyTotals.netRevenue.toFixed(0),   color: '#9c27b0' },
          { label: 'Cash Expenses',  value: '£' + monthlyTotals.cashExpense.toFixed(0),  color: '#ff7043' },
          { label: 'Bank Expenses',  value: '£' + monthlyTotals.bankExpense.toFixed(0),  color: '#ff7043' },
          { label: 'Net P&L',        value: (monthlyTotals.netPL >= 0 ? '+' : '') + '£' + monthlyTotals.netPL.toFixed(0), color: monthlyTotals.netPL >= 0 ? '#4caf50' : '#ff5252' },
        ].map(c => (
          <div key={c.label} style={{ ...card, padding: '14px 16px' }}>
            <div style={{ fontSize: '0.58rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>{c.label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: '800', color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button style={tabBtn('daily')}    onClick={() => setActiveTab('daily')}>Daily Ledger</button>
        <button style={tabBtn('payments')} onClick={() => setActiveTab('payments')}>Payments</button>
        <button style={tabBtn('summary')}  onClick={() => setActiveTab('summary')}>Monthly Summary</button>
        {activeTab === 'daily' && (
          <button
            onClick={() => setShowEmptyDays(v => !v)}
            style={{ ...tabBtn('empty'), background: 'rgba(255,255,255,0.03)', color: showEmptyDays ? '#d4af37' : 'var(--muted)', border: `1px solid ${showEmptyDays ? 'rgba(212,175,55,0.35)' : 'rgba(255,255,255,0.08)'}` }}>
            {showEmptyDays ? 'Empty Days: On' : 'Empty Days: Off'}
          </button>
        )}
      </div>

      {/* Daily range filter */}
      {!loading && activeTab === 'daily' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={dailyRangeMode} onChange={e => setDailyRangeMode(e.target.value)} style={{ ...inp, width: 'auto', minWidth: '110px', padding: '7px 10px' }}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
          {dailyRangeMode !== 'month' && (
            <input type="date" value={toInputDate(selectedDay)}
              onChange={e => {
                if (!e.target.value) return;
                const d = new Date(e.target.value + 'T12:00:00');
                setSelectedDay(d);
                if (monthMode === 'selected') setSelectedMonth(monthKey(d));
              }}
              style={{ ...inp, width: 'auto', colorScheme: 'dark', padding: '7px 10px' }}
            />
          )}
          {dailyRangeMode === 'week' && (
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
              {startOfWeek(selectedDay).toLocaleDateString('en-GB')} – {endOfWeek(selectedDay).toLocaleDateString('en-GB')}
            </span>
          )}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '60px', fontSize: '0.8rem', letterSpacing: '1px' }}>Loading...</div>}

      {/* ── DAILY LEDGER ── */}
      {!loading && activeTab === 'daily' && (
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
              <thead>
                <tr style={{ background: 'rgba(212,175,55,0.07)' }}>
                  <th style={{ ...thS, textAlign: 'left', minWidth: '80px' }}>Date</th>
                  {barbers.map(b => (
                    <React.Fragment key={b.name}>
                      <th style={{ ...thS, color: b.color }}>{b.name}<br/>Cash</th>
                      <th style={{ ...thS, color: b.color }}>{b.name}<br/>Card</th>
                    </React.Fragment>
                  ))}
                  <th style={{ ...thS, color: '#ff7043' }}>Cash<br/>Exp.</th>
                  <th style={{ ...thS, color: '#ff7043' }}>Bank<br/>Exp.</th>
                  <th style={{ ...thS, textAlign: 'left', minWidth: '160px' }}>Notes</th>
                  <th style={{ ...thS, color: '#d4af37' }}>Gross<br/>Revenue</th>
                  <th style={{ ...thS, color: '#9c27b0' }}>Net<br/>Revenue</th>
                  <th style={{ ...thS, color: 'rgba(255,255,255,0.35)' }}>Wages</th>
                  <th style={{ ...thS, color: monthlyTotals.netPL >= 0 ? '#4caf50' : '#ff5252', minWidth: '80px' }}>Net P&L</th>
                </tr>
              </thead>
              <tbody>
                {visibleDailyRows.map(row => {
                  const isEditing = editingExpense === row.dateKey;
                  return (
                    <tr key={row.dateKey} style={{ background: row.hasData ? 'rgba(212,175,55,0.015)' : 'transparent', opacity: row.hasData ? 1 : 0.4 }}>

                      {/* Date */}
                      <td style={{ ...tdS(), textAlign: 'left', fontWeight: '600', fontSize: '0.72rem' }}>
                        <span style={{ color: '#d4af37' }}>{String(row.day).padStart(2, '0')}</span>
                        <span style={{ color: 'var(--muted)', marginLeft: '4px', fontSize: '0.6rem' }}>{row.dayOfWeek}</span>
                      </td>

                      {/* Barber revenue columns */}
                      {barbers.map(b => (
                        <React.Fragment key={b.name}>
                          <td style={{ ...tdS(), color: (row.barberRevenue[b.name]?.cash || 0) > 0 ? 'var(--text)' : 'rgba(255,255,255,0.1)' }}>
                            {row.barberRevenue[b.name]?.cash > 0 ? '£' + row.barberRevenue[b.name].cash.toFixed(0) : '–'}
                          </td>
                          <td style={{ ...tdS(), color: (row.barberRevenue[b.name]?.card || 0) > 0 ? 'var(--text)' : 'rgba(255,255,255,0.1)' }}>
                            {row.barberRevenue[b.name]?.card > 0 ? '£' + row.barberRevenue[b.name].card.toFixed(0) : '–'}
                          </td>
                        </React.Fragment>
                      ))}

                      {/* Cash Expense — click to edit */}
                      <td style={{ ...tdS(), color: '#ff7043', cursor: 'pointer' }}
                        onClick={() => {
                          if (!isEditing) {
                            setEditingExpense(row.dateKey);
                            setExpenseDraft({ cashExpense: row.cashExpense || '', bankExpense: row.bankExpense || '', notes: row.expenseNotes || '' });
                          }
                        }}>
                        {isEditing
                          ? <input type="number" value={expenseDraft.cashExpense}
                              onChange={e => setExpenseDraft(d => ({ ...d, cashExpense: e.target.value }))}
                              style={{ ...inp, width: '70px', padding: '4px 7px', fontSize: '0.75rem' }}
                              autoFocus onClick={e => e.stopPropagation()} />
                          : row.cashExpense > 0 ? '£' + row.cashExpense.toFixed(0) : <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: '0.65rem' }}>+</span>
                        }
                      </td>

                      {/* Bank Expense — click to edit (inline form) */}
                      <td style={{ ...tdS(), color: '#ff7043', cursor: 'pointer' }}
                        onClick={() => {
                          if (!isEditing) {
                            setEditingExpense(row.dateKey);
                            setExpenseDraft({ cashExpense: row.cashExpense || '', bankExpense: row.bankExpense || '', notes: row.expenseNotes || '' });
                          }
                        }}>
                        {isEditing
                          ? <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <input type="number" value={expenseDraft.bankExpense}
                                onChange={e => setExpenseDraft(d => ({ ...d, bankExpense: e.target.value }))}
                                style={{ ...inp, width: '70px', padding: '4px 7px', fontSize: '0.75rem' }}
                                onClick={e => e.stopPropagation()} />
                              <input type="text" value={expenseDraft.notes} placeholder="Notes"
                                onChange={e => setExpenseDraft(d => ({ ...d, notes: e.target.value }))}
                                style={{ ...inp, width: '150px', padding: '4px 7px', fontSize: '0.7rem' }}
                                onClick={e => e.stopPropagation()} />
                              <button onClick={e => { e.stopPropagation(); saveExpense(row.dateKey); }} disabled={expenseSaving}
                                style={{ padding: '4px 8px', background: '#d4af37', border: 'none', borderRadius: '5px', color: '#000', fontWeight: '700', fontSize: '0.65rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                {expenseSaving ? '...' : 'Save'}
                              </button>
                              <button onClick={e => { e.stopPropagation(); setEditingExpense(null); }}
                                style={{ padding: '4px 6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', color: 'var(--muted)', fontSize: '0.65rem', cursor: 'pointer' }}>✕</button>
                            </div>
                          : row.bankExpense > 0 ? '£' + row.bankExpense.toFixed(0) : <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: '0.65rem' }}>+</span>
                        }
                      </td>

                      {/* Notes */}
                      <td style={{ ...tdS(), textAlign: 'left', color: row.expenseNotes ? 'var(--muted)' : 'rgba(255,255,255,0.12)', fontSize: '0.7rem' }}>
                        {row.expenseNotes || '–'}
                      </td>

                      <td style={tdS()}>{row.grossRevenue > 0 ? '£' + row.grossRevenue.toFixed(0) : '–'}</td>
                      <td style={{ ...tdS(), color: '#9c27b0', fontWeight: row.netRevenue > 0 ? '700' : '400' }}>{row.netRevenue > 0 ? '£' + row.netRevenue.toFixed(0) : '–'}</td>
                      <td style={{ ...tdS(), color: 'rgba(255,255,255,0.3)', fontSize: '0.68rem' }}>{row.totalWages > 0 ? '£' + row.totalWages.toFixed(0) : '–'}</td>
                      <td style={tdS(row.hasData ? (row.netPL >= 0 ? 'green' : 'red') : null)}>
                        {row.hasData ? (row.netPL >= 0 ? '+' : '') + '£' + row.netPL.toFixed(0) : '–'}
                      </td>
                    </tr>
                  );
                })}

                {/* Totals row */}
                <tr style={{ background: 'rgba(212,175,55,0.08)', borderTop: '2px solid rgba(212,175,55,0.3)' }}>
                  <td style={{ ...tdS(), textAlign: 'left', fontWeight: '800', fontSize: '0.72rem', color: '#d4af37' }}>TOTAL</td>
                  {barbers.map(b => {
                    const cash = visibleDailyRows.reduce((s, d) => s + (d.barberRevenue[b.name]?.cash || 0), 0);
                    const card = visibleDailyRows.reduce((s, d) => s + (d.barberRevenue[b.name]?.card || 0), 0);
                    return (
                      <React.Fragment key={b.name}>
                        <td style={{ ...tdS(), fontWeight: '700', color: b.color }}>{cash > 0 ? '£' + cash.toFixed(0) : '–'}</td>
                        <td style={{ ...tdS(), fontWeight: '700', color: b.color }}>{card > 0 ? '£' + card.toFixed(0) : '–'}</td>
                      </React.Fragment>
                    );
                  })}
                  <td style={{ ...tdS(), fontWeight: '700', color: '#ff7043' }}>{fmt(visibleDailyRows.reduce((s, d) => s + d.cashExpense, 0))}</td>
                  <td style={{ ...tdS(), fontWeight: '700', color: '#ff7043' }}>{fmt(visibleDailyRows.reduce((s, d) => s + d.bankExpense, 0))}</td>
                  <td style={{ ...tdS(), textAlign: 'left', color: 'rgba(255,255,255,0.3)' }}>–</td>
                  <td style={{ ...tdS(), fontWeight: '800', color: '#d4af37' }}>£{visibleDailyRows.reduce((s, d) => s + d.grossRevenue, 0).toFixed(0)}</td>
                  <td style={{ ...tdS(), fontWeight: '800', color: '#9c27b0' }}>£{visibleDailyRows.reduce((s, d) => s + d.netRevenue, 0).toFixed(0)}</td>
                  <td style={{ ...tdS(), color: 'rgba(255,255,255,0.35)' }}>–</td>
                  <td style={{ ...tdS(visibleDailyRows.reduce((s, d) => s + d.netPL, 0) >= 0 ? 'green' : 'red'), fontWeight: '800' }}>
                    {(() => { const t = visibleDailyRows.reduce((s, d) => s + d.netPL, 0); return (t >= 0 ? '+' : '') + '£' + t.toFixed(0); })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(212,175,55,0.1)', fontSize: '0.6rem', color: 'var(--muted)' }}>
            Click any expense cell to edit. Wages = active barbers × daily rate. Net P&L = Net Revenue – Wages – Fixed Cost.
          </div>
        </div>
      )}

      {/* ── PAYMENTS ── */}
      {!loading && activeTab === 'payments' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', alignItems: 'start' }}>

          {/* Payment list */}
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(212,175,55,0.1)', fontSize: '0.65rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px' }}>
              PAYMENTS & ADVANCES
            </div>
            <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap' }}>
              <select value={paymentMonthMode} onChange={e => setPaymentMonthMode(e.target.value)} style={{ ...inp, width: 'auto', minWidth: '130px', padding: '6px 10px' }}>
                <option value="selected">This Month</option>
                <option value="all">All Time</option>
              </select>
              <select value={paymentBarberFilter} onChange={e => setPaymentBarberFilter(e.target.value)} style={{ ...inp, width: 'auto', minWidth: '130px', padding: '6px 10px' }}>
                <option value="all">All Barbers</option>
                {barbers.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
              <select value={paymentMethodFilter} onChange={e => setPaymentMethodFilter(e.target.value)} style={{ ...inp, width: 'auto', minWidth: '110px', padding: '6px 10px' }}>
                <option value="all">All Methods</option>
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
                <option value="Other">Other</option>
              </select>
            </div>
            {paymentRows.length === 0
              ? <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem' }}>No payments match the current filter.</div>
              : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(212,175,55,0.05)' }}>
                      {['Date','Barber','Amount','Method','Source','Notes',''].map(h => (
                        <th key={h} style={{ ...thS, textAlign: h === '' ? 'center' : 'left', padding: '8px 14px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paymentRows.map(p => {
                      const d = p.__date;
                      const barber = barbers.find(b => normalizeName(b.name) === normalizeName(p.barberName));
                      return (
                        <tr key={p.id + p.sourceType} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '10px 14px', fontSize: '0.75rem' }}>{d.toLocaleDateString('en-GB')}</td>
                          <td style={{ padding: '10px 14px', fontSize: '0.75rem', color: barber?.color || '#d4af37', fontWeight: '600' }}>{p.barberName}</td>
                          <td style={{ padding: '10px 14px', fontSize: '0.82rem', fontWeight: '700', color: '#ff7043' }}>£{parseFloat(p.amount).toFixed(0)}</td>
                          <td style={{ padding: '10px 14px', fontSize: '0.72rem', color: 'var(--muted)' }}>{p.method}</td>
                          <td style={{ padding: '10px 14px', fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)' }}>{p.sourceType === 'advances' ? 'imported' : 'manual'}</td>
                          <td style={{ padding: '10px 14px', fontSize: '0.72rem', color: 'var(--muted)' }}>{p.notes || '–'}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <button onClick={() => deletePayment(p)}
                              style={{ background: 'transparent', border: 'none', color: 'rgba(255,82,82,0.5)', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            }
          </div>

          {/* Add payment */}
          <div style={{ ...card, padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '0.65rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px' }}>NEW PAYMENT / ADVANCE</div>
            <div>
              <label style={lbl}>Date</label>
              <input type="date" value={payForm.date} onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} style={{ ...inp, colorScheme: 'dark' }} />
            </div>
            <div>
              <label style={lbl}>Barber</label>
              <select value={payForm.barberName} onChange={e => setPayForm(f => ({ ...f, barberName: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                <option value="">Select...</option>
                {barbers.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Amount (£)</label>
              <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" style={inp} />
            </div>
            <div>
              <label style={lbl}>Method</label>
              <select value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                <option>Cash</option>
                <option>Bank</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Notes (optional)</label>
              <input value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} placeholder="Description..." style={inp} />
            </div>
            <button onClick={addPayment} disabled={payLoading || !payForm.date || !payForm.barberName || !payForm.amount}
              style={{ padding: '11px', background: 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '8px', color: '#000', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer', opacity: (!payForm.date || !payForm.barberName || !payForm.amount) ? 0.5 : 1 }}>
              {payLoading ? 'Saving...' : 'Add Payment'}
            </button>
          </div>
        </div>
      )}

      {/* ── MONTHLY SUMMARY ── */}
      {!loading && activeTab === 'summary' && (
        <div style={{ display: 'grid', gap: '16px' }}>

          {/* Sub-tab toggle */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {[['live', 'Live Summary'], ['initial', 'Initial Investments']].map(([id, label]) => (
              <button key={id} onClick={() => setSummaryView(id)}
                style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: '700', letterSpacing: '1px', transition: 'all 0.2s',
                  background: summaryView === id ? 'linear-gradient(135deg,#d4af37,#b8860b)' : 'rgba(255,255,255,0.05)',
                  color: summaryView === id ? '#000' : 'var(--muted)' }}>
                {label}
              </button>
            ))}
          </div>

          {summaryView === 'live' && (
            <>
              {/* Barber breakdown */}
              <div style={{ ...card, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(212,175,55,0.1)', fontSize: '0.65rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px' }}>
                  BARBER MONTHLY BREAKDOWN — {MONTH_NAMES[month].toUpperCase()} {year}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                    <thead>
                      <tr style={{ background: 'rgba(212,175,55,0.06)' }}>
                        <th style={{ ...thS, textAlign: 'left' }}>Barber</th>
                        <th style={thS}>Days Worked</th>
                        <th style={thS}>Revenue</th>
                        <th style={{ ...thS, color: '#4caf50' }}>Wages</th>
                        <th style={{ ...thS, color: '#ff7043' }}>Advances</th>
                        <th style={{ ...thS, color: '#4caf50' }}>Net Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlySummary.map(s => (
                        <tr key={s.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ ...tdS(), textAlign: 'left', fontWeight: '700', color: s.color }}>{s.name}</td>
                          <td style={tdS()}>{s.workedDays}</td>
                          <td style={tdS()}>{fmt(s.totalRev)}</td>
                          <td style={{ ...tdS(), color: '#4caf50' }}>{fmt(s.wages)}</td>
                          <td style={{ ...tdS(), color: '#ff7043' }}>{s.totalAdvances > 0 ? fmt(s.totalAdvances) : '–'}</td>
                          <td style={tdS(s.balance >= 0 ? 'green' : 'red')}>
                            {(s.balance >= 0 ? '+' : '') + '£' + s.balance.toFixed(0)}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: 'rgba(212,175,55,0.08)', borderTop: '2px solid rgba(212,175,55,0.3)' }}>
                        <td style={{ ...tdS(), textAlign: 'left', fontWeight: '800', color: '#d4af37' }}>TOTAL</td>
                        <td style={{ ...tdS(), fontWeight: '800' }}>{monthlySummaryTotals.workedDays}</td>
                        <td style={{ ...tdS(), fontWeight: '800' }}>{fmt(monthlySummaryTotals.totalRev)}</td>
                        <td style={{ ...tdS(), fontWeight: '800', color: '#4caf50' }}>{fmt(monthlySummaryTotals.wages)}</td>
                        <td style={{ ...tdS(), fontWeight: '800', color: '#ff7043' }}>{fmt(monthlySummaryTotals.totalAdvances)}</td>
                        <td style={{ ...tdS(monthlySummaryTotals.balance >= 0 ? 'green' : 'red'), fontWeight: '800' }}>
                          {(monthlySummaryTotals.balance >= 0 ? '+' : '') + '£' + monthlySummaryTotals.balance.toFixed(0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Monthly P&L summary */}
              <div style={{ ...card, border: '1px solid rgba(255,112,67,0.2)', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,112,67,0.15)', fontSize: '0.65rem', color: '#ff7043', fontWeight: '700', letterSpacing: '2px' }}>
                  MONTHLY P&L — {MONTH_NAMES[month].toUpperCase()} {year}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '650px' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,112,67,0.05)' }}>
                        <th style={{ ...thS, textAlign: 'left' }}>Period</th>
                        <th style={thS}>Cash Exp.</th>
                        <th style={thS}>Bank Exp.</th>
                        <th style={{ ...thS, color: '#7e57c2' }}>Other Costs</th>
                        <th style={thS}>Gross Revenue</th>
                        <th style={thS}>Net Revenue</th>
                        <th style={{ ...thS, color: monthlyTotals.netPL >= 0 ? '#4caf50' : '#ff5252' }}>Net P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ ...tdS(), textAlign: 'left', fontWeight: '700' }}>{MONTH_NAMES[month]} {year}</td>
                        <td style={{ ...tdS(), color: '#ff7043' }}>{fmt(monthlyTotals.cashExpense)}</td>
                        <td style={{ ...tdS(), color: '#ff7043' }}>{fmt(monthlyTotals.bankExpense)}</td>
                        <td style={{ ...tdS(), color: '#7e57c2' }}>{initialInvestmentTotal > 0 ? fmt(initialInvestmentTotal) : '–'}</td>
                        <td style={{ ...tdS(), color: '#d4af37' }}>{fmt(monthlyTotals.grossRevenue)}</td>
                        <td style={{ ...tdS(), color: '#9c27b0' }}>{fmt(monthlyTotals.netRevenue)}</td>
                        <td style={tdS(monthlyTotals.netPL >= 0 ? 'green' : 'red')}>
                          {(monthlyTotals.netPL >= 0 ? '+' : '') + '£' + monthlyTotals.netPL.toFixed(0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {summaryView === 'initial' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', alignItems: 'start' }}>
              <div style={{ ...card, border: '1px solid rgba(126,87,194,0.25)', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(126,87,194,0.2)', fontSize: '0.65rem', color: '#b39ddb', fontWeight: '700', letterSpacing: '2px' }}>
                  INITIAL INVESTMENTS — {MONTH_NAMES[month].toUpperCase()} {year}
                </div>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Total this month</span>
                  <span style={{ fontSize: '1rem', fontWeight: '800', color: '#b39ddb' }}>
                    {initialInvestmentTotal > 0 ? fmt(initialInvestmentTotal) : '–'}
                  </span>
                </div>
                {selectedMonthInvestments.length === 0
                  ? <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.78rem' }}>No investment records for this month.</div>
                  : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'rgba(126,87,194,0.06)' }}>
                          {['Date','Amount','Method','Notes',''].map(h => (
                            <th key={h} style={{ ...thS, textAlign: h === '' ? 'center' : 'left', padding: '8px 12px' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedMonthInvestments.map(inv => {
                          const d = paymentToDate(inv.date);
                          return (
                            <tr key={inv.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '10px 12px', fontSize: '0.75rem' }}>{d ? d.toLocaleDateString('en-GB') : '–'}</td>
                              <td style={{ padding: '10px 12px', fontSize: '0.82rem', fontWeight: '700', color: '#b39ddb' }}>£{parseFloat(inv.amount || 0).toFixed(0)}</td>
                              <td style={{ padding: '10px 12px', fontSize: '0.72rem', color: 'var(--muted)' }}>{inv.method || '–'}</td>
                              <td style={{ padding: '10px 12px', fontSize: '0.72rem', color: 'var(--muted)' }}>{inv.notes || '–'}</td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <button onClick={() => deleteInitialInvestment(inv.id)}
                                  style={{ background: 'transparent', border: 'none', color: 'rgba(255,82,82,0.5)', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                }
              </div>

              <div style={{ ...card, border: '1px solid rgba(126,87,194,0.25)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '0.65rem', color: '#b39ddb', fontWeight: '700', letterSpacing: '2px' }}>ADD INVESTMENT</div>
                <div>
                  <label style={lbl}>Date</label>
                  <input type="date" value={investmentForm.date} onChange={e => setInvestmentForm(f => ({ ...f, date: e.target.value }))} style={{ ...inp, colorScheme: 'dark' }} />
                </div>
                <div>
                  <label style={lbl}>Amount (£)</label>
                  <input type="number" value={investmentForm.amount} onChange={e => setInvestmentForm(f => ({ ...f, amount: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Method</label>
                  <select value={investmentForm.method} onChange={e => setInvestmentForm(f => ({ ...f, method: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                    <option>Cash</option>
                    <option>Bank</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Notes</label>
                  <input value={investmentForm.notes} onChange={e => setInvestmentForm(f => ({ ...f, notes: e.target.value }))} placeholder="Description..." style={inp} />
                </div>
                <button onClick={addInitialInvestment} disabled={investmentSaving || !investmentForm.date || !investmentForm.amount}
                  style={{ padding: '11px', background: 'linear-gradient(135deg,#b39ddb,#7e57c2)', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer', opacity: (!investmentForm.date || !investmentForm.amount) ? 0.5 : 1 }}>
                  {investmentSaving ? 'Saving...' : 'Add'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
