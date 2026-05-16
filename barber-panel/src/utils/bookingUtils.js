import config, { seedServices } from '../config';

export function pp(val) {
  return parseFloat(String(val || '0').replace(/[£,]/g, '').replace('-', '').trim()) || 0;
}

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

export function normalizeBookingStatus(raw) {
  const n = String(raw || '').trim().toUpperCase().replace(/[-\s]+/g, '_');
  if (n === 'CHECKEDOUT' || n === 'PAID' || n === 'DONE' || n === 'COMPLETE') return 'CHECKED_OUT';
  if (n === 'CANCELED') return 'CANCELLED';
  if (n === 'NOSHOW' || n === 'NO_SHOW') return 'NO_SHOW';
  if (n === 'CONFIRMED' || n === 'PENDING' || n === 'CHECKED_OUT' || n === 'CANCELLED' || n === 'BLOCKED' || n === 'NO_SHOW') return n;
  return n || 'CONFIRMED';
}

export function normalizeSoldProducts(list) {
  return (Array.isArray(list) ? list : [])
    .map((p) => ({
      productId: p?.productId || p?.id || '',
      name: p?.name || 'Product',
      price: parseFloat(String(p?.price || 0).replace('£', '')) || 0,
      qty: parseInt(p?.qty, 10) || 0,
    }))
    .filter((p) => p.qty > 0);
}

export function getProductsTotal(list) {
  return normalizeSoldProducts(list).reduce((sum, p) => sum + p.price * p.qty, 0);
}

export function bookingNetWithoutTip(booking) {
  const paid = pp(booking?.paidAmount);
  if (normalizeBookingStatus(booking?.status) === 'CHECKED_OUT' && paid > 0) {
    return Math.max(0, paid - pp(booking?.tip));
  }
  const gross = pp(booking?.price) + pp(booking?.serviceCharge) + getProductsTotal(booking?.soldProducts);
  return Math.max(0, gross - pp(booking?.discount));
}

export function normalizeServiceKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

export function findServiceByBookingValue(value) {
  const liveList = Array.isArray(config.services) ? config.services : [];
  const seedList = Array.isArray(seedServices) ? seedServices : [];
  const list = [...liveList, ...seedList];
  const key = normalizeServiceKey(value);
  if (!key) return null;
  return list.find((s) => {
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
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
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

export function isBarberBookingDisabled(barber) {
  if (!barber) return false;
  return barber.active === false;
}

export function getAvailableBarbersForDate(barbers, date) {
  const targetDate = date || new Date();
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][targetDate.getDay()];
  return (barbers || []).filter((barber) => {
    if (isBarberBookingDisabled(barber)) return false;
    if (barber.workingDays && barber.workingDays.length > 0 && !barber.workingDays.includes(dayName)) return false;
    if (barber.dayHours && barber.dayHours[dayName] && barber.dayHours[dayName].closed) return false;
    return true;
  });
}

export function getBookingName(booking) {
  const firstLast = [booking?.firstName, booking?.lastName].filter(Boolean).join(' ').trim();
  const raw = booking?.name || booking?.customerName || booking?.clientName || booking?.fullName || booking?.customer || firstLast;
  return String(raw || '').trim() || 'Walk-in';
}

export function getBColor(barber, barbers) {
  if (barbers) {
    const f = barbers.find(b => b.name.toLowerCase() === (barber || '').toLowerCase());
    if (f) return f.color;
  }
  return { alex: '#d4af37', arda: '#4caf50' }[(barber || '').toLowerCase()] || '#7a7260';
}

export function getExtrasFromServices(services) {
  return (services || []).filter(s => s.category === 'Extras').map(s => ({
    id: s.id,
    name: s.name,
    price: s.price,
    category: 'Extras',
    active: true,
    inStock: true,
  }));
}
