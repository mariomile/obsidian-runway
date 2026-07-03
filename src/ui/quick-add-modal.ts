import { FuzzySuggestModal, Modal, Notice } from 'obsidian';
import type { TFile } from 'obsidian';

import { addDays, todayKey } from '../dates.ts';
import { dailyNotePath } from '../edits/daily-note.ts';
import { PRIORITY_EMOJI } from '../core/parse.ts';
import type { RunwayContext } from './context.ts';
import type { DayKey, Priority } from '../types.ts';

class TargetPickerModal extends FuzzySuggestModal<TFile> {
  private readonly onPick: (file: TFile) => void;

  constructor(ctx: RunwayContext, onPick: (file: TFile) => void) {
    super(ctx.app);
    this.onPick = onPick;
    this.setPlaceholder('Nota di destinazione…');
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onPick(file);
  }
}

/** Quick-add: text + date chips + priority + target note (default: today's daily). */
export class QuickAddModal extends Modal {
  private readonly ctx: RunwayContext;
  private text = '';
  private date: DayKey | null = null;
  private priority: Priority | null = null;
  private targetPath: string | null = null;

  constructor(ctx: RunwayContext) {
    super(ctx.app);
    this.ctx = ctx;
  }

  onOpen(): void {
    this.modalEl.addClass('runway-quick-add');
    this.titleEl.setText('Nuovo task');

    const input = this.contentEl.createEl('input', {
      cls: 'runway-quick-add__input',
      type: 'text',
      placeholder: 'Descrizione (emoji Tasks passano così come sono)',
    });
    input.addEventListener('input', () => {
      this.text = input.value;
    });

    const today = todayKey();
    const chips = this.contentEl.createDiv({ cls: 'runway-quick-add__chips' });
    const dateChoices: [string, DayKey | null][] = [
      ['Nessuna data', null],
      ['Oggi', today],
      ['Domani', addDays(today, 1)],
      ['+1 settimana', addDays(today, 7)],
    ];
    const chipEls: HTMLElement[] = [];
    for (const [label, date] of dateChoices) {
      const chip = chips.createEl('button', { cls: 'runway-quick-add__chip', text: label });
      if (date === this.date) chip.addClass('is-active');
      chip.addEventListener('click', () => {
        this.date = date;
        for (const el of chipEls) el.removeClass('is-active');
        chip.addClass('is-active');
      });
      chipEls.push(chip);
    }
    chipEls[0]?.addClass('is-active');

    const priorityRow = this.contentEl.createDiv({ cls: 'runway-quick-add__priority' });
    const select = priorityRow.createEl('select', { cls: 'dropdown' });
    const priorities: [string, Priority | ''][] = [
      ['Nessuna priorità', ''],
      [`${PRIORITY_EMOJI.highest} Massima`, 'highest'],
      [`${PRIORITY_EMOJI.high} Alta`, 'high'],
      [`${PRIORITY_EMOJI.medium} Media`, 'medium'],
      [`${PRIORITY_EMOJI.low} Bassa`, 'low'],
      [`${PRIORITY_EMOJI.lowest} Minima`, 'lowest'],
    ];
    for (const [label, value] of priorities) {
      select.createEl('option', { text: label, value });
    }
    select.addEventListener('change', () => {
      this.priority = select.value === '' ? null : (select.value as Priority);
    });

    const targetRow = this.contentEl.createDiv({ cls: 'runway-quick-add__target' });
    const targetLabel = targetRow.createSpan({
      cls: 'runway-quick-add__target-path',
      text: `→ ${dailyNotePath(this.ctx.settings, today)}`,
    });
    const change = targetRow.createEl('button', { text: 'Cambia' });
    change.addEventListener('click', () => {
      new TargetPickerModal(this.ctx, (file) => {
        this.targetPath = file.path;
        targetLabel.setText(`→ ${file.path}`);
      }).open();
    });

    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
    const submit = buttons.createEl('button', { cls: 'mod-cta', text: 'Aggiungi' });
    submit.addEventListener('click', () => void this.submit());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void this.submit();
    });
    buttons.createEl('button', { text: 'Annulla' }).addEventListener('click', () => this.close());
    input.focus();
  }

  private async submit(): Promise<void> {
    const text = this.text.trim();
    if (text === '') return;
    let body = text;
    if (this.priority !== null) body += ` ${PRIORITY_EMOJI[this.priority]}`;
    if (this.date !== null) body += ` 📅 ${this.date}`;
    this.close();
    const path = await this.ctx.edits.quickAdd(body, this.targetPath ?? undefined);
    if (path !== null) new Notice(`Runway: task aggiunto a ${path}.`);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
