import { setIcon } from 'obsidian';

import { compareDayKeys, todayKey } from '../dates.ts';
import { PRIORITY_EMOJI } from '../core/parse.ts';
import { refOf, showTaskMenu } from './task-menu.ts';
import { showDateMenu } from './date-menu.ts';
import type { RunwayContext } from './context.ts';
import type { Task } from '../types.ts';

export interface TaskRowOptions {
  /** Hide the note-name chip (e.g. when grouping by folder already says it). */
  showNote?: boolean;
}

function noteName(path: string): string {
  const slash = path.lastIndexOf('/');
  return path.slice(slash + 1).replace(/\.md$/, '');
}

/** One task row, shared by the sidebar and the list view. */
export function renderTaskRow(
  container: HTMLElement,
  ctx: RunwayContext,
  task: Task,
  options: TaskRowOptions = {},
): void {
  const ref = refOf(task);
  const row = container.createDiv({ cls: 'runway-row' });
  row.dataset.status = task.status;

  const checkbox = row.createDiv({ cls: 'runway-row__check' });
  const checkIcon: Record<string, string> = {
    todo: 'circle',
    'in-progress': 'circle-dot',
    done: 'check-circle-2',
    cancelled: 'x-circle',
    unknown: 'help-circle',
  };
  setIcon(checkbox, checkIcon[task.status] ?? 'circle');
  if (task.status !== 'unknown') {
    checkbox.setAttribute('aria-label', task.status === 'done' ? 'Riapri' : 'Completa');
    checkbox.addEventListener('click', (event) => {
      event.stopPropagation();
      const target = task.status === 'done' ? 'todo' : 'done';
      void ctx.edits.setStatus(ref, target);
    });
  }

  const main = row.createDiv({ cls: 'runway-row__main' });
  const desc = main.createDiv({ cls: 'runway-row__desc', text: task.description || '(senza testo)' });
  desc.addEventListener('click', () => void ctx.edits.openAtLine(ref));

  const meta = main.createDiv({ cls: 'runway-row__meta' });
  if (task.priority !== null) {
    meta.createSpan({
      cls: `runway-chip runway-chip--priority runway-chip--${task.priority}`,
      text: PRIORITY_EMOJI[task.priority],
    });
  }
  if (task.due !== undefined) {
    const overdue = compareDayKeys(task.due, todayKey()) < 0 && task.status !== 'done';
    const dueChip = meta.createSpan({
      cls: `runway-chip runway-chip--due${overdue ? ' runway-chip--overdue' : ''}`,
      text: `📅 ${task.due}`,
    });
    if (task.status !== 'unknown') {
      dueChip.setAttribute('aria-label', 'Rischedula');
      dueChip.addEventListener('click', (event) => {
        event.stopPropagation();
        showDateMenu(event, ctx.app, task.due, {
          onPick: (date) => void ctx.edits.reschedule(ref, date),
          onClear: () => void ctx.edits.clearDate(ref),
        });
      });
    }
  }
  if (task.scheduled !== undefined) {
    const late =
      compareDayKeys(task.scheduled, todayKey()) < 0 &&
      task.status !== 'done' &&
      task.status !== 'cancelled';
    const scheduledChip = meta.createSpan({
      cls: `runway-chip runway-chip--scheduled${late ? ' runway-chip--overdue' : ''}`,
      text: `⏳ ${task.scheduled}`,
    });
    if (task.status !== 'unknown') {
      scheduledChip.setAttribute('aria-label', 'Rischedula (⏳)');
      scheduledChip.addEventListener('click', (event) => {
        event.stopPropagation();
        showDateMenu(event, ctx.app, task.scheduled, {
          onPick: (date) => void ctx.edits.reschedule(ref, date, '⏳'),
          onClear: () => void ctx.edits.clearDate(ref, '⏳'),
        });
      });
    }
  }
  if (options.showNote !== false) {
    const note = meta.createSpan({
      cls: 'runway-chip runway-chip--note',
      text: noteName(task.path),
    });
    note.setAttribute('aria-label', task.path);
    note.addEventListener('click', (event) => {
      event.stopPropagation();
      void ctx.edits.openAtLine(ref);
    });
  }

  row.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    showTaskMenu(event, ctx, task);
  });
  const more = row.createDiv({ cls: 'runway-row__more' });
  setIcon(more, 'more-horizontal');
  more.setAttribute('aria-label', 'Azioni');
  more.addEventListener('click', (event) => {
    event.stopPropagation();
    showTaskMenu(event, ctx, task);
  });
}
