import { ItemView, setIcon } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';

import { addDays, compareDayKeys, todayKey } from '../dates.ts';
import { sortTasks, taskDate } from '../core/query.ts';
import { renderTaskRow } from './task-row.ts';
import { QuickAddModal } from './quick-add-modal.ts';
import type { RunwayContext } from './context.ts';
import type { Task } from '../types.ts';

export const VIEW_TYPE_SIDEBAR = 'runway-sidebar';

const OPEN_STATUSES = new Set(['todo', 'in-progress']);

interface Section {
  title: string;
  cls: string;
  tasks: Task[];
}

/** Daily glance: Overdue / Oggi / Prossimi N giorni, with quick-add. */
export class RunwaySidebarView extends ItemView {
  private readonly ctx: RunwayContext;
  private unsubscribe: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, ctx: RunwayContext) {
    super(leaf);
    this.ctx = ctx;
  }

  getViewType(): string {
    return VIEW_TYPE_SIDEBAR;
  }

  getDisplayText(): string {
    return 'Runway';
  }

  getIcon(): string {
    return 'plane-takeoff';
  }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.ctx.index.subscribe(() => this.render());
    this.render();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private sections(): Section[] {
    const today = todayKey();
    const horizon = addDays(today, this.ctx.settings.sidebarUpcomingDays);
    const open = this.ctx.index.all().filter((task) => OPEN_STATUSES.has(task.status));

    const overdue: Task[] = [];
    const dueToday: Task[] = [];
    const upcoming: Task[] = [];
    for (const task of open) {
      const date = taskDate(task);
      if (date === undefined) continue;
      const cmp = compareDayKeys(date, today);
      if (cmp < 0) overdue.push(task);
      else if (cmp === 0) dueToday.push(task);
      else if (compareDayKeys(date, horizon) <= 0) upcoming.push(task);
    }
    return [
      { title: 'In ritardo', cls: 'overdue', tasks: sortTasks(overdue, 'due') },
      { title: 'Oggi', cls: 'today', tasks: sortTasks(dueToday, 'priority') },
      {
        title: `Prossimi ${this.ctx.settings.sidebarUpcomingDays} giorni`,
        cls: 'upcoming',
        tasks: sortTasks(upcoming, 'due'),
      },
    ];
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass('runway-sidebar');

    const header = root.createDiv({ cls: 'runway-sidebar__header' });
    header.createSpan({ cls: 'runway-sidebar__title', text: 'Runway' });
    const actions = header.createDiv({ cls: 'runway-sidebar__actions' });
    const add = actions.createEl('button', { cls: 'runway-iconbtn' });
    setIcon(add, 'plus');
    add.setAttribute('aria-label', 'Nuovo task');
    add.addEventListener('click', () => new QuickAddModal(this.ctx).open());
    const expand = actions.createEl('button', { cls: 'runway-iconbtn' });
    setIcon(expand, 'layout-list');
    expand.setAttribute('aria-label', 'Apri lista completa');
    expand.addEventListener('click', () => void this.ctx.openListView());

    if (!this.ctx.index.isReady()) {
      root.createDiv({ cls: 'runway-empty', text: 'Indicizzazione…' });
      return;
    }

    let shown = 0;
    for (const section of this.sections()) {
      if (section.tasks.length === 0) continue;
      shown += section.tasks.length;
      const sectionEl = root.createDiv({
        cls: `runway-section runway-section--${section.cls}`,
      });
      const head = sectionEl.createDiv({ cls: 'runway-section__head' });
      head.createSpan({ cls: 'runway-section__title', text: section.title });
      head.createSpan({ cls: 'runway-section__count', text: String(section.tasks.length) });
      const list = sectionEl.createDiv({ cls: 'runway-section__list' });
      for (const task of section.tasks) {
        renderTaskRow(list, this.ctx, task);
      }
    }
    if (shown === 0) {
      root.createDiv({ cls: 'runway-empty', text: 'Nessun task in scadenza. 🛫' });
    }
  }
}
