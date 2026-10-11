import { setIcon } from 'obsidian';

import { BOARD_COLUMNS, columnStatus } from '../core/board.ts';
import { renderTaskRow } from './task-row.ts';
import { QuickAddModal } from './quick-add-modal.ts';
import { refOf } from './task-menu.ts';
import type { TaskRef } from '../edits/task-edit.ts';
import type { RunwayContext } from './context.ts';
import type { Task, TaskGroupResult } from '../types.ts';

const DRAG_MIME = 'application/x-runway-task';

export interface BoardOptions {
  ctx: RunwayContext;
  /** Wire cursor/selection onto each card, same as list rows. */
  onCard: (task: Task, card: HTMLElement) => void;
  /** Max cards rendered in a column. */
  limit: (columnKey: string) => number;
  onShowMore: (columnKey: string) => void;
}

function parseRef(payload: string): TaskRef | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { path, line, rawText } = parsed as Record<string, unknown>;
  if (typeof path !== 'string' || typeof line !== 'number' || typeof rawText !== 'string') return null;
  return { path, line, rawText };
}

/**
 * Status board: To do · In progress · Done, always all three so an empty
 * column is still a drop target. Dragging a card onto a column sets that
 * status on the task line ([ ] / [/] / [x]); the index refresh re-renders.
 */
export function renderBoard(parent: HTMLElement, groups: TaskGroupResult[], opts: BoardOptions): void {
  const board = parent.createDiv({ cls: 'runway-board' });
  for (const column of BOARD_COLUMNS) {
    const tasks = groups.find((group) => group.key === column.key)?.tasks ?? [];
    const col = board.createDiv({ cls: `runway-board__col runway-board__col--${column.status}` });
    const head = col.createDiv({ cls: 'runway-board__colhead' });
    head.createSpan({ cls: `runway-check runway-check--${column.status}` });
    head.createSpan({ cls: 'runway-board__coltitle', text: column.label });
    head.createSpan({ cls: 'runway-board__count', text: String(tasks.length) });

    const body = col.createDiv({ cls: 'runway-board__colbody' });
    body.addEventListener('dragover', (event) => {
      event.preventDefault();
      col.addClass('is-dragover');
    });
    body.addEventListener('dragleave', (event) => {
      if (!body.contains(event.relatedTarget as Node | null)) col.removeClass('is-dragover');
    });
    body.addEventListener('drop', (event) => {
      event.preventDefault();
      col.removeClass('is-dragover');
      const ref = parseRef(event.dataTransfer?.getData(DRAG_MIME) ?? '');
      const status = columnStatus(column.key);
      if (ref && status) void opts.ctx.edits.setStatus(ref, status);
    });

    const shown = tasks.slice(0, opts.limit(column.key));
    for (const task of shown) {
      const card = renderTaskRow(body, opts.ctx, task, { showNote: true });
      card.addClass('runway-board__card');
      card.setAttr('draggable', 'true');
      card.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData(DRAG_MIME, JSON.stringify(refOf(task)));
        card.addClass('is-dragging');
      });
      card.addEventListener('dragend', () => card.removeClass('is-dragging'));
      opts.onCard(task, card);
    }
    if (tasks.length > shown.length) {
      const more = body.createEl('button', {
        cls: 'runway-group__more',
        text: `Show ${tasks.length - shown.length} more`,
      });
      more.addEventListener('click', () => opts.onShowMore(column.key));
    }

    if (column.status === 'todo') {
      const add = col.createDiv({ cls: 'runway-board__coladd', attr: { role: 'button', tabindex: '0' } });
      setIcon(add.createSpan({ cls: 'runway-board__coladd-icon' }), 'plus');
      add.createSpan({ text: 'Task' });
      add.addEventListener('click', () => new QuickAddModal(opts.ctx).open());
    }
  }
}
