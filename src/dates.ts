import type { DayKey } from './types.ts';

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(y: number, m: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(y, m, 0).getDate();
}

export function dayKey(y: number, m: number, d: number): DayKey {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

export function parseDayKey(key: string): Ymd | null {
  const match = DAY_KEY_RE.exec(key);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function isValidDayKey(key: string): boolean {
  return parseDayKey(key) !== null;
}

export function todayKey(now: Date = new Date()): DayKey {
  return dayKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function fromDate(date: Date): DayKey {
  return dayKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function mustParse(key: DayKey): Ymd {
  const ymd = parseDayKey(key);
  if (!ymd) throw new Error(`Invalid DayKey: ${key}`);
  return ymd;
}

export function addDays(key: DayKey, n: number): DayKey {
  const { y, m, d } = mustParse(key);
  // Date normalizes overflow on the local calendar, so DST never shifts the day.
  return fromDate(new Date(y, m - 1, d + n));
}

export function addMonths(key: DayKey, n: number): DayKey {
  const { y, m, d } = mustParse(key);
  const monthIndex = m - 1 + n;
  const targetYear = y + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12 + 1;
  const clampedDay = Math.min(d, daysInMonth(targetYear, targetMonth));
  return dayKey(targetYear, targetMonth, clampedDay);
}

/** Whole-day difference b − a (both must be valid keys). */
export function daysBetween(a: DayKey, b: DayKey): number {
  const from = mustParse(a);
  const to = mustParse(b);
  const ms =
    new Date(to.y, to.m - 1, to.d).getTime() - new Date(from.y, from.m - 1, from.d).getTime();
  return Math.round(ms / 86_400_000);
}

export function compareDayKeys(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
