import { convertTo24 } from './timeUtils';
import { normalizeBookingStatus, findServiceByBookingValue } from './bookingUtils';

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

  return (existingBookings || []).some((booking) => {
    const st = normalizeBookingStatus(booking.status);
    if (st === 'CANCELLED' || st === 'NO_SHOW' || st === 'DELETED' || st === 'CHECKED_OUT' || st === 'COMPLETED') return false;
    if (ignoreBookingId && booking.bookingId === ignoreBookingId) return false;
    if ((booking.barber || '').toLowerCase() !== barberValue) return false;
    if (booking.date !== dateValue) return false;

    const existingRange = getExistingRangeMinutes(booking);
    if (!existingRange) return false;

    return startMinutes < existingRange.end && endMinutes > existingRange.start;
  });
}
