import { FuzzySuggestModal } from 'obsidian';
import type { App, TFile } from 'obsidian';

class NotePickerModal extends FuzzySuggestModal<TFile> {
  private readonly onPick: (file: TFile) => void;

  constructor(app: App, placeholder: string, onPick: (file: TFile) => void) {
    super(app);
    this.onPick = onPick;
    this.setPlaceholder(placeholder);
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

/** Fuzzy note picker over all markdown files. */
export function pickNote(
  app: App,
  placeholder: string,
  onPick: (file: TFile) => void,
): void {
  new NotePickerModal(app, placeholder, onPick).open();
}
