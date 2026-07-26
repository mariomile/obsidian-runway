import { Menu, Modal } from 'obsidian';
import type { App } from 'obsidian';

import { buildDateMenuItems } from './date-menu.ts';
import { pickNote } from './note-picker.ts';
import { promptText } from './prompt-modal.ts';
import { PRIORITY_EMOJI } from '../core/parse.ts';
import type { RunwayContext } from './context.ts';
import type { TaskRef } from '../edits/task-edit.ts';
import type { Priority, Task, TaskStatus } from '../types.ts';

class EditDescriptionModal extends Modal {
  private readonly initial: string;
  private readonly onSubmit: (text: string) => void;

  constructor(app: App, initial: string, onSubmit: (text: string) => void) {
    super(app);
    this.initial = initial;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    this.titleEl.setText('Edit task');
    const input = this.contentEl.createEl('input', {
      cls: 'runway-edit-input',
      type: 'text',
      value: this.initial,
    });
    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
    const save = buttons.createEl('button', { cls: 'mod-cta', text: 'Save' });
    const submit = (): void => {
      const value = input.value.trim();
      if (value !== '' && value !== this.initial) {
        this.close();
        this.onSubmit(value);
        return;
      }
      this.close();
    };
    save.addEventListener('click', submit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });
    buttons.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
    input.focus();
    input.select();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

const STATUS_ITEMS: [Exclude<TaskStatus, 'unknown'>, string, string][] = [
  ['todo', 'To do', 'circle'],
  ['in-progress', 'In progress', 'circle-dot'],
  ['done', 'Done', 'check-circle'],
  ['cancelled', 'Cancelled', 'x-circle'],
];

const PRIORITY_ITEMS: [Priority | null, string][] = [
  ['highest', `${PRIORITY_EMOJI.highest} Highest`],
  ['high', `${PRIORITY_EMOJI.high} High`],
  ['medium', `${PRIORITY_EMOJI.medium} Medium`],
  ['low', `${PRIORITY_EMOJI.low} Low`],
  ['lowest', `${PRIORITY_EMOJI.lowest} Lowest`],
  [null, 'No priority'],
];

export function refOf(task: Task): TaskRef {
  return { path: task.path, line: task.line, rawText: task.rawText };
}

/** Prompt for a task note (add or edit) and write it as an indented child. */
export function promptTaskNote(ctx: RunwayContext, task: Task): void {
  promptText(ctx.app, task.note ? 'Edit note' : 'Add note', task.note ?? '', (text) => {
    void ctx.edits.setNote(refOf(task), text);
  });
}

export function showTaskMenu(event: MouseEvent, ctx: RunwayContext, task: Task): void {
  const menu = new Menu();
  const ref = refOf(task);

  menu.addItem((item) =>
    item
      .setTitle('Open in file')
      .setIcon('file-symlink')
      .onClick(() => void ctx.edits.openAtLine(ref)),
  );

  if (task.status !== 'unknown') {
    menu.addSeparator();
    for (const [status, label, icon] of STATUS_ITEMS) {
      if (status === task.status) continue;
      menu.addItem((item) =>
        item
          .setTitle(label)
          .setIcon(icon)
          .onClick(() => void ctx.edits.setStatus(ref, status)),
      );
    }

    menu.addSeparator();
    buildDateMenuItems(menu, ctx.app, task.due, {
      onPick: (date) => void ctx.edits.reschedule(ref, date),
      onClear: () => void ctx.edits.clearDate(ref),
    });

    menu.addSeparator();
    for (const [priority, label] of PRIORITY_ITEMS) {
      if (priority === task.priority) continue;
      menu.addItem((item) =>
        item.setTitle(label).onClick(() => void ctx.edits.setPriority(ref, priority)),
      );
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle('Edit text…')
        .setIcon('pencil')
        .onClick(() => {
          new EditDescriptionModal(ctx.app, task.description, (text) => {
            void ctx.edits.editDescription(ref, text);
          }).open();
        }),
    );
    menu.addItem((item) =>
      item
        .setTitle(task.note ? 'Edit note…' : 'Add note…')
        .setIcon('text')
        .onClick(() => promptTaskNote(ctx, task)),
    );
    if (task.note) {
      menu.addItem((item) =>
        item
          .setTitle('Remove note')
          .setIcon('trash')
          .onClick(() => void ctx.edits.setNote(ref, '')),
      );
    }
    menu.addItem((item) =>
      item
        .setTitle('Move to note…')
        .setIcon('folder-input')
        .onClick(() => {
          pickNote(ctx.app, 'Move task to…', (file) => {
            void ctx.edits.moveToNote(ref, file.path);
          });
        }),
    );
  }

  menu.showAtMouseEvent(event);
}
