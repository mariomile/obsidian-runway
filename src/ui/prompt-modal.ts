import { Modal } from 'obsidian';
import type { App } from 'obsidian';

/** Single-line text prompt. Calls back only on a non-empty submit. */
export function promptText(
  app: App,
  title: string,
  initial: string,
  onSubmit: (value: string) => void,
): void {
  new PromptModal(app, title, initial, onSubmit).open();
}

class PromptModal extends Modal {
  private readonly title: string;
  private readonly initial: string;
  private readonly onSubmit: (value: string) => void;

  constructor(app: App, title: string, initial: string, onSubmit: (value: string) => void) {
    super(app);
    this.title = title;
    this.initial = initial;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    this.titleEl.setText(this.title);
    const input = this.contentEl.createEl('input', {
      cls: 'runway-edit-input',
      type: 'text',
      value: this.initial,
    });
    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
    const save = buttons.createEl('button', { cls: 'mod-cta', text: 'Salva' });
    const submit = (): void => {
      const value = input.value.trim();
      this.close();
      if (value !== '') this.onSubmit(value);
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
