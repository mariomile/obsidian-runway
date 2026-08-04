import { Menu, Notice, setIcon } from 'obsidian';
import type { MenuItem } from 'obsidian';

import { todayKey } from '../dates.ts';
import { DEFAULT_FILTER, queryTasks } from '../core/query.ts';
import { PRIORITY_EMOJI } from '../core/parse.ts';
import { renderTaskRow } from './task-row.ts';
import { promptTaskNote, refOf } from './task-menu.ts';
import { showDateMenu } from './date-menu.ts';
import { pickNote } from './note-picker.ts';
import { QuickAddModal } from './quick-add-modal.ts';
import { promptText } from './prompt-modal.ts';
import { createChip, createIconButton, makeButtonLike, setChipPressed } from '../kit/controls.ts';
import type { RunwayContext } from './context.ts';
import type {
  DueFilter,
  Priority,
  SavedView,
  Task,
  TaskFilter,
  TaskGroup,
  TaskSort,
  TaskStatus,
} from '../types.ts';

function taskKey(task: Task): string {
  return `${task.path}:${task.line}`;
}

/** `MenuItem.setSubmenu()` exists at runtime (Obsidian ≥1.4) but isn't typed. */
function submenuOf(item: MenuItem): Menu {
  return (item as MenuItem & { setSubmenu(): Menu }).setSubmenu();
}

const PAGE_SIZE = 200;

/** Prominent time views (Craft-style) — the primary way to slice the list.
   "Today" folds in overdue; the date grouping still shows an Overdue bucket. */
const DUE_SEGMENTS: [DueFilter, string][] = [
  ['today', 'Today'],
  ['upcoming', 'Upcoming'],
  ['none', 'No date'],
  ['all', 'All'],
];

const STATUS_OPTIONS: [TaskStatus, string][] = [
  ['todo', 'To do'],
  ['in-progress', 'In progress'],
  ['done', 'Done'],
  ['cancelled', 'Cancelled'],
];

const OPEN_STATUSES: TaskStatus[] = ['todo', 'in-progress'];

function isDefaultStatuses(statuses: TaskStatus[]): boolean {
  return statuses.length === 2 && OPEN_STATUSES.every((status) => statuses.includes(status));
}

function statusSummary(statuses: TaskStatus[]): string {
  if (statuses.length === 0) return 'Any status';
  if (isDefaultStatuses(statuses)) return 'Open';
  return statuses
    .map((status) => STATUS_OPTIONS.find(([value]) => value === status)?.[1] ?? status)
    .join(', ');
}

const SORT_OPTIONS: [TaskSort, string][] = [
  ['due', 'Due date'],
  ['priority', 'Priority'],
  ['path', 'Note'],
];

const GROUP_OPTIONS: [TaskGroup, string][] = [
  ['note', 'Note'],
  ['date', 'Date'],
  ['agenda', 'Agenda'],
  ['priority', 'Priority'],
  ['tag', 'Tag'],
  ['folder', 'Folder'],
  ['none', 'None'],
];

/** Agenda's far buckets open collapsed — the near days are what you glance at. */
const AGENDA_FAR_KEYS = ['y-later', 'zz-none'];

const PRIORITY_OPTIONS: [string, string][] = [
  ['', 'Priority'],
  ['highest', `${PRIORITY_EMOJI.highest} Highest`],
  ['high', `${PRIORITY_EMOJI.high} High`],
  ['medium', `${PRIORITY_EMOJI.medium} Medium`],
  ['low', `${PRIORITY_EMOJI.low} Low`],
  ['lowest', `${PRIORITY_EMOJI.lowest} Lowest`],
];

function shortLabel(options: readonly [string, string][], value: string): string {
  return options.find(([candidate]) => candidate === value)?.[1] ?? value;
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
  /** Persistent segments host in the header row (filled by renderFilters). */
  private segmentsEl: HTMLElement | null = null;
  private bulkBarEl: HTMLElement | null = null;
  private resultsEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private lastGroupKeys: string[] = [];

  // Keyboard cursor + multi-selection over the currently-visible rows.
  private cursor = -1;
  private readonly selection = new Set<string>();
  private visibleTasks: Task[] = [];
  private rowEls: HTMLElement[] = [];
  private taskByKey = new Map<string, Task>();
  private keyHandler: ((event: KeyboardEvent) => void) | null = null;

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
    // Default-group agenda (from settings) with no saved collapse state gets the
    // far buckets folded, matching the explicit switch and the Upcoming command.
    if (this.state.group === 'agenda' && this.collapsed.size === 0) this.seedAgendaCollapse();
  }

  mount(): void {
    this.container.addClass('runway-panel');
    this.container.toggleClass('runway-panel--compact', this.options.compact);
    this.container.tabIndex = 0;
    this.keyHandler = (event) => this.onKeyDown(event);
    this.container.addEventListener('keydown', this.keyHandler);
    this.unsubscribe = this.ctx.index.subscribe(() => this.renderResults());
    this.renderChrome();
  }

  unmount(): void {
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    if (this.keyHandler) this.container.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
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

    // No title or divider — the tab already reads "Runway"; keep it light.
    this.countEl = null;
    const header = root.createDiv({ cls: 'runway-panel__header' });
    const actions = header.createDiv({ cls: 'runway-panel__actions' });

    const searchWrap = actions.createDiv({ cls: 'mv-field runway-search' });
    const searchIcon = searchWrap.createSpan({ cls: 'mv-field__icon' });
    setIcon(searchIcon, 'search');
    const search = searchWrap.createEl('input', {
      cls: 'mv-field__input runway-search__input',
      type: 'search',
      placeholder: 'Search…',
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

    // Time segments live in the header row so they sit beside the search when
    // there's width; renderFilters fills this persistent host. CSS `order` +
    // flex-wrap pull them up next to search on the full page and drop them to
    // their own line in the compact sidebar (see .runway-segments rules).
    this.segmentsEl = actions.createDiv({ cls: 'mv-seg runway-segments' });

    const add = actions.createEl('button', { cls: 'runway-add-btn' });
    setIcon(add, 'plus');
    if (!this.options.compact) add.createSpan({ text: 'Task' });
    add.setAttribute('aria-label', 'New task');
    add.addEventListener('click', () => new QuickAddModal(this.ctx).open());

    const overflow = createIconButton(actions, 'More', 'runway-iconbtn');
    setIcon(overflow, 'more-horizontal');
    overflow.addEventListener('click', (event) => this.openOverflowMenu(event));

    this.filtersEl = root.createDiv({ cls: 'runway-panel__filters' });
    this.bulkBarEl = root.createDiv({ cls: 'runway-bulkbar is-hidden' });
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
      // Niente emoji nell'etichetta: il calendario è un'icona vera a sinistra,
      // come in ogni altro chip. Un glifo emoji non prende il colore del tema
      // e cambia forma fra piattaforme.
      const pill = dayRow.createDiv({ cls: 'mv-chip is-on runway-fchip' });
      makeButtonLike(pill, 'Remove day filter');
      const dayIcon = pill.createSpan({ cls: 'mv-chip__icon' });
      setIcon(dayIcon, 'calendar');
      pill.createSpan({ cls: 'mv-chip__label', text: this.state.filter.exactDay });
      const clear = pill.createSpan({ cls: 'mv-chip__caret' });
      setIcon(clear, 'x');
      pill.addEventListener('click', () =>
        this.update(() => {
          this.state.filter.exactDay = null;
        }),
      );
    }

    // Primary: prominent time segments (All · Today · Week · …).
    // Rendered into the persistent header host so they share the search row.
    const segments = this.segmentsEl;
    if (segments) {
      segments.empty();
      for (const [value, label] of DUE_SEGMENTS) {
        const active = !this.state.filter.exactDay && this.state.filter.due === value;
        // <button> è legittimo QUI e solo qui: `.mv-seg > .mv-seg-item` è un
        // selettore figlio a (0,2,0) e batte `button:not(.clickable-icon)` di
        // app.css. I primitivi standalone (chip, icon-btn) non hanno questa
        // leva e vanno su div — vedi kit/controls.ts.
        const segment = segments.createEl('button', {
          cls: 'mv-seg-item runway-segment',
          text: label,
          attr: { 'aria-pressed': String(active) },
        });
        segment.addEventListener('click', () =>
          this.update(() => {
            this.state.filter.due = value;
            this.state.filter.exactDay = null;
          }),
        );
      }
    }

    // Secondary: one "Filters" chip (status + tag + folder + priority) + sort/group.
    const controlRow = bar.createDiv({ cls: 'runway-filterbar__row' });

    const activeFilters = this.activeFilterCount();
    const filterChip = controlRow.createDiv({ cls: 'mv-chip runway-fchip' });
    makeButtonLike(filterChip, 'Filters');
    setChipPressed(filterChip, activeFilters > 0);
    const filterIcon = filterChip.createSpan({ cls: 'mv-chip__icon' });
    setIcon(filterIcon, 'filter');
    filterChip.createSpan({
      cls: 'mv-chip__label',
      text: activeFilters > 0 ? `Filters (${activeFilters})` : 'Filters',
    });
    const filterCaret = filterChip.createSpan({ cls: 'mv-chip__caret' });
    setIcon(filterCaret, 'chevron-down');
    filterChip.addEventListener('click', (event) => this.openFiltersMenu(event));

    const controlEnd = controlRow.createDiv({ cls: 'runway-filterbar__end' });
    this.iconMenu(controlEnd, 'arrow-up-down', 'Sort', SORT_OPTIONS, this.state.sort, (value) =>
      this.update(() => {
        this.state.sort = value;
      }),
    );
    this.iconMenu(controlEnd, 'layout-list', 'Group', GROUP_OPTIONS, this.state.group, (value) =>
      this.update(() => {
        this.state.group = value;
        if (value === 'agenda') this.seedAgendaCollapse();
      }),
    );
  }

  /** Icon-only button opening a single-select menu (sort / group). */
  private iconMenu<T extends string>(
    parent: HTMLElement,
    icon: string,
    label: string,
    options: readonly [T, string][],
    current: T,
    onPick: (value: T) => void,
  ): void {
    const button = createIconButton(parent, `${label}: ${shortLabel(options, current)}`, 'runway-iconbtn');
    setIcon(button, icon);
    button.addEventListener('click', (event) => {
      const menu = new Menu();
      for (const [value, optionLabel] of options) {
        menu.addItem((item) =>
          item
            .setTitle(optionLabel)
            .setChecked(value === current)
            .onClick(() => onPick(value)),
        );
      }
      menu.showAtMouseEvent(event);
    });
  }

  private activeFilterCount(): number {
    let count = 0;
    if (!isDefaultStatuses(this.state.filter.statuses)) count += 1;
    if (this.state.filter.tags.length > 0) count += 1;
    if (this.state.filter.folder !== null) count += 1;
    if (this.state.filter.priorities !== null) count += 1;
    return count;
  }

  /** One popover holding every secondary filter dimension as a submenu. */
  private openFiltersMenu(event: MouseEvent): void {
    const menu = new Menu();
    const facets = this.facets();

    menu.addItem((item) => {
      item.setTitle(`Status · ${statusSummary(this.state.filter.statuses)}`).setIcon('circle-dot');
      const sub = submenuOf(item);
      for (const [status, label] of STATUS_OPTIONS) {
        sub.addItem((sitem: MenuItem) =>
          sitem
            .setTitle(label)
            .setChecked(this.state.filter.statuses.includes(status))
            .onClick(() =>
              this.update(() => {
                this.state.filter.statuses = this.state.filter.statuses.includes(status)
                  ? this.state.filter.statuses.filter((candidate) => candidate !== status)
                  : [...this.state.filter.statuses, status];
              }),
            ),
        );
      }
    });

    menu.addItem((item) => {
      const current = this.state.filter.priorities?.[0] ?? '';
      item.setTitle('Priority').setIcon('flag');
      const sub = submenuOf(item);
      for (const [value, label] of PRIORITY_OPTIONS) {
        sub.addItem((sitem: MenuItem) =>
          sitem
            .setTitle(label)
            .setChecked(value === current)
            .onClick(() =>
              this.update(() => {
                this.state.filter.priorities = value === '' ? null : [value as Priority];
              }),
            ),
        );
      }
    });

    menu.addItem((item) => {
      item.setTitle('Tag').setIcon('hash');
      const sub = submenuOf(item);
      sub.addItem((sitem: MenuItem) =>
        sitem
          .setTitle('All tags')
          .setChecked(this.state.filter.tags.length === 0)
          .onClick(() => this.update(() => (this.state.filter.tags = []))),
      );
      for (const tag of facets.tags) {
        sub.addItem((sitem: MenuItem) =>
          sitem
            .setTitle(tag)
            .setChecked(this.state.filter.tags[0] === tag)
            .onClick(() => this.update(() => (this.state.filter.tags = [tag]))),
        );
      }
    });

    menu.addItem((item) => {
      item.setTitle('Folder').setIcon('folder');
      const sub = submenuOf(item);
      sub.addItem((sitem: MenuItem) =>
        sitem
          .setTitle('All folders')
          .setChecked(this.state.filter.folder === null)
          .onClick(() => this.update(() => (this.state.filter.folder = null))),
      );
      for (const folder of facets.folders) {
        sub.addItem((sitem: MenuItem) =>
          sitem
            .setTitle(folder)
            .setChecked(this.state.filter.folder === folder)
            .onClick(() => this.update(() => (this.state.filter.folder = folder))),
        );
      }
    });

    if (this.activeFilterCount() > 0) {
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle('Clear filters')
          .setIcon('filter-x')
          .onClick(() =>
            this.update(() => {
              this.state.filter.statuses = [...OPEN_STATUSES];
              this.state.filter.tags = [];
              this.state.filter.folder = null;
              this.state.filter.priorities = null;
            }),
          ),
      );
    }

    menu.showAtMouseEvent(event);
  }

  /** Header overflow: saved views, collapse-all, expand-to-page. */
  private openOverflowMenu(event: MouseEvent): void {
    const menu = new Menu();

    menu.addItem((item) => {
      item.setTitle('Saved views').setIcon('bookmark');
      const sub = submenuOf(item);
      if (this.ctx.settings.savedViews.length === 0) {
        sub.addItem((sitem: MenuItem) => sitem.setTitle('No saved views').setDisabled(true));
      }
      for (const view of this.ctx.settings.savedViews) {
        sub.addItem((sitem: MenuItem) => sitem.setTitle(view.name).onClick(() => this.applyView(view)));
      }
      sub.addSeparator();
      sub.addItem((sitem: MenuItem) =>
        sitem
          .setTitle('Save current view…')
          .setIcon('save')
          .onClick(() => this.saveCurrentView()),
      );
    });

    if (this.lastGroupKeys.length > 0) {
      const anyOpen = this.lastGroupKeys.some((key) => !this.collapsed.has(key));
      menu.addItem((item) =>
        item
          .setTitle(anyOpen ? 'Collapse all' : 'Expand all')
          .setIcon(anyOpen ? 'chevrons-down-up' : 'chevrons-up-down')
          .onClick(() => this.toggleAll()),
      );
    }

    if (this.options.onExpand) {
      menu.addItem((item) =>
        item
          .setTitle('Open full list')
          .setIcon('maximize-2')
          .onClick(() => this.options.onExpand?.()),
      );
    }

    menu.showAtMouseEvent(event);
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
    this.visibleTasks = [];
    this.rowEls = [];
    this.taskByKey = new Map();

    if (!this.ctx.index.isReady()) {
      results.createDiv({ cls: 'runway-empty', text: 'Indexing…' });
      return;
    }

    const groups = queryTasks(
      this.ctx.index.all(),
      this.state.filter,
      this.state.sort,
      this.state.group,
      todayKey(),
      {
        inboxFolders: this.ctx.settings.inboxFolders,
        agendaHorizonDays: this.ctx.settings.agendaHorizonDays,
      },
    );
    for (const group of groups) {
      for (const task of group.tasks) this.taskByKey.set(taskKey(task), task);
    }
    const total = groups.reduce((sum, group) => sum + group.tasks.length, 0);
    this.countEl?.setText(this.options.compact ? String(total) : `${total} task`);
    this.lastGroupKeys = groups.filter((group) => group.label !== '').map((group) => group.key);
    // Drop selection entries whose tasks are gone (completed, edited away).
    for (const key of [...this.selection]) if (!this.taskByKey.has(key)) this.selection.delete(key);

    if (total === 0) {
      this.cursor = -1;
      this.renderBulkBar();
      results.createDiv({ cls: 'runway-empty', text: 'No task matches the filters.' });
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
      const variant = this.state.group === 'agenda' ? this.agendaVariant(group.key) : '';
      const section = results.createDiv({
        cls: `runway-group${isInbox ? ' runway-group--inbox' : ''}${variant}${collapsed ? ' is-collapsed' : ''}`,
      });

      const head = section.createDiv({
        cls: 'runway-group__head',
        attr: { role: 'button', 'aria-expanded': String(!collapsed), tabindex: '0' },
      });
      const chevron = head.createSpan({ cls: 'runway-group__chevron' });
      setIcon(chevron, 'chevron-right');
      head.createSpan({ cls: 'runway-group__title', text: group.label });
      if (group.sublabel) head.createSpan({ cls: 'runway-group__sub', text: group.sublabel });
      head.createSpan({ cls: 'runway-group__count', text: String(group.tasks.length) });

      const notePath = group.tasks[0]?.path;
      if (this.state.group === 'note' && !isInbox && notePath !== undefined) {
        const spacer = head.createDiv({ cls: 'runway-group__actions' });
        const addHere = spacer.createSpan({ cls: 'runway-group__act' });
        setIcon(addHere, 'plus');
        addHere.setAttribute('aria-label', 'New task in this note');
        addHere.addEventListener('click', (event) => {
          event.stopPropagation();
          new QuickAddModal(this.ctx, notePath).open();
        });
        const open = spacer.createSpan({ cls: 'runway-group__act' });
        setIcon(open, 'file-symlink');
        open.setAttribute('aria-label', 'Open note');
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

    if (this.cursor >= this.visibleTasks.length) this.cursor = this.visibleTasks.length - 1;
    this.renderBulkBar();
  }

  private renderRows(body: HTMLElement, key: string, tasks: readonly Task[], showNote: boolean): void {
    const visible = this.expanded.has(key) ? tasks : tasks.slice(0, PAGE_SIZE);
    for (const task of visible) {
      const index = this.visibleTasks.length;
      const rowEl = renderTaskRow(body, this.ctx, task, {
        showNote,
        cursor: index === this.cursor,
        selected: this.selection.has(taskKey(task)),
      });
      // Modifier-click selects without triggering the row's open/complete handlers.
      rowEl.addEventListener(
        'click',
        (event) => {
          if (event.metaKey || event.ctrlKey) {
            event.preventDefault();
            event.stopPropagation();
            this.toggleSelect(task);
          } else if (event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            this.selectRange(index);
          }
        },
        { capture: true },
      );
      this.visibleTasks.push(task);
      this.rowEls.push(rowEl);
    }
    if (tasks.length > visible.length) {
      const more = body.createEl('button', {
        cls: 'runway-group__more',
        text: `Show ${tasks.length - visible.length} more`,
      });
      more.addEventListener('click', () => {
        this.expanded.add(key);
        this.renderResults();
      });
    }
  }

  // ── Keyboard cursor + multi-selection ───────────────────────────────

  private onKeyDown(event: KeyboardEvent): void {
    const target = event.target;
    // Let interactive controls (inputs, buttons, chips, group headers) own
    // their own keys — otherwise Enter/Space double-fire (e.g. a group header
    // would both toggle collapse and open the cursor task).
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.closest('input, textarea, select, a, button, [role="button"]'))
    ) {
      return;
    }
    switch (event.key) {
      case 'j':
      case 'ArrowDown':
        this.moveCursor(1);
        break;
      case 'k':
      case 'ArrowUp':
        this.moveCursor(-1);
        break;
      case 'x':
        void this.completeTargets();
        break;
      case 'e':
        this.editCursor();
        break;
      case 'n': {
        const task = this.cursorTask();
        if (task) promptTaskNote(this.ctx, task);
        break;
      }
      case 'Enter':
      case 'o':
        this.openCursor();
        break;
      case ' ':
        this.toggleCursorSelection();
        break;
      case 'Escape':
        if (this.selection.size === 0) return;
        this.clearSelection();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  private moveCursor(delta: number): void {
    if (this.visibleTasks.length === 0) return;
    const prev = this.cursor;
    this.cursor =
      prev < 0
        ? delta > 0
          ? 0
          : this.visibleTasks.length - 1
        : Math.max(0, Math.min(this.visibleTasks.length - 1, prev + delta));
    if (prev >= 0) this.rowEls[prev]?.removeClass('is-cursor');
    const el = this.rowEls[this.cursor];
    el?.addClass('is-cursor');
    el?.scrollIntoView({ block: 'nearest' });
  }

  private cursorTask(): Task | null {
    return this.cursor >= 0 ? (this.visibleTasks[this.cursor] ?? null) : null;
  }

  private toggleSelect(task: Task): void {
    const key = taskKey(task);
    if (this.selection.has(key)) this.selection.delete(key);
    else this.selection.add(key);
    const index = this.visibleTasks.findIndex((candidate) => taskKey(candidate) === key);
    if (index >= 0) this.rowEls[index]?.toggleClass('is-selected', this.selection.has(key));
    this.renderBulkBar();
  }

  private toggleCursorSelection(): void {
    const task = this.cursorTask();
    if (task) this.toggleSelect(task);
  }

  private selectRange(toIndex: number): void {
    const from = this.cursor < 0 ? toIndex : this.cursor;
    const [lo, hi] = from <= toIndex ? [from, toIndex] : [toIndex, from];
    for (let i = lo; i <= hi; i++) {
      const task = this.visibleTasks[i];
      if (!task) continue;
      this.selection.add(taskKey(task));
      this.rowEls[i]?.addClass('is-selected');
    }
    this.cursor = toIndex;
    this.renderBulkBar();
  }

  private clearSelection(): void {
    this.selection.clear();
    for (const el of this.rowEls) el.removeClass('is-selected');
    this.renderBulkBar();
  }

  /** Refs for the current bulk target: the selection, else the cursor row. */
  private targets(): Task[] {
    if (this.selection.size > 0) {
      return [...this.selection].map((key) => this.taskByKey.get(key)).filter((t): t is Task => !!t);
    }
    const task = this.cursorTask();
    return task ? [task] : [];
  }

  private async completeTargets(): Promise<void> {
    const targets = this.targets();
    for (const task of targets) await this.ctx.edits.setStatus(refOf(task), 'done');
    this.clearSelection();
  }

  private editCursor(): void {
    const task = this.cursorTask();
    if (!task) return;
    promptText(this.ctx.app, 'Edit task', task.description, (text) => {
      void this.ctx.edits.editDescription(refOf(task), text);
    });
  }

  private openCursor(): void {
    const task = this.cursorTask();
    if (task) void this.ctx.edits.openAtLine(refOf(task));
  }

  private renderBulkBar(): void {
    const bar = this.bulkBarEl;
    if (!bar) return;
    bar.empty();
    bar.toggleClass('is-hidden', this.selection.size === 0);
    if (this.selection.size === 0) return;

    bar.createSpan({ cls: 'runway-bulkbar__count', text: `${this.selection.size} selected` });
    const actions = bar.createDiv({ cls: 'runway-bulkbar__actions' });

    const complete = createChip(actions, 'Complete', { extraClass: 'mv-chip--pill runway-pill' });
    complete.addEventListener('click', () => void this.completeTargets());

    const reschedule = createChip(actions, 'Reschedule', { extraClass: 'mv-chip--pill runway-pill' });
    reschedule.addEventListener('click', (event) => {
      const targets = this.targets();
      showDateMenu(event, this.ctx.app, undefined, {
        onPick: (date) => {
          void (async () => {
            for (const task of targets) await this.ctx.edits.reschedule(refOf(task), date);
            this.clearSelection();
          })();
        },
      });
    });

    const move = createChip(actions, 'Move', { extraClass: 'mv-chip--pill runway-pill' });
    move.addEventListener('click', () => {
      const targets = this.targets();
      pickNote(this.ctx.app, 'Move tasks to…', (file) => {
        void (async () => {
          for (const task of targets) await this.ctx.edits.moveToNote(refOf(task), file.path);
          this.clearSelection();
        })();
      });
    });

    const clear = createIconButton(actions, 'Deselect', 'runway-iconbtn');
    setIcon(clear, 'x');
    clear.addEventListener('click', () => this.clearSelection());
  }

  // ── State transitions ───────────────────────────────────────────────

  private update(mutate: () => void): void {
    mutate();
    this.expanded.clear();
    this.selection.clear();
    this.cursor = -1;
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

  private applyView(view: SavedView): void {
    this.state.filter = { ...structuredClone(DEFAULT_FILTER), ...view.filter };
    this.state.sort = view.sort;
    this.state.group = view.group;
    this.expanded.clear();
    this.collapsed.clear();
    if (view.group === 'agenda') this.seedAgendaCollapse();
    this.selection.clear();
    this.cursor = -1;
    this.options.onStateChange();
    this.renderFilters();
    this.renderResults();
  }

  private saveCurrentView(): void {
    promptText(this.ctx.app, 'View name', '', (name) => {
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
      new Notice(`Runway: view "${name}" saved.`);
    });
  }

  /** Accent modifier for an agenda bucket: red Overdue, accented Today. */
  private agendaVariant(key: string): string {
    if (key === 'a-overdue') return ' runway-group--overdue';
    if (key === `b-${todayKey()}`) return ' runway-group--today';
    return '';
  }

  /** Open the agenda's far buckets collapsed the first time they appear. */
  private seedAgendaCollapse(): void {
    for (const key of AGENDA_FAR_KEYS) this.collapsed.add(key);
  }

  private toggleAll(): void {
    const anyOpen = this.lastGroupKeys.some((key) => !this.collapsed.has(key));
    if (anyOpen) for (const key of this.lastGroupKeys) this.collapsed.add(key);
    else this.collapsed.clear();
    this.options.onStateChange();
    this.renderResults();
  }
}
