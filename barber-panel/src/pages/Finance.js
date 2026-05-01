import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../firebase';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, where, Timestamp, orderBy,
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

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function fmtCurrency(n) {
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

export default function Finance() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState('daily');
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );
  const [bookings, setBookings] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [expenses, setExpenses] = useState({});   // { 'YYYY-MM-DD': { id, kasaMasraf, bankaMasraf } }
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Configurable rates stored in localStorage
  const [wageRates, setWageRates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('financeWageRates') || '{}'); } catch { return {}; }
  });
  const [fixedDailyRate, setFixedDailyRate] = useState(() =>
    parseFloat(localStorage.getItem('financeFixedRate') || '100')
  );
  const [showSettings, setShowSettings] = useState(false);

  // Payment form
  const [payForm, setPayForm] = useState({ date: '', barberName: '', amount: '', method: 'Cash', notes: '' });
  const [payLoading, setPayLoading] = useState(false);

  // Inline expense editing
  const [editingExpense, setEditingExpense] = useState(null); // dateKey
  const [expenseDraft, setExpenseDraft] = useState({ kasaMasraf: '', bankaMasraf: '' });
  const [expenseSaving, setExpenseSaving] = useState(false);

  const [year, month] = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    return [y, m - 1];
  }, [selectedMonth]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const startOfMonth = new Date(year, month, 1, 0, 0, 0);
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

      const [bookSnap, barberSnap, expSnap, paySnap] = await Promise.all([
        getDocs(query(
          collection(db, `tenants/${TENANT}/bookings`),
          where('startTime', '>=', Timestamp.fromDate(startOfMonth)),
          where('startTime', '<=', Timestamp.fromDate(endOfMonth))
        )),
        getDocs(collection(db, `tenants/${TENANT}/barbers`)),
        getDocs(query(collection(db, `tenants/${TENANT}/finance_expenses`), where('month', '==', selectedMonth))),
        getDocs(query(collection(db, `tenants/${TENANT}/finance_payments`), orderBy('date', 'desc'))),
      ]);

      const fetchedBarbers = barberSnap.docs
        .map(d => ({ docId: d.id, ...d.data() }))
        .filter(b => b.active !== false)
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      setBarbers(fetchedBarbers);

      const barberNameById = fetchedBarbers.reduce((acc, b) => {
        if (!b.name) return acc;
        [b.docId, b.id].filter(Boolean).forEach(k => { acc[String(k).toLowerCase()] = b.name; });
        return acc;
      }, {});

      const fetchedBookings = bookSnap.docs.map(d => {
        const data = d.data();
        const rawBarber = String(data.barberId || '').trim();
        const barber = data.barberName || barberNameById[rawBarber.toLowerCase()] || rawBarber;
        const startTime = data.startTime?.toDate();
        return { ...data, barber, startTime, dateKey: startTime ? toDateKey(startTime) : null };
      }).filter(b => b.status !== 'CANCELLED' && b.dateKey);
      setBookings(fetchedBookings);

      const expMap = {};
      expSnap.docs.forEach(d => {
        expMap[d.data().date] = { id: d.id, ...d.data() };
      });
      setExpenses(expMap);

      const fetchedPayments = paySnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPayments(fetchedPayments);

    } catch (err) {
      console.error('Finance fetchAll error:', err);
    }
    setLoading(false);
  }, [selectedMonth, year, month]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Compute daily rows
  const dailyData = useMemo(() => {
    const numDays = daysInMonth(year, month);
    return Array.from({ length: numDays }, (_, i) => {
      const day = i + 1;
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayBookings = bookings.filter(b => b.dateKey === dateKey);
      const exp = expenses[dateKey] || {};
      const kasaMasraf = parseFloat(exp.kasaMasraf || 0);
      const bankaMasraf = parseFloat(exp.bankaMasraf || 0);

      const barberRevenue = {};
      barbers.forEach(b => {
        barberRevenue[b.name] = { cash: 0, card: 0 };
      });

      dayBookings.forEach(b => {
        const name = b.barber;
        if (!barberRevenue[name]) barberRevenue[name] = { cash: 0, card: 0 };
        const rev = effectiveRevenue(b);
        if (isCash(b)) barberRevenue[name].cash += rev;
        else barberRevenue[name].card += rev;
      });

      const toplamCiro = Object.values(barberRevenue).reduce((s, v) => s + v.cash + v.card, 0);
      const netCiro = toplamCiro - kasaMasraf - bankaMasraf;

      // Wages: barbers who had at least 1 booking this day
      const activeBarbersToday = Object.entries(barberRevenue)
        .filter(([, v]) => v.cash + v.card > 0)
        .map(([name]) => name);
      const totalWages = activeBarbersToday.reduce((s, name) => s + (parseFloat(wageRates[name] || 100)), 0);
      const fixedCost = activeBarbersToday.length > 0 ? fixedDailyRate : 0;
      const netKarZarar = netCiro - totalWages - fixedCost;

      const dayOfWeek = new Date(year, month, day).toLocaleDateString('en-GB', { weekday: 'short' });

      return { day, dateKey, dayOfWeek, barberRevenue, kasaMasraf, bankaMasraf, toplamCiro, netCiro, totalWages, fixedCost, netKarZarar, hasData: toplamCiro > 0, exp };
    });
  }, [bookings, barbers, expenses, wageRates, fixedDailyRate, year, month]);

  const monthlySummary = useMemo(() => {
    return barbers.map(b => {
      const bName = b.name;
      const bBookings = bookings.filter(bb => bb.barber === bName);
      const workedDays = new Set(bBookings.map(bb => bb.dateKey)).size;
      const totalRevenue = bBookings.reduce((s, bb) => s + effectiveRevenue(bb), 0);
      const wages = workedDays * parseFloat(wageRates[bName] || 100);
      const monthPayments = payments.filter(p => {
        const d = p.date?.toDate ? p.date.toDate() : new Date(p.date);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        return key === selectedMonth && (p.barberName || '').toLowerCase() === bName.toLowerCase();
      });
      const totalAdvances = monthPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
      const balance = wages - totalAdvances;
      return { name: bName, color: b.color, workedDays, totalRevenue, wages, totalAdvances, balance };
    });
  }, [bookings, barbers, payments, wageRates, selectedMonth]);

  const monthlyTotals = useMemo(() => {
    const totalCiro = dailyData.reduce((s, d) => s + d.toplamCiro, 0);
    const totalNetCiro = dailyData.reduce((s, d) => s + d.netCiro, 0);
    const totalKasa = dailyData.reduce((s, d) => s + d.kasaMasraf, 0);
    const totalBanka = dailyData.reduce((s, d) => s + d.bankaMasraf, 0);
    const totalKar = dailyData.reduce((s, d) => s + d.netKarZarar, 0);
    return { totalCiro, totalNetCiro, totalKasa, totalBanka, totalKar };
  }, [dailyData]);

  const saveExpense = async (dateKey) => {
    setExpenseSaving(true);
    try {
      const data = {
        date: dateKey,
        month: selectedMonth,
        kasaMasraf: parseFloat(expenseDraft.kasaMasraf) || 0,
        bankaMasraf: parseFloat(expenseDraft.bankaMasraf) || 0,
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
        date: Timestamp.fromDate(dateObj),
        barberName: payForm.barberName,
        amount: parseFloat(payForm.amount),
        method: payForm.method,
        notes: payForm.notes || '',
      };
      const ref = await addDoc(collection(db, `tenants/${TENANT}/finance_payments`), docData);
      setPayments(prev => [{ id: ref.id, ...docData }, ...prev]);
      setPayForm({ date: '', barberName: '', amount: '', method: 'Cash', notes: '' });
    } catch (e) { console.error(e); }
    setPayLoading(false);
  };

  const deletePayment = async (id) => {
    if (!window.confirm('Delete this payment record?')) return;
    await deleteDoc(doc(db, `tenants/${TENANT}/finance_payments`, id));
    setPayments(prev => prev.filter(p => p.id !== id));
  };

  const saveWageSettings = () => {
    localStorage.setItem('financeWageRates', JSON.stringify(wageRates));
    localStorage.setItem('financeFixedRate', String(fixedDailyRate));
    setShowSettings(false);
  };

  const tabStyle = (id) => ({
    padding: '8px 18px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '700',
    letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer', border: 'none',
    background: activeTab === id ? 'linear-gradient(135deg,#d4af37,#b8860b)' : 'rgba(255,255,255,0.05)',
    color: activeTab === id ? '#000' : 'var(--muted)',
    transition: 'all 0.2s',
  });

  const thStyle = {
    padding: '8px 10px', fontSize: '0.58rem', color: 'var(--muted)', letterSpacing: '1.5px',
    textTransform: 'uppercase', fontWeight: '700', textAlign: 'right', whiteSpace: 'nowrap',
    borderBottom: '1px solid rgba(212,175,55,0.15)',
  };
  const tdStyle = (highlight) => ({
    padding: '6px 10px', fontSize: '0.75rem', textAlign: 'right', whiteSpace: 'nowrap',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    color: highlight === 'green' ? '#4caf50' : highlight === 'red' ? '#ff5252' : 'var(--text)',
    fontWeight: highlight ? '700' : '400',
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', letterSpacing: '2px', color: '#d4af37' }}>FINANCE</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--muted)', letterSpacing: '1px' }}>
            {MONTH_NAMES[month]} {year} — Gelir / Gider / Ödemeler
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="month" value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            style={{ ...inp, width: 'auto', colorScheme: 'dark', padding: '7px 12px' }}
          />
          <button onClick={() => setShowSettings(s => !s)}
            style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: '600' }}>
            ⚙ Ayarlar
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div style={{ background: 'var(--card2)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ fontSize: '0.65rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px', marginBottom: '14px' }}>WAGE RATES (£/GÜN)</div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {barbers.map(b => (
              <div key={b.name} style={{ minWidth: '120px' }}>
                <label style={{ ...lbl, color: b.color }}>{b.name}</label>
                <input type="number" value={wageRates[b.name] ?? 100}
                  onChange={e => setWageRates(r => ({ ...r, [b.name]: e.target.value }))}
                  style={{ ...inp, width: '100px' }} />
              </div>
            ))}
            <div>
              <label style={lbl}>Sabit Günlük Gider (£)</label>
              <input type="number" value={fixedDailyRate}
                onChange={e => setFixedDailyRate(parseFloat(e.target.value) || 0)}
                style={{ ...inp, width: '100px' }} />
            </div>
            <button onClick={saveWageSettings}
              style={{ padding: '9px 20px', background: 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '8px', color: '#000', fontWeight: '700', fontSize: '0.78rem', cursor: 'pointer' }}>
              Kaydet
            </button>
          </div>
        </div>
      )}

      {/* Monthly summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Toplam Ciro', value: '£' + monthlyTotals.totalCiro.toFixed(0), color: '#d4af37' },
          { label: 'Net Ciro', value: '£' + monthlyTotals.totalNetCiro.toFixed(0), color: '#9c27b0' },
          { label: 'Kasa Masraf', value: '£' + monthlyTotals.totalKasa.toFixed(0), color: '#ff7043' },
          { label: 'Banka Masraf', value: '£' + monthlyTotals.totalBanka.toFixed(0), color: '#ff7043' },
          { label: 'Net Kar/Zarar', value: '£' + monthlyTotals.totalKar.toFixed(0), color: monthlyTotals.totalKar >= 0 ? '#4caf50' : '#ff5252' },
        ].map(card => (
          <div key={card.label} style={{ background: 'var(--card2)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '0.58rem', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>{card.label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: '800', color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button style={tabStyle('daily')} onClick={() => setActiveTab('daily')}>Günlük Tablo</button>
        <button style={tabStyle('payments')} onClick={() => setActiveTab('payments')}>Ödemeler</button>
        <button style={tabStyle('summary')} onClick={() => setActiveTab('summary')}>Aylık Özet</button>
      </div>

      {loading && <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px', fontSize: '0.8rem' }}>Yükleniyor...</div>}

      {/* ── TAB 1: GÜNLÜK TABLO ── */}
      {!loading && activeTab === 'daily' && (
        <div style={{ background: 'var(--card2)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
              <thead>
                <tr style={{ background: 'rgba(212,175,55,0.07)' }}>
                  <th style={{ ...thStyle, textAlign: 'left', minWidth: '80px' }}>Tarih</th>
                  {barbers.map(b => (
                    <React.Fragment key={b.name}>
                      <th style={{ ...thStyle, color: b.color }}>{b.name} Cash</th>
                      <th style={{ ...thStyle, color: b.color }}>{b.name} Card</th>
                    </React.Fragment>
                  ))}
                  <th style={{ ...thStyle, color: '#ff7043' }}>Kasa<br/>Masraf</th>
                  <th style={{ ...thStyle, color: '#ff7043' }}>Banka<br/>Masraf</th>
                  <th style={{ ...thStyle, color: '#9c27b0' }}>Toplam<br/>Ciro</th>
                  <th style={{ ...thStyle, color: '#7e57c2' }}>Net<br/>Ciro</th>
                  <th style={{ ...thStyle, color: 'var(--muted)' }}>Ücretler</th>
                  <th style={{ ...thStyle, color: monthlyTotals.totalKar >= 0 ? '#4caf50' : '#ff5252', minWidth: '90px' }}>Net<br/>Kar/Zarar</th>
                </tr>
              </thead>
              <tbody>
                {dailyData.filter(d => {
                  const date = new Date(year, month, d.day);
                  return date <= new Date();
                }).map(row => {
                  const isEditing = editingExpense === row.dateKey;
                  const rowBg = !row.hasData ? 'transparent' : 'rgba(212,175,55,0.02)';
                  return (
                    <tr key={row.dateKey} style={{ background: rowBg, opacity: row.hasData ? 1 : 0.45 }}>
                      <td style={{ ...tdStyle(), textAlign: 'left', fontWeight: '600', fontSize: '0.72rem' }}>
                        <span style={{ color: '#d4af37' }}>{String(row.day).padStart(2,'0')}</span>
                        <span style={{ color: 'var(--muted)', marginLeft: '4px', fontSize: '0.6rem' }}>{row.dayOfWeek}</span>
                      </td>
                      {barbers.map(b => (
                        <React.Fragment key={b.name}>
                          <td style={{ ...tdStyle(), color: (row.barberRevenue[b.name]?.cash || 0) > 0 ? 'var(--text)' : 'rgba(255,255,255,0.12)' }}>
                            {row.barberRevenue[b.name]?.cash > 0 ? '£' + row.barberRevenue[b.name].cash.toFixed(0) : '–'}
                          </td>
                          <td style={{ ...tdStyle(), color: (row.barberRevenue[b.name]?.card || 0) > 0 ? 'var(--text)' : 'rgba(255,255,255,0.12)' }}>
                            {row.barberRevenue[b.name]?.card > 0 ? '£' + row.barberRevenue[b.name].card.toFixed(0) : '–'}
                          </td>
                        </React.Fragment>
                      ))}

                      {/* Kasa Masraf — inline edit */}
                      <td style={{ ...tdStyle(), color: '#ff7043', cursor: 'pointer', position: 'relative' }}
                        onClick={() => { if (!isEditing) { setEditingExpense(row.dateKey); setExpenseDraft({ kasaMasraf: row.kasaMasraf || '', bankaMasraf: row.bankaMasraf || '' }); } }}>
                        {isEditing
                          ? <input type="number" value={expenseDraft.kasaMasraf} onChange={e => setExpenseDraft(d => ({ ...d, kasaMasraf: e.target.value }))}
                              style={{ ...inp, width: '70px', padding: '4px 7px', fontSize: '0.75rem' }} autoFocus onClick={e => e.stopPropagation()} />
                          : row.kasaMasraf > 0 ? '£' + row.kasaMasraf.toFixed(0) : <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: '0.65rem' }}>+</span>
                        }
                      </td>

                      {/* Banka Masraf — inline edit */}
                      <td style={{ ...tdStyle(), color: '#ff7043', cursor: 'pointer' }}
                        onClick={() => { if (!isEditing) { setEditingExpense(row.dateKey); setExpenseDraft({ kasaMasraf: row.kasaMasraf || '', bankaMasraf: row.bankaMasraf || '' }); } }}>
                        {isEditing
                          ? <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <input type="number" value={expenseDraft.bankaMasraf} onChange={e => setExpenseDraft(d => ({ ...d, bankaMasraf: e.target.value }))}
                                style={{ ...inp, width: '70px', padding: '4px 7px', fontSize: '0.75rem' }} onClick={e => e.stopPropagation()} />
                              <button onClick={e => { e.stopPropagation(); saveExpense(row.dateKey); }} disabled={expenseSaving}
                                style={{ padding: '4px 8px', background: '#d4af37', border: 'none', borderRadius: '5px', color: '#000', fontWeight: '700', fontSize: '0.65rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                {expenseSaving ? '...' : 'Kaydet'}
                              </button>
                              <button onClick={e => { e.stopPropagation(); setEditingExpense(null); }}
                                style={{ padding: '4px 6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', color: 'var(--muted)', fontSize: '0.65rem', cursor: 'pointer' }}>✕</button>
                            </div>
                          : row.bankaMasraf > 0 ? '£' + row.bankaMasraf.toFixed(0) : <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: '0.65rem' }}>+</span>
                        }
                      </td>

                      <td style={tdStyle()}>{row.toplamCiro > 0 ? '£' + row.toplamCiro.toFixed(0) : '–'}</td>
                      <td style={{ ...tdStyle(), color: '#9c27b0', fontWeight: row.netCiro > 0 ? '700' : '400' }}>{row.netCiro > 0 ? '£' + row.netCiro.toFixed(0) : '–'}</td>
                      <td style={{ ...tdStyle(), color: 'rgba(255,255,255,0.35)', fontSize: '0.68rem' }}>{row.totalWages > 0 ? '£' + row.totalWages.toFixed(0) : '–'}</td>
                      <td style={tdStyle(row.hasData ? (row.netKarZarar >= 0 ? 'green' : 'red') : null)}>
                        {row.hasData ? (row.netKarZarar >= 0 ? '+' : '') + '£' + row.netKarZarar.toFixed(0) : '–'}
                      </td>
                    </tr>
                  );
                })}

                {/* Monthly totals row */}
                <tr style={{ background: 'rgba(212,175,55,0.08)', borderTop: '2px solid rgba(212,175,55,0.3)' }}>
                  <td style={{ ...tdStyle(), textAlign: 'left', fontWeight: '800', fontSize: '0.72rem', color: '#d4af37' }}>TOPLAM</td>
                  {barbers.map(b => {
                    const cashTotal = dailyData.reduce((s, d) => s + (d.barberRevenue[b.name]?.cash || 0), 0);
                    const cardTotal = dailyData.reduce((s, d) => s + (d.barberRevenue[b.name]?.card || 0), 0);
                    return (
                      <React.Fragment key={b.name}>
                        <td style={{ ...tdStyle(), fontWeight: '700', color: b.color }}>{cashTotal > 0 ? '£' + cashTotal.toFixed(0) : '–'}</td>
                        <td style={{ ...tdStyle(), fontWeight: '700', color: b.color }}>{cardTotal > 0 ? '£' + cardTotal.toFixed(0) : '–'}</td>
                      </React.Fragment>
                    );
                  })}
                  <td style={{ ...tdStyle(), fontWeight: '700', color: '#ff7043' }}>{monthlyTotals.totalKasa > 0 ? '£' + monthlyTotals.totalKasa.toFixed(0) : '–'}</td>
                  <td style={{ ...tdStyle(), fontWeight: '700', color: '#ff7043' }}>{monthlyTotals.totalBanka > 0 ? '£' + monthlyTotals.totalBanka.toFixed(0) : '–'}</td>
                  <td style={{ ...tdStyle(), fontWeight: '800', color: '#d4af37' }}>£{monthlyTotals.totalCiro.toFixed(0)}</td>
                  <td style={{ ...tdStyle(), fontWeight: '800', color: '#9c27b0' }}>£{monthlyTotals.totalNetCiro.toFixed(0)}</td>
                  <td style={{ ...tdStyle(), color: 'rgba(255,255,255,0.4)' }}>–</td>
                  <td style={{ ...tdStyle(monthlyTotals.totalKar >= 0 ? 'green' : 'red'), fontWeight: '800' }}>
                    {(monthlyTotals.totalKar >= 0 ? '+' : '') + '£' + monthlyTotals.totalKar.toFixed(0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(212,175,55,0.1)', fontSize: '0.6rem', color: 'var(--muted)' }}>
            Kasa/Banka masrafını girmek için ilgili hücreye tıkla. Ücretler = o gün çalışan berber sayısı × günlük ücret.
          </div>
        </div>
      )}

      {/* ── TAB 2: ÖDEMELER ── */}
      {!loading && activeTab === 'payments' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', alignItems: 'start' }}>
          {/* Payment list */}
          <div style={{ background: 'var(--card2)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(212,175,55,0.1)', fontSize: '0.65rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px' }}>
              TÜM ÖDEMELER / AVANSLAR
            </div>
            {payments.length === 0 && <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem' }}>Henüz kayıt yok.</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(212,175,55,0.05)' }}>
                  {['Tarih','Berber','Miktar','Yöntem','Not',''].map(h => (
                    <th key={h} style={{ ...thStyle, textAlign: h === '' ? 'center' : 'left', padding: '8px 14px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map(p => {
                  const d = p.date?.toDate ? p.date.toDate() : new Date(p.date);
                  const barber = barbers.find(b => b.name.toLowerCase() === (p.barberName || '').toLowerCase());
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 14px', fontSize: '0.75rem' }}>{d.toLocaleDateString('tr-TR')}</td>
                      <td style={{ padding: '10px 14px', fontSize: '0.75rem', color: barber?.color || '#d4af37', fontWeight: '600' }}>{p.barberName}</td>
                      <td style={{ padding: '10px 14px', fontSize: '0.82rem', fontWeight: '700', color: '#ff7043' }}>£{parseFloat(p.amount).toFixed(0)}</td>
                      <td style={{ padding: '10px 14px', fontSize: '0.72rem', color: 'var(--muted)' }}>{p.method}</td>
                      <td style={{ padding: '10px 14px', fontSize: '0.72rem', color: 'var(--muted)' }}>{p.notes}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <button onClick={() => deletePayment(p.id)}
                          style={{ background: 'transparent', border: 'none', color: 'rgba(255,82,82,0.5)', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add payment form */}
          <div style={{ background: 'var(--card2)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '0.65rem', color: '#d4af37', fontWeight: '700', letterSpacing: '2px' }}>YENİ ÖDEME / AVANS</div>
            <div>
              <label style={lbl}>Tarih</label>
              <input type="date" value={payForm.date} onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} style={{ ...inp, colorScheme: 'dark' }} />
            </div>
            <div>
              <label style={lbl}>Berber</label>
              <select value={payForm.barberName} onChange={e => setPayForm(f => ({ ...f, barberName: e.target.value }))}
                style={{ ...inp, cursor: 'pointer' }}>
                <option value="">Seç...</option>
                {barbers.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Miktar (£)</label>
              <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" style={inp} />
            </div>
            <div>
              <label style={lbl}>Yöntem</label>
              <select value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                <option>Cash</option>
                <option>Bank</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Not (opsiyonel)</label>
              <input value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} placeholder="Açıklama..." style={inp} />
            </div>
            <button onClick={addPayment} disabled={payLoading || !payForm.date || !payForm.barberName || !payForm.amount}
              style={{ padding: '11px', background: 'linear-gradient(135deg,#d4af37,#b8860b)', border: 'none', borderRadius: '8px', color: '#000', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer', opacity: (!payForm.date || !payForm.barberName || !payForm.amount) ? 0.5 : 1 }}>
              {payLoading ? 'Kaydediliyor...' : 'Ekle'}
            </button>
          </div>
        </div>
      )}

      {/* ── TAB 3: AYLIK ÖZET ── */}
      {!loading && activeTab === 'summary' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {monthlySummary.map(s => (
            <div key={s.name} style={{ background: 'var(--card2)', border: `1px solid ${s.color}30`, borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', background: `${s.color}12`, borderBottom: `1px solid ${s.color}20`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: '800', fontSize: '0.9rem' }}>
                  {s.name[0]}
                </div>
                <div>
                  <div style={{ fontWeight: '800', fontSize: '0.9rem', color: s.color }}>{s.name}</div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '1px' }}>{MONTH_NAMES[month]} {year}</div>
                </div>
              </div>
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { label: 'Çalışılan Gün', value: `${s.workedDays} gün`, color: 'var(--text)' },
                  { label: 'Toplam Ciro (Katkı)', value: `£${s.totalRevenue.toFixed(0)}`, color: '#d4af37' },
                  { label: 'Kazanılan Ücret', value: `£${s.wages.toFixed(0)}`, color: '#4caf50' },
                  { label: 'Toplam Avans', value: s.totalAdvances > 0 ? `£${s.totalAdvances.toFixed(0)}` : '–', color: '#ff7043' },
                  { label: 'Net Bakiye (Ücret - Avans)', value: `${s.balance >= 0 ? '+' : ''}£${s.balance.toFixed(0)}`, color: s.balance >= 0 ? '#4caf50' : '#ff5252' },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{row.label}</span>
                    <span style={{ fontSize: '0.88rem', fontWeight: '700', color: row.color }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Monthly expense summary */}
          <div style={{ background: 'var(--card2)', border: '1px solid rgba(255,112,67,0.25)', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', background: 'rgba(255,112,67,0.06)', borderBottom: '1px solid rgba(255,112,67,0.15)', fontSize: '0.65rem', color: '#ff7043', fontWeight: '700', letterSpacing: '2px' }}>
              AYLIK GİDER ÖZETİ
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Toplam Kasa Masraf', value: `£${monthlyTotals.totalKasa.toFixed(0)}`, color: '#ff7043' },
                { label: 'Toplam Banka Masraf', value: `£${monthlyTotals.totalBanka.toFixed(0)}`, color: '#ff7043' },
                { label: 'Toplam Ciro', value: `£${monthlyTotals.totalCiro.toFixed(0)}`, color: '#d4af37' },
                { label: 'Net Ciro (Masraf sonrası)', value: `£${monthlyTotals.totalNetCiro.toFixed(0)}`, color: '#9c27b0' },
                { label: 'Net Kar/Zarar', value: `${monthlyTotals.totalKar >= 0 ? '+' : ''}£${monthlyTotals.totalKar.toFixed(0)}`, color: monthlyTotals.totalKar >= 0 ? '#4caf50' : '#ff5252' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{row.label}</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: '700', color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
