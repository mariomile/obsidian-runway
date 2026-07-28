// ⚠️ VENDORED da marioverse-kit/daykey.ts — sorgente canonica lì.
// Non editare qui: modifica il canonico e rilancia marioverse-kit/sync.sh.
// marioverse-kit · daykey — canonical source of truth.
//
// The day-key primitives shared verbatim across the suite. A DayKey is an
// ISO `YYYY-MM-DD` string; all arithmetic goes through the local calendar so a
// DST transition never shifts a whole-day result. Higher-level, plugin-specific
// helpers (calendar grids, agenda labels, ISO weeks) stay in each consumer's
// own `dates.ts` — this module is only the core every plugin agreed on.
//
// Consumers vendor a copy at `src/kit/daykey.ts` via `sync.sh`. Edit HERE, then
// re-sync; never edit a vendored copy directly.

export type DayKey = string;

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

export function mustParse(key: DayKey): Ymd {
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

export function compareDayKeys(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
