import { addDays, compareDayKeys } from '../dates.ts';
import type { DayKey, Task, TaskStatus } from '../types.ts';

export type BoardStatus = Extract<TaskStatus, 'todo' | 'in-progress' | 'done'>;

export interface BoardColumn {
  /** Same key the `status` grouping produces, so query groups map 1:1. */
  key: string;
  label: string;
  status: BoardStatus;
}

/** Fixed columns: an empty column must still be there to drop onto. */
export const BOARD_COLUMNS: readonly BoardColumn[] = [
  { key: '0-todo', label: 'To do', status: 'todo' },
  { key: '1-in-progress', label: 'In progress', status: 'in-progress' },
  { key: '2-done', label: 'Done', status: 'done' },
];

/** The Done column only keeps what was finished this recently. */
export const BOARD_DONE_DAYS = 7;

/**
 * Which tasks belong on the board: everything open, plus tasks completed in
 * the last BOARD_DONE_DAYS. Without the window the Done column would carry the
 * vault's whole history. A done task with no ✅ date has no age, so it stays off.
 */
export function onBoard(task: Task, today: DayKey): boolean {
  if (task.status === 'todo' || task.status === 'in-progress') return true;
  if (task.status !== 'done' || task.doneDate === undefined) return false;
  return compareDayKeys(task.doneDate, addDays(today, -BOARD_DONE_DAYS)) >= 0;
}

/** Status a card dropped on `columnKey` should take, or null for an unknown column. */
export function columnStatus(columnKey: string): BoardStatus | null {
  return BOARD_COLUMNS.find((column) => column.key === columnKey)?.status ?? null;
}
