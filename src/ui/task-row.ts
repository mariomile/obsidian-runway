import { setIcon } from 'obsidian';

import { compareDayKeys, todayKey } from '../dates.ts';
import { PRIORITY_EMOJI } from '../core/parse.ts';
import { refOf, showTaskMenu } from './task-menu.ts';
import { showDateMenu } from './date-menu.ts';
import type { RunwayContext } from './context.ts';
import type { DateEmoji, DayKey, Task } from '../types.ts';

export interface TaskRowOptions {
  /** Hide the note-name chip (e.g. when grouping by note already says it). */
  showNote?: boolean;
}

function noteName(path: string): string {
  const slash = path.lastIndexOf('/');
  return path.slice(slash + 1).replace(/\.md$/, '');
}

/** Display text: collapse markdown/wiki links to their label, keep everything else. */
export function displayText(description: string): string {
  return description
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]|]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'Completa',
  'in-progress': 'Completa',
  done: 'Riapri',
  cancelled: 'Riapri',
};

/** Dot-marked date chip (horizon semantic colors), clickable to reschedule. */
function renderDateChip(
  meta: HTMLElement,
  ctx: RunwayContext,
  task: Task,
  emoji: DateEmoji,
  date: DayKey,
  kind: 'due' | 'scheduled',
): void {
  const open = task.status !== 'done' && task.status !== 'cancelled';
  const late = open && compareDayKeys(date, todayKey()) < 0;
  const chip = meta.createSpan({
    cls: `runway-chip runway-chip--${kind}${late ? ' runway-chip--overdue' : ''}`,
  });
  chip.createSpan({ cls: 'runway-chip__dot' });
  chip.createSpan({ cls: 'runway-chip__label', text: date });
  if (task.status === 'unknown') return;
  chip.setAttribute(
    'aria-label',
    kind === 'due' ? 'Scadenza — clic per rischedulare' : 'Pianificato — clic per rischedulare',
  );
  chip.addEventListener('click', (event) => {
    event.stopPropagation();
    showDateMenu(event, ctx.app, date, {
      onPick: (next) => void ctx.edits.reschedule(refOf(task), next, emoji),
      onClear: () => void ctx.edits.clearDate(refOf(task), emoji),
    });
  });
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

  const checkWrap = row.createDiv({ cls: 'runway-row__check' });
  checkWrap.createSpan({ cls: `runway-check runway-check--${task.status}` });
  if (task.status !== 'unknown') {
    checkWrap.setAttribute('aria-label', STATUS_LABEL[task.status] ?? 'Completa');
    checkWrap.addEventListener('click', (event) => {
      event.stopPropagation();
      const target = task.status === 'done' ? 'todo' : 'done';
      void ctx.edits.setStatus(ref, target);
    });
  }

  const main = row.createDiv({ cls: 'runway-row__main' });
  const desc = main.createDiv({
    cls: 'runway-row__desc',
    text: displayText(task.description) || '(senza testo)',
  });
  desc.addEventListener('click', () => void ctx.edits.openAtLine(ref));

  const meta = main.createDiv({ cls: 'runway-row__meta' });
  if (task.priority !== null) {
    meta.createSpan({
      cls: `runway-chip runway-chip--priority`,
      text: PRIORITY_EMOJI[task.priority],
      attr: { 'aria-label': `Priorità: ${task.priority}` },
    });
  }
  if (task.due !== undefined) {
    renderDateChip(meta, ctx, task, '📅', task.due, 'due');
  }
  if (task.scheduled !== undefined) {
    renderDateChip(meta, ctx, task, '⏳', task.scheduled, 'scheduled');
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
