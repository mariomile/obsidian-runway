import { Menu, Notice, setIcon } from 'obsidian';

import { todayKey } from '../dates.ts';
import { DEFAULT_FILTER, queryTasks } from '../core/query.ts';
import { PRIORITY_EMOJI } from '../core/parse.ts';
import { renderTaskRow } from './task-row.ts';
import { QuickAddModal } from './quick-add-modal.ts';
import { promptText } from './prompt-modal.ts';
import type { RunwayContext } from './context.ts';
import type {
  DueFilter,
  Priority,
  SavedView,
  TaskFilter,
  TaskGroup,
  TaskSort,
  TaskStatus,
} from '../types.ts';

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

const DUE_CHIP: Record<DueFilter, string> = {
  all: 'Data',
  overdue: 'In ritardo',
  today: 'Oggi',
  week: '7 giorni',
  none: 'Senza data',
};

const SORT_OPTIONS: [TaskSort, string][] = [
  ['due', 'Scadenza'],
  ['priority', 'Priorità'],
  ['path', 'Nota'],
];

const GROUP_OPTIONS: [TaskGroup, string][] = [
  ['note', 'Nota'],
  ['date', 'Data'],
  ['priority', 'Priorità'],
  ['tag', 'Tag'],
  ['folder', 'Cartella'],
  ['none', 'Niente'],
];

const PRIORITY_OPTIONS: [string, string][] = [
  ['', 'Priorità'],
  ['highest', `${PRIORITY_EMOJI.highest} Massima`],
  ['high', `${PRIORITY_EMOJI.high} Alta`],
  ['medium', `${PRIORITY_EMOJI.medium} Media`],
  ['low', `${PRIORITY_EMOJI.low} Bassa`],
  ['lowest', `${PRIORITY_EMOJI.lowest} Minima`],
];

function shortLabel(options: readonly [string, string][], value: string): string {
  return options.find(([candidate]) => candidate === value)?.[1] ?? value;
}

function lastSegment(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const slash = trimmed.lastIndexOf('/');
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

export interface TaskPanelState {
  filter: TaskFilter;
  sort: TaskSort;
  group: TaskGroup;
  collapsed: string[];
}

export interface TaskPanelOptions {
  compact: boolean;
  title: string;
  onStateChange: () => void;
  /** Sidebar only: jump to the full-page list. */
  onExpand?: () => void;
}

/**
 * Shared task surface: compact filter bar + accordion groups, driven by one
 * state object. The sidebar and the full-page list are the same component at
 * two densities (compact flag) — identical filtering, grouping and collapse
 * behavior. Rows come from the shared renderTaskRow.
 */
export class TaskPanel {
  private readonly container: HTMLElement;
  private readonly ctx: RunwayContext;
  private readonly options: TaskPanelOptions;
  private readonly state: TaskPanelState;
  private readonly collapsed: Set<string>;
  /** Groups the user expanded past PAGE_SIZE; reset when the query changes. */
  private readonly expanded = new Set<string>();

  private filtersEl: HTMLElement | null = null;
  private resultsEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private toggleAllBtn: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private lastGroupKeys: string[] = [];

  constructor(
    container: HTMLElement,
    ctx: RunwayContext,
    initial: Partial<TaskPanelState>,
    options: TaskPanelOptions,
  ) {
    this.container = container;
    this.ctx = ctx;
    this.options = options;
    this.state = {
      filter: { ...structuredClone(DEFAULT_FILTER), ...(initial.filter ?? {}) },
      sort: initial.sort ?? ctx.settings.defaultSort,
      group: initial.group ?? ctx.settings.defaultGroup,
      collapsed: initial.collapsed ?? [],
    };
    this.collapsed = new Set(this.state.collapsed);
  }

  mount(): void {
    this.container.addClass('runway-panel');
    this.container.toggleClass('runway-panel--compact', this.options.compact);
    this.unsubscribe = this.ctx.index.subscribe(() => this.renderResults());
    this.renderChrome();
  }

  unmount(): void {
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  getState(): TaskPanelState {
    return { ...this.state, filter: { ...this.state.filter }, collapsed: [...this.collapsed] };
  }

  // ── Chrome (built once; search input never rebuilt so focus survives) ──

  private renderChrome(): void {
    const root = this.container;
    root.empty();

    const header = root.createDiv({ cls: 'runway-panel__header' });
    const titleGroup = header.createDiv({ cls: 'runway-panel__titlegroup' });
    titleGroup.createEl(this.options.compact ? 'span' : 'h2', {
      cls: 'runway-panel__title',
      text: this.options.title,
    });
    this.countEl = titleGroup.createSpan({ cls: 'runway-panel__count' });

    const actions = header.createDiv({ cls: 'runway-panel__actions' });

    const searchWrap = actions.createDiv({ cls: 'runway-search' });
    const searchIcon = searchWrap.createSpan({ cls: 'runway-search__icon' });
    setIcon(searchIcon, 'search');
    const search = searchWrap.createEl('input', {
      cls: 'runway-search__input',
      type: 'search',
      placeholder: 'Cerca…',
      value: this.state.filter.text,
    });
    search.addEventListener('input', () => {
      if (this.searchTimer !== null) clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => {
        this.state.filter.text = search.value;
        this.expanded.clear();
        this.renderResults();
        this.options.onStateChange();
      }, 150);
    });

    const viewsBtn = actions.createEl('button', { cls: 'runway-iconbtn' });
    setIcon(viewsBtn, 'bookmark');
    viewsBtn.setAttribute('aria-label', 'Viste salvate');
    viewsBtn.addEventListener('click', (event) => this.openViewsMenu(event));

    this.toggleAllBtn = actions.createEl('button', { cls: 'runway-iconbtn' });
    this.toggleAllBtn.addEventListener('click', () => this.toggleAll());

    if (this.options.onExpand) {
      const expand = actions.createEl('button', { cls: 'runway-iconbtn' });
      setIcon(expand, 'maximize-2');
      expand.setAttribute('aria-label', 'Apri lista completa');
      expand.addEventListener('click', () => this.options.onExpand?.());
    }

    const add = actions.createEl('button', { cls: 'runway-add-btn' });
    setIcon(add, 'plus');
    if (!this.options.compact) add.createSpan({ text: 'Task' });
    add.setAttribute('aria-label', 'Nuovo task');
    add.addEventListener('click', () => new QuickAddModal(this.ctx).open());

    this.filtersEl = root.createDiv({ cls: 'runway-panel__filters' });
    this.resultsEl = root.createDiv({ cls: 'runway-panel__results' });

    this.renderFilters();
    this.renderResults();
  }

  // ── Filter bar ──────────────────────────────────────────────────────

  private renderFilters(): void {
    const bar = this.filtersEl;
    if (!bar) return;
    bar.empty();

    if (this.state.filter.exactDay) {
      const dayRow = bar.createDiv({ cls: 'runway-filterbar__row' });
      const pill = dayRow.createEl('button', {
        cls: 'runway-fchip is-active',
        attr: { 'aria-label': 'Rimuovi filtro giorno' },
      });
      pill.createSpan({ cls: 'runway-fchip__label', text: `📅 ${this.state.filter.exactDay}` });
      const clear = pill.createSpan({ cls: 'runway-fchip__caret' });
      setIcon(clear, 'x');
      pill.addEventListener('click', () =>
        this.update(() => {
          this.state.filter.exactDay = null;
        }),
      );
    }

    const statusRow = bar.createDiv({ cls: 'runway-filterbar__row' });
    for (const [status, label] of STATUS_PILLS) {
      const active = this.state.filter.statuses.includes(status);
      const pill = statusRow.createEl('button', {
        cls: `runway-pill${active ? ' is-active' : ''}`,
        text: label,
      });
      pill.addEventListener('click', () =>
        this.update(() => {
          this.state.filter.statuses = active
            ? this.state.filter.statuses.filter((candidate) => candidate !== status)
            : [...this.state.filter.statuses, status];
        }),
      );
    }

    const controlRow = bar.createDiv({ cls: 'runway-filterbar__row' });
    const facets = this.facets();

    this.chip(controlRow, {
      label: DUE_CHIP[this.state.filter.due],
      active: this.state.filter.due !== 'all',
      options: DUE_OPTIONS,
      current: this.state.filter.due,
      onPick: (value) =>
        this.update(() => {
          this.state.filter.due = value;
        }),
    });

    this.chip(controlRow, {
      label: this.state.filter.tags[0] ?? 'Tag',
      active: this.state.filter.tags.length > 0,
      options: [['', 'Tutti i tag'], ...facets.tags.map((tag): [string, string] => [tag, tag])],
      current: this.state.filter.tags[0] ?? '',
      emptyNote: 'Nessun tag',
      onPick: (value) =>
        this.update(() => {
          this.state.filter.tags = value === '' ? [] : [value];
        }),
    });

    this.chip(controlRow, {
      label: this.state.filter.folder ? lastSegment(this.state.filter.folder) : 'Cartella',
      active: this.state.filter.folder !== null,
      options: [
        ['', 'Tutte le cartelle'],
        ...facets.folders.map((folder): [string, string] => [folder, folder]),
      ],
      current: this.state.filter.folder ?? '',
      emptyNote: 'Nessuna cartella',
      onPick: (value) =>
        this.update(() => {
          this.state.filter.folder = value === '' ? null : value;
        }),
    });

    const priority = this.state.filter.priorities?.[0] ?? '';
    this.chip(controlRow, {
      label: priority === '' ? 'Priorità' : (PRIORITY_EMOJI[priority as Priority] ?? 'Priorità'),
      active: this.state.filter.priorities !== null,
      options: PRIORITY_OPTIONS,
      current: priority,
      onPick: (value) =>
        this.update(() => {
          this.state.filter.priorities = value === '' ? null : [value as Priority];
        }),
    });

    const controlEnd = controlRow.createDiv({ cls: 'runway-filterbar__end' });
    this.chip(controlEnd, {
      icon: 'arrow-up-down',
      label: shortLabel(SORT_OPTIONS, this.state.sort),
      options: SORT_OPTIONS,
      current: this.state.sort,
      onPick: (value) =>
        this.update(() => {
          this.state.sort = value;
        }),
    });
    this.chip(controlEnd, {
      icon: 'layout-list',
      label: shortLabel(GROUP_OPTIONS, this.state.group),
      options: GROUP_OPTIONS,
      current: this.state.group,
      onPick: (value) =>
        this.update(() => {
          this.state.group = value;
        }),
    });
  }

  private chip<T extends string>(
    parent: HTMLElement,
    config: {
      label: string;
      options: readonly [T, string][];
      current: T;
      onPick: (value: T) => void;
      icon?: string;
      active?: boolean;
      emptyNote?: string;
    },
  ): void {
    const chip = parent.createEl('button', {
      cls: `runway-fchip${config.active ? ' is-active' : ''}`,
    });
    if (config.icon) {
      const icon = chip.createSpan({ cls: 'runway-fchip__icon' });
      setIcon(icon, config.icon);
    }
    chip.createSpan({ cls: 'runway-fchip__label', text: config.label });
    const caret = chip.createSpan({ cls: 'runway-fchip__caret' });
    setIcon(caret, 'chevron-down');
    chip.addEventListener('click', (event) => {
      const menu = new Menu();
      const selectable = config.options.filter(([value]) => !config.emptyNote || value !== '');
      if (config.emptyNote && selectable.length === 0) {
        menu.addItem((item) => item.setTitle(config.emptyNote as string).setDisabled(true));
      }
      for (const [value, label] of config.options) {
        menu.addItem((item) =>
          item
            .setTitle(label)
            .setChecked(value === config.current)
            .onClick(() => config.onPick(value)),
        );
      }
      menu.showAtMouseEvent(event);
    });
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

  // ── Results (accordion groups) ──────────────────────────────────────

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
      this.state.filter,
      this.state.sort,
      this.state.group,
      todayKey(),
      { inboxFolders: this.ctx.settings.inboxFolders },
    );
    const total = groups.reduce((sum, group) => sum + group.tasks.length, 0);
    this.countEl?.setText(this.options.compact ? String(total) : `${total} task`);
    this.lastGroupKeys = groups.filter((group) => group.label !== '').map((group) => group.key);
    this.syncToggleAll();

    if (total === 0) {
      results.createDiv({ cls: 'runway-empty', text: 'Nessun task corrisponde ai filtri.' });
      return;
    }

    for (const group of groups) {
      const isInbox = this.state.group === 'note' && group.key === '0-inbox';
      const showNote = this.state.group !== 'note' || isInbox;

      // The single unlabeled bucket (group = none) is not an accordion.
      if (group.label === '') {
        const body = results.createDiv({ cls: 'runway-group__body' });
        this.renderRows(body, group.key, group.tasks, showNote);
        continue;
      }

      const collapsed = this.collapsed.has(group.key);
      const section = results.createDiv({
        cls: `runway-group${isInbox ? ' runway-group--inbox' : ''}${collapsed ? ' is-collapsed' : ''}`,
      });

      const head = section.createDiv({
        cls: 'runway-group__head',
        attr: { role: 'button', 'aria-expanded': String(!collapsed), tabindex: '0' },
      });
      const chevron = head.createSpan({ cls: 'runway-group__chevron' });
      setIcon(chevron, 'chevron-right');
      head.createSpan({ cls: 'runway-group__title', text: group.label });
      head.createSpan({ cls: 'runway-group__count', text: String(group.tasks.length) });

      const notePath = group.tasks[0]?.path;
      if (this.state.group === 'note' && !isInbox && notePath !== undefined) {
        const spacer = head.createDiv({ cls: 'runway-group__actions' });
        const addHere = spacer.createSpan({ cls: 'runway-group__act' });
        setIcon(addHere, 'plus');
        addHere.setAttribute('aria-label', 'Nuovo task in questa nota');
        addHere.addEventListener('click', (event) => {
          event.stopPropagation();
          new QuickAddModal(this.ctx, notePath).open();
        });
        const open = spacer.createSpan({ cls: 'runway-group__act' });
        setIcon(open, 'file-symlink');
        open.setAttribute('aria-label', 'Apri nota');
        open.addEventListener('click', (event) => {
          event.stopPropagation();
          const file = this.ctx.app.vault.getFileByPath(notePath);
          if (file) void this.ctx.app.workspace.getLeaf('tab').openFile(file);
        });
      }

      head.addEventListener('click', () => this.toggleCollapse(group.key));
      head.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.toggleCollapse(group.key);
        }
      });

      if (!collapsed) {
        const body = section.createDiv({ cls: 'runway-group__body' });
        this.renderRows(body, group.key, group.tasks, showNote);
      }
    }
  }

  private renderRows(
    body: HTMLElement,
    key: string,
    tasks: readonly Parameters<typeof renderTaskRow>[2][],
    showNote: boolean,
  ): void {
    const visible = this.expanded.has(key) ? tasks : tasks.slice(0, PAGE_SIZE);
    for (const task of visible) {
      renderTaskRow(body, this.ctx, task, { showNote });
    }
    if (tasks.length > visible.length) {
      const more = body.createEl('button', {
        cls: 'runway-group__more',
        text: `Mostra altri ${tasks.length - visible.length}`,
      });
      more.addEventListener('click', () => {
        this.expanded.add(key);
        this.renderResults();
      });
    }
  }

  // ── State transitions ───────────────────────────────────────────────

  private update(mutate: () => void): void {
    mutate();
    this.expanded.clear();
    this.options.onStateChange();
    this.renderFilters();
    this.renderResults();
  }

  private toggleCollapse(key: string): void {
    if (this.collapsed.has(key)) this.collapsed.delete(key);
    else this.collapsed.add(key);
    this.options.onStateChange();
    this.renderResults();
  }

  // ── Saved views ─────────────────────────────────────────────────────

  private openViewsMenu(event: MouseEvent): void {
    const menu = new Menu();
    const views = this.ctx.settings.savedViews;
    if (views.length === 0) {
      menu.addItem((item) => item.setTitle('Nessuna vista salvata').setDisabled(true));
    }
    for (const view of views) {
      menu.addItem((item) =>
        item
          .setTitle(view.name)
          .setIcon('bookmark')
          .onClick(() => this.applyView(view)),
      );
    }
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle('Salva vista corrente…')
        .setIcon('save')
        .onClick(() => this.saveCurrentView()),
    );
    menu.showAtMouseEvent(event);
  }

  private applyView(view: SavedView): void {
    this.state.filter = { ...structuredClone(DEFAULT_FILTER), ...view.filter };
    this.state.sort = view.sort;
    this.state.group = view.group;
    this.expanded.clear();
    this.collapsed.clear();
    this.options.onStateChange();
    this.renderFilters();
    this.renderResults();
  }

  private saveCurrentView(): void {
    promptText(this.ctx.app, 'Nome della vista', '', (name) => {
      const view: SavedView = {
        name,
        filter: { ...this.state.filter },
        sort: this.state.sort,
        group: this.state.group,
      };
      const existing = this.ctx.settings.savedViews.findIndex((v) => v.name === name);
      if (existing >= 0) this.ctx.settings.savedViews[existing] = view;
      else this.ctx.settings.savedViews.push(view);
      void this.ctx.saveSettings();
      new Notice(`Runway: vista "${name}" salvata.`);
    });
  }

  private toggleAll(): void {
    const anyOpen = this.lastGroupKeys.some((key) => !this.collapsed.has(key));
    if (anyOpen) for (const key of this.lastGroupKeys) this.collapsed.add(key);
    else this.collapsed.clear();
    this.options.onStateChange();
    this.renderResults();
  }

  private syncToggleAll(): void {
    const btn = this.toggleAllBtn;
    if (!btn) return;
    const anyOpen = this.lastGroupKeys.some((key) => !this.collapsed.has(key));
    btn.empty();
    setIcon(btn, anyOpen ? 'chevrons-down-up' : 'chevrons-up-down');
    btn.setAttribute('aria-label', anyOpen ? 'Comprimi tutto' : 'Espandi tutto');
    btn.toggleClass('is-hidden', this.lastGroupKeys.length === 0);
  }
}
