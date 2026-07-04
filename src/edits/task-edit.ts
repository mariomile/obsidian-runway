import { Notice } from 'obsidian';
import type { App, TFile } from 'obsidian';

import { applyLineEdit, locateLine, removeLine } from '../core/line-edit.ts';
import { parseTaskLine } from '../core/parse.ts';
import { completeRecurring } from '../core/recurrence.ts';
import { isChildNote, noteLine } from '../core/task-note.ts';
import {
  removeDateField,
  rewriteDate,
  rewriteDescription,
  rewritePriority,
  transitionStatus,
} from '../core/serialize.ts';
import { todayKey } from '../dates.ts';
import { appendTaskLine, applyDailyTemplate, dailyNotePath } from './daily-note.ts';
import type { LineRef } from '../core/line-edit.ts';
import type { DateEmoji, DayKey, Priority, RunwaySettings, TaskStatus } from '../types.ts';

export interface TaskRef extends LineRef {
  path: string;
}

interface EditOptions {
  /** Suppress per-edit Notices (undo re-application reports once). */
  silent?: boolean;
}

/** All write paths of the plugin: guarded line edits + quick-add appends. */
export class TaskEditService {
  private readonly app: App;
  private readonly getSettings: () => RunwaySettings;

  constructor(app: App, getSettings: () => RunwaySettings) {
    this.app = app;
    this.getSettings = getSettings;
  }

  async openAtLine(ref: TaskRef): Promise<void> {
    const file = this.app.vault.getFileByPath(ref.path);
    if (!file) return;
    await this.app.workspace.getLeaf().openFile(file, { eState: { line: ref.line } });
  }

  /**
   * Status transition from a view. Recurring tasks are opened at the line
   * instead: creating the next occurrence needs a recurrence engine, and a
   * blind toggle would corrupt the series.
   */
  async setStatus(ref: TaskRef, target: Exclude<TaskStatus, 'unknown'>): Promise<boolean> {
    const parsed = parseTaskLine(ref.rawText);
    if (!parsed || parsed.status === 'unknown') return false;
    if (target === 'done' && ref.rawText.includes('🔁')) {
      const result = completeRecurring(ref.rawText, todayKey());
      if (result === null) {
        // Unsupported rule or no date to advance: don't risk the series.
        new Notice('Runway: ricorrenza non gestita — apro il file.');
        await this.openAtLine(ref);
        return false;
      }
      const changed = await this.editLine(
        ref,
        () => `${result.nextLine}\n${result.completedLine}`,
      );
      if (changed) new Notice('Runway: completato, prossima occorrenza creata.');
      return changed;
    }
    return this.editLine(ref, (line) => transitionStatus(line, target, todayKey()));
  }

  /** Rewrite one date field; success Notice carries a 10s undo. */
  async reschedule(
    ref: TaskRef,
    date: DayKey,
    emoji: DateEmoji = '📅',
    options?: EditOptions,
  ): Promise<boolean> {
    const parsed = parseTaskLine(ref.rawText);
    const oldDate = emoji === '📅' ? parsed?.due : parsed?.scheduled;
    const changed = await this.editLine(ref, (line) => rewriteDate(line, emoji, date), options);
    if (changed && !options?.silent) {
      this.noticeWithUndo(ref, emoji, date, oldDate);
    }
    return changed;
  }

  async clearDate(ref: TaskRef, emoji: DateEmoji = '📅'): Promise<boolean> {
    return this.editLine(ref, (line) => removeDateField(line, emoji));
  }

  async setPriority(ref: TaskRef, priority: Priority | null): Promise<boolean> {
    return this.editLine(ref, (line) => rewritePriority(line, priority));
  }

  async editDescription(ref: TaskRef, text: string): Promise<boolean> {
    return this.editLine(ref, (line) => rewriteDescription(line, text));
  }

  /**
   * Attach / replace / remove a task's note — the indented child line right
   * below it. Empty text removes the note. Guarded by the task's rawText.
   */
  async setNote(ref: TaskRef, text: string): Promise<boolean> {
    const file = this.app.vault.getFileByPath(ref.path);
    if (!file) {
      new Notice('Runway: file non trovato.');
      return false;
    }
    let changed = false;
    await this.app.vault.process(file, (content) => {
      const lines = content.split('\n');
      const index = locateLine(lines, ref);
      if (index === -1) return content;
      const taskLine = lines[index] ?? ref.rawText;
      const hasNote = isChildNote(taskLine, lines[index + 1]);
      const trimmed = text.trim();
      if (trimmed === '') {
        if (hasNote) {
          lines.splice(index + 1, 1);
          changed = true;
        }
      } else {
        const line = noteLine(taskLine, trimmed);
        if (hasNote) lines[index + 1] = line;
        else lines.splice(index + 1, 0, line);
        changed = true;
      }
      return changed ? lines.join('\n') : content;
    });
    if (!changed) new Notice('Runway: il task è cambiato nel frattempo — riprova.');
    return changed;
  }

  /**
   * Append `- [ ] body` to `targetPath` (default: today's daily note,
   * created from the daily template when missing). Returns the target path.
   */
  async quickAdd(body: string, targetPath?: string): Promise<string | null> {
    const settings = this.getSettings();
    const today = todayKey();
    const path = targetPath ?? dailyNotePath(settings, today);
    const file = await this.ensureFile(path, today);
    if (!file) {
      new Notice(`Runway: impossibile creare "${path}".`);
      return null;
    }
    const taskLine = `- [ ] ${body.trim()}`;
    await this.app.vault.process(file, (content) =>
      appendTaskLine(content, taskLine, settings.quickAddHeading),
    );
    return path;
  }

  /**
   * Move a task line out of its note and into `targetPath` (created if
   * missing). Appends to the target first, then removes from the source, so a
   * mid-flight failure can at worst duplicate — never lose — the task.
   */
  async moveToNote(ref: TaskRef, targetPath: string): Promise<boolean> {
    if (targetPath === ref.path) return false;
    const source = this.app.vault.getFileByPath(ref.path);
    if (!source) {
      new Notice('Runway: file di origine non trovato.');
      return false;
    }
    const target = await this.ensureFile(targetPath, todayKey());
    if (!target) {
      new Notice(`Runway: impossibile creare "${targetPath}".`);
      return false;
    }
    const movedLine = ref.rawText.replace(/^\s+/, '');
    await this.app.vault.process(target, (content) =>
      appendTaskLine(content, movedLine, this.getSettings().quickAddHeading),
    );
    let removed = false;
    await this.app.vault.process(source, (content) => {
      const result = removeLine(content, ref);
      removed = result.removed;
      return result.content;
    });
    new Notice(
      removed
        ? `Runway: task spostato in ${targetPath}.`
        : 'Runway: copiato, ma la riga di origine è cambiata — controlla i duplicati.',
    );
    return removed;
  }

  private async ensureFile(path: string, today: DayKey): Promise<TFile | null> {
    const existing = this.app.vault.getFileByPath(path);
    if (existing) return existing;
    const settings = this.getSettings();
    const isDaily = path === dailyNotePath(settings, today);
    let content = '';
    if (isDaily) {
      content = applyDailyTemplate(
        await this.readDailyTemplate(),
        today,
        path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, ''),
      );
    }
    const slash = path.lastIndexOf('/');
    if (slash > 0) {
      const folder = path.slice(0, slash);
      if (this.app.vault.getFolderByPath(folder) === null) {
        await this.app.vault.createFolder(folder);
      }
    }
    try {
      return await this.app.vault.create(path, content);
    } catch {
      return this.app.vault.getFileByPath(path);
    }
  }

  private async readDailyTemplate(): Promise<string> {
    try {
      const raw = await this.app.vault.adapter.read(
        `${this.app.vault.configDir}/daily-notes.json`,
      );
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return '';
      const templatePath = (parsed as Record<string, unknown>).template;
      if (typeof templatePath !== 'string' || templatePath === '') return '';
      const file =
        this.app.vault.getFileByPath(templatePath) ??
        this.app.vault.getFileByPath(`${templatePath}.md`) ??
        this.app.metadataCache.getFirstLinkpathDest(templatePath, '');
      if (!file) return '';
      return await this.app.vault.cachedRead(file);
    } catch {
      return '';
    }
  }

  private async editLine(
    ref: TaskRef,
    transform: (line: string) => string,
    options?: EditOptions,
  ): Promise<boolean> {
    const file = this.app.vault.getFileByPath(ref.path);
    if (!file) {
      if (!options?.silent) new Notice('Runway: file non trovato.');
      return false;
    }
    let changed = false;
    await this.app.vault.process(file, (content) => {
      const result = applyLineEdit(content, ref, transform);
      changed = result.changed;
      return result.content;
    });
    if (!changed && !options?.silent) {
      new Notice('Runway: il task è cambiato nel frattempo — riprova.');
    }
    return changed;
  }

  /** Success Notice with a 10s "Annulla" that re-applies the old date through the same guards. */
  private noticeWithUndo(
    ref: TaskRef,
    emoji: DateEmoji,
    newDate: DayKey,
    oldDate: DayKey | undefined,
  ): void {
    const fragment = document.createDocumentFragment();
    fragment.createSpan({ text: `Runway: task spostato al ${newDate}. ` });
    if (oldDate === undefined) {
      new Notice(fragment, 10_000);
      return;
    }
    const undo = fragment.createEl('a', { text: 'Annulla' });
    const notice = new Notice(fragment, 10_000);
    undo.addEventListener('click', () => {
      notice.hide();
      const movedRef: TaskRef = { ...ref, rawText: rewriteDate(ref.rawText, emoji, newDate) };
      void this.reschedule(movedRef, oldDate, emoji, { silent: true }).then((ok) => {
        new Notice(
          ok ? `Runway: ripristinato al ${oldDate}.` : 'Runway: annullamento non riuscito.',
        );
      });
    });
  }
}
