import { addDays, isValidDayKey, parseDayKey } from '../dates.ts';
import type { DayKey } from '../types.ts';

export interface NaturalDateResult {
  date: DayKey | null;
  /** Input with the recognized trailing date phrase removed. */
  cleaned: string;
}

/** ISO weekday of a day key: Monday = 1 … Sunday = 7. */
function isoWeekday(key: DayKey): number {
  const ymd = parseDayKey(key);
  if (!ymd) return 1;
  const jsDay = new Date(ymd.y, ymd.m - 1, ymd.d).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

/** Nearest day on or after `today` whose ISO weekday is `target`. */
function nextWeekday(today: DayKey, target: number): DayKey {
  const delta = (target - isoWeekday(today) + 7) % 7;
  return addDays(today, delta);
}

const WEEKDAYS: [RegExp, number][] = [
  [/luned[iì]|monday|\blun\b|\bmon\b/, 1],
  [/marted[iì]|tuesday|\bmar\b|\btue\b/, 2],
  [/mercoled[iì]|wednesday|\bmer\b|\bwed\b/, 3],
  [/gioved[iì]|thursday|\bgio\b|\bthu\b/, 4],
  [/venerd[iì]|friday|\bven\b|\bfri\b/, 5],
  [/sabato|saturday|\bsab\b|\bsat\b/, 6],
  [/domenica|sunday|\bdom\b|\bsun\b/, 7],
];

/** Each entry: a regex anchored at end of string → resolver(today, match). */
const PATTERNS: [RegExp, (today: DayKey, match: RegExpExecArray) => DayKey | null][] = [
  [/(\d{4}-\d{2}-\d{2})$/, (_t, m) => (isValidDayKey(m[1] ?? '') ? (m[1] as DayKey) : null)],
  [
    // Slash-only shorthand: `.`/`-` collide with decimals ("v2.1") and ranges
    // ("cap 3-4"); full hyphen dates are covered by the ISO pattern above.
    /(?:^|\s)(\d{1,2})\/(\d{1,2})$/,
    (today, m) => {
      const day = Number(m[1]);
      const month = Number(m[2]);
      const year = Number(parseDayKey(today)?.y ?? 0);
      const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (!isValidDayKey(candidate)) return null;
      // A date already gone by rolls to next year — friendlier for capture.
      return candidate < today
        ? `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        : candidate;
    },
  ],
  [/\b(?:oggi|today)$/, (today) => today],
  [/\b(?:dopodomani|day after tomorrow)$/, (today) => addDays(today, 2)],
  [/\b(?:domani|tomorrow)$/, (today) => addDays(today, 1)],
  [
    /\b(?:tra|fra|in)\s+(\d+)\s+(giorn[oi]|days?|settiman[ae]|weeks?)$/,
    (today, m) => {
      const n = Number(m[1]);
      const unit = m[2] ?? '';
      const days = /sett|week/.test(unit) ? n * 7 : n;
      return addDays(today, days);
    },
  ],
  [/\b(?:prossima settimana|settimana prossima|next week)$/, (today) => addDays(today, 7)],
  [
    /\b(?:questo\s+)?(?:weekend|fine settimana)$/,
    (today) => nextWeekday(today, 6),
  ],
];

/**
 * Detect a trailing natural-language date in `text` (Italian + English) and
 * return the resolved day plus the text with that phrase stripped. Only the
 * end of the string is inspected, so descriptions are never mangled.
 */
export function parseNaturalDate(text: string, today: DayKey): NaturalDateResult {
  const trimmed = text.replace(/\s+$/, '');
  const lower = trimmed.toLowerCase();

  for (const [pattern, resolve] of PATTERNS) {
    const match = pattern.exec(lower);
    if (!match) continue;
    const date = resolve(today, match);
    if (date === null) continue;
    return { date, cleaned: trimmed.slice(0, match.index).replace(/\s+$/, '') };
  }

  for (const [pattern, target] of WEEKDAYS) {
    const anchored = new RegExp(`(?:^|\\s)(${pattern.source})$`, 'u');
    const match = anchored.exec(lower);
    if (!match) continue;
    return {
      date: nextWeekday(today, target),
      cleaned: trimmed.slice(0, match.index).replace(/\s+$/, ''),
    };
  }

  return { date: null, cleaned: trimmed };
}
