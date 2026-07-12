import type { DayKey, Priority, TaskGroup, TaskStatus } from '../types.ts';

export type ColumnsBy = 'status' | 'time' | 'priority';

export type DropAction =
  | { kind: 'status'; status: Exclude<TaskStatus, 'unknown'> }
  | { kind: 'reschedule'; date: DayKey }
  | { kind: 'clearDate' }
  | { kind: 'priority'; priority: Priority | null }
  | { kind: 'none' };

export function boardGroup(columnsBy: ColumnsBy): TaskGroup {
  if (columnsBy === 'time') return 'date';
  return columnsBy; // 'status' | 'priority'
}

const STATUS_BY_KEY: Record<string, Exclude<TaskStatus, 'unknown'>> = {
  '0-todo': 'todo',
  '1-in-progress': 'in-progress',
  '2-done': 'done',
  '3-cancelled': 'cancelled',
};

const PRIORITY_BY_KEY: Record<string, Priority | null> = {
  '0-highest': 'highest',
  '1-high': 'high',
  '2-medium': 'medium',
  '3-low': 'low',
  '4-lowest': 'lowest',
  '5-none': null,
};

export function columnDropAction(columnsBy: ColumnsBy, columnKey: string, today: DayKey): DropAction {
  if (columnsBy === 'status') {
    const status = STATUS_BY_KEY[columnKey];
    return status ? { kind: 'status', status } : { kind: 'none' };
  }
  if (columnsBy === 'priority') {
    if (columnKey in PRIORITY_BY_KEY) return { kind: 'priority', priority: PRIORITY_BY_KEY[columnKey]! };
    return { kind: 'none' };
  }
  // time: date buckets — only Today and No date have an unambiguous target.
  if (columnKey === 'b-today') return { kind: 'reschedule', date: today };
  if (columnKey === 'zz-none') return { kind: 'clearDate' };
  return { kind: 'none' };
}

/** What a task created from a column's "+" should carry. */
export interface AddIntent {
  date?: DayKey | null;
  priority?: Priority | null;
}

/**
 * What a column's "+" pre-fills, or null when creating a task there would be
 * ambiguous (e.g. an "In corso"/"Done" status column, or an Overdue bucket).
 * An empty object means "plain task, no prefill".
 */
export function columnAddIntent(
  columnsBy: ColumnsBy,
  columnKey: string,
  today: DayKey,
): AddIntent | null {
  if (columnsBy === 'status') {
    return columnKey === '0-todo' ? {} : null;
  }
  if (columnsBy === 'priority') {
    if (columnKey === '5-none') return { priority: null };
    if (columnKey in PRIORITY_BY_KEY) return { priority: PRIORITY_BY_KEY[columnKey]! };
    return null;
  }
  if (columnKey === 'b-today') return { date: today };
  if (columnKey === 'zz-none') return { date: null };
  return null;
}
