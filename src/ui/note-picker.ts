import { FuzzySuggestModal } from 'obsidian';
import type { App, TFile } from 'obsidian';

class NotePickerModal extends FuzzySuggestModal<TFile> {
  private readonly onPick: (file: TFile) => void;
  private readonly files: TFile[] | undefined;

  constructor(app: App, placeholder: string, onPick: (file: TFile) => void, files?: TFile[]) {
    super(app);
    this.onPick = onPick;
    this.files = files;
    this.setPlaceholder(placeholder);
  }

  getItems(): TFile[] {
    return this.files ?? this.app.vault.getMarkdownFiles();
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onPick(file);
  }
}

/** Fuzzy note picker over `files`, or every markdown file when omitted. */
export function pickNote(
  app: App,
  placeholder: string,
  onPick: (file: TFile) => void,
  files?: TFile[],
): void {
  new NotePickerModal(app, placeholder, onPick, files).open();
}
