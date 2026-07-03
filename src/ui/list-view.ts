import { ItemView, setIcon } from 'obsidian';
import type { ViewStateResult, WorkspaceLeaf } from 'obsidian';

import { todayKey } from '../dates.ts';
import { DEFAULT_FILTER, queryTasks } from '../core/query.ts';
import { renderTaskRow } from './task-row.ts';
import { QuickAddModal } from './quick-add-modal.ts';
import type { RunwayContext } from './context.ts';
import type {
  DueFilter,
  TaskFilter,
  TaskGroup,
  TaskSort,
  TaskStatus,
} from '../types.ts';

export const VIEW_TYPE_LIST = 'runway-list';

const PAGE_SIZE = 200;

const STATUS_PILLS: [TaskStatus, string][] = [
  ['todo', 'Da fare'],
  ['in-progress', 'In corso'],
  ['done', 'Fatti'],
  ['cancelled', 'Annullati'],
];

const DUE_OPTIONS: [DueFilter, string][] = [
  ['all', 'Qualsiasi data'],
  ['overdue', 'In ritardo'],
  ['today', 'Entro oggi'],
  ['week', 'Entro 7 giorni'],
  ['none', 'Senza data'],
];

const SORT_OPTIONS: [TaskSort, string][] = [
  ['due', 'Per scadenza'],
  ['priority', 'Per priorità'],
  ['path', 'Per nota'],
];

const GROUP_OPTIONS: [TaskGroup, string][] = [
  ['none', 'Nessun gruppo'],
  ['date', 'Per data'],
  ['priority', 'Per priorità'],
  ['tag', 'Per tag'],
  ['folder', 'Per cartella'],
];

/** Full-page flat list with on-the-fly filters, sorting and grouping. */
export class RunwayListView extends ItemView {
  private readonly ctx: RunwayContext;
  private unsubscribe: (() => void) | null = null;
  private filter: TaskFilter = structuredClone(DEFAULT_FILTER);
  private sort: TaskSort;
  private group: TaskGroup;
  /** Groups the user expanded past PAGE_SIZE; reset when the query changes. */
  private readonly expanded = new Set<string>();
  private resultsEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, ctx: RunwayContext) {
    super(leaf);
    this.ctx = ctx;
    this.sort = ctx.settings.defaultSort;
    this.group = ctx.settings.defaultGroup;
  }

  getViewType(): string {
    return VIEW_TYPE_LIST;
  }

  getDisplayText(): string {
    return 'Runway — Tasks';
  }

  getIcon(): string {
    return 'plane-takeoff';
  }

  getState(): Record<string, unknown> {
    return { filter: this.filter, sort: this.sort, group: this.group };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    if (typeof state === 'object' && state !== null) {
      const record = state as Record<string, unknown>;
      if (typeof record.filter === 'object' && record.filter !== null) {
        this.filter = { ...structuredClone(DEFAULT_FILTER), ...(record.filter as Partial<TaskFilter>) };
      }
      if (typeof record.sort === 'string') this.sort = record.sort as TaskSort;
      if (typeof record.group === 'string') this.group = record.group as TaskGroup;
    }
    await super.setState(state, result);
    this.render();
  }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.ctx.index.subscribe(() => this.renderResults());
    this.render();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Full rebuild: toolbar + results. */
  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass('runway-list');
    this.renderToolbar(root);
    this.resultsEl = root.createDiv({ cls: 'runway-list__results' });
    this.renderResults();
  }

  /** Results only — keeps toolbar DOM (and the search input focus) intact. */
  private renderResults(): void {
    const results = this.resultsEl;
    if (!results) return;
    results.empty();

    if (!this.ctx.index.isReady()) {
      results.createDiv({ cls: 'runway-empty', text: 'Indicizzazione…' });
      return;
    }

    const groups = queryTasks(
      this.ctx.index.all(),
      this.filter,
      this.sort,
      this.group,
      todayKey(),
    );
    const total = groups.reduce((sum, group) => sum + group.tasks.length, 0);
    results.createDiv({ cls: 'runway-list__count', text: `${total} task` });

    if (total === 0) {
      results.createDiv({ cls: 'runway-empty', text: 'Nessun task corrisponde ai filtri.' });
      return;
    }

    const body = results.createDiv({ cls: 'runway-list__body' });
    for (const group of groups) {
      const sectionEl = body.createDiv({ cls: 'runway-section' });
      if (group.label !== '') {
        const head = sectionEl.createDiv({ cls: 'runway-section__head' });
        head.createSpan({ cls: 'runway-section__title', text: group.label });
        head.createSpan({ cls: 'runway-section__count', text: String(group.tasks.length) });
      }
      const list = sectionEl.createDiv({ cls: 'runway-section__list' });
      const visible = this.expanded.has(group.key)
        ? group.tasks
        : group.tasks.slice(0, PAGE_SIZE);
      for (const task of visible) {
        renderTaskRow(list, this.ctx, task);
      }
      if (group.tasks.length > visible.length) {
        const more = sectionEl.createEl('button', {
          cls: 'runway-section__more',
          text: `Mostra altri ${group.tasks.length - visible.length}`,
        });
        more.addEventListener('click', () => {
          this.expanded.add(group.key);
          this.renderResults();
        });
      }
    }
  }

  /** Apply a filter/sort/group mutation, persist layout, refresh results. */
  private update(mutate: () => void): void {
    mutate();
    this.expanded.clear();
    this.app.workspace.requestSaveLayout();
    this.renderResults();
  }

  private facets(): { tags: string[]; folders: string[] } {
    const tags = new Set<string>();
    const folders = new Set<string>();
    for (const task of this.ctx.index.all()) {
      for (const tag of task.tags) tags.add(tag);
      if (task.folder !== '') folders.add(task.folder);
    }
    return { tags: [...tags].sort(), folders: [...folders].sort() };
  }

  private renderToolbar(root: HTMLElement): void {
    const toolbar = root.createDiv({ cls: 'runway-toolbar' });

    const searchRow = toolbar.createDiv({ cls: 'runway-toolbar__row' });
    const search = searchRow.createEl('input', {
      cls: 'runway-toolbar__search',
      type: 'search',
      placeholder: 'Cerca nei task…',
      value: this.filter.text,
    });
    let searchTimer: ReturnType<typeof setTimeout> | null = null;
    search.addEventListener('input', () => {
      if (searchTimer !== null) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this.update(() => {
          this.filter.text = search.value;
        });
      }, 150);
    });
    const add = searchRow.createEl('button', { cls: 'clickable-icon runway-toolbar__add' });
    setIcon(add, 'plus');
    add.setAttribute('aria-label', 'Nuovo task');
    add.addEventListener('click', () => new QuickAddModal(this.ctx).open());

    const pillsRow = toolbar.createDiv({ cls: 'runway-toolbar__row' });
    for (const [status, label] of STATUS_PILLS) {
      const active = this.filter.statuses.includes(status);
      const pill = pillsRow.createEl('button', {
        cls: `runway-pill${active ? ' is-active' : ''}`,
        text: label,
      });
      pill.addEventListener('click', () => {
        const nowActive = this.filter.statuses.includes(status);
        pill.toggleClass('is-active', !nowActive);
        this.update(() => {
          this.filter.statuses = nowActive
            ? this.filter.statuses.filter((candidate) => candidate !== status)
            : [...this.filter.statuses, status];
        });
      });
    }

    const controlsRow = toolbar.createDiv({ cls: 'runway-toolbar__row' });
    const facets = this.facets();

    this.select(controlsRow, DUE_OPTIONS, this.filter.due, (value) => {
      this.update(() => {
        this.filter.due = value;
      });
    });
    this.select(
      controlsRow,
      [['', 'Tutti i tag'], ...facets.tags.map((tag): [string, string] => [tag, tag])],
      this.filter.tags[0] ?? '',
      (value) => {
        this.update(() => {
          this.filter.tags = value === '' ? [] : [value];
        });
      },
    );
    this.select(
      controlsRow,
      [
        ['', 'Tutte le cartelle'],
        ...facets.folders.map((folder): [string, string] => [folder, folder]),
      ],
      this.filter.folder ?? '',
      (value) => {
        this.update(() => {
          this.filter.folder = value === '' ? null : value;
        });
      },
    );
    this.select(controlsRow, SORT_OPTIONS, this.sort, (value) => {
      this.update(() => {
        this.sort = value;
      });
    });
    this.select(controlsRow, GROUP_OPTIONS, this.group, (value) => {
      this.update(() => {
        this.group = value;
      });
    });
  }

  private select<T extends string>(
    parent: HTMLElement,
    options: readonly [T, string][],
    current: T,
    onChange: (value: T) => void,
  ): void {
    const select = parent.createEl('select', { cls: 'dropdown runway-toolbar__select' });
    for (const [value, label] of options) {
      const option = select.createEl('option', { text: label, value });
      if (value === current) option.selected = true;
    }
    select.addEventListener('change', () => onChange(select.value as T));
  }
}
