import { toDateKey } from './timeUtils';

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
  return {
    open: special.open || base.open,
    close: special.close || base.close,
    closed: !!special.closed,
    note: special.note || '',
  };
}
