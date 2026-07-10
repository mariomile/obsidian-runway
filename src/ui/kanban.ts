import { columnDropAction } from '../core/board.ts';
import { todayKey } from '../dates.ts';
import { renderTaskRow } from './task-row.ts';
import type { ColumnsBy } from '../core/board.ts';
import type { TaskRef } from '../edits/task-edit.ts';
import type { RunwayContext } from './context.ts';
import type { TaskGroupResult } from '../types.ts';

export interface BoardOptions {
  ctx: RunwayContext;
  columnsBy: ColumnsBy;
  /** Re-run the query after a successful drop. */
  onChanged: () => void;
}

const DRAG_MIME = 'application/x-runway-task';

/** Horizontal Kanban: one column per group, cards drag between columns. */
export function renderBoard(parent: HTMLElement, groups: TaskGroupResult[], opts: BoardOptions): void {
  const board = parent.createDiv({ cls: 'runway-board' });
  for (const group of groups) {
    const column = board.createDiv({ cls: 'runway-board__col' });
    const head = column.createDiv({ cls: 'runway-board__colhead' });
    head.createSpan({ cls: 'runway-board__coltitle', text: group.label || '—' });
    head.createSpan({ cls: 'runway-pill', text: String(group.tasks.length) });

    const body = column.createDiv({ cls: 'runway-board__colbody' });
    const action = columnDropAction(opts.columnsBy, group.key, todayKey());
    const droppable = action.kind !== 'none';
    column.toggleClass('is-droppable', droppable);

    if (droppable) {
      body.addEventListener('dragover', (e) => {
        e.preventDefault();
        column.addClass('is-dragover');
      });
      body.addEventListener('dragleave', () => column.removeClass('is-dragover'));
      body.addEventListener('drop', (e) => {
        e.preventDefault();
        column.removeClass('is-dragover');
        const payload = e.dataTransfer?.getData(DRAG_MIME);
        if (!payload) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          return;
        }
        if (
          typeof parsed === 'object' && parsed !== null &&
          typeof (parsed as { path?: unknown }).path === 'string' &&
          typeof (parsed as { line?: unknown }).line === 'number' &&
          typeof (parsed as { rawText?: unknown }).rawText === 'string'
        ) {
          void handleDrop(parsed as TaskRef, action, opts);
        }
      });
    }

    for (const task of group.tasks) {
      const card = renderTaskRow(body, opts.ctx, task, { showNote: true });
      card.addClass('runway-board__card');
      card.setAttr('draggable', 'true');
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData(
          DRAG_MIME,
          JSON.stringify({ path: task.path, line: task.line, rawText: task.rawText }),
        );
      });
    }
  }
}

async function handleDrop(
  ref: TaskRef,
  action: ReturnType<typeof columnDropAction>,
  opts: BoardOptions,
): Promise<void> {
  let ok = false;
  switch (action.kind) {
    case 'status':
      ok = await opts.ctx.edits.setStatus(ref, action.status);
      break;
    case 'reschedule':
      ok = await opts.ctx.edits.reschedule(ref, action.date);
      break;
    case 'clearDate':
      ok = await opts.ctx.edits.clearDate(ref);
      break;
    case 'priority':
      ok = await opts.ctx.edits.setPriority(ref, action.priority);
      break;
    case 'none':
      return;
  }
  if (ok) opts.onChanged();
}
