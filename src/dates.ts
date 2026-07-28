import type { DayKey } from './types.ts';
import { mustParse } from './kit/daykey.ts';

// Day-key core condiviso via marioverse-kit (vendored in src/kit/daykey.ts).
export {
  addDays,
  addMonths,
  compareDayKeys,
  dayKey,
  daysInMonth,
  isValidDayKey,
  mustParse,
  parseDayKey,
  todayKey,
  type Ymd,
} from './kit/daykey.ts';

/** Whole-day difference b − a (both must be valid keys). */
export function daysBetween(a: DayKey, b: DayKey): number {
  const from = mustParse(a);
  const to = mustParse(b);
  const ms =
    new Date(to.y, to.m - 1, to.d).getTime() - new Date(from.y, from.m - 1, from.d).getTime();
  return Math.round(ms / 86_400_000);
}

// Fixed English tables — no `Intl`, so agenda labels are byte-deterministic in
// tests and identical across the user's locale. Sunday-indexed to match getDay().
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Weekday index (0 = Sunday) for a calendar day. */
export function dayOfWeek(key: DayKey): number {
  const { y, m, d } = mustParse(key);
  return new Date(y, m - 1, d).getDay();
}

/**
 * Two-part label for an Agenda day bucket, relative to `today`.
 * `primary` is the scannable word/weekday ("Today" / "Tomorrow" / "Wed"),
 * `secondary` the faint tabular date ("6 Jul") that disambiguates repeats
 * (two Wednesdays inside a 14-day horizon share a primary, differ on date).
 */
export function agendaDayLabel(
  key: DayKey,
  today: DayKey,
): { primary: string; secondary: string } {
  const { m, d } = mustParse(key);
  // Indices are exhaustive: mustParse guarantees m∈1..12, getDay() returns 0..6.
  const secondary = `${d} ${MONTHS[m - 1]!}`;
  const diff = daysBetween(today, key);
  if (diff === 0) return { primary: 'Today', secondary };
  if (diff === 1) return { primary: 'Tomorrow', secondary };
  return { primary: WEEKDAYS[dayOfWeek(key)]!, secondary };
}
