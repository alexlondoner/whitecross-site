export function convertTo24(t) {
  if (!t) return 0;
  const s = String(t);
  const m1 = s.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (m1) {
    let h = parseInt(m1[1]); const min = parseInt(m1[2]); const ap = m1[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  }
  const mPlain = s.match(/^(\d{1,2}):(\d{2})$/);
  if (mPlain) {
    const h = parseInt(mPlain[1], 10);
    const min = parseInt(mPlain[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return h * 60 + min;
  }
  const m2 = s.match(/T(\d+):(\d+)/);
  if (m2) return parseInt(m2[1]) * 60 + parseInt(m2[2]);
  return 0;
}

export function minsToLabel(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
  return h12 + ':' + (m === 0 ? '00' : String(m).padStart(2, '0')) + ' ' + ap;
}

export function formatDateKey(date) {
  return date.getDate() + ' ' + date.toLocaleDateString('en-GB', { month: 'long' }) + ' ' + date.getFullYear();
}

export function toDateKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

export function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

export function getFirstDay(y, m) { let d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }

export function getWeekDates(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(d);
    dd.setDate(d.getDate() + i);
    return dd;
  });
}
