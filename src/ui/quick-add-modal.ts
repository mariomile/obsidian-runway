import { Modal, Notice } from 'obsidian';

import { addDays, todayKey } from '../dates.ts';
import { dailyNotePath } from '../edits/daily-note.ts';
import { PRIORITY_EMOJI } from '../core/parse.ts';
import { parseNaturalDate } from '../core/natural-date.ts';
import { pickNote } from './note-picker.ts';
import type { RunwayContext } from './context.ts';
import type { DayKey, Priority } from '../types.ts';

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
      placeholder: 'Descrizione — prova "chiama Marco domani"',
    });
    const hint = this.contentEl.createDiv({ cls: 'runway-quick-add__hint' });
    input.addEventListener('input', () => {
      this.text = input.value;
      this.syncHint(hint);
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
      pickNote(this.ctx.app, 'Nota di destinazione…', (file) => {
        this.targetPath = file.path;
        targetLabel.setText(`→ ${file.path}`);
      });
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

  /** When no date chip is picked, honor a trailing natural-language date. */
  private resolved(): { description: string; date: DayKey | null } {
    const text = this.text.trim();
    if (this.date !== null) return { description: text, date: this.date };
    const natural = parseNaturalDate(text, todayKey());
    return { description: natural.date ? natural.cleaned : text, date: natural.date };
  }

  private syncHint(hint: HTMLElement): void {
    if (this.date !== null) {
      hint.setText('');
      return;
    }
    const natural = parseNaturalDate(this.text.trim(), todayKey());
    hint.setText(natural.date ? `📅 ${natural.date} — "${natural.cleaned}"` : '');
  }

  private async submit(): Promise<void> {
    const { description, date } = this.resolved();
    if (description === '') return;
    let body = description;
    if (this.priority !== null) body += ` ${PRIORITY_EMOJI[this.priority]}`;
    if (date !== null) body += ` 📅 ${date}`;
    this.close();
    const path = await this.ctx.edits.quickAdd(body, this.targetPath ?? undefined);
    if (path !== null) new Notice(`Runway: task aggiunto a ${path}.`);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
