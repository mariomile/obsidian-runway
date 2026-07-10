# Runway Fixed Views, Kanban & UX Alignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed view nav (Inbox / Today / Upcoming / All), a configurable Kanban board, a prominent add-task, and a suite-aligned UX to Runway — additive, no data-model changes.

**Architecture:** A pure `core/views.ts` resolves each view to a filter + group (+ a Today-only OR-branch and pin). The panel renders a nav strip and, per active view, either the existing list or a new board whose columns reuse the group-by engine. All writes route through the existing guarded `TaskEditService`.

**Tech Stack:** TypeScript, Obsidian API, esbuild, node native test runner (`node --test`) for pure core, pnpm.

## Global Constraints

- Min Obsidian `1.12.7`; `isDesktopOnly: false` (desktop + mobile).
- **No runtime dependencies** beyond the Obsidian API.
- **Pure core** (`src/core/**`, `src/dates.ts`): no Obsidian imports; unit-tested with `node --test`.
- **CSS Principle 0**: every color/space/type value from a theme variable (`--text-*`, `--background-*`, `--interactive-accent`, `--radius-*`, `--size-*`, `--font-ui-*`, `--shadow-*`). No hardcoded hex.
- Class prefix `runway-`. UI signature = design-system **Filone B ("app panel")**.
- Task lines are the source of truth — every mutation goes through `TaskEditService` (guarded line edits). Never write files directly.
- Commit after every green task. Work on branch `feat/views-kanban`.
- Verify commands: `pnpm build` (typecheck + bundle), `pnpm test` (node native tests).

---

### Task 1: Status grouping in the query engine

Adds a `'status'` group so the board can build status columns (and list gains group-by-status for free).

**Files:**
- Modify: `src/types.ts` (extend `TaskGroup`)
- Modify: `src/core/query.ts` (`groupSpec` status case)
- Modify: `src/settings.ts` (`GROUPS` array)
- Test: `src/core/query.test.ts`

**Interfaces:**
- Produces: `TaskGroup` now includes `'status'`; `groupSpec(task, 'status', …)` returns `{ key: '<rank>-<status>', label: <Label> }`.

- [ ] **Step 1: Write the failing test**

Add to `src/core/query.test.ts`:

```ts
test('groups by status with a stable column order', () => {
  const tasks = [
    makeTask({ path: 'a.md', line: 1, status: 'done' }),
    makeTask({ path: 'a.md', line: 2, status: 'todo' }),
    makeTask({ path: 'a.md', line: 3, status: 'in-progress' }),
  ];
  const groups = queryTasks(tasks, { ...DEFAULT_FILTER, statuses: [] }, 'path', 'status', '2026-07-10');
  assert.deepEqual(
    groups.map((g) => g.label),
    ['Todo', 'In progress', 'Done'],
  );
});
```

*(Use the file's existing `makeTask` helper; if `status` isn't a field it sets, extend that helper to pass `status` through — check the top of `query.test.ts`.)*

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `'status'` not assignable to `TaskGroup` (typecheck) or wrong labels.

- [ ] **Step 3: Extend the type**

In `src/types.ts`, change:

```ts
export type TaskGroup = 'none' | 'note' | 'status' | 'date' | 'agenda' | 'priority' | 'tag' | 'folder';
```

- [ ] **Step 4: Implement the status group**

In `src/core/query.ts`, inside `groupSpec`'s `switch (group)`, add before `case 'date'`:

```ts
    case 'status': {
      const rank: Record<Task['status'], number> = {
        todo: 0,
        'in-progress': 1,
        done: 2,
        cancelled: 3,
        unknown: 4,
      };
      const label: Record<Task['status'], string> = {
        todo: 'Todo',
        'in-progress': 'In progress',
        done: 'Done',
        cancelled: 'Cancelled',
        unknown: 'Other',
      };
      return { key: `${rank[task.status]}-${task.status}`, label: label[task.status] };
    }
```

- [ ] **Step 5: Register the group for settings/saved-views validation**

In `src/settings.ts`, update:

```ts
const GROUPS: readonly TaskGroup[] = ['none', 'note', 'status', 'date', 'agenda', 'priority', 'tag', 'folder'];
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test` then `pnpm build`
Expected: PASS + clean typecheck.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/core/query.ts src/settings.ts src/core/query.test.ts
git commit -m "feat(query): add status grouping for board columns"
```

---

### Task 2: `include` OR-branch and `pinGroups` in the query engine

Lets a view admit extra tasks (Today's daily-note tasks, any date) and pin a group to the top — both needed by `resolveView`.

**Files:**
- Modify: `src/core/query.ts` (`queryTasks` signature + new `pinGroups`)
- Test: `src/core/query.test.ts`

**Interfaces:**
- Produces:
  - `queryTasks(tasks, filter, sort, group, today, options?, include?)` — new optional 7th arg `include?: (task: Task) => boolean`. A task matches if `matchesTask(...)` **or** (`include(task)` and it passes the same filter with the date gate lifted).
  - `pinGroups(groups: TaskGroupResult[], pinnedKeys: string[]): TaskGroupResult[]` — moves the named group keys to the front in the given order; others keep their sort.

- [ ] **Step 1: Write the failing tests**

Add to `src/core/query.test.ts`:

```ts
test('include admits a dateless task the due gate would drop, honoring status', () => {
  const daily = 'Journal/Daily/2026-07-10.md';
  const tasks = [
    makeTask({ path: daily, line: 1, status: 'todo', due: undefined }),       // no date, open
    makeTask({ path: daily, line: 2, status: 'done', due: undefined }),        // no date, done
    makeTask({ path: 'other.md', line: 1, status: 'todo', due: '2026-07-10' }),// due today elsewhere
  ];
  const filter = { ...DEFAULT_FILTER, due: 'today' as const, statuses: ['todo', 'in-progress'] as const };
  const groups = queryTasks(tasks, filter, 'path', 'none', '2026-07-10', {}, (t) => t.path === daily);
  const paths = groups.flatMap((g) => g.tasks.map((t) => `${t.path}:${t.line}`));
  assert.deepEqual(paths.sort(), [`${daily}:1`, 'other.md:1']); // done daily task excluded
});

test('pinGroups moves named keys to the front in order', () => {
  const groups = [
    { key: '1-b.md', label: 'b', tasks: [] },
    { key: '1-a.md', label: 'a', tasks: [] },
    { key: '1-daily.md', label: 'daily', tasks: [] },
  ];
  const pinned = pinGroups(groups, ['1-daily.md']);
  assert.deepEqual(pinned.map((g) => g.key), ['1-daily.md', '1-a.md', '1-b.md']);
});
```

Add `pinGroups` to the import at the top of the test file.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test`
Expected: FAIL — `pinGroups` not exported; `queryTasks` ignores 7th arg.

- [ ] **Step 3: Extend `queryTasks`**

In `src/core/query.ts`, replace the `queryTasks` signature and its filtering line:

```ts
export function queryTasks(
  tasks: Task[],
  filter: TaskFilter,
  sort: TaskSort,
  group: TaskGroup,
  today: DayKey,
  options: QueryOptions = {},
  include?: (task: Task) => boolean,
): TaskGroupResult[] {
  const dateFree: TaskFilter = { ...filter, due: 'all', exactDay: null };
  const matched = sortTasks(
    tasks.filter(
      (task) =>
        matchesTask(task, filter, today) ||
        (include !== undefined && include(task) && matchesTask(task, dateFree, today)),
    ),
    sort,
  );
  // …rest of the function body is unchanged…
```

- [ ] **Step 4: Add `pinGroups`**

Append to `src/core/query.ts`:

```ts
/** Move the named group keys to the front in `pinnedKeys` order; others keep their sort. */
export function pinGroups(
  groups: TaskGroupResult[],
  pinnedKeys: string[],
): TaskGroupResult[] {
  if (pinnedKeys.length === 0) return groups;
  const wanted = new Set(pinnedKeys);
  const pinned: TaskGroupResult[] = [];
  const rest: TaskGroupResult[] = [];
  for (const group of groups) (wanted.has(group.key) ? pinned : rest).push(group);
  pinned.sort((a, b) => pinnedKeys.indexOf(a.key) - pinnedKeys.indexOf(b.key));
  return [...pinned, ...rest];
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm test` then `pnpm build`
Expected: PASS + clean typecheck.

- [ ] **Step 6: Commit**

```bash
git add src/core/query.ts src/core/query.test.ts
git commit -m "feat(query): add include OR-branch and pinGroups"
```

---

### Task 3: `core/views.ts` — view resolution (the heart)

Pure resolver: view id → filter + group + Today's include/pin. No Obsidian imports.

**Files:**
- Create: `src/core/views.ts`
- Test: `src/core/views.test.ts`

**Interfaces:**
- Produces:
  - `type ViewId = 'inbox' | 'today' | 'upcoming' | 'all'`
  - `interface ViewContext { today: DayKey; dailyPath: string }`
  - `interface ResolvedView { filter: TaskFilter; group: TaskGroup; include?: (task: Task) => boolean; pinnedGroupKeys?: string[] }`
  - `resolveView(view: ViewId, ctx: ViewContext): ResolvedView`
  - `const VIEW_IDS: readonly ViewId[]`, `const VIEW_LABELS: Record<ViewId, string>`

- [ ] **Step 1: Write the failing tests**

Create `src/core/views.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveView, VIEW_IDS } from './views.ts';

const CTX = { today: '2026-07-10', dailyPath: 'Journal/Daily/2026-07-10.md' };

test('inbox = dateless, open statuses, grouped by note', () => {
  const rv = resolveView('inbox', CTX);
  assert.equal(rv.filter.due, 'none');
  assert.deepEqual(rv.filter.statuses, ['todo', 'in-progress']);
  assert.equal(rv.group, 'note');
  assert.equal(rv.include, undefined);
});

test('today = due-today filter + daily-note include + pinned daily group', () => {
  const rv = resolveView('today', CTX);
  assert.equal(rv.filter.due, 'today');
  assert.equal(rv.group, 'note');
  assert.equal(rv.include?.({ path: CTX.dailyPath } as never), true);
  assert.equal(rv.include?.({ path: 'other.md' } as never), false);
  assert.deepEqual(rv.pinnedGroupKeys, [`1-${CTX.dailyPath}`]);
});

test('upcoming = future dates, agenda grouping', () => {
  const rv = resolveView('upcoming', CTX);
  assert.equal(rv.filter.due, 'upcoming');
  assert.equal(rv.group, 'agenda');
});

test('all = no date filter, all statuses, grouped by note', () => {
  const rv = resolveView('all', CTX);
  assert.equal(rv.filter.due, 'all');
  assert.deepEqual(rv.filter.statuses, []);
  assert.equal(rv.group, 'note');
});

test('VIEW_IDS is the canonical order', () => {
  assert.deepEqual([...VIEW_IDS], ['inbox', 'today', 'upcoming', 'all']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test`
Expected: FAIL — module `./views.ts` not found.

- [ ] **Step 3: Implement `core/views.ts`**

Create `src/core/views.ts`:

```ts
import { DEFAULT_FILTER } from './query.ts';
import type { DayKey, Task, TaskFilter, TaskGroup, TaskStatus } from '../types.ts';

export type ViewId = 'inbox' | 'today' | 'upcoming' | 'all';

export const VIEW_IDS: readonly ViewId[] = ['inbox', 'today', 'upcoming', 'all'];

export const VIEW_LABELS: Record<ViewId, string> = {
  inbox: 'Inbox',
  today: 'Today',
  upcoming: 'Upcoming',
  all: 'All',
};

export interface ViewContext {
  /** Current calendar day (render-time). */
  today: DayKey;
  /** Path of today's daily note (from dailyNotePath). */
  dailyPath: string;
}

export interface ResolvedView {
  filter: TaskFilter;
  group: TaskGroup;
  /** Today only: OR-branch admitting tasks that live in today's daily note. */
  include?: (task: Task) => boolean;
  /** Group keys to pin to the top (Today's daily note). */
  pinnedGroupKeys?: string[];
}

const OPEN: TaskStatus[] = ['todo', 'in-progress'];

function withFilter(over: Partial<TaskFilter>): TaskFilter {
  return { ...DEFAULT_FILTER, statuses: [...OPEN], ...over };
}

export function resolveView(view: ViewId, ctx: ViewContext): ResolvedView {
  switch (view) {
    case 'inbox':
      return { filter: withFilter({ due: 'none' }), group: 'note' };
    case 'today':
      return {
        filter: withFilter({ due: 'today' }),
        group: 'note',
        include: (task) => task.path === ctx.dailyPath,
        pinnedGroupKeys: [`1-${ctx.dailyPath}`],
      };
    case 'upcoming':
      return { filter: withFilter({ due: 'upcoming' }), group: 'agenda' };
    case 'all':
      return { filter: withFilter({ due: 'all', statuses: [] }), group: 'note' };
  }
}
```

*(Note: `due: 'today'` includes overdue — matching Runway's existing "Oggi = overdue + due-today" command. Intentional.)*

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test` then `pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/views.ts src/core/views.test.ts
git commit -m "feat(views): pure view resolver for Inbox/Today/Upcoming/All"
```

---

### Task 4: Settings & panel-state fields

Persist the default view, board column dimension, and the panel's active view + render mode.

**Files:**
- Modify: `src/types.ts` (`RunwaySettings`)
- Modify: `src/settings.ts` (`DEFAULT_SETTINGS`, `parseSettings`)
- Modify: `src/ui/task-panel.ts` (`TaskPanelState` + constructor seeding + `getState`)
- Test: `src/settings.test.ts`

**Interfaces:**
- Produces:
  - `RunwaySettings.defaultView: ViewId` (default `'today'`)
  - `RunwaySettings.boardColumnsBy: 'status' | 'time' | 'priority'` (default `'status'`)
  - `TaskPanelState.view: ViewId`, `TaskPanelState.mode: 'list' | 'board'`

- [ ] **Step 1: Write the failing test**

Add to `src/settings.test.ts`:

```ts
test('parses defaultView and boardColumnsBy with fallbacks', () => {
  const s = parseSettings({ defaultView: 'inbox', boardColumnsBy: 'priority' });
  assert.equal(s.defaultView, 'inbox');
  assert.equal(s.boardColumnsBy, 'priority');

  const bad = parseSettings({ defaultView: 'nope', boardColumnsBy: 'nope' });
  assert.equal(bad.defaultView, 'today');
  assert.equal(bad.boardColumnsBy, 'status');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test`
Expected: FAIL — fields undefined.

- [ ] **Step 3: Extend the settings type**

In `src/types.ts`, add to `RunwaySettings` (import `ViewId` from `./core/views.ts`):

```ts
  /** View shown when a Runway surface first opens. */
  defaultView: ViewId;
  /** Dimension the Kanban board splits columns by. */
  boardColumnsBy: 'status' | 'time' | 'priority';
```

Add the import at the top of `types.ts`:

```ts
import type { ViewId } from './core/views.ts';
```

- [ ] **Step 4: Extend defaults and parsing**

In `src/settings.ts`:

```ts
// in DEFAULT_SETTINGS:
  defaultView: 'today',
  boardColumnsBy: 'status',

// add constants near SORTS/GROUPS:
const VIEWS: readonly RunwaySettings['defaultView'][] = ['inbox', 'today', 'upcoming', 'all'];
const BOARD_COLS: readonly RunwaySettings['boardColumnsBy'][] = ['status', 'time', 'priority'];

// in parseSettings return object:
    defaultView: oneOf(data.defaultView, VIEWS, DEFAULT_SETTINGS.defaultView),
    boardColumnsBy: oneOf(data.boardColumnsBy, BOARD_COLS, DEFAULT_SETTINGS.boardColumnsBy),
```

- [ ] **Step 5: Extend `TaskPanelState`**

In `src/ui/task-panel.ts`, extend the interface and constructor seeding:

```ts
export interface TaskPanelState {
  view: ViewId;
  mode: 'list' | 'board';
  filter: TaskFilter;
  sort: TaskSort;
  group: TaskGroup;
  collapsed: string[];
}
```

In the constructor's `this.state = { … }` add (import `ViewId` from `../core/views.ts`):

```ts
      view: initial.view ?? ctx.settings.defaultView,
      mode: initial.mode ?? 'list',
```

`getState()` already returns `this.state`, so both fields persist automatically.

- [ ] **Step 6: Run to verify pass**

Run: `pnpm test` then `pnpm build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/settings.ts src/ui/task-panel.ts src/settings.test.ts
git commit -m "feat(settings): defaultView, boardColumnsBy, panel view+mode state"
```

---

### Task 5: Board column mapping + drop-action resolver (pure)

Two pure helpers the board needs: which `TaskGroup` the board groups by, and what edit a drop performs.

**Files:**
- Create: `src/core/board.ts`
- Test: `src/core/board.test.ts`

**Interfaces:**
- Consumes: `TaskGroup`, `TaskStatus`, `Priority`, `DayKey` from `../types.ts`.
- Produces:
  - `boardGroup(columnsBy: 'status' | 'time' | 'priority'): TaskGroup` → `'status' | 'date' | 'priority'`
  - `type DropAction = { kind: 'status'; status: Exclude<TaskStatus,'unknown'> } | { kind: 'reschedule'; date: DayKey } | { kind: 'clearDate' } | { kind: 'priority'; priority: Priority | null } | { kind: 'none' }`
  - `columnDropAction(columnsBy, columnKey: string, today: DayKey): DropAction`

- [ ] **Step 1: Write the failing tests**

Create `src/core/board.test.ts`:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { boardGroup, columnDropAction } from './board.ts';

test('boardGroup maps the column dimension to a TaskGroup', () => {
  assert.equal(boardGroup('status'), 'status');
  assert.equal(boardGroup('time'), 'date');
  assert.equal(boardGroup('priority'), 'priority');
});

test('status columns drop to a status transition', () => {
  assert.deepEqual(columnDropAction('status', '0-todo', '2026-07-10'), { kind: 'status', status: 'todo' });
  assert.deepEqual(columnDropAction('status', '2-done', '2026-07-10'), { kind: 'status', status: 'done' });
});

test('time columns: only Today (reschedule) and No date (clear) are droppable', () => {
  assert.deepEqual(columnDropAction('time', 'b-today', '2026-07-10'), { kind: 'reschedule', date: '2026-07-10' });
  assert.deepEqual(columnDropAction('time', 'zz-none', '2026-07-10'), { kind: 'clearDate' });
  assert.deepEqual(columnDropAction('time', 'a-overdue', '2026-07-10'), { kind: 'none' });
  assert.deepEqual(columnDropAction('time', 'c-week', '2026-07-10'), { kind: 'none' });
});

test('priority columns drop to a priority set (incl. clearing)', () => {
  assert.deepEqual(columnDropAction('priority', '0-highest', '2026-07-10'), { kind: 'priority', priority: 'highest' });
  assert.deepEqual(columnDropAction('priority', '5-none', '2026-07-10'), { kind: 'priority', priority: null });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test`
Expected: FAIL — `./board.ts` not found.

- [ ] **Step 3: Implement `core/board.ts`**

Create `src/core/board.ts`. The key strings mirror `groupSpec` (Task 1 status keys `<rank>-<status>`, `dateGroup` keys `a-overdue|b-today|c-week|d-later|zz-none`, priority keys `<rank>-<priority>` / `5-none`):

```ts
import type { DayKey, Priority, TaskGroup, TaskStatus } from '../types.ts';

export type ColumnsBy = 'status' | 'time' | 'priority';

export type DropAction =
  | { kind: 'status'; status: Exclude<TaskStatus, 'unknown'> }
  | { kind: 'reschedule'; date: DayKey }
  | { kind: 'clearDate' }
  | { kind: 'priority'; priority: Priority | null }
  | { kind: 'none' };

export function boardGroup(columnsBy: ColumnsBy): TaskGroup {
  if (columnsBy === 'time') return 'date';
  return columnsBy; // 'status' | 'priority'
}

const STATUS_BY_KEY: Record<string, Exclude<TaskStatus, 'unknown'>> = {
  '0-todo': 'todo',
  '1-in-progress': 'in-progress',
  '2-done': 'done',
  '3-cancelled': 'cancelled',
};

const PRIORITY_BY_KEY: Record<string, Priority | null> = {
  '0-highest': 'highest',
  '1-high': 'high',
  '2-medium': 'medium',
  '3-low': 'low',
  '4-lowest': 'lowest',
  '5-none': null,
};

export function columnDropAction(columnsBy: ColumnsBy, columnKey: string, today: DayKey): DropAction {
  if (columnsBy === 'status') {
    const status = STATUS_BY_KEY[columnKey];
    return status ? { kind: 'status', status } : { kind: 'none' };
  }
  if (columnsBy === 'priority') {
    if (columnKey in PRIORITY_BY_KEY) return { kind: 'priority', priority: PRIORITY_BY_KEY[columnKey]! };
    return { kind: 'none' };
  }
  // time: date buckets — only Today and No date have an unambiguous target.
  if (columnKey === 'b-today') return { kind: 'reschedule', date: today };
  if (columnKey === 'zz-none') return { kind: 'clearDate' };
  return { kind: 'none' };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test` then `pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/board.ts src/core/board.test.ts
git commit -m "feat(board): pure column mapping and drop-action resolver"
```

---

### Task 6: Wire view resolution into the panel results

Make the list honor the active view (resolved filter/group + Today include/pin). No nav UI yet — drive `state.view` from a temporary default so this is testable in isolation.

**Files:**
- Modify: `src/ui/task-panel.ts` (`renderResults`, add `viewCtx()` + `selectView()` helpers)

**Interfaces:**
- Consumes: `resolveView`, `VIEW_IDS` (Task 3); `pinGroups` (Task 2); `dailyNotePath` from `../edits/daily-note.ts`; `boardGroup` (Task 5).
- Produces: `TaskPanel.selectView(view: ViewId): void` (used by Task 7 nav).

- [ ] **Step 1: Add imports**

At the top of `src/ui/task-panel.ts`:

```ts
import { DEFAULT_FILTER, queryTasks, pinGroups } from '../core/query.ts';
import { resolveView } from '../core/views.ts';
import { boardGroup } from '../core/board.ts';
import { dailyNotePath } from '../edits/daily-note.ts';
import type { ViewId } from '../core/views.ts';
```

- [ ] **Step 2: Add view-context + select helpers**

Add these private methods to the `TaskPanel` class:

```ts
  private viewCtx(): { today: string; dailyPath: string } {
    const today = todayKey();
    return { today, dailyPath: dailyNotePath(this.ctx.settings, today) };
  }

  /** Switch the active fixed view: reset filter+group to the view's base. */
  selectView(view: ViewId): void {
    const resolved = resolveView(view, this.viewCtx());
    this.update(() => {
      this.state.view = view;
      this.state.filter = { ...structuredClone(DEFAULT_FILTER), ...resolved.filter };
      this.state.group = resolved.group;
      this.collapsed.clear();
      if (this.state.group === 'agenda') this.seedAgendaCollapse();
    });
    this.renderFilters();
  }
```

- [ ] **Step 3: Rewrite the query call in `renderResults`**

Replace the `const groups = queryTasks( … );` block (around line 511) with:

```ts
    const view = this.state.view;
    const resolved = resolveView(view, this.viewCtx());
    const group = this.state.mode === 'board'
      ? boardGroup(this.ctx.settings.boardColumnsBy)
      : this.state.group;
    let groups = queryTasks(
      this.ctx.index.all(),
      this.state.filter,
      this.state.sort,
      group,
      todayKey(),
      {
        inboxFolders: this.ctx.settings.inboxFolders,
        agendaHorizonDays: this.ctx.settings.agendaHorizonDays,
      },
      view === 'today' ? resolved.include : undefined,
    );
    if (view === 'today' && this.state.mode === 'list' && resolved.pinnedGroupKeys) {
      groups = pinGroups(groups, resolved.pinnedGroupKeys);
    }
```

- [ ] **Step 4: Verify build + existing tests**

Run: `pnpm build` then `pnpm test`
Expected: clean typecheck, all tests green (this task is wiring; behavior is covered by Tasks 2–3 units).

- [ ] **Step 5: Manual smoke**

Deploy (`pnpm build` writes into the vault via `.obsidian-plugin-dir`), reload Obsidian. Open the full-page Runway list. Confirm it opens on the default view (`today`) showing due-today tasks + today's daily-note tasks with the daily group at top.

- [ ] **Step 6: Commit**

```bash
git add src/ui/task-panel.ts
git commit -m "feat(panel): resolve fixed views in list results"
```

---

### Task 7: View-nav strip + `+ New task`

The primary nav: 4 view segments + Lista/Board toggle + add-task button. Filone B styling.

**Files:**
- Create: `src/ui/view-nav.ts`
- Modify: `src/ui/task-panel.ts` (`renderChrome` mounts the nav; add `renderNav()` + `toggleMode()`)

**Interfaces:**
- Consumes: `VIEW_IDS`, `VIEW_LABELS` (Task 3); `TaskPanel.selectView` (Task 6).
- Produces: `renderViewNav(parent, opts): void` — pure DOM builder driven by callbacks.

- [ ] **Step 1: Implement the nav builder**

Create `src/ui/view-nav.ts`:

```ts
import { setIcon } from 'obsidian';
import { VIEW_IDS, VIEW_LABELS } from '../core/views.ts';
import type { ViewId } from '../core/views.ts';

export interface ViewNavOptions {
  active: ViewId;
  mode: 'list' | 'board';
  onSelect: (view: ViewId) => void;
  onToggleMode: () => void;
  onNewTask: () => void;
}

/** Segmented view nav + list/board toggle + add-task, styled Filone B. */
export function renderViewNav(parent: HTMLElement, opts: ViewNavOptions): void {
  const nav = parent.createDiv({ cls: 'runway-nav' });

  const seg = nav.createDiv({ cls: 'runway-nav__views' });
  for (const view of VIEW_IDS) {
    const btn = seg.createEl('button', {
      cls: 'runway-nav__view',
      text: VIEW_LABELS[view],
    });
    btn.toggleClass('is-active', view === opts.active);
    btn.addEventListener('click', () => opts.onSelect(view));
  }

  const actions = nav.createDiv({ cls: 'runway-nav__actions' });

  const mode = actions.createEl('button', { cls: 'runway-iconbtn', attr: { 'aria-label': 'Lista / Board' } });
  setIcon(mode, opts.mode === 'board' ? 'list' : 'columns-3');
  mode.addEventListener('click', () => opts.onToggleMode());

  const add = actions.createEl('button', { cls: 'runway-nav__add' });
  setIcon(add.createSpan({ cls: 'runway-nav__add-icon' }), 'plus');
  add.createSpan({ text: 'New task' });
  add.addEventListener('click', () => opts.onNewTask());
}
```

- [ ] **Step 2: Mount the nav in `renderChrome`**

In `src/ui/task-panel.ts`, import and mount. Add import:

```ts
import { renderViewNav } from './view-nav.ts';
```

In `renderChrome()`, immediately after `const root = …` / before the header (so the nav is the top strip), insert:

```ts
    this.navEl = root.createDiv({ cls: 'runway-nav-host' });
    this.renderNav();
```

Add the field `private navEl: HTMLElement | null = null;` with the other element fields, and these methods:

```ts
  private renderNav(): void {
    const host = this.navEl;
    if (!host) return;
    host.empty();
    renderViewNav(host, {
      active: this.state.view,
      mode: this.state.mode,
      onSelect: (view) => this.selectView(view),
      onToggleMode: () => this.toggleMode(),
      onNewTask: () => this.ctx.onQuickAdd(),
    });
  }

  private toggleMode(): void {
    this.update(() => {
      this.state.mode = this.state.mode === 'list' ? 'board' : 'list';
    });
    this.renderNav();
  }
```

Have `selectView` also call `this.renderNav()` (to repaint the active segment) — append it after `this.renderFilters()` in that method.

- [ ] **Step 3: Confirm the quick-add hook**

`onNewTask` calls `this.ctx.onQuickAdd()`. Verify `RunwayContext` (in `src/ui/context.ts`) exposes the quick-add opener the command palette already uses (search `quickAdd`/`QuickAdd` in `main.ts`). If the opener lives on `main` rather than `ctx`, add `onQuickAdd: () => void` to `RunwayContext` and wire it where the context is built in `main.ts`. Reuse the existing quick-add modal — do not build a new one.

- [ ] **Step 4: Build + manual smoke**

Run: `pnpm build`
Then reload Obsidian: the nav strip shows Inbox/Today/Upcoming/All; clicking switches views; the toggle flips list/board (board render lands in Task 8 — for now it re-groups by status in the list); `+ New task` opens the existing quick-add.

- [ ] **Step 5: Commit**

```bash
git add src/ui/view-nav.ts src/ui/task-panel.ts src/ui/context.ts src/main.ts
git commit -m "feat(nav): fixed view nav strip with list/board toggle and add-task"
```

---

### Task 8: Kanban board render + drag

Render columns from the grouped result; drag a card to a column → one guarded edit.

**Files:**
- Create: `src/ui/kanban.ts`
- Modify: `src/ui/task-panel.ts` (`renderResults` branches to board when `mode === 'board'`)

**Interfaces:**
- Consumes: `TaskGroupResult` (grouped output), `columnDropAction`, `boardGroup` (Task 5), `renderTaskRow` (existing), `ctx.edits` (`TaskEditService`).
- Produces: `renderBoard(parent, groups, opts): void`.

- [ ] **Step 1: Implement the board renderer**

Create `src/ui/kanban.ts`:

```ts
import { columnDropAction } from '../core/board.ts';
import { todayKey } from '../dates.ts';
import { renderTaskRow } from './task-row.ts';
import type { ColumnsBy } from '../core/board.ts';
import type { RunwayContext } from './context.ts';
import type { Task, TaskGroupResult } from '../types.ts';

export interface BoardOptions {
  ctx: RunwayContext;
  columnsBy: ColumnsBy;
  /** Re-run the query after a successful drop. */
  onChanged: () => void;
}

const DRAG_MIME = 'application/x-runway-task';

/** Horizontal Kanban: one column per group, cards drag between columns. */
export function renderBoard(parent: HTMLElement, groups: TaskGroupResult[], opts: BoardOptions): void {
  const board = parent.createDiv({ cls: 'runway-board' });
  for (const group of groups) {
    const column = board.createDiv({ cls: 'runway-board__col' });
    const head = column.createDiv({ cls: 'runway-board__colhead' });
    head.createSpan({ cls: 'runway-board__coltitle', text: group.label || '—' });
    head.createSpan({ cls: 'runway-pill', text: String(group.tasks.length) });

    const body = column.createDiv({ cls: 'runway-board__colbody' });
    const action = columnDropAction(opts.columnsBy, group.key, todayKey());
    const droppable = action.kind !== 'none';
    column.toggleClass('is-droppable', droppable);

    if (droppable) {
      body.addEventListener('dragover', (e) => { e.preventDefault(); column.addClass('is-dragover'); });
      body.addEventListener('dragleave', () => column.removeClass('is-dragover'));
      body.addEventListener('drop', (e) => {
        e.preventDefault();
        column.removeClass('is-dragover');
        const payload = e.dataTransfer?.getData(DRAG_MIME);
        if (payload) void handleDrop(JSON.parse(payload) as Task, action, opts);
      });
    }

    for (const task of group.tasks) {
      const card = renderTaskRow(body, opts.ctx, task, { compact: true, showNote: true });
      card.addClass('runway-board__card');
      card.setAttr('draggable', 'true');
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData(DRAG_MIME, JSON.stringify({ path: task.path, line: task.line, rawText: task.rawText }));
      });
    }
  }
}

async function handleDrop(
  task: Pick<Task, 'path' | 'line' | 'rawText'>,
  action: ReturnType<typeof columnDropAction>,
  opts: BoardOptions,
): Promise<void> {
  const ref = { path: task.path, line: task.line, rawText: task.rawText };
  let ok = false;
  switch (action.kind) {
    case 'status': ok = await opts.ctx.edits.setStatus(ref, action.status); break;
    case 'reschedule': ok = await opts.ctx.edits.reschedule(ref, action.date); break;
    case 'clearDate': ok = await opts.ctx.edits.clearDate(ref); break;
    case 'priority': ok = await opts.ctx.edits.setPriority(ref, action.priority); break;
    case 'none': return;
  }
  if (ok) opts.onChanged();
}
```

*(Verify `renderTaskRow`'s options object — the exact option names `compact`/`showNote` must match its signature in `task-row.ts`; adapt the call if they differ. Verify `ctx.edits` is the `TaskEditService`; it is what the API layer uses.)*

- [ ] **Step 2: Branch `renderResults` to the board**

In `src/ui/task-panel.ts` `renderResults`, after `groups` is computed (Task 6) and the empty-state guard, wrap the list rendering:

```ts
    if (this.state.mode === 'board') {
      renderBoard(results, groups, {
        ctx: this.ctx,
        columnsBy: this.ctx.settings.boardColumnsBy,
        onChanged: () => this.renderResults(),
      });
      this.renderBulkBar();
      return;
    }
    // …existing list rendering (the `for (const group of groups)` loop)…
```

Add the import: `import { renderBoard } from './kanban.ts';`

- [ ] **Step 3: Build + manual smoke**

Run: `pnpm build`
Reload Obsidian. Toggle to Board on the Today view. Confirm: columns Todo / In progress / Done; drag a card from Todo → Done marks it `[x]` in the source note; the board re-renders. Change `boardColumnsBy` to `priority` in settings and confirm columns switch and drag sets priority.

- [ ] **Step 4: Commit**

```bash
git add src/ui/kanban.ts src/ui/task-panel.ts
git commit -m "feat(board): Kanban render with drag-to-column edits"
```

---

### Task 9: Filone B UX pass (CSS)

Style the nav, board, and refine the existing surface to the "app panel" signature — all theme variables.

**Files:**
- Modify: `styles.css`

**Interfaces:** none (CSS only).

- [ ] **Step 1: Add nav + board styles**

Append to `styles.css` (values from theme variables only):

```css
/* View nav — Filone B segmented control */
.runway-nav { display: flex; align-items: center; gap: var(--size-4-2); padding: var(--size-4-2) var(--size-4-3); }
.runway-nav__views { display: inline-flex; gap: var(--size-2-1); background: var(--background-secondary); padding: var(--size-2-1); border-radius: var(--radius-m); }
.runway-nav__view { border: none; background: transparent; color: var(--text-muted); font-size: var(--font-ui-small); padding: var(--size-2-2) var(--size-4-2); border-radius: var(--radius-s); cursor: var(--cursor); }
.runway-nav__view:hover { background: var(--background-modifier-hover); }
.runway-nav__view.is-active { background: var(--background-primary); color: var(--text-normal); font-weight: var(--font-semibold); box-shadow: var(--shadow-s); }
.runway-nav__actions { margin-left: auto; display: inline-flex; align-items: center; gap: var(--size-4-2); }
.runway-nav__add { display: inline-flex; align-items: center; gap: var(--size-2-2); border: none; border-radius: var(--radius-s); background: var(--interactive-accent); color: var(--text-on-accent); font-size: var(--font-ui-small); padding: var(--size-2-2) var(--size-4-2); cursor: var(--cursor); }
.runway-nav__add:hover { background: var(--interactive-accent-hover); }

/* Count pill (nav / column / group) */
.runway-pill { font-variant-numeric: tabular-nums; background: var(--interactive-accent); color: var(--text-on-accent); border-radius: var(--radius-s); padding: 0 var(--size-2-2); font-size: var(--font-ui-smaller); }

/* Kanban board */
.runway-board { display: flex; gap: var(--size-4-3); overflow-x: auto; padding: var(--size-4-2) var(--size-4-3) var(--size-4-4); align-items: flex-start; }
.runway-board__col { flex: 0 0 clamp(220px, 22vw, 300px); background: var(--background-secondary); border-radius: var(--radius-m); padding: var(--size-2-2); }
.runway-board__colhead { display: flex; align-items: center; justify-content: space-between; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); font-size: var(--font-ui-smaller); padding: var(--size-2-2) var(--size-2-3); }
.runway-board__colbody { display: flex; flex-direction: column; gap: var(--size-2-2); min-height: var(--size-4-6); }
.runway-board__card { background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); box-shadow: var(--shadow-s); cursor: grab; }
.runway-board__col.is-dragover { outline: 2px solid var(--interactive-accent); outline-offset: -2px; }
.runway-board__col:not(.is-droppable) .runway-board__colhead { opacity: 0.6; }
```

- [ ] **Step 2: Filone B refinement of existing controls**

Ensure (add/adjust) the existing surface matches: icon buttons `28px` with `--radius-s` and `--background-modifier-hover` on hover, no focus ring on buttons, quiet (border-only) input focus, group headers uppercase `0.06em` `--text-faint` `--font-ui-smaller`. Search `styles.css` for `.runway-iconbtn`, `.runway-search`, `.runway-group__head` and reconcile to these values (do not introduce hex).

- [ ] **Step 3: Build + visual smoke**

Run: `pnpm build`
Reload Obsidian on the Cosmos theme (dark) and one light theme. Confirm nav, board, pills, and inputs read as one coherent app panel; nothing hardcoded shows the wrong color when the theme flips.

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "style: Filone B UX for nav, board and refined controls"
```

---

### Task 10: Design-system enrollment (vault docs)

Record Runway as a Filone B member so the suite stays "one product."

**Files (in the vault, not this repo):**
- Modify: `~/Vaults/marioverse.ai/Resources/_theme/marioverse-craft/DESIGN-SYSTEM.md`
- Modify: `~/Vaults/marioverse.ai/Resources/_theme/marioverse-craft/ALIGNMENT-TODO.md`

- [ ] **Step 1: Add Runway to Filone B members**

In `DESIGN-SYSTEM.md`, under **Filone B — "app panel"**, add `runway` to the **Membri** line (alongside `superbasetags · memory-cockpit · selection-sidekick`).

- [ ] **Step 2: Tick the alignment item**

In `ALIGNMENT-TODO.md`, change the line
`- [ ] **Definire i filoni per plugin non ancora mappati** … (runway, cartographer).`
to mark Runway done (Filone B), leaving cartographer open.

- [ ] **Step 3: No build — vault auto-commits**

The vault auto-commits its own changes; no action needed beyond saving the files.

---

## Self-Review

**Spec coverage:**
- §3 view taxonomy → Tasks 3, 6 (resolution) + 7 (nav). ✅
- §4 Today algorithm (due-today ∪ daily-note, dynamic today, pin) → Task 3 (`include`/`pin`) + Task 6 (render-time `viewCtx()` recompute + `pinGroups`). ✅ Midnight rollover: `todayKey()` is read on every `renderResults`; the existing index `subscribe` re-render plus Obsidian's periodic refresh cover idle panes — if a fully idle pane must roll over unobserved, add a low-frequency `setInterval(() => this.renderResults(), 60_000)` in `mount()` (timer poll, not render-loop-gated). Called out for the implementer.
- §5 Kanban (configurable, default status, drag→guarded edit, per-view) → Tasks 1, 5, 8. ✅
- §6 add-task → Task 7 (`+ New task` reuses existing quick-add). ✅
- §7 UX Filone B + enrollment → Tasks 9, 10. ✅
- §8 architecture (`core/views.ts` pure+tested, `ui/view-nav.ts`, `ui/kanban.ts`) → Tasks 3, 7, 8; parser/serializer/index untouched. ✅
- §9 A3 assumption (add-task = prominent new-task button) → Task 7 as built. ✅

**Placeholder scan:** No TBD/TODO. The two "verify the existing signature" notes (renderTaskRow options in Task 8, quick-add opener in Task 7) are real integration checks against un-quoted existing code, each with a concrete fallback, not deferred work.

**Type consistency:** `ViewId` defined in Task 3, imported in Tasks 4/6/7. `boardGroup`/`columnDropAction`/`ColumnsBy` defined in Task 5, consumed in Task 8. Status/priority/date group keys in `board.ts` (Task 5) match the keys produced by `groupSpec` (Task 1 status; existing `dateGroup`/priority). `queryTasks` 7th arg `include` (Task 2) consumed in Task 6. `TaskPanelState.view`/`.mode` (Task 4) consumed in Tasks 6/7/8.

## Verification (whole feature)

- `pnpm test` — existing 11 core suites green + new: `views.test.ts`, `board.test.ts`, `query.test.ts` (status + include + pinGroups), `settings.test.ts`.
- `pnpm build` — clean typecheck + bundle deployed to vault.
- Manual: each view resolves correctly; Today pins the daily note and surfaces dateless daily tasks; board drag writes one guarded edit in all three column modes; `+ New task` opens quick-add; Cosmos dark + one light theme both read coherently; sidebar + full-page + phone density.
