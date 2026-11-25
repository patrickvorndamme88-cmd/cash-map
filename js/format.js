// ==========================================================================
// cash-map — German Formatting, Date Math & Privacy Helpers
// ==========================================================================

const currencyFmt = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyCompactFmt = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFmt = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MONTH_NAMES_LONG = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function roundCents(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function formatMoney(amount, { privacy = false, signed = false, compact = false } = {}) {
  if (privacy) return signed ? '±••• €' : '•••,•• €';
  const val = roundCents(amount || 0);
  const absVal = Math.abs(val);
  const formatted = compact && Number.isInteger(absVal)
    ? currencyCompactFmt.format(absVal)
    : currencyFmt.format(absVal);

  if (val < 0) return `−${formatted}`;
  if (signed && val > 0) return `+${formatted}`;
  return formatted;
}

export function formatPlainNumber(amount) {
  return numberFmt.format(roundCents(amount || 0));
}

export function formatPercent(value, digits = 0) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(digits).replace('.', ',')} %`;
}

export function getTodayISO() {
  const d = new Date();
  return toISODate(d);
}

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getCurrentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function parseMonthKey(key) {
  const [y, m] = String(key).split('-').map(Number);
  return { year: y, month: m }; // month is 1..12
}

export function monthKeyFromDate(isoDate) {
  return String(isoDate).slice(0, 7);
}

export function shiftMonthKey(key, delta) {
  const { year, month } = parseMonthKey(key);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function compareMonthKeys(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function listMonthsBetween(startKey, endKey) {
  const result = [];
  if (compareMonthKeys(startKey, endKey) > 0) return [endKey];
  let cur = startKey;
  let guard = 0;
  while (compareMonthKeys(cur, endKey) <= 0 && guard < 240) {
    result.push(cur);
    cur = shiftMonthKey(cur, 1);
    guard++;
  }
  return result;
}

export function formatMonthLong(key) {
  const { year, month } = parseMonthKey(key);
  return `${MONTH_NAMES_LONG[month - 1]} ${year}`;
}

export function formatMonthShort(key) {
  const { year, month } = parseMonthKey(key);
  return `${MONTH_NAMES_SHORT[month - 1]} ${String(year).slice(-2)}`;
}

export function formatMonthNameOnly(key) {
  const { month } = parseMonthKey(key);
  return MONTH_NAMES_SHORT[month - 1];
}

export function formatDateGroupLabel(isoDate) {
  const today = getTodayISO();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = toISODate(yesterdayDate);

  if (isoDate === today) return 'Heute';
  if (isoDate === yesterday) return 'Gestern';

  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = WEEKDAYS_SHORT[dt.getDay()];
  return `${wd}, ${d}. ${MONTH_NAMES_SHORT[m - 1]} ${y}`;
}

export function formatShortDate(isoDate) {
  if (!isoDate) return '';
  const [, m, d] = isoDate.split('-').map(Number);
  return `${d}. ${MONTH_NAMES_SHORT[m - 1]}`;
}

export function daysInMonth(monthKey) {
  const { year, month } = parseMonthKey(monthKey);
  return new Date(year, month, 0).getDate();
}

export function defaultDateForMonth(monthKey) {
  const cur = getCurrentMonthKey();
  if (monthKey === cur) return getTodayISO();
  return `${monthKey}-15`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function parseGermanAmount(str) {
  if (typeof str === 'number') return Number.isFinite(str) ? roundCents(str) : NaN;
  const cleaned = String(str ?? '')
    .trim()
    .replace(/[€\s]/g, '')
    .replace(/\.(?=\d{3}(?:,|$))/g, '') // thousands dot
    .replace(',', '.');
  if (!cleaned) return NaN;
  const val = Number(cleaned);
  return Number.isFinite(val) ? roundCents(val) : NaN;
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
