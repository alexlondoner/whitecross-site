import config, { seedServices } from '../config';

// ─── Service lookup ───────────────────────────────────────────────────────────
export function normalizeServiceKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

export function findServiceByBookingValue(value) {
  const liveList = Array.isArray(config.services) ? config.services : [];
  const seedList = Array.isArray(seedServices) ? seedServices : [];
  const list = [...liveList, ...seedList];
  const key = normalizeServiceKey(value);
  if (!key) return null;
  return list.find(s => {
    const idKey = normalizeServiceKey(s?.id);
    const nameKey = normalizeServiceKey(s?.name);
    return key === idKey || key === nameKey;
  }) || null;
}

export function prettifyServiceId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const looksLikeId = raw.includes('-') || raw.includes('_');
  if (!looksLikeId) return raw;
  return raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, m => m.toUpperCase());
}

export function getBookingServiceLabel(booking) {
  const svc = findServiceByBookingValue(booking?.service);
  if (svc?.name) return svc.name;
  const explicitName = String(booking?.serviceName || booking?.serviceLabel || '').trim();
  if (explicitName) return explicitName;
  const rawService = String(booking?.service || '').trim();
  if (rawService) return prettifyServiceId(rawService);
  return booking?.source === 'Product Sale' ? 'Product Sale' : '';
}

export function getDisplayedAmount(booking) {
  const hasPrice = booking?.price !== undefined && booking?.price !== null && String(booking.price) !== '';
  if (hasPrice) return booking.price;
  const svc = findServiceByBookingValue(booking?.service);
  if (svc) return svc.price;
  return booking?.paidAmount ?? '';
}

// ─── Status normalisation ─────────────────────────────────────────────────────
export function normalizeBookingStatus(raw) {
  const n = String(raw || '').trim().toUpperCase().replace(/[-\s]+/g, '_');
  if (n === 'CHECKEDOUT' || n === 'PAID' || n === 'DONE' || n === 'COMPLETE') return 'CHECKED_OUT';
  if (n === 'CANCELED') return 'CANCELLED';
  if (n === 'NOSHOW' || n === 'NO_SHOW') return 'NO_SHOW';
  if (['CONFIRMED','PENDING','CHECKED_OUT','CANCELLED','BLOCKED','NO_SHOW','UNPAID'].includes(n)) return n;
  return n || 'CONFIRMED';
}

// ─── Source normalisation ─────────────────────────────────────────────────────
export function normalizeBookingSource(raw) {
  const n = String(raw || '').trim().toLowerCase();
  if (!n) return 'Website';
  if (n === 'booksy') return 'Booksy';
  if (n === 'fresha') return 'Fresha';
  if (n === 'treatwell') return 'Treatwell';
  if (n === 'website') return 'Website';
  if (n === 'product sale' || n === 'product_sale' || n === 'productsale') return 'Product Sale';
  if (n === 'walk-in' || n === 'walk_in' || n === 'walkin' || n === 'historical' || n === 'manual') return 'Walk-in';
  return String(raw || '').trim();
}

// ─── Products ─────────────────────────────────────────────────────────────────
export function normalizeSoldProducts(list) {
  return (Array.isArray(list) ? list : [])
    .map(p => ({
      productId: p?.productId || p?.id || '',
      name: p?.name || 'Product',
      price: parseFloat(String(p?.price || 0).replace('£', '')) || 0,
      qty: parseInt(p?.qty, 10) || 0,
    }))
    .filter(p => p.qty > 0);
}

export function getProductsTotal(list) {
  return normalizeSoldProducts(list).reduce((sum, p) => sum + p.price * p.qty, 0);
}

// ─── Money helpers ────────────────────────────────────────────────────────────
export function pp(val) {
  return parseFloat(String(val || '0').replace(/[£,]/g, '').replace('-', '').trim()) || 0;
}

export function bookingNetWithoutTip(booking) {
  const paid = pp(booking?.paidAmount);
  if (normalizeBookingStatus(booking?.status) === 'CHECKED_OUT' && paid > 0) {
    return Math.max(0, paid - pp(booking?.tip));
  }
  const gross = pp(booking?.price) + pp(booking?.serviceCharge) + getProductsTotal(booking?.soldProducts);
  return Math.max(0, gross - pp(booking?.discount));
}

// ─── Barber colour ────────────────────────────────────────────────────────────
export function getBColor(barber, barbers) {
  if (barbers) {
    const f = barbers.find(b => b.name.toLowerCase() === (barber || '').toLowerCase());
    if (f) return f.color;
  }
  return { alex: '#d4af37', arda: '#4caf50' }[(barber || '').toLowerCase()] || '#7a7260';
}

// ─── Booking name ─────────────────────────────────────────────────────────────
export function getBookingName(booking) {
  const firstLast = [booking?.firstName, booking?.lastName].filter(Boolean).join(' ').trim();
  const raw = booking?.name || booking?.customerName || booking?.clientName || booking?.fullName || booking?.customer || firstLast;
  return String(raw || '').trim() || 'Walk-in';
}

// ─── Time helpers ─────────────────────────────────────────────────────────────
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
  if (mPlain) { const h = parseInt(mPlain[1], 10); const min = parseInt(mPlain[2], 10); if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return h * 60 + min; }
  const m2 = s.match(/T(\d+):(\d+)/);
  if (m2) return parseInt(m2[1]) * 60 + parseInt(m2[2]);
  return 0;
}

export function minsToLabel(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
  return h12 + ':' + (m === 0 ? '00' : String(m).padStart(2, '0')) + ' ' + ap;
}

export function toDateKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDateKey(date) {
  return date.getDate() + ' ' + date.toLocaleDateString('en-GB', { month: 'long' }) + ' ' + date.getFullYear();
}

export function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
export function getFirstDay(y, m) { let d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }

export function getWeekDates(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => { const dd = new Date(d); dd.setDate(d.getDate() + i); return dd; });
}

// ─── Availability helpers ─────────────────────────────────────────────────────
export function normalizeSpecialHours(list) {
  return (Array.isArray(list) ? list : [])
    .filter(item => item && item.date)
    .map(item => ({
      date: item.date,
      open: item.open || '09:00',
      close: item.close || '19:00',
      closed: !!item.closed,
      note: item.note || '',
    }));
}

export function getSpecialHoursForDate(date, specialHours) {
  const key = toDateKey(date);
  return (specialHours || []).find(item => item.date === key) || null;
}

export function getEffectiveDayHours(date, dayName, weeklyHours, specialHours) {
  const base = (weeklyHours && weeklyHours[dayName]) || { open: '09:00', close: '19:00', closed: false };
  const special = getSpecialHoursForDate(date, specialHours);
  if (!special) return base;
  return { open: special.open || base.open, close: special.close || base.close, closed: !!special.closed, note: special.note || '' };
}

export function isBarberBookingDisabled(barber) {
  if (!barber) return false;
  return barber.active === false;
}

export function getAvailableBarbersForDate(barbers, date) {
  const targetDate = date || new Date();
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][targetDate.getDay()];
  return (barbers || []).filter(barber => {
    if (isBarberBookingDisabled(barber)) return false;
    if (barber.workingDays && barber.workingDays.length > 0 && !barber.workingDays.includes(dayName)) return false;
    if (barber.dayHours && barber.dayHours[dayName] && barber.dayHours[dayName].closed) return false;
    return true;
  });
}

export function getExistingRangeMinutes(booking) {
  const start = convertTo24(booking.time || booking.startTime || '');
  if (!Number.isFinite(start)) return null;
  if (booking.status === 'BLOCKED') {
    const end = convertTo24(booking.endTime || '');
    return { start, end: Number.isFinite(end) && end > start ? end : start + 60 };
  }
  const service = findServiceByBookingValue(booking.service);
  const duration = service ? (parseInt(service.duration, 10) || 30) : 30;
  return { start, end: start + duration };
}

export function hasTimeConflict(existingBookings, options) {
  const { dateValue, barberValue, startMinutes, durationMinutes, ignoreBookingId } = options;
  const endMinutes = startMinutes + durationMinutes;
  return (existingBookings || []).some(booking => {
    const st = normalizeBookingStatus(booking.status);
    if (['CANCELLED','NO_SHOW','DELETED','CHECKED_OUT','COMPLETED'].includes(st)) return false;
    if (ignoreBookingId && booking.bookingId === ignoreBookingId) return false;
    if ((booking.barber || '').toLowerCase() !== barberValue) return false;
    if (booking.date !== dateValue) return false;
    const existingRange = getExistingRangeMinutes(booking);
    if (!existingRange) return false;
    return startMinutes < existingRange.end && endMinutes > existingRange.start;
  });
}
