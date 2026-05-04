import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, Timestamp, orderBy,
} from 'firebase/firestore';

const TENANT = 'whitecross';

// ── Partner / employee config ────────────────────────────────────────────────
// Stored in localStorage so admin can adjust if needed
const PARTNER_CONFIG_DEFAULT = {
  Alex:   { share: 50, wage: 100, isPartner: true,  creditTo: null    },
  Arda:   { share: 25, wage: 100, isPartner: true,  creditTo: null    },
  Tuncay: { share: 25, wage: 0,   isPartner: true,  creditTo: null    },
  Kadim:  { share: 0,  wage: 100, isPartner: false, creditTo: 'Tuncay' },
  Manoj:  { share: 0,  wage: 50,  isPartner: false, creditTo: 'Tuncay' },
};

const INITIAL_INVESTMENT = [
  { name: 'Alex',   share: 50, paid: 17743 },
  { name: 'Arda',   share: 25, paid: 5500  },
  { name: 'Tuncay', share: 25, paid: 2700  },
];
const INITIAL_TOTAL = INITIAL_INVESTMENT.reduce((s, r) => s + r.paid, 0);

const FIXED_DAILY_COST_DEFAULT = 100; // £/day

// ── Helpers ──────────────────────────────────────────────────────────────────
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

function paymentMethod(b) {
  const m = String(b.paymentMethod || b.paymentType || '').toLowerCase();
  if (m === 'cash') return 'CASH';
  if (m === 'monzo') return 'MONZO';
  return 'CARD';
}

function isWalkInBooking(b) {
  const src = String(b.source || '').trim().toLowerCase();
  if (src === 'walk_in' || src === 'walk-in' || src === 'walkin' || src === 'historical') return true;
  if (src === '' && String(b.clientName || '').trim().toLowerCase() === 'walk-in') return true;
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
    return new Date(v.seconds * 1000);
  }
  if (typeof v === 'string') {
    const s = v.trim();
    const d1 = new Date(s);
    if (!Number.isNaN(d1.getTime())) return d1;
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthKey(d) {
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toInputDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function startOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
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

function fmt(n, sign = false) {
  if (!n && n !== 0) return '–';
  const v = parseFloat(n);
  if (!Number.isFinite(v) || v === 0) return '–';
  return (sign && v > 0 ? '+' : '') + '£' + Math.round(v);
}

function fmtSigned(n) {
  if (!Number.isFinite(n)) return '–';
  return (n >= 0 ? '+£' : '-£') + Math.round(Math.abs(n));
}

// ── Styles ───────────────────────────────────────────────────────────────────
const inp = {
  background: 'var(--card2)', border: '1px solid rgba(212,175,55,0.25)',
  borderRadius: '8px', color: 'var(--text)', padding: '9px 12px', fontSize: '0.82rem',
  width: '100%', boxSizing: 'border-box', outline: 'none',
};
const lbl = {
  fontSize: '0.65rem', color: 'var(--muted)', letterSpacing: '1.5px',
  textTransform: 'uppercase', fontWeight: '600', marginBottom: '5px', display: 'block',
};
const thS = {
  padding: '8px 10px', fontSize: '0.58rem', color: 'var(--muted)', letterSpacing: '1.5px',
  textTransform: 'uppercase', fontWeight: '700', textAlign: 'right', whiteSpace: 'nowrap',
  borderBottom: '1px solid rgba(212,175,55,0.15)',
};
function tdS(hi) {
  return {
    padding: '6px 10px', fontSize: '0.75rem', textAlign: 'right', whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)',
    color: hi === 'green' ? '#4caf50' : hi === 'red' ? '#ff5252' : 'var(--text)',
    fontWeight: hi ? '700' : '400',
  };
}
const card = { background: 'var(--card2)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '16px' };

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const BARBER_COLORS = { Alex: '#4caf50', Arda: '#2196f3', Kadim: '#ff9800', Manoj: '#e91e63', Tuncay: '#b39ddb' };

const resolveBarberName = (rawName, canonMap) => {
  const n = normalizeName(rawName);
  if (!n) return '';
  if (canonMap[n]) return canonMap[n];
  for (const [k, v] of Object.entries(canonMap)) {
    if (n.includes(k)) return v;
  }
  return rawName;
};

// ── Component ────────────────────────────────────────────────────────────────
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
  const [loading, setLoading] = useState(true);
  const [dailyRangeMode, setDailyRangeMode] = useState('month');
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [summaryView, setSummaryView] = useState('partnership');

  const [partnerConfig, setPartnerConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem('partnerConfig') || 'null') || PARTNER_CONFIG_DEFAULT; }
    catch { return PARTNER_CONFIG_DEFAULT; }
  });
  const [fixedDailyRate, setFixedDailyRate] = useState(() =>
    parseFloat(localStorage.getItem('financeFixedRate') || String(FIXED_DAILY_COST_DEFAULT))
  );
  const [showSettings, setShowSettings] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(null);

  const [payForm, setPayForm] = useState({ date: '', barberName: '', amount: '', method: 'Cash', notes: '' });
  const [payLoading, setPayLoading] = useState(false);
  const [paymentMonthMode, setPaymentMonthMode] = useState('all');
  const [paymentBarberFilter, setPaymentBarberFilter] = useState('all');
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

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [bookSnap, barberSnap, expSnap, paySnap, advSnap, legacyExpSnap] = await Promise.all([
        getDocs(collection(db, `tenants/${TENANT}/bookings`)),
        getDocs(collection(db, `tenants/${TENANT}/barbers`)),
        getDocs(collection(db, `tenants/${TENANT}/finance_expenses`)),
        getDocs(query(collection(db, `tenants/${TENANT}/finance_payments`), orderBy('date', 'desc'))),
        getDocs(collection(db, `tenants/${TENANT}/advances`)),
        getDocs(collection(db, `tenants/${TENANT}/expenses`)),
      ]);

      // Barbers
      const fetchedBarbers = barberSnap.docs
        .map(d => ({ docId: d.id, ...d.data() }))
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

      // Track real (Firestore) barber names — only these get wages charged
      const realBarberNames = new Set(fetchedBarbers.map(b => normalizeName(b.name)));

      // Add display-only defaults for any common name not in Firestore (no wages)
      const byName = new Set(fetchedBarbers.map(b => normalizeName(b.name)));
      const defaults = ['Alex','Arda','Kadim','Manoj'].filter(n => !byName.has(n.toLowerCase()))
        .map((n, i) => ({ name: n, color: BARBER_COLORS[n], order: 10 + i, id: n.toLowerCase(), docId: `default-${n.toLowerCase()}`, displayOnly: true }));
      const allBarbers = [...fetchedBarbers, ...defaults].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      setBarbers(allBarbers.map(b => ({ ...b, _isReal: realBarberNames.has(normalizeName(b.name)) })));

      const canonMap = allBarbers.reduce((acc, b) => {
        if (b?.name) acc[normalizeName(b.name)] = b.name;
        return acc;
      }, {});
      const barberById = allBarbers.reduce((acc, b) => {
        if (!b.name) return acc;
        [b.docId, b.id].filter(Boolean).forEach(k => { acc[String(k).toLowerCase()] = b.name; });
        return acc;
      }, {});

      // Bookings
      const fetchedBookings = bookSnap.docs.map(d => {
        const data = d.data();
        const rawBarber = data.barberName || barberById[String(data.barberId || '').toLowerCase()] || data.barberId || '';
        const barber = resolveBarberName(rawBarber, canonMap);
        const startTime = data.startTime?.toDate?.();
        const rawStatus = String(data.status || '').trim().toUpperCase().replace(/[-\s]+/g, '_');
        const status = ['CONFIRMED','PENDING','CHECKED_OUT','CANCELLED','BLOCKED','NO_SHOW'].includes(rawStatus) ? rawStatus : (rawStatus || 'CONFIRMED');
        return { ...data, status, barber, startTime, dateKey: startTime ? toDateKey(startTime) : null };
      }).filter(b => b.status !== 'CANCELLED' && b.dateKey);
      setBookings(fetchedBookings);

      // Expenses — merge legacy `expenses` collection with manual `finance_expenses`
      const expMap = {};
      legacyExpSnap.docs.forEach(d => {
        const data = d.data();
        const dt = paymentToDate(data.date);
        if (!dt) return;
        const dk = toDateKey(dt);
        if (!expMap[dk]) expMap[dk] = { cashExpense: 0, bankExpense: 0, notes: '' };
        const amt = parseFloat(data.amount || 0);
        const type = String(data.type || '').toUpperCase();
        if (type === 'CASH' || type === 'KASA') expMap[dk].cashExpense += amt;
        else expMap[dk].bankExpense += amt;
        if (data.note && !expMap[dk].notes) expMap[dk].notes = data.note;
      });
      expSnap.docs.forEach(d => {
        const data = d.data();
        expMap[data.date] = {
          id: d.id,
          cashExpense: parseFloat(data.cashExpense ?? data.kasaMasraf ?? 0),
          bankExpense:  parseFloat(data.bankExpense  ?? data.bankaMasraf ?? 0),
          notes:        data.notes || data.aciklama || '',
          ...data,
        };
      });
      setExpenses(expMap);

      // Payments — merge finance_payments + legacy advances
      const manualPays = paySnap.docs.map(d => ({ id: d.id, sourceType: 'finance_payments', ...d.data() }));
      const legacyAdv  = advSnap.docs.map(d => {
        const data = d.data() || {};
        return {
          id: d.id, sourceType: 'advances',
          date:       data.date || null,
          barberName: data.barberName || data.barber || '',
          amount:     parseFloat(data.amount || 0) || 0,
          method:     data.method || data.paymentMethod || 'Cash',
          notes:      data.notes || data.note || '',
        };
      });
      const merged = [...manualPays, ...legacyAdv].sort((a, b) => {
        const ad = paymentToDate(a.date), bd = paymentToDate(b.date);
        return (bd?.getTime() || 0) - (ad?.getTime() || 0);
      });
      setPayments(merged);
    } catch (err) {
      console.error('Finance fetchAll error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Daily rows ────────────────────────────────────────────────────────────
  const dailyData = useMemo(() => {
    const inScope = dk => monthMode === 'all' || String(dk || '').startsWith(selectedMonth);
    const realBarberSet = new Set(barbers.filter(b => b._isReal).map(b => normalizeName(b.name)));
    const scopedBk = bookings.filter(b => b.dateKey && inScope(b.dateKey));
    const scopedExpKeys = Object.keys(expenses).filter(inScope);

    const dateKeys = monthMode === 'selected'
      ? Array.from({ length: daysInMonth(year, month) }, (_, i) =>
          `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)
      : Array.from(new Set([...scopedBk.map(b => b.dateKey), ...scopedExpKeys])).sort();

    return dateKeys.map(dk => {
      const [py, pm, pd] = String(dk).split('-').map(Number);
      const rowDate = new Date(py, pm - 1, pd);
      const dayBk = scopedBk.filter(b => b.dateKey === dk);
      const exp = expenses[dk] || {};
      const cashExpense = parseFloat(exp.cashExpense ?? 0);
      const bankExpense = parseFloat(exp.bankExpense ?? 0);

      const barberRev = {};
      barbers.forEach(b => { barberRev[b.name] = { cash: 0, monzo: 0, card: 0 }; });
      // Revenue: only CHECKED_OUT bookings; wages: all non-cancelled (worked)
      const workedNames = new Set();
      dayBk.forEach(b => {
        const name = b.barber;
        workedNames.add(name);
        if (b.status !== 'CHECKED_OUT') return;
        if (!barberRev[name]) barberRev[name] = { cash: 0, monzo: 0, card: 0 };
        const rev = effectiveRevenue(b);
        const pm2 = paymentMethod(b);
        if (pm2 === 'CASH') barberRev[name].cash += rev;
        else if (pm2 === 'MONZO') barberRev[name].monzo += rev;
        else barberRev[name].card += rev;
      });

      const grossRevenue = Object.values(barberRev).reduce((s, v) => s + v.cash + v.monzo + v.card, 0);
      const netRevenue   = grossRevenue - cashExpense - bankExpense;

      // Wages: barbers in partnerConfig (includes Kadim/Manoj even if not in Firestore)
      // + any real Firestore barber not in partnerConfig (fallback £100)
      let totalWages = 0;
      workedNames.forEach(name => {
        const cfg = partnerConfig[name];
        if (cfg !== undefined) {
          totalWages += cfg.wage ?? 0;
        } else if (realBarberSet.has(normalizeName(name))) {
          totalWages += 100;
        }
      });
      const shopOpen = grossRevenue > 0;
      const fixedCost = shopOpen ? fixedDailyRate : 0;
      const netPL = netRevenue - totalWages - fixedCost;

      return {
        day: pd, dateKey: dk, dayOfWeek: rowDate.toLocaleDateString('en-GB', { weekday: 'short' }),
        barberRev, cashExpense, bankExpense, expenseNotes: String(exp.notes || '').trim(),
        grossRevenue, netRevenue, totalWages, fixedCost, netPL,
        hasData: grossRevenue > 0 || cashExpense > 0 || bankExpense > 0 || !!String(exp.notes || '').trim(),
        exp,
      };
    });
  }, [bookings, barbers, expenses, partnerConfig, fixedDailyRate, year, month, selectedMonth, monthMode]);

  const visibleDailyRows = useMemo(() => {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    return dailyData.filter(d => {
      const [py, pm, pd] = String(d.dateKey).split('-').map(Number);
      const rowDate = new Date(py, pm - 1, pd, 12, 0, 0);
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
  }, [dailyData, dailyRangeMode, selectedDay, showEmptyDays, monthMode, selectedMonth]);

  const monthlyTotals = useMemo(() => ({
    grossRevenue: dailyData.reduce((s, d) => s + d.grossRevenue, 0),
    netRevenue:   dailyData.reduce((s, d) => s + d.netRevenue,   0),
    cashExpense:  dailyData.reduce((s, d) => s + d.cashExpense,  0),
    bankExpense:  dailyData.reduce((s, d) => s + d.bankExpense,  0),
    totalWages:   dailyData.reduce((s, d) => s + d.totalWages,   0),
    fixedCost:    dailyData.reduce((s, d) => s + d.fixedCost,    0),
    netPL:        dailyData.reduce((s, d) => s + d.netPL,        0),
  }), [dailyData]);

  // ── Partnership accounting ─────────────────────────────────────────────────
  // Per-month stats for each month that has any data
  const partnershipByMonth = useMemo(() => {
    const realBarberSet = new Set(barbers.filter(b => b._isReal).map(b => normalizeName(b.name)));
    const allMonths = Array.from(new Set(
      bookings.map(b => monthKey(b.startTime)).filter(Boolean)
    )).sort();

    return allMonths.map(mk => {
      const [my, mm] = mk.split('-').map(Number);
      const numDays = daysInMonth(my, mm - 1);
      const mkDates = Array.from({ length: numDays }, (_, i) =>
        `${my}-${String(mm).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);

      // Sum all daily P&L rows for this month
      let grossRev = 0, cashExp = 0, bankExp = 0, totalWages = 0, fixedCostTotal = 0;
      const barberDays = {}; // name → set of dateKeys
      const barberRev  = {}; // name → total revenue

      const monthBk = bookings.filter(b => monthKey(b.startTime) === mk);
      monthBk.forEach(b => {
        // All non-cancelled bookings count for worked-days (wages)
        if (!barberDays[b.barber]) barberDays[b.barber] = new Set();
        barberDays[b.barber].add(b.dateKey);
        // Only CHECKED_OUT bookings count for revenue
        if (b.status === 'CHECKED_OUT') {
          if (!barberRev[b.barber]) barberRev[b.barber] = 0;
          const rev = effectiveRevenue(b);
          barberRev[b.barber] += rev;
          grossRev += rev;
        }
      });

      mkDates.forEach(dk => {
        const exp = expenses[dk];
        if (exp) { cashExp += parseFloat(exp.cashExpense ?? 0); bankExp += parseFloat(exp.bankExpense ?? 0); }
      });

      const netRevenue = grossRev - cashExp - bankExp;

      // Compute wages per worker (days worked × wage)
      // Includes partnerConfig workers (Kadim/Manoj) even if not in Firestore
      Object.entries(barberDays).forEach(([name, days]) => {
        const cfg = partnerConfig[name];
        if (cfg !== undefined) {
          totalWages += days.size * (cfg.wage ?? 0);
        } else if (realBarberSet.has(normalizeName(name))) {
          totalWages += days.size * 100;
        }
      });

      // Shop-open days = any day with revenue (for fixed cost)
      const shopDays = new Set(monthBk.map(b => b.dateKey)).size;
      fixedCostTotal = shopDays * fixedDailyRate;

      const companyNetPL = netRevenue - totalWages - fixedCostTotal;

      // Per partner accounting
      const partners = {};
      Object.entries(partnerConfig).filter(([, cfg]) => cfg.isPartner).forEach(([name, cfg]) => {
        // EL EMEĞİ = wages_earned - advances
        let wagesEarned = 0;
        if (cfg.isPartner && cfg.wage > 0) {
          const workedDays = barberDays[name]?.size || 0;
          wagesEarned = workedDays * cfg.wage;
        }
        // Credit wages from employees who credit to this partner
        Object.entries(partnerConfig)
          .filter(([, c]) => c.creditTo === name)
          .forEach(([empName, empCfg]) => {
            const empDays = barberDays[empName]?.size || 0;
            wagesEarned += empDays * empCfg.wage;
          });

        const advances = payments
          .filter(p => {
            const d = paymentToDate(p.date);
            return d && monthKey(d) === mk && normalizeName(p.barberName) === normalizeName(name);
          })
          .reduce((s, p) => s + parseFloat(p.amount || 0), 0);

        const elEmegi   = wagesEarned - advances;
        const hisseden  = (cfg.share / 100) * companyNetPL;
        const netDurum  = elEmegi + hisseden;

        partners[name] = {
          wagesEarned, advances, elEmegi,
          hisseden, netDurum, share: cfg.share,
          workedDays: barberDays[name]?.size || 0,
          revenue: barberRev[name] || 0,
        };
      });

      return {
        mk, label: MONTH_NAMES[mm - 1] + ' ' + my,
        grossRev, cashExp, bankExp, netRevenue, totalWages, fixedCostTotal, companyNetPL,
        shopDays, partners,
      };
    });
  }, [bookings, barbers, expenses, payments, partnerConfig, fixedDailyRate]);

  const selectedMonthPartnership = useMemo(() =>
    partnershipByMonth.find(r => r.mk === selectedMonth),
  [partnershipByMonth, selectedMonth]);

  // Cumulative NET DURUM per partner
  const cumulativeByPartner = useMemo(() => {
    const cum = {};
    for (const row of partnershipByMonth) {
      for (const [name, p] of Object.entries(row.partners)) {
        cum[name] = (cum[name] || 0) + p.netDurum;
      }
    }
    return cum;
  }, [partnershipByMonth]);

  // Payment rows
  const paymentRows = useMemo(() =>
    payments
      .map(p => ({ ...p, __date: paymentToDate(p.date) }))
      .filter(p => p.__date)
      .filter(p => paymentMonthMode === 'all' ? true : monthKey(p.__date) === selectedMonth)
      .filter(p => paymentBarberFilter === 'all' ? true : normalizeName(p.barberName) === normalizeName(paymentBarberFilter))
      .sort((a, b) => b.__date.getTime() - a.__date.getTime()),
  [payments, selectedMonth, paymentMonthMode, paymentBarberFilter]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const saveExpense = async dk => {
    setExpenseSaving(true);
    try {
      const data = {
        date: dk, month: dk.slice(0, 7),
        cashExpense: parseFloat(expenseDraft.cashExpense) || 0,
        bankExpense: parseFloat(expenseDraft.bankExpense) || 0,
        notes: String(expenseDraft.notes || '').trim(),
      };
      const existing = expenses[dk];
      if (existing?.id) {
        await updateDoc(doc(db, `tenants/${TENANT}/finance_expenses`, existing.id), data);
      } else {
        const ref = await addDoc(collection(db, `tenants/${TENANT}/finance_expenses`), data);
        data.id = ref.id;
      }
      setExpenses(prev => ({ ...prev, [dk]: { ...data } }));
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
        date: Timestamp.fromDate(dateObj),
        barberName: payForm.barberName, amount: parseFloat(payForm.amount),
        method: payForm.method, notes: payForm.notes || '',
      };
      const ref = await addDoc(collection(db, `tenants/${TENANT}/finance_payments`), docData);
      setPayments(prev => [{ id: ref.id, sourceType: 'finance_payments', ...docData }, ...prev]);
      setPayForm({ date: '', barberName: '', amount: '', method: 'Cash', notes: '' });
    } catch (e) { console.error(e); }
    setPayLoading(false);
  };

  const deletePayment = async payment => {
    if (!window.confirm('Delete this payment record?')) return;
    const col = payment.sourceType === 'advances' ? 'advances' : 'finance_payments';
    await deleteDoc(doc(db, `tenants/${TENANT}/${col}`, payment.id));
    setPayments(prev => prev.filter(p => !(p.id === payment.id && p.sourceType === payment.sourceType)));
  };

  const saveSettings = () => {
    if (!settingsDraft) return;
    setPartnerConfig(settingsDraft.partnerConfig);
    setFixedDailyRate(settingsDraft.fixedDailyRate);
    localStorage.setItem('partnerConfig', JSON.stringify(settingsDraft.partnerConfig));
    localStorage.setItem('financeFixedRate', String(settingsDraft.fixedDailyRate));
    setShowSettings(false);
  };

  const openSettings = () => {
    setSettingsDraft({ partnerConfig: JSON.parse(JSON.stringify(partnerConfig)), fixedDailyRate });
    setShowSettings(true);
  };

  // ── Tab button style ──────────────────────────────────────────────────────
  const tabBtn = id => ({
    padding: '8px 18px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '700',
    letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer', border: '1px solid var(--border)',
    background: activeTab === id ? 'linear-gradient(135deg,#d4af37,#b8860b)' : 'var(--card)',
    color: activeTab === id ? '#000' : 'var(--muted)', transition: 'all 0.2s',
  });

  const subBtn = (cur, id, label) => (
    <button key={id} onClick={() => setSummaryView(id)} style={{
      padding: '7px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
      fontSize: '0.7rem', fontWeight: '700', letterSpacing: '1px',
      background: cur === id ? 'linear-gradient(135deg,#d4af37,#b8860b)' : 'var(--card)',
      color: cur === id ? '#000' : 'var(--muted)',
    }}>{label}</button>
  );

  const partnerNames = Object.keys(partnerConfig).filter(n => partnerConfig[n].isPartner);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: '1500px', margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', letterSpacing: '2px', color: '#d4af37' }}>FINANCE</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--muted)', letterSpacing: '1px' }}>
            {MONTH_NAMES[month]} {year} · Revenue / Expenses / Partnership
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
            style={{ ...inp, width: 'auto', colorScheme: 'dark', padding: '7px 12px', opacity: monthMode === 'all' ? 0.5 : 1 }}
            disabled={monthMode === 'all'} />
          <select value={monthMode} onChange={e => setMonthMode(e.target.value)}
            style={{ ...inp, width: 'auto', minWidth: '130px', padding: '7px 10px' }}>
            <option value="selected">This Month</option>
            <option value="all">All Months</option>
          </select>
          <button onClick={openSettings}
            style={{ padding: '8px 14px', background: showSettings ? 'rgba(212,175,55,0.15)' : 'var(--card2)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', color: showSettings ? '#d4af37' : 'var(--muted)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: '600' }}>
            ⚙ Settings
          </button>
        </div>
      </div>

      {/* ── Settings panel ── */}
      {showSettings && settingsDraft && (
        <div style={{ ...card, padding: '20px', marginBottom: '20px' }}>
          <div style={{ fontSize: '0.65rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px', marginBottom: '16px' }}>PARTNERSHIP SETTINGS</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', minWidth: '600px', width: '100%' }}>
              <thead>
                <tr>
                  {['Name','Share %','Wage £/day','Is Partner','Credits To'].map(h => (
                    <th key={h} style={{ ...thS, textAlign: 'left', padding: '6px 12px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(settingsDraft.partnerConfig).map(([name, cfg]) => (
                  <tr key={name} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 12px', color: BARBER_COLORS[name] || '#d4af37', fontWeight: '700', fontSize: '0.82rem' }}>{name}</td>
                    <td style={{ padding: '6px 12px' }}>
                      <input type="number" value={cfg.share} min="0" max="100"
                        onChange={e => setSettingsDraft(d => ({ ...d, partnerConfig: { ...d.partnerConfig, [name]: { ...d.partnerConfig[name], share: parseFloat(e.target.value) || 0 } } }))}
                        style={{ ...inp, width: '70px', padding: '5px 8px', fontSize: '0.78rem' }} />
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <input type="number" value={cfg.wage} min="0"
                        onChange={e => setSettingsDraft(d => ({ ...d, partnerConfig: { ...d.partnerConfig, [name]: { ...d.partnerConfig[name], wage: parseFloat(e.target.value) || 0 } } }))}
                        style={{ ...inp, width: '70px', padding: '5px 8px', fontSize: '0.78rem' }} />
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <input type="checkbox" checked={cfg.isPartner}
                        onChange={e => setSettingsDraft(d => ({ ...d, partnerConfig: { ...d.partnerConfig, [name]: { ...d.partnerConfig[name], isPartner: e.target.checked } } }))} />
                    </td>
                    <td style={{ padding: '6px 12px', fontSize: '0.78rem', color: 'var(--muted)' }}>{cfg.creditTo || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '14px', flexWrap: 'wrap' }}>
            <div>
              <label style={lbl}>Fixed Daily Cost (£/day when shop is open)</label>
              <input type="number" value={settingsDraft.fixedDailyRate} min="0"
                onChange={e => setSettingsDraft(d => ({ ...d, fixedDailyRate: parseFloat(e.target.value) || 0 }))}
                style={{ ...inp, width: '100px' }} />
            </div>
            <button onClick={saveSettings}
              style={{ padding: '9px 22px', background: 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '8px', color: '#000', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer', marginTop: '18px' }}>
              Save
            </button>
            <button onClick={() => setShowSettings(false)}
              style={{ padding: '9px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', fontSize: '0.78rem', cursor: 'pointer', marginTop: '18px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Gross Revenue',  value: '£' + monthlyTotals.grossRevenue.toFixed(0), color: '#d4af37' },
          { label: 'Net Revenue',    value: '£' + monthlyTotals.netRevenue.toFixed(0),   color: '#9c27b0' },
          { label: 'Cash Expenses',  value: '£' + monthlyTotals.cashExpense.toFixed(0),  color: '#ff7043' },
          { label: 'Bank Expenses',  value: '£' + monthlyTotals.bankExpense.toFixed(0),  color: '#ff7043' },
          { label: 'Total Wages',    value: '£' + monthlyTotals.totalWages.toFixed(0),   color: '#4caf50' },
          { label: 'Fixed Cost',     value: '£' + monthlyTotals.fixedCost.toFixed(0),    color: '#78909c' },
          { label: 'Net P&L',        value: (monthlyTotals.netPL >= 0 ? '+' : '') + '£' + monthlyTotals.netPL.toFixed(0), color: monthlyTotals.netPL >= 0 ? '#4caf50' : '#ff5252' },
        ].map(c => (
          <div key={c.label} style={{ ...card, padding: '14px 16px' }}>
            <div style={{ fontSize: '0.58rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>{c.label}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: '800', color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button style={tabBtn('daily')}    onClick={() => setActiveTab('daily')}>Daily Ledger</button>
        <button style={tabBtn('payments')} onClick={() => setActiveTab('payments')}>Payments</button>
        <button style={tabBtn('summary')}  onClick={() => setActiveTab('summary')}>Monthly Summary</button>
        <button style={tabBtn('overview')} onClick={() => setActiveTab('overview')}>Overview</button>
        {activeTab === 'daily' && (
          <button onClick={() => setShowEmptyDays(v => !v)}
            style={{ ...tabBtn('empty'), background: 'var(--card2)', color: showEmptyDays ? '#d4af37' : 'var(--muted)', border: `1px solid ${showEmptyDays ? 'rgba(212,175,55,0.35)' : 'var(--border)'}` }}>
            {showEmptyDays ? 'Empty Days: On' : 'Empty Days: Off'}
          </button>
        )}
      </div>

      {/* Daily range selector */}
      {!loading && activeTab === 'daily' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={dailyRangeMode} onChange={e => setDailyRangeMode(e.target.value)}
            style={{ ...inp, width: 'auto', minWidth: '110px', padding: '7px 10px' }}>
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
              style={{ ...inp, width: 'auto', colorScheme: 'dark', padding: '7px 10px' }} />
          )}
          {dailyRangeMode === 'week' && (
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
              {startOfWeek(selectedDay).toLocaleDateString('en-GB')} – {endOfWeek(selectedDay).toLocaleDateString('en-GB')}
            </span>
          )}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '60px', fontSize: '0.8rem', letterSpacing: '1px' }}>Loading...</div>}

      {/* ══════════════════════════════════════════════════════════════════════
          DAILY LEDGER
          ══════════════════════════════════════════════════════════════════ */}
      {!loading && activeTab === 'daily' && (
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1100px' }}>
              <thead>
                <tr style={{ background: 'rgba(212,175,55,0.07)' }}>
                  <th style={{ ...thS, textAlign: 'left', minWidth: '75px' }}>Date</th>
                  {barbers.map(b => (
                    <React.Fragment key={b.name}>
                      <th style={{ ...thS, color: b.color || BARBER_COLORS[b.name] }}>{b.name}<br/>Cash</th>
                      <th style={{ ...thS, color: b.color || BARBER_COLORS[b.name], opacity: 0.75 }}>{b.name}<br/>Card</th>
                    </React.Fragment>
                  ))}
                  <th style={{ ...thS, color: '#ff7043' }}>Cash<br/>Exp.</th>
                  <th style={{ ...thS, color: '#ff7043' }}>Bank<br/>Exp.</th>
                  <th style={{ ...thS, textAlign: 'left', minWidth: '150px' }}>Notes</th>
                  <th style={{ ...thS, color: '#d4af37' }}>Gross</th>
                  <th style={{ ...thS, color: '#9c27b0' }}>Net Rev.</th>
                  <th style={{ ...thS, color: 'var(--muted)' }}>Wages</th>
                  <th style={{ ...thS, color: monthlyTotals.netPL >= 0 ? '#4caf50' : '#ff5252' }}>Net P&L</th>
                </tr>
              </thead>
              <tbody>
                {visibleDailyRows.map(row => {
                  const isEditing = editingExpense === row.dateKey;
                  return (
                    <tr key={row.dateKey} style={{ background: row.hasData ? 'rgba(212,175,55,0.015)' : 'transparent', opacity: row.hasData ? 1 : 0.4 }}>
                      <td style={{ ...tdS(), textAlign: 'left', fontWeight: '600', fontSize: '0.72rem' }}>
                        <span style={{ color: '#d4af37' }}>{String(row.day).padStart(2, '0')}</span>
                        <span style={{ color: 'var(--muted)', marginLeft: '4px', fontSize: '0.6rem' }}>{row.dayOfWeek}</span>
                      </td>

                      {barbers.map(b => {
                        const rev = row.barberRev[b.name] || { cash: 0, monzo: 0, card: 0 };
                        const cardTotal = rev.card + rev.monzo;
                        return (
                          <React.Fragment key={b.name}>
                            <td style={{ ...tdS(), color: rev.cash > 0 ? 'var(--text)' : 'var(--muted)' }}>
                              {rev.cash > 0 ? '£' + Math.round(rev.cash) : '–'}
                            </td>
                            <td style={{ ...tdS(), color: cardTotal > 0 ? 'var(--text)' : 'var(--muted)', fontSize: '0.72rem' }}>
                              {cardTotal > 0 ? '£' + Math.round(cardTotal) : '–'}
                              {rev.monzo > 0 && rev.card > 0 && <span style={{ fontSize: '0.55rem', color: 'var(--muted)', marginLeft: '2px' }}>m</span>}
                            </td>
                          </React.Fragment>
                        );
                      })}

                      {/* Cash Expense — click to edit */}
                      <td style={{ ...tdS(), color: '#ff7043', cursor: 'pointer' }}
                        onClick={() => { if (!isEditing) { setEditingExpense(row.dateKey); setExpenseDraft({ cashExpense: row.cashExpense || '', bankExpense: row.bankExpense || '', notes: row.expenseNotes || '' }); } }}>
                        {isEditing
                          ? <input type="number" value={expenseDraft.cashExpense}
                              onChange={e => setExpenseDraft(d => ({ ...d, cashExpense: e.target.value }))}
                              style={{ ...inp, width: '70px', padding: '4px 7px', fontSize: '0.75rem' }}
                              autoFocus onClick={e => e.stopPropagation()} />
                          : row.cashExpense > 0 ? '£' + Math.round(row.cashExpense) : <span style={{ color: 'var(--muted)', fontSize: '0.65rem' }}>+</span>
                        }
                      </td>

                      {/* Bank Expense — inline form when editing */}
                      <td style={{ ...tdS(), color: '#ff7043', cursor: 'pointer' }}
                        onClick={() => { if (!isEditing) { setEditingExpense(row.dateKey); setExpenseDraft({ cashExpense: row.cashExpense || '', bankExpense: row.bankExpense || '', notes: row.expenseNotes || '' }); } }}>
                        {isEditing
                          ? <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <input type="number" value={expenseDraft.bankExpense}
                                onChange={e => setExpenseDraft(d => ({ ...d, bankExpense: e.target.value }))}
                                style={{ ...inp, width: '70px', padding: '4px 7px', fontSize: '0.75rem' }}
                                onClick={e => e.stopPropagation()} />
                              <input type="text" value={expenseDraft.notes} placeholder="Notes"
                                onChange={e => setExpenseDraft(d => ({ ...d, notes: e.target.value }))}
                                style={{ ...inp, width: '140px', padding: '4px 7px', fontSize: '0.7rem' }}
                                onClick={e => e.stopPropagation()} />
                              <button onClick={e => { e.stopPropagation(); saveExpense(row.dateKey); }} disabled={expenseSaving}
                                style={{ padding: '4px 8px', background: '#d4af37', border: 'none', borderRadius: '5px', color: '#000', fontWeight: '700', fontSize: '0.65rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                {expenseSaving ? '...' : '✓ Save'}
                              </button>
                              <button onClick={e => { e.stopPropagation(); setEditingExpense(null); }}
                                style={{ padding: '4px 6px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--muted)', fontSize: '0.65rem', cursor: 'pointer' }}>✕</button>
                            </div>
                          : row.bankExpense > 0 ? '£' + Math.round(row.bankExpense) : <span style={{ color: 'var(--muted)', fontSize: '0.65rem' }}>+</span>
                        }
                      </td>

                      <td style={{ ...tdS(), textAlign: 'left', color: row.expenseNotes ? 'var(--text)' : 'var(--muted)', fontSize: '0.7rem' }}>
                        {row.expenseNotes || '–'}
                      </td>
                      <td style={tdS()}>{row.grossRevenue > 0 ? '£' + Math.round(row.grossRevenue) : '–'}</td>
                      <td style={{ ...tdS(), color: '#9c27b0', fontWeight: row.netRevenue > 0 ? '700' : '400' }}>{row.netRevenue > 0 ? '£' + Math.round(row.netRevenue) : '–'}</td>
                      <td style={{ ...tdS(), color: 'var(--muted)', fontSize: '0.68rem' }}>{row.totalWages > 0 ? '£' + Math.round(row.totalWages) : '–'}</td>
                      <td style={tdS(row.hasData ? (row.netPL >= 0 ? 'green' : 'red') : null)}>
                        {row.hasData ? (row.netPL >= 0 ? '+' : '') + '£' + Math.round(row.netPL) : '–'}
                      </td>
                    </tr>
                  );
                })}

                {/* Totals */}
                <tr style={{ background: 'rgba(212,175,55,0.08)', borderTop: '2px solid rgba(212,175,55,0.3)' }}>
                  <td style={{ ...tdS(), textAlign: 'left', fontWeight: '800', fontSize: '0.72rem', color: '#d4af37' }}>TOTAL</td>
                  {barbers.map(b => {
                    const cash  = visibleDailyRows.reduce((s, d) => s + (d.barberRev[b.name]?.cash  || 0), 0);
                    const card  = visibleDailyRows.reduce((s, d) => s + (d.barberRev[b.name]?.card  || 0), 0);
                    const monzo = visibleDailyRows.reduce((s, d) => s + (d.barberRev[b.name]?.monzo || 0), 0);
                    const col = b.color || BARBER_COLORS[b.name];
                    return (
                      <React.Fragment key={b.name}>
                        <td style={{ ...tdS(), fontWeight: '700', color: col }}>{cash > 0 ? '£' + Math.round(cash) : '–'}</td>
                        <td style={{ ...tdS(), fontWeight: '700', color: col }}>{(card + monzo) > 0 ? '£' + Math.round(card + monzo) : '–'}</td>
                      </React.Fragment>
                    );
                  })}
                  <td style={{ ...tdS(), fontWeight: '700', color: '#ff7043' }}>{fmt(visibleDailyRows.reduce((s, d) => s + d.cashExpense, 0))}</td>
                  <td style={{ ...tdS(), fontWeight: '700', color: '#ff7043' }}>{fmt(visibleDailyRows.reduce((s, d) => s + d.bankExpense, 0))}</td>
                  <td style={{ ...tdS(), textAlign: 'left', color: 'var(--muted)' }}>–</td>
                  <td style={{ ...tdS(), fontWeight: '800', color: '#d4af37' }}>£{Math.round(visibleDailyRows.reduce((s, d) => s + d.grossRevenue, 0))}</td>
                  <td style={{ ...tdS(), fontWeight: '800', color: '#9c27b0' }}>£{Math.round(visibleDailyRows.reduce((s, d) => s + d.netRevenue, 0))}</td>
                  <td style={{ ...tdS(), color: 'var(--muted)' }}>–</td>
                  <td style={{ ...tdS(visibleDailyRows.reduce((s, d) => s + d.netPL, 0) >= 0 ? 'green' : 'red'), fontWeight: '800' }}>
                    {(() => { const t = visibleDailyRows.reduce((s, d) => s + d.netPL, 0); return (t >= 0 ? '+' : '') + '£' + Math.round(t); })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(212,175,55,0.1)', fontSize: '0.6rem', color: 'var(--muted)' }}>
            Click any expense cell to edit. Card total includes Monzo (shown as "m"). Net P&L = Net Revenue – Wages – Fixed Cost (£{fixedDailyRate}/day).
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PAYMENTS / ADVANCES
          ══════════════════════════════════════════════════════════════════ */}
      {!loading && activeTab === 'payments' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', alignItems: 'start' }}>
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(212,175,55,0.1)', fontSize: '0.65rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px' }}>
              PAYMENTS & ADVANCES
            </div>
            <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <select value={paymentMonthMode} onChange={e => setPaymentMonthMode(e.target.value)} style={{ ...inp, width: 'auto', minWidth: '130px', padding: '6px 10px' }}>
                <option value="selected">This Month</option>
                <option value="all">All Time</option>
              </select>
              <select value={paymentBarberFilter} onChange={e => setPaymentBarberFilter(e.target.value)} style={{ ...inp, width: 'auto', minWidth: '130px', padding: '6px 10px' }}>
                <option value="all">All Barbers</option>
                {barbers.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </div>
            {paymentRows.length === 0
              ? <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem' }}>No payments match the current filter.</div>
              : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(212,175,55,0.05)' }}>
                      {['Date','Barber','Amount','Method','Source','Notes',''].map(h => (
                        <th key={h} style={{ ...thS, textAlign: 'left', padding: '8px 14px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paymentRows.map(p => {
                      const barber = barbers.find(b => normalizeName(b.name) === normalizeName(p.barberName));
                      const bColor = barber?.color || BARBER_COLORS[p.barberName] || '#d4af37';
                      return (
                        <tr key={p.id + p.sourceType} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', fontSize: '0.75rem' }}>{p.__date.toLocaleDateString('en-GB')}</td>
                          <td style={{ padding: '10px 14px', fontSize: '0.75rem', color: bColor, fontWeight: '600' }}>{p.barberName}</td>
                          <td style={{ padding: '10px 14px', fontSize: '0.82rem', fontWeight: '700', color: '#ff7043' }}>£{Math.round(parseFloat(p.amount || 0))}</td>
                          <td style={{ padding: '10px 14px', fontSize: '0.72rem', color: 'var(--muted)' }}>{p.method}</td>
                          <td style={{ padding: '10px 14px', fontSize: '0.65rem', color: 'var(--muted)' }}>{p.sourceType === 'advances' ? 'imported' : 'manual'}</td>
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

      {/* ══════════════════════════════════════════════════════════════════════
          MONTHLY SUMMARY
          ══════════════════════════════════════════════════════════════════ */}
      {!loading && activeTab === 'summary' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {subBtn(summaryView, 'partnership', 'Partnership')}
            {subBtn(summaryView, 'pnl', 'P&L Breakdown')}
          </div>

          {/* Partnership accounting — EL EMEĞİ / HİSSEDEN / NET DURUM */}
          {summaryView === 'partnership' && (
            <div style={{ display: 'grid', gap: '16px' }}>
              {/* Company P&L row */}
              {selectedMonthPartnership && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                  {[
                    { label: 'Gross Revenue',    value: '£' + Math.round(selectedMonthPartnership.grossRev),       color: '#d4af37' },
                    { label: 'Cash Expenses',    value: selectedMonthPartnership.cashExp > 0 ? '−£' + Math.round(selectedMonthPartnership.cashExp) : '–', color: '#ff7043' },
                    { label: 'Bank Expenses',    value: selectedMonthPartnership.bankExp > 0 ? '−£' + Math.round(selectedMonthPartnership.bankExp) : '–', color: '#ff7043' },
                    { label: 'Total Wages',      value: '£' + Math.round(selectedMonthPartnership.totalWages),     color: '#4caf50' },
                    { label: 'Fixed Cost',       value: '£' + Math.round(selectedMonthPartnership.fixedCostTotal), color: '#78909c' },
                    { label: 'Shop Days Open',   value: selectedMonthPartnership.shopDays + ' days',               color: '#78909c' },
                    { label: 'Company Net P&L',  value: (selectedMonthPartnership.companyNetPL >= 0 ? '+' : '') + '£' + Math.round(selectedMonthPartnership.companyNetPL), color: selectedMonthPartnership.companyNetPL >= 0 ? '#4caf50' : '#ff5252' },
                  ].map(c => (
                    <div key={c.label} style={{ ...card, padding: '12px 14px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.57rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '5px' }}>{c.label}</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: '800', color: c.color }}>{c.value}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ ...card, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(212,175,55,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px' }}>
                    PARTNERSHIP ACCOUNTING — {MONTH_NAMES[month].toUpperCase()} {year}
                  </span>
                </div>
                {!selectedMonthPartnership
                  ? <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem' }}>No data for this month.</div>
                  : <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                        <thead>
                          <tr style={{ background: 'rgba(212,175,55,0.06)' }}>
                            <th style={{ ...thS, textAlign: 'left' }}>Partner</th>
                            <th style={thS}>Share</th>
                            <th style={{ ...thS, color: 'var(--muted)' }}>Days</th>
                            <th style={{ ...thS, color: '#4caf50' }}>Wages Earned</th>
                            <th style={{ ...thS, color: '#ff7043' }}>Advances</th>
                            <th style={{ ...thS, color: '#2196f3' }}>EL EMEĞİ<br/><span style={{ fontSize: '0.5rem', letterSpacing: '0' }}>Wages – Advances</span></th>
                            <th style={{ ...thS, color: '#9c27b0' }}>HİSSEDEN<br/><span style={{ fontSize: '0.5rem', letterSpacing: '0' }}>Share × NetPL</span></th>
                            <th style={{ ...thS, color: '#d4af37', minWidth: '90px' }}>NET DURUM<br/><span style={{ fontSize: '0.5rem', letterSpacing: '0' }}>EL + HİSSE</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {partnerNames.map(name => {
                            const p = selectedMonthPartnership.partners[name];
                            if (!p) return null;
                            const col = BARBER_COLORS[name] || '#d4af37';
                            return (
                              <tr key={name} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ ...tdS(), textAlign: 'left', fontWeight: '700', color: col }}>{name}</td>
                                <td style={{ ...tdS(), fontSize: '0.7rem', color: 'var(--muted)' }}>{p.share}%</td>
                                <td style={tdS()}>{p.workedDays || '–'}</td>
                                <td style={{ ...tdS(), color: '#4caf50' }}>{p.wagesEarned > 0 ? fmt(p.wagesEarned) : '–'}</td>
                                <td style={{ ...tdS(), color: '#ff7043' }}>{p.advances > 0 ? fmt(p.advances) : '–'}</td>
                                <td style={{ ...tdS(), color: '#2196f3', fontWeight: '700' }}>{fmtSigned(p.elEmegi)}</td>
                                <td style={{ ...tdS(), color: p.hisseden >= 0 ? '#9c27b0' : '#ff5252', fontWeight: '700' }}>{fmtSigned(p.hisseden)}</td>
                                <td style={{ ...tdS(p.netDurum >= 0 ? 'green' : 'red'), fontWeight: '800', fontSize: '0.82rem' }}>{fmtSigned(p.netDurum)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                }
              </div>

              {/* Employee wages note */}
              {selectedMonthPartnership && (
                <div style={{ ...card, padding: '12px 16px', border: '1px solid var(--border)', fontSize: '0.68rem', color: 'var(--muted)' }}>
                  <span style={{ color: '#b39ddb', fontWeight: '700' }}>Tuncay</span> earns wages via employees:{' '}
                  {Object.entries(partnerConfig).filter(([, c]) => c.creditTo === 'Tuncay').map(([n, c]) => `${n} (£${c.wage}/day)`).join(', ')}.
                  Company Net P&L = Net Revenue – All Wages – Fixed Cost (£{fixedDailyRate}×{selectedMonthPartnership.shopDays} days).
                </div>
              )}
            </div>
          )}

          {/* P&L Breakdown */}
          {summaryView === 'pnl' && (
            <div style={{ display: 'grid', gap: '16px' }}>
              {/* Barber revenue breakdown */}
              <div style={{ ...card, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(212,175,55,0.1)', fontSize: '0.65rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px' }}>
                  BARBER REVENUE — {MONTH_NAMES[month].toUpperCase()} {year}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                    <thead>
                      <tr style={{ background: 'rgba(212,175,55,0.06)' }}>
                        <th style={{ ...thS, textAlign: 'left' }}>Barber</th>
                        <th style={thS}>Days</th>
                        <th style={thS}>Cash</th>
                        <th style={thS}>Card+Monzo</th>
                        <th style={thS}>Total Revenue</th>
                        <th style={{ ...thS, color: '#4caf50' }}>Wages</th>
                      </tr>
                    </thead>
                    <tbody>
                      {barbers.map(b => {
                        const bBk = bookings.filter(bk => isWalkInBooking(bk) && bk.barber === b.name && String(bk.dateKey || '').startsWith(selectedMonth));
                        const workedDays = new Set(bBk.map(bk => bk.dateKey)).size;
                        const cash  = bBk.filter(bk => paymentMethod(bk) === 'CASH').reduce((s, bk) => s + effectiveRevenue(bk), 0);
                        const card  = bBk.filter(bk => paymentMethod(bk) !== 'CASH').reduce((s, bk) => s + effectiveRevenue(bk), 0);
                        const wages = workedDays * (partnerConfig[b.name]?.wage ?? 100);
                        const col   = b.color || BARBER_COLORS[b.name];
                        return (
                          <tr key={b.name} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ ...tdS(), textAlign: 'left', fontWeight: '700', color: col }}>{b.name}</td>
                            <td style={tdS()}>{workedDays || '–'}</td>
                            <td style={tdS()}>{cash > 0 ? fmt(cash) : '–'}</td>
                            <td style={tdS()}>{card > 0 ? fmt(card) : '–'}</td>
                            <td style={{ ...tdS(), fontWeight: '700' }}>{(cash + card) > 0 ? fmt(cash + card) : '–'}</td>
                            <td style={{ ...tdS(), color: '#4caf50' }}>{wages > 0 ? fmt(wages) : '–'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Monthly P&L */}
              <div style={{ ...card, border: '1px solid rgba(255,112,67,0.2)', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,112,67,0.15)', fontSize: '0.65rem', color: '#ff7043', fontWeight: '700', letterSpacing: '2px' }}>
                  P&L STATEMENT — {MONTH_NAMES[month].toUpperCase()} {year}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                    <tbody>
                      {[
                        { label: 'Gross Revenue',    value: monthlyTotals.grossRevenue, color: '#d4af37', bold: true },
                        { label: '  Cash Expenses',  value: -monthlyTotals.cashExpense, color: '#ff7043' },
                        { label: '  Bank Expenses',  value: -monthlyTotals.bankExpense, color: '#ff7043' },
                        { label: 'Net Revenue',       value: monthlyTotals.netRevenue,   color: '#9c27b0', bold: true, border: true },
                        { label: '  Wages',           value: -monthlyTotals.totalWages,  color: '#4caf50' },
                        { label: '  Fixed Cost',      value: -monthlyTotals.fixedCost,   color: '#78909c' },
                        { label: 'Net P&L',           value: monthlyTotals.netPL,        color: monthlyTotals.netPL >= 0 ? '#4caf50' : '#ff5252', bold: true, border: true },
                      ].map(r => (
                        <tr key={r.label} style={{ borderBottom: r.border ? '2px solid rgba(212,175,55,0.25)' : '1px solid var(--border)', background: r.bold ? 'rgba(212,175,55,0.04)' : 'transparent' }}>
                          <td style={{ padding: '10px 16px', fontSize: r.bold ? '0.8rem' : '0.75rem', fontWeight: r.bold ? '700' : '400', color: 'var(--text)', minWidth: '200px' }}>{r.label}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: r.bold ? '800' : '500', color: r.color, fontSize: r.bold ? '0.88rem' : '0.78rem' }}>
                            {r.value < 0 ? '–£' + Math.round(Math.abs(r.value)) : '£' + Math.round(r.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          OVERVIEW — GENELTABLO (multi-month matrix + initial investment)
          ══════════════════════════════════════════════════════════════════ */}
      {!loading && activeTab === 'overview' && (
        <div style={{ display: 'grid', gap: '20px' }}>

          {/* Multi-month NET DURUM matrix */}
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(212,175,55,0.1)', fontSize: '0.65rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px' }}>
              GENERAL OVERVIEW — NET POSITION PER PARTNER
            </div>
            {partnershipByMonth.length === 0
              ? <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem' }}>No data yet.</div>
              : <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                    <thead>
                      <tr style={{ background: 'rgba(212,175,55,0.06)' }}>
                        <th style={{ ...thS, textAlign: 'left', minWidth: '130px' }}>Month</th>
                        {partnerNames.map(n => (
                          <React.Fragment key={n}>
                            <th style={{ ...thS, color: BARBER_COLORS[n] || '#d4af37' }}>{n}<br/>NET DURUM</th>
                          </React.Fragment>
                        ))}
                        <th style={{ ...thS, color: '#78909c' }}>Net P&L</th>
                        <th style={{ ...thS, color: '#9c27b0' }}>Net Rev.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {partnershipByMonth.map(row => (
                        <tr key={row.mk} style={{ borderBottom: '1px solid var(--border)', background: row.mk === selectedMonth ? 'rgba(212,175,55,0.04)' : 'transparent' }}>
                          <td style={{ ...tdS(), textAlign: 'left', fontWeight: row.mk === selectedMonth ? '700' : '400', color: row.mk === selectedMonth ? '#d4af37' : 'var(--text)', fontSize: '0.78rem' }}>
                            {row.label}
                          </td>
                          {partnerNames.map(n => {
                            const p = row.partners[n];
                            if (!p) return <td key={n} style={tdS()}>–</td>;
                            return (
                              <td key={n} style={{ ...tdS(p.netDurum >= 0 ? 'green' : 'red'), fontWeight: '700' }}>
                                {fmtSigned(p.netDurum)}
                              </td>
                            );
                          })}
                          <td style={{ ...tdS(row.companyNetPL >= 0 ? 'green' : 'red'), fontWeight: '700' }}>
                            {fmtSigned(row.companyNetPL)}
                          </td>
                          <td style={{ ...tdS(), color: '#9c27b0' }}>{fmt(row.netRevenue)}</td>
                        </tr>
                      ))}

                      {/* Cumulative totals */}
                      <tr style={{ background: 'rgba(212,175,55,0.1)', borderTop: '2px solid rgba(212,175,55,0.3)' }}>
                        <td style={{ ...tdS(), textAlign: 'left', fontWeight: '800', color: '#d4af37', fontSize: '0.72rem' }}>CUMULATIVE</td>
                        {partnerNames.map(n => (
                          <td key={n} style={{ ...tdS((cumulativeByPartner[n] || 0) >= 0 ? 'green' : 'red'), fontWeight: '800', fontSize: '0.82rem' }}>
                            {fmtSigned(cumulativeByPartner[n] || 0)}
                          </td>
                        ))}
                        <td style={{ ...tdS(partnershipByMonth.reduce((s, r) => s + r.companyNetPL, 0) >= 0 ? 'green' : 'red'), fontWeight: '800' }}>
                          {fmtSigned(partnershipByMonth.reduce((s, r) => s + r.companyNetPL, 0))}
                        </td>
                        <td style={{ ...tdS(), fontWeight: '800', color: '#9c27b0' }}>
                          {fmt(partnershipByMonth.reduce((s, r) => s + r.netRevenue, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
            }
          </div>

          {/* Company Net P&L per month — mini chart style */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            {partnershipByMonth.map(row => (
              <div key={row.mk} style={{ ...card, padding: '12px 14px', border: `1px solid ${row.companyNetPL >= 0 ? 'rgba(76,175,80,0.2)' : 'rgba(255,82,82,0.2)'}` }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginBottom: '4px' }}>{row.label}</div>
                <div style={{ fontSize: '1rem', fontWeight: '800', color: row.companyNetPL >= 0 ? '#4caf50' : '#ff5252' }}>
                  {fmtSigned(row.companyNetPL)}
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginTop: '3px' }}>{row.shopDays} shop days</div>
              </div>
            ))}
          </div>

          {/* Initial Investment table */}
          <div style={{ ...card, border: '1px solid rgba(126,87,194,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(126,87,194,0.2)', fontSize: '0.65rem', color: '#b39ddb', fontWeight: '700', letterSpacing: '2px' }}>
              INITIAL INVESTMENT — SETUP
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                <thead>
                  <tr style={{ background: 'rgba(126,87,194,0.06)' }}>
                    {['Partner','Share','Amount Paid','Required*','Balance'].map(h => (
                      <th key={h} style={{ ...thS, textAlign: 'left', padding: '8px 16px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {INITIAL_INVESTMENT.map(r => {
                    const required = INITIAL_TOTAL * (r.share / 100);
                    const balance  = r.paid - required;
                    return (
                      <tr key={r.name} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 16px', fontSize: '0.82rem', fontWeight: '700', color: BARBER_COLORS[r.name] || '#b39ddb' }}>{r.name}</td>
                        <td style={{ padding: '10px 16px', fontSize: '0.78rem', color: 'var(--muted)' }}>{r.share}%</td>
                        <td style={{ padding: '10px 16px', fontSize: '0.82rem', fontWeight: '700', color: '#b39ddb' }}>£{r.paid.toLocaleString()}</td>
                        <td style={{ padding: '10px 16px', fontSize: '0.78rem', color: 'var(--muted)' }}>£{Math.round(required).toLocaleString()}</td>
                        <td style={{ padding: '10px 16px', fontSize: '0.8rem', fontWeight: '700', color: balance >= 0 ? '#4caf50' : '#ff5252' }}>
                          {balance >= 0 ? '+' : ''}£{Math.round(balance).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: 'rgba(126,87,194,0.08)', borderTop: '2px solid rgba(126,87,194,0.25)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: '800', color: '#b39ddb', fontSize: '0.78rem' }}>TOTAL</td>
                    <td style={{ padding: '10px 16px', fontWeight: '700', color: '#b39ddb', fontSize: '0.78rem' }}>100%</td>
                    <td style={{ padding: '10px 16px', fontWeight: '800', color: '#b39ddb', fontSize: '0.88rem' }}>£{INITIAL_TOTAL.toLocaleString()}</td>
                    <td colSpan={2} style={{ padding: '10px 16px', fontSize: '0.7rem', color: 'var(--muted)' }}>
                      * Required = Total Pool × Share%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
