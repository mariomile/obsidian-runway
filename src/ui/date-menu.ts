import { Menu, Modal } from 'obsidian';
import type { App } from 'obsidian';

import { addDays, isValidDayKey, todayKey } from '../dates.ts';
import type { DayKey } from '../types.ts';

class PickDateModal extends Modal {
  private readonly onPick: (date: DayKey) => void;
  private readonly initial: DayKey;

  constructor(app: App, initial: DayKey, onPick: (date: DayKey) => void) {
    super(app);
    this.initial = initial;
    this.onPick = onPick;
  }

  onOpen(): void {
    this.titleEl.setText('Scegli data');
    const input = this.contentEl.createEl('input', {
      cls: 'runway-date-input',
      type: 'date',
      value: this.initial,
    });
    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
    const confirm = buttons.createEl('button', { cls: 'mod-cta', text: 'Conferma' });
    const submit = (): void => {
      if (isValidDayKey(input.value)) {
        this.close();
        this.onPick(input.value);
      }
    };
    confirm.addEventListener('click', submit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });
    buttons.createEl('button', { text: 'Annulla' }).addEventListener('click', () => this.close());
    input.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export interface DateMenuHandlers {
  onPick(date: DayKey): void;
  onClear?(): void;
}

/** Shared reschedule menu: Oggi / Domani / +1 settimana / picker / rimuovi. */
export function buildDateMenuItems(
  menu: Menu,
  app: App,
  current: DayKey | undefined,
  handlers: DateMenuHandlers,
): void {
  const today = todayKey();
  const presets: [string, DayKey][] = [
    ['Oggi', today],
    ['Domani', addDays(today, 1)],
    ['+1 settimana', addDays(today, 7)],
  ];
  for (const [label, date] of presets) {
    menu.addItem((item) =>
      item
        .setTitle(label)
        .setIcon('calendar')
        .onClick(() => handlers.onPick(date)),
    );
  }
  menu.addItem((item) =>
    item
      .setTitle('Scegli data…')
      .setIcon('calendar-search')
      .onClick(() => {
        new PickDateModal(app, current ?? today, handlers.onPick).open();
      }),
  );
  if (handlers.onClear && current !== undefined) {
    menu.addItem((item) =>
      item
        .setTitle('Rimuovi data')
        .setIcon('calendar-off')
        .onClick(() => handlers.onClear?.()),
    );
  }
}

export function showDateMenu(
  event: MouseEvent,
  app: App,
  current: DayKey | undefined,
  handlers: DateMenuHandlers,
): void {
  const menu = new Menu();
  buildDateMenuItems(menu, app, current, handlers);
  menu.showAtMouseEvent(event);
}
