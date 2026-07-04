import { addDays, addMonths, daysBetween } from '../dates.ts';
import { parseTaskLine } from './parse.ts';
import { rewriteDate, transitionStatus } from './serialize.ts';
import type { DayKey } from '../types.ts';

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';

export interface Recurrence {
  unit: RecurrenceUnit;
  interval: number;
  /** `🔁 … when done`: the next date is measured from the completion date. */
  whenDone: boolean;
}

const RULE_RE =
  /🔁\s*every\s+(?:(\d+)\s+)?(day|days|week|weeks|month|months|year|years)\b(\s+when\s+done)?/iu;

/**
 * Parse the subset of Tasks-plugin recurrence rules Runway handles:
 * `every [N] day|week|month|year [when done]`. Anything richer (specific
 * weekdays, "every weekday", multiple clauses) returns null → the caller
 * falls back to opening the file, never corrupting the series.
 */
export function parseRecurrence(text: string): Recurrence | null {
  const match = RULE_RE.exec(text);
  if (!match) return null;
  const interval = match[1] ? Number(match[1]) : 1;
  if (!Number.isFinite(interval) || interval < 1) return null;
  const unitWord = (match[2] ?? '').toLowerCase();
  const unit: RecurrenceUnit = unitWord.startsWith('day')
    ? 'day'
    : unitWord.startsWith('week')
      ? 'week'
      : unitWord.startsWith('month')
        ? 'month'
        : 'year';
  return { unit, interval, whenDone: match[3] !== undefined };
}

function shift(date: DayKey, rec: Recurrence): DayKey {
  switch (rec.unit) {
    case 'day':
      return addDays(date, rec.interval);
    case 'week':
      return addDays(date, rec.interval * 7);
    case 'month':
      return addMonths(date, rec.interval);
    case 'year':
      return addMonths(date, rec.interval * 12);
  }
}

export interface RecurrenceResult {
  /** The new open occurrence (goes above), then the completed line. */
  nextLine: string;
  completedLine: string;
}

/**
 * Complete a recurring task Tasks-plugin style: mark the current line done and
 * spawn the next occurrence above it, each date field advanced by the rule.
 * Returns null when the rule is unsupported or the task carries no date to
 * advance — the caller then handles it safely (open the file).
 */
export function completeRecurring(rawText: string, today: DayKey): RecurrenceResult | null {
  const parsed = parseTaskLine(rawText);
  if (!parsed) return null;
  const rec = parseRecurrence(rawText);
  if (!rec) return null;
  if (parsed.due === undefined && parsed.scheduled === undefined) return null;

  let nextDue: DayKey | undefined;
  let nextScheduled: DayKey | undefined;

  if (rec.whenDone) {
    if (parsed.due !== undefined) {
      nextDue = shift(today, rec);
      if (parsed.scheduled !== undefined) {
        nextScheduled = addDays(nextDue, daysBetween(parsed.due, parsed.scheduled));
      }
    } else if (parsed.scheduled !== undefined) {
      nextScheduled = shift(today, rec);
    }
  } else {
    if (parsed.due !== undefined) nextDue = shift(parsed.due, rec);
    if (parsed.scheduled !== undefined) nextScheduled = shift(parsed.scheduled, rec);
  }

  let nextLine = transitionStatus(rawText, 'todo', today);
  if (nextDue !== undefined) nextLine = rewriteDate(nextLine, '📅', nextDue);
  if (nextScheduled !== undefined) nextLine = rewriteDate(nextLine, '⏳', nextScheduled);

  const completedLine = transitionStatus(rawText, 'done', today);
  return { nextLine, completedLine };
}
