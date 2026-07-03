import { Menu, Modal } from 'obsidian';
import type { App } from 'obsidian';

import { buildDateMenuItems } from './date-menu.ts';
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
    this.titleEl.setText('Modifica task');
    const input = this.contentEl.createEl('input', {
      cls: 'runway-edit-input',
      type: 'text',
      value: this.initial,
    });
    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
    const save = buttons.createEl('button', { cls: 'mod-cta', text: 'Salva' });
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
    buttons.createEl('button', { text: 'Annulla' }).addEventListener('click', () => this.close());
    input.focus();
    input.select();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

const STATUS_ITEMS: [Exclude<TaskStatus, 'unknown'>, string, string][] = [
  ['todo', 'Da fare', 'circle'],
  ['in-progress', 'In corso', 'circle-dot'],
  ['done', 'Fatto', 'check-circle'],
  ['cancelled', 'Annullato', 'x-circle'],
];

const PRIORITY_ITEMS: [Priority | null, string][] = [
  ['highest', `${PRIORITY_EMOJI.highest} Massima`],
  ['high', `${PRIORITY_EMOJI.high} Alta`],
  ['medium', `${PRIORITY_EMOJI.medium} Media`],
  ['low', `${PRIORITY_EMOJI.low} Bassa`],
  ['lowest', `${PRIORITY_EMOJI.lowest} Minima`],
  [null, 'Nessuna priorità'],
];

export function refOf(task: Task): TaskRef {
  return { path: task.path, line: task.line, rawText: task.rawText };
}

export function showTaskMenu(event: MouseEvent, ctx: RunwayContext, task: Task): void {
  const menu = new Menu();
  const ref = refOf(task);

  menu.addItem((item) =>
    item
      .setTitle('Apri nel file')
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
        .setTitle('Modifica testo…')
        .setIcon('pencil')
        .onClick(() => {
          new EditDescriptionModal(ctx.app, task.description, (text) => {
            void ctx.edits.editDescription(ref, text);
          }).open();
        }),
    );
  }

  menu.showAtMouseEvent(event);
}
