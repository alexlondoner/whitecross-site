import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, getDoc, setDoc, query, Timestamp, orderBy,
} from 'firebase/firestore';
import { updateTipStatus } from '../firestoreActions';

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
  // Tips are personal to the barber — never counted as company revenue
  const tip = parsePrice(b.tip);
  if (b.status === 'CHECKED_OUT') {
    const paid = parsePrice(b.paidAmount);
    if (paid > 0) return Math.max(0, paid - tip);
  }
  const p = parsePrice(b.price);
  if (p > 0) return p;
  return Math.max(0, parsePrice(b.paidAmount) - tip);
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

function soldProductsTotal(b) {
  const list = Array.isArray(b?.soldProducts) ? b.soldProducts : [];
  return list.reduce((s, p) => s + parsePrice(p?.price) * (parseInt(p?.qty, 10) || 0), 0);
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
  const [paymentFilter, setPaymentFilter] = useState('all'); // all | cash | card

  const [partnerConfig, setPartnerConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem('partnerConfig') || 'null') || PARTNER_CONFIG_DEFAULT; }
    catch { return PARTNER_CONFIG_DEFAULT; }
  });
  const [fixedDailyRate, setFixedDailyRate] = useState(() =>
    parseFloat(localStorage.getItem('financeFixedRate') || String(FIXED_DAILY_COST_DEFAULT))
  );
  const [showSettings, setShowSettings] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [tipSettings, setTipSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('financeTipSettings') || 'null') || { tipsToIndividual: true, cardTipMethod: 'till_cash' }; }
    catch { return { tipsToIndividual: true, cardTipMethod: 'till_cash' }; }
  });

  const [payForm, setPayForm] = useState({ date: '', barberName: '', amount: '', method: 'Cash', notes: '' });
  const [payLoading, setPayLoading] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ date: '', cashExpense: '', bankExpense: '', notes: '' });
  const [expenseFormSaving, setExpenseFormSaving] = useState(false);
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

  // Load finance config from Firestore (overrides localStorage if found)
  useEffect(() => {
    const loadFinanceConfig = async () => {
      try {
        const snap = await getDoc(doc(db, `tenants/${TENANT}/settings`, 'finance_config'));
        if (snap.exists()) {
          const data = snap.data();
          if (data.partnerConfig) {
            setPartnerConfig(data.partnerConfig);
            localStorage.setItem('partnerConfig', JSON.stringify(data.partnerConfig));
          }
          if (data.fixedDailyRate !== undefined) {
            setFixedDailyRate(parseFloat(data.fixedDailyRate) || FIXED_DAILY_COST_DEFAULT);
            localStorage.setItem('financeFixedRate', String(data.fixedDailyRate));
          }
          if (data.tipSettings) {
            setTipSettings(data.tipSettings);
            localStorage.setItem('financeTipSettings', JSON.stringify(data.tipSettings));
          }
        }
      } catch {}
    };
    loadFinanceConfig();
  }, []);

  // ── Daily rows ────────────────────────────────────────────────────────────
  const dailyData = useMemo(() => {
    const inScope = dk => monthMode === 'all' || String(dk || '').startsWith(selectedMonth);
    const realBarberSet = new Set(barbers.filter(b => b._isReal).map(b => normalizeName(b.name)));
    const scopedBk = bookings.filter(b => {
      if (!b.dateKey || !inScope(b.dateKey)) return false;
      if (paymentFilter === 'cash') return paymentMethod(b) === 'CASH';
      if (paymentFilter === 'card') return paymentMethod(b) !== 'CASH';
      return true;
    });
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

      const barberRev  = {};
      const barberTips = {};
      barbers.forEach(b => {
        barberRev[b.name]  = { cash: 0, monzo: 0, card: 0 };
        barberTips[b.name] = { cash: 0, monzo: 0, card: 0 };
      });
      // Revenue: only CHECKED_OUT bookings; wages: all non-cancelled (worked)
      const workedNames = new Set();
      dayBk.forEach(b => {
        const name = b.barber;
        workedNames.add(name);
        if (b.status !== 'CHECKED_OUT') return;
        if (!barberRev[name])  barberRev[name]  = { cash: 0, monzo: 0, card: 0 };
        if (!barberTips[name]) barberTips[name] = { cash: 0, monzo: 0, card: 0 };
        const rev = effectiveRevenue(b);
        const tip = parsePrice(b.tip);
        const pm2 = paymentMethod(b);
        if (pm2 === 'CASH') { barberRev[name].cash += rev; if (tip) barberTips[name].cash += tip; }
        else if (pm2 === 'MONZO') { barberRev[name].monzo += rev; if (tip) barberTips[name].monzo += tip; }
        else { barberRev[name].card += rev; if (tip) barberTips[name].card += tip; }
      });
      // Card/monzo tips need to be reimbursed to the barber from the till
      const tillTipPayout = tipSettings.tipsToIndividual && tipSettings.cardTipMethod === 'till_cash'
        ? Object.values(barberTips).reduce((s, t) => s + t.card + t.monzo, 0)
        : 0;
      const totalTipsDay = Object.values(barberTips).reduce((s, t) => s + t.cash + t.card + t.monzo, 0);

      const grossRevenue = Object.values(barberRev).reduce((s, v) => s + v.cash + v.monzo + v.card, 0);
      let productRev = 0;
      dayBk.forEach(b => { if (b.status === 'CHECKED_OUT') productRev += soldProductsTotal(b); });
      const serviceRev = Math.max(0, grossRevenue - productRev);
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
        barberRev, barberTips, cashExpense, bankExpense, expenseNotes: String(exp.notes || '').trim(),
        grossRevenue, serviceRev, productRev, netRevenue, totalWages, fixedCost, netPL,
        tillTipPayout, totalTipsDay,
        hasData: grossRevenue > 0 || cashExpense > 0 || bankExpense > 0 || !!String(exp.notes || '').trim(),
        exp,
      };
    });
  }, [bookings, barbers, expenses, partnerConfig, fixedDailyRate, year, month, selectedMonth, monthMode, paymentFilter]);

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
    grossRevenue:   dailyData.reduce((s, d) => s + d.grossRevenue,   0),
    serviceRevenue: dailyData.reduce((s, d) => s + d.serviceRev,     0),
    productRevenue: dailyData.reduce((s, d) => s + d.productRev,     0),
    netRevenue:     dailyData.reduce((s, d) => s + d.netRevenue,     0),
    cashExpense:    dailyData.reduce((s, d) => s + d.cashExpense,    0),
    bankExpense:    dailyData.reduce((s, d) => s + d.bankExpense,    0),
    totalWages:     dailyData.reduce((s, d) => s + d.totalWages,     0),
    fixedCost:      dailyData.reduce((s, d) => s + d.fixedCost,      0),
    netPL:          dailyData.reduce((s, d) => s + d.netPL,          0),
    totalTips:      dailyData.reduce((s, d) => s + d.totalTipsDay,   0),
    tillTipPayout:  dailyData.reduce((s, d) => s + d.tillTipPayout,  0),
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

      const rawPL = grossRev - totalWages - fixedCostTotal;

      return {
        mk, label: MONTH_NAMES[mm - 1] + ' ' + my,
        grossRev, cashExp, bankExp, netRevenue, totalWages, fixedCostTotal, companyNetPL, rawPL,
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

  const addExpense = async () => {
    if (!expenseForm.date) return;
    const cashToAdd = parseFloat(expenseForm.cashExpense) || 0;
    const bankToAdd = parseFloat(expenseForm.bankExpense) || 0;
    const notesToAdd = String(expenseForm.notes || '').trim();
    if (cashToAdd <= 0 && bankToAdd <= 0 && !notesToAdd) return;

    setExpenseFormSaving(true);
    try {
      const dk = expenseForm.date;
      const existing = expenses[dk] || null;
      const nextCash = (parseFloat(existing?.cashExpense) || 0) + cashToAdd;
      const nextBank = (parseFloat(existing?.bankExpense) || 0) + bankToAdd;
      const nextNotes = [String(existing?.notes || '').trim(), notesToAdd]
        .filter(Boolean)
        .join(existing?.notes && notesToAdd ? ' | ' : '');

      const data = {
        date: dk,
        month: dk.slice(0, 7),
        cashExpense: nextCash,
        bankExpense: nextBank,
        notes: nextNotes,
      };

      if (existing?.id) {
        await updateDoc(doc(db, `tenants/${TENANT}/finance_expenses`, existing.id), data);
        data.id = existing.id;
      } else {
        const ref = await addDoc(collection(db, `tenants/${TENANT}/finance_expenses`), data);
        data.id = ref.id;
      }

      setExpenses(prev => ({ ...prev, [dk]: data }));
      setExpenseForm({ date: '', cashExpense: '', bankExpense: '', notes: '' });
    } catch (e) {
      console.error(e);
    }
    setExpenseFormSaving(false);
  };

  const deletePayment = async payment => {
    if (!window.confirm('Delete this payment record?')) return;
    const col = payment.sourceType === 'advances' ? 'advances' : 'finance_payments';
    await deleteDoc(doc(db, `tenants/${TENANT}/${col}`, payment.id));
    setPayments(prev => prev.filter(p => !(p.id === payment.id && p.sourceType === payment.sourceType)));
  };

  const saveSettings = async () => {
    if (!settingsDraft) return;
    setPartnerConfig(settingsDraft.partnerConfig);
    setFixedDailyRate(settingsDraft.fixedDailyRate);
    setTipSettings(settingsDraft.tipSettings);
    localStorage.setItem('partnerConfig', JSON.stringify(settingsDraft.partnerConfig));
    localStorage.setItem('financeFixedRate', String(settingsDraft.fixedDailyRate));
    localStorage.setItem('financeTipSettings', JSON.stringify(settingsDraft.tipSettings));
    try {
      await setDoc(doc(db, `tenants/${TENANT}/settings`, 'finance_config'), {
        partnerConfig: settingsDraft.partnerConfig,
        fixedDailyRate: settingsDraft.fixedDailyRate,
        tipSettings: settingsDraft.tipSettings,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) { console.error('Finance config save error:', e); }
    setShowSettings(false);
  };

  const openSettings = () => {
    setSettingsDraft({ partnerConfig: JSON.parse(JSON.stringify(partnerConfig)), fixedDailyRate, tipSettings: { ...tipSettings } });
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', letterSpacing: '2px', color: '#d4af37' }}>FINANCE</h2>
            <span style={{ display: 'inline-block', width: '32px', height: '6px', borderRadius: '4px', background: 'linear-gradient(90deg,#d4af37,#b8860b)', marginTop: '8px' }} />
          </div>
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
          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', marginTop: '14px', flexWrap: 'wrap' }}>
            <div>
              <label style={lbl}>Fixed Daily Cost (£/day when shop is open)</label>
              <input type="number" value={settingsDraft.fixedDailyRate} min="0"
                onChange={e => setSettingsDraft(d => ({ ...d, fixedDailyRate: parseFloat(e.target.value) || 0 }))}
                style={{ ...inp, width: '100px' }} />
            </div>
            <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '24px' }}>
              <div style={{ fontSize: '0.62rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px', marginBottom: '10px' }}>TIP SETTINGS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text)' }}>
                  <input type="checkbox" checked={settingsDraft.tipSettings.tipsToIndividual}
                    onChange={e => setSettingsDraft(d => ({ ...d, tipSettings: { ...d.tipSettings, tipsToIndividual: e.target.checked } }))} />
                  Tips go to individual barber (not shared pool)
                </label>
                {settingsDraft.tipSettings.tipsToIndividual && (
                  <div>
                    <label style={lbl}>Card tip reimbursement method</label>
                    <select value={settingsDraft.tipSettings.cardTipMethod}
                      onChange={e => setSettingsDraft(d => ({ ...d, tipSettings: { ...d.tipSettings, cardTipMethod: e.target.value } }))}
                      style={{ ...inp, width: 'auto', minWidth: '200px', padding: '6px 10px', fontSize: '0.78rem' }}>
                      <option value="till_cash">From till cash (tracked as payout)</option>
                      <option value="bank_transfer">Bank transfer (info only)</option>
                      <option value="none">Manual / no tracking</option>
                    </select>
                    <div style={{ fontSize: '0.67rem', color: 'var(--muted)', marginTop: '4px', maxWidth: '280px' }}>
                      {settingsDraft.tipSettings.cardTipMethod === 'till_cash'
                        ? 'Card tips appear as a till cash payout in the daily ledger.'
                        : settingsDraft.tipSettings.cardTipMethod === 'bank_transfer'
                        ? 'Card tips are shown for info only — no till impact recorded.'
                        : 'Tips are not tracked in ledger calculations.'}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end', marginTop: '8px' }}>
              <button onClick={saveSettings}
                style={{ padding: '9px 22px', background: 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '8px', color: '#000', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}>
                Save
              </button>
              <button onClick={() => setShowSettings(false)}
                style={{ padding: '9px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', fontSize: '0.78rem', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Gross Revenue',    value: '£' + monthlyTotals.grossRevenue.toFixed(0),   color: '#d4af37' },
          { label: 'Service Revenue',  value: '£' + monthlyTotals.serviceRevenue.toFixed(0), color: '#d4af37', sub: true },
          { label: 'Product Revenue',  value: '£' + monthlyTotals.productRevenue.toFixed(0), color: '#03a9f4', sub: true },
          { label: 'Net Revenue',      value: '£' + monthlyTotals.netRevenue.toFixed(0),     color: '#9c27b0' },
          { label: 'Cash Expenses',    value: '£' + monthlyTotals.cashExpense.toFixed(0),    color: '#ff7043' },
          { label: 'Bank Expenses',    value: '£' + monthlyTotals.bankExpense.toFixed(0),    color: '#ff7043' },
          { label: 'Total Wages',      value: '£' + monthlyTotals.totalWages.toFixed(0),     color: '#4caf50' },
          { label: 'Fixed Cost',       value: '£' + monthlyTotals.fixedCost.toFixed(0),      color: '#78909c' },
          { label: 'Net P&L',          value: (monthlyTotals.netPL >= 0 ? '+' : '') + '£' + monthlyTotals.netPL.toFixed(0), color: monthlyTotals.netPL >= 0 ? '#4caf50' : '#ff5252' },
          { label: 'Tips (Total)',     value: '£' + monthlyTotals.totalTips.toFixed(0),      color: '#2196f3' },
          ...(tipSettings.tipsToIndividual && tipSettings.cardTipMethod === 'till_cash' && monthlyTotals.tillTipPayout > 0
            ? [{ label: 'Till → Barbers', value: '−£' + monthlyTotals.tillTipPayout.toFixed(0), color: '#ff9800', sub: true }]
            : []),
        ].map(c => (
          <div key={c.label} style={{ ...card, padding: '14px 16px', borderLeft: c.sub ? `3px solid ${c.color}55` : undefined, opacity: c.sub ? 0.85 : 1 }}>
            <div style={{ fontSize: '0.58rem', color: c.sub ? c.color + '99' : 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>{c.label}</div>
            <div style={{ fontSize: c.sub ? '1.05rem' : '1.2rem', fontWeight: '800', color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button style={tabBtn('daily')}    onClick={() => setActiveTab('daily')}>Daily Ledger</button>
        <button style={tabBtn('tips')}     onClick={() => setActiveTab('tips')}>Tips</button>
        <button style={tabBtn('payments')} onClick={() => setActiveTab('payments')}>Payments</button>
        <button style={tabBtn('expenses')} onClick={() => setActiveTab('expenses')}>Expenses</button>
        <button style={tabBtn('summary')}  onClick={() => setActiveTab('summary')}>Monthly Summary</button>
        <button style={tabBtn('overview')} onClick={() => setActiveTab('overview')}>Overview</button>
        {activeTab === 'daily' && (
          <button onClick={() => setShowEmptyDays(v => !v)}
            style={{ ...tabBtn('empty'), background: 'var(--card2)', color: showEmptyDays ? '#d4af37' : 'var(--muted)', border: `1px solid ${showEmptyDays ? 'rgba(212,175,55,0.35)' : 'var(--border)'}` }}>
            {showEmptyDays ? 'Empty Days: On' : 'Empty Days: Off'}
          </button>
        )}
      </div>

      {/* Payment filter */}
      {!loading && (activeTab === 'daily' || activeTab === 'summary') && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginRight: '2px' }}>Payment:</span>
          {[['all','All','#d4af37'],['cash','Cash','#4caf50'],['card','Card / Monzo','#2196f3']].map(([k,l,c]) => (
            <button key={k} onClick={() => setPaymentFilter(k)}
              style={{ padding: '5px 14px', borderRadius: '20px', border: `1px solid ${paymentFilter === k ? c : 'var(--border)'}`, background: paymentFilter === k ? c + '22' : 'transparent', color: paymentFilter === k ? c : 'var(--muted)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: paymentFilter === k ? '700' : '400', transition: 'all 0.15s' }}>
              {l}
            </button>
          ))}
        </div>
      )}

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
                  {tipSettings.tipsToIndividual && <th style={{ ...thS, color: '#2196f3' }}>Tips</th>}
                  {tipSettings.tipsToIndividual && tipSettings.cardTipMethod === 'till_cash' && <th style={{ ...thS, color: '#ff9800', fontSize: '0.58rem' }}>Till→<br/>Barbers</th>}
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
                      {tipSettings.tipsToIndividual && (
                        <td style={{ ...tdS(), color: row.totalTipsDay > 0 ? '#2196f3' : 'var(--muted)', fontSize: '0.72rem' }}>
                          {row.totalTipsDay > 0
                            ? <span title={Object.entries(row.barberTips || {}).filter(([,t]) => t.cash+t.card+t.monzo>0).map(([n,t]) => `${n}: £${(t.cash+t.card+t.monzo).toFixed(2)}`).join(' | ')}>
                                £{row.totalTipsDay.toFixed(2)}
                              </span>
                            : '–'}
                        </td>
                      )}
                      {tipSettings.tipsToIndividual && tipSettings.cardTipMethod === 'till_cash' && (
                        <td style={{ ...tdS(), color: row.tillTipPayout > 0 ? '#ff9800' : 'var(--muted)', fontSize: '0.72rem' }}>
                          {row.tillTipPayout > 0 ? '−£' + row.tillTipPayout.toFixed(2) : '–'}
                        </td>
                      )}
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
                  {tipSettings.tipsToIndividual && (
                    <td style={{ ...tdS(), fontWeight: '700', color: '#2196f3' }}>
                      {(() => { const t = visibleDailyRows.reduce((s, d) => s + d.totalTipsDay, 0); return t > 0 ? '£' + t.toFixed(2) : '–'; })()}
                    </td>
                  )}
                  {tipSettings.tipsToIndividual && tipSettings.cardTipMethod === 'till_cash' && (
                    <td style={{ ...tdS(), fontWeight: '700', color: '#ff9800' }}>
                      {(() => { const t = visibleDailyRows.reduce((s, d) => s + d.tillTipPayout, 0); return t > 0 ? '−£' + t.toFixed(2) : '–'; })()}
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(212,175,55,0.1)', fontSize: '0.6rem', color: 'var(--muted)' }}>
            Click any expense cell to edit. Card total includes Monzo (shown as "m"). Net P&L = Net Revenue – Wages – Fixed Cost (£{fixedDailyRate}/day).
            {tipSettings.tipsToIndividual && tipSettings.cardTipMethod === 'till_cash' && ' Hover over Tips cell to see per-barber breakdown. Till→Barbers = card/monzo tips reimbursed from till.'}
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
          EXPENSES
          ══════════════════════════════════════════════════════════════════ */}
      {!loading && activeTab === 'expenses' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', alignItems: 'start' }}>
          <div style={{ ...card, padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '0.65rem', color: '#ff7043', fontWeight: '700', letterSpacing: '2px' }}>NEW CASH / BANK EXPENSE</div>
            <div>
              <label style={lbl}>Date</label>
              <input type="date" value={expenseForm.date} onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))} style={{ ...inp, colorScheme: 'dark' }} />
            </div>
            <div>
              <label style={lbl}>Cash Expense (£)</label>
              <input type="number" value={expenseForm.cashExpense} onChange={e => setExpenseForm(f => ({ ...f, cashExpense: e.target.value }))} placeholder="0" style={inp} />
            </div>
            <div>
              <label style={lbl}>Bank Expense (£)</label>
              <input type="number" value={expenseForm.bankExpense} onChange={e => setExpenseForm(f => ({ ...f, bankExpense: e.target.value }))} placeholder="0" style={inp} />
            </div>
            <div>
              <label style={lbl}>Notes (optional)</label>
              <input value={expenseForm.notes} onChange={e => setExpenseForm(f => ({ ...f, notes: e.target.value }))} placeholder="Description..." style={inp} />
            </div>
            <button onClick={addExpense} disabled={expenseFormSaving || !expenseForm.date || (!expenseForm.cashExpense && !expenseForm.bankExpense && !expenseForm.notes)}
              style={{ padding: '11px', background: 'linear-gradient(135deg,#ff7043,#ff8a65)', border: 'none', borderRadius: '8px', color: '#111', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer', opacity: (!expenseForm.date || (!expenseForm.cashExpense && !expenseForm.bankExpense && !expenseForm.notes)) ? 0.5 : 1 }}>
              {expenseFormSaving ? 'Saving...' : 'Add Expense'}
            </button>
            <div style={{ fontSize: '0.68rem', color: 'var(--muted)', lineHeight: 1.5 }}>
              Saves directly from the panel. If that date already has expenses, the new amounts are added to the existing totals.
            </div>
          </div>

          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(212,175,55,0.1)', fontSize: '0.65rem', color: '#ff7043', fontWeight: '700', letterSpacing: '2px' }}>
              EXPENSE HISTORY ({monthMode === 'selected' ? 'THIS MONTH' : 'ALL MONTHS'})
            </div>
            {Object.entries(expenses)
              .filter(([dk]) => monthMode === 'all' || String(dk || '').startsWith(selectedMonth))
              .sort((a, b) => b[0].localeCompare(a[0])).length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem' }}>No expense records in current filter.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,112,67,0.08)' }}>
                    {['Date','Cash','Bank','Notes'].map(h => (
                      <th key={h} style={{ ...thS, textAlign: 'left', padding: '8px 14px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(expenses)
                    .filter(([dk]) => monthMode === 'all' || String(dk || '').startsWith(selectedMonth))
                    .sort((a, b) => b[0].localeCompare(a[0]))
                    .map(([dk, exp]) => (
                      <tr key={dk} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontSize: '0.75rem' }}>{dk}</td>
                        <td style={{ padding: '10px 14px', fontSize: '0.75rem', color: '#ff7043', fontWeight: '700' }}>
                          {(parseFloat(exp?.cashExpense) || 0) > 0 ? `£${Math.round(parseFloat(exp?.cashExpense) || 0)}` : '–'}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '0.75rem', color: '#ff7043', fontWeight: '700' }}>
                          {(parseFloat(exp?.bankExpense) || 0) > 0 ? `£${Math.round(parseFloat(exp?.bankExpense) || 0)}` : '–'}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '0.72rem', color: 'var(--muted)' }}>{exp?.notes || '–'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TIPS
          ══════════════════════════════════════════════════════════════════ */}
      {!loading && activeTab === 'tips' && (
        <TipsTab bookings={bookings} selectedDay={selectedDay} setSelectedDay={setSelectedDay} />
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
                    { label: 'P&L (Before Exp.)', value: (selectedMonthPartnership.rawPL >= 0 ? '+' : '') + '£' + Math.round(selectedMonthPartnership.rawPL), color: selectedMonthPartnership.rawPL >= 0 ? '#78909c' : '#ff5252' },
                    { label: 'Net P&L (After Exp.)', value: (selectedMonthPartnership.companyNetPL >= 0 ? '+' : '') + '£' + Math.round(selectedMonthPartnership.companyNetPL), color: selectedMonthPartnership.companyNetPL >= 0 ? '#4caf50' : '#ff5252' },
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
                        const allBk = bookings.filter(bk => bk.barber === b.name && String(bk.dateKey || '').startsWith(selectedMonth));
                        const workedDays = new Set(allBk.filter(bk => bk.status !== 'CANCELLED' && bk.status !== 'BLOCKED').map(bk => bk.dateKey)).size;
                        const bBk = allBk.filter(bk => bk.status === 'CHECKED_OUT');
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
                        { label: 'Gross Revenue',      value: monthlyTotals.grossRevenue,   color: '#d4af37', bold: true },
                        { label: '  Service Revenue',  value: monthlyTotals.serviceRevenue, color: '#d4af37' },
                        { label: '  Product Revenue',  value: monthlyTotals.productRevenue, color: '#03a9f4' },
                        { label: '  Cash Expenses',    value: -monthlyTotals.cashExpense,   color: '#ff7043' },
                        { label: '  Bank Expenses',    value: -monthlyTotals.bankExpense,   color: '#ff7043' },
                        { label: 'Net Revenue',        value: monthlyTotals.netRevenue,     color: '#9c27b0', bold: true, border: true },
                        { label: '  Wages',            value: -monthlyTotals.totalWages,    color: '#4caf50' },
                        { label: '  Fixed Cost',       value: -monthlyTotals.fixedCost,     color: '#78909c' },
                        { label: 'Net P&L',            value: monthlyTotals.netPL,          color: monthlyTotals.netPL >= 0 ? '#4caf50' : '#ff5252', bold: true, border: true },
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
                        <th style={{ ...thS, color: '#78909c' }}>P&L<br/><span style={{ fontSize: '0.5rem', letterSpacing: 0 }}>before exp.</span></th>
                        <th style={{ ...thS, color: '#ff7043' }}>Net P&L<br/><span style={{ fontSize: '0.5rem', letterSpacing: 0 }}>after exp.</span></th>
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
                          <td style={{ ...tdS(row.rawPL >= 0 ? 'green' : 'red'), fontWeight: '700' }}>
                            {fmtSigned(row.rawPL)}
                          </td>
                          <td style={{ ...tdS(row.companyNetPL >= 0 ? 'green' : 'red'), fontWeight: '700', color: '#ff7043' }}>
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
                        <td style={{ ...tdS(partnershipByMonth.reduce((s, r) => s + r.rawPL, 0) >= 0 ? 'green' : 'red'), fontWeight: '800' }}>
                          {fmtSigned(partnershipByMonth.reduce((s, r) => s + r.rawPL, 0))}
                        </td>
                        <td style={{ ...tdS(partnershipByMonth.reduce((s, r) => s + r.companyNetPL, 0) >= 0 ? 'green' : 'red'), fontWeight: '800', color: '#ff7043' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
            {partnershipByMonth.map(row => (
              <div key={row.mk} style={{ ...card, padding: '12px 14px', border: `1px solid ${row.companyNetPL >= 0 ? 'rgba(76,175,80,0.2)' : 'rgba(255,82,82,0.2)'}` }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginBottom: '6px' }}>{row.label} · {row.shopDays} days</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                  <span style={{ fontSize: '0.55rem', color: 'var(--muted)' }}>Before exp.</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: '700', color: row.rawPL >= 0 ? '#78909c' : '#ff5252' }}>{fmtSigned(row.rawPL)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.55rem', color: 'var(--muted)' }}>After exp.</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: '800', color: row.companyNetPL >= 0 ? '#4caf50' : '#ff5252' }}>{fmtSigned(row.companyNetPL)}</span>
                </div>
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

// ── TIPS TAB ─────────────────────────────────────────────────────────────────
function TipsTab({ bookings, selectedDay, setSelectedDay }) {
  const [tipping, setTipping] = useState({});

  const dayKey = selectedDay instanceof Date
    ? selectedDay.getFullYear() + '-' + String(selectedDay.getMonth() + 1).padStart(2, '0') + '-' + String(selectedDay.getDate()).padStart(2, '0')
    : String(selectedDay).slice(0, 10);

  const tippedBookings = useMemo(() => {
    return bookings.filter(function(b) {
      const tip = parseFloat(b.tip) || 0;
      if (tip <= 0) return false;
      const d = b.startTime?.toDate ? b.startTime.toDate() : (b.date ? new Date(b.date) : null);
      if (!d) return false;
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return k === dayKey;
    });
  }, [bookings, dayKey]);

  const cardTips = tippedBookings.filter(b => {
    const m = (b.paymentMethod || b.method || '').toUpperCase();
    return m !== 'CASH';
  });
  const cashTips = tippedBookings.filter(b => {
    const m = (b.paymentMethod || b.method || '').toUpperCase();
    return m === 'CASH';
  });

  const totalCard = cardTips.reduce((s, b) => s + (parseFloat(b.tip) || 0), 0);
  const totalCash = cashTips.reduce((s, b) => s + (parseFloat(b.tip) || 0), 0);
  const cardTakenAsCash = cardTips.filter(b => b.tipTakenAsCash).reduce((s, b) => s + (parseFloat(b.tip) || 0), 0);

  const toggle = async function(booking, field) {
    const id = booking.bookingId;
    setTipping(t => ({ ...t, [id + field]: true }));
    try {
      const isCard = (booking.paymentMethod || booking.method || '').toUpperCase() !== 'CASH';
      const update = {};
      if (field === 'tipTaken') {
        update.tipTaken = !booking.tipTaken;
        if (!update.tipTaken) update.tipTakenAsCash = false;
      }
      if (field === 'tipTakenAsCash') {
        update.tipTakenAsCash = !booking.tipTakenAsCash;
        if (update.tipTakenAsCash) update.tipTaken = true;
      }
      await updateTipStatus(id, update);
      Object.assign(booking, update);
    } catch(e) {
      alert('Error updating tip status');
    } finally {
      setTipping(t => ({ ...t, [id + field]: false }));
    }
  };

  const pill = (label, active, color) => ({
    padding: '3px 10px', borderRadius: '99px', fontSize: '0.72rem', fontWeight: '700',
    background: active ? color + '22' : 'transparent',
    color: active ? color : 'var(--muted)',
    border: '1px solid ' + (active ? color + '55' : 'var(--border)'),
    cursor: 'pointer', whiteSpace: 'nowrap',
  });

  const renderRow = function(b, isCard) {
    const tip = parseFloat(b.tip) || 0;
    const taken = isCard ? !!b.tipTakenAsCash : (b.tipTaken !== false);
    const id = b.bookingId;
    return (
      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderRadius: '10px', background: 'var(--card)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '120px' }}>
          <div style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text)' }}>{b.clientName || b.name || '—'}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '2px' }}>{b.barber || b.barberName || '—'} · {b.service || '—'}</div>
        </div>
        <div style={{ fontSize: '1rem', fontWeight: '700', color: '#d4af37', minWidth: '48px', textAlign: 'right' }}>£{tip.toFixed(2)}</div>

        {isCard ? (
          <button
            onClick={() => toggle(b, 'tipTakenAsCash')}
            disabled={!!tipping[id + 'tipTakenAsCash']}
            style={pill(b.tipTakenAsCash ? 'Cash Taken ✓' : 'Cash Taken?', b.tipTakenAsCash, '#4caf50')}
          >
            {b.tipTakenAsCash ? 'Cash Taken ✓' : 'Cash Taken?'}
          </button>
        ) : (
          <button
            onClick={() => toggle(b, 'tipTaken')}
            disabled={!!tipping[id + 'tipTaken']}
            style={pill(taken ? 'Taken ✓' : 'Not Taken', taken, '#4caf50')}
          >
            {taken ? 'Taken ✓' : 'Not Taken'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Date picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <input
          type="date"
          value={dayKey}
          onChange={e => setSelectedDay(new Date(e.target.value + 'T12:00:00'))}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: '0.85rem' }}
        />
        <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{tippedBookings.length} tip{tippedBookings.length !== 1 ? 's' : ''} · Total £{(totalCard + totalCash).toFixed(2)}</span>
      </div>

      {/* Cash impact banner */}
      {cardTakenAsCash > 0 && (
        <div style={{ padding: '12px 16px', background: 'rgba(255,152,0,0.1)', border: '1px solid rgba(255,152,0,0.3)', borderRadius: '10px', fontSize: '0.82rem', color: '#ff9800' }}>
          ⚠️ £{cardTakenAsCash.toFixed(2)} card tip taken as cash — this reduces expected cash in till by £{cardTakenAsCash.toFixed(2)}
        </div>
      )}

      {tippedBookings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: '12px' }}>No tips for this day</div>
      ) : (
        <>
          {/* Card tips */}
          {cardTips.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>Card Tips</span>
                <span style={{ fontSize: '0.82rem', color: '#d4af37', fontWeight: '700' }}>£{totalCard.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {cardTips.map(b => renderRow(b, true))}
              </div>
            </div>
          )}

          {/* Cash tips */}
          {cashTips.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>Cash Tips</span>
                <span style={{ fontSize: '0.82rem', color: '#4caf50', fontWeight: '700' }}>£{totalCash.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {cashTips.map(b => renderRow(b, false))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
