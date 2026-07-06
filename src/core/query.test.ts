import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseTaskLine } from './parse.ts';
import { DEFAULT_FILTER, matchesTask, queryTasks, sortTasks } from './query.ts';
import { topLevelFolder } from '../utils.ts';
import type { Task, TaskFilter } from '../types.ts';

const TODAY = '2026-07-03';

function makeTask(line: string, path = 'Active/Projects/Test/note.md', lineNo = 0): Task {
  const parsed = parseTaskLine(line);
  if (!parsed) throw new Error(`fixture must parse: ${line}`);
  return { ...parsed, path, line: lineNo, rawText: line, folder: topLevelFolder(path) };
}

const TASKS: Task[] = [
  makeTask('- [ ] Overdue task 📅 2026-06-30', 'Projects/Alpha/note.md', 1),
  makeTask('- [ ] Due today ⏫ 📅 2026-07-03', 'Projects/Alpha/note.md', 2),
  makeTask('- [ ] Due next week 📅 2026-07-08 #project', 'Daily/2026-07-03.md', 3),
  makeTask('- [ ] Later 📅 2026-08-01', 'Resources/Books/book.md', 4),
  makeTask('- [ ] No date 🔺 #personal', 'Projects/Beta/note.md', 5),
  makeTask('- [x] Done ✅ 2026-07-01 📅 2026-07-01', 'Daily/2026-07-01.md', 6),
  makeTask('- [/] In progress 📅 2026-07-03', 'Projects/Alpha/note.md', 7),
  makeTask('- [-] Cancelled', 'Projects/Alpha/note.md', 8),
];

function filter(overrides: Partial<TaskFilter>): TaskFilter {
  return { ...DEFAULT_FILTER, ...overrides };
}

test('default filter keeps only todo and in-progress', () => {
  const matched = TASKS.filter((task) => matchesTask(task, DEFAULT_FILTER, TODAY));
  assert.equal(matched.length, 6);
  assert.ok(matched.every((task) => task.status === 'todo' || task.status === 'in-progress'));
});

test('due presets', () => {
  const overdue = TASKS.filter((task) => matchesTask(task, filter({ due: 'overdue' }), TODAY));
  assert.deepEqual(overdue.map((task) => task.description), ['Overdue task']);

  const today = TASKS.filter((task) => matchesTask(task, filter({ due: 'today' }), TODAY));
  assert.deepEqual(
    today.map((task) => task.description).sort(),
    ['Due today', 'In progress', 'Overdue task'],
  );

  const week = TASKS.filter((task) => matchesTask(task, filter({ due: 'week' }), TODAY));
  assert.equal(week.length, 4);

  const none = TASKS.filter((task) => matchesTask(task, filter({ due: 'none' }), TODAY));
  assert.deepEqual(none.map((task) => task.description), ['No date #personal']);

  const upcoming = TASKS.filter((task) => matchesTask(task, filter({ due: 'upcoming' }), TODAY));
  assert.deepEqual(upcoming.map((task) => task.description).sort(), [
    'Due next week #project',
    'Later',
  ]);
});

test('tag filter matches exact and namespace prefix', () => {
  const tagged = TASKS.filter((task) => matchesTask(task, filter({ tags: ['#personal'] }), TODAY));
  assert.deepEqual(tagged.map((task) => task.description), ['No date #personal']);

  const withNested = makeTask('- [ ] Nested tag #domain/product', 'Atlas/x.md', 9);
  assert.ok(matchesTask(withNested, filter({ tags: ['#domain'] }), TODAY));
  assert.ok(!matchesTask(withNested, filter({ tags: ['#dom'] }), TODAY));
});

test('folder filter is a path prefix', () => {
  const active = TASKS.filter(
    (task) => matchesTask(task, filter({ folder: 'Projects/Alpha' }), TODAY),
  );
  assert.equal(active.length, 3);
});

test('text filter is accent-insensitive and all-terms', () => {
  const task = makeTask('- [ ] Prossimà attività strategica', 'x.md', 10);
  assert.ok(matchesTask(task, filter({ text: 'attivita strategica' }), TODAY));
  assert.ok(!matchesTask(task, filter({ text: 'attivita mancante' }), TODAY));
});

test('priority filter excludes tasks without priority', () => {
  const high = TASKS.filter(
    (task) => matchesTask(task, filter({ priorities: ['high', 'highest'] }), TODAY),
  );
  assert.deepEqual(high.map((task) => task.description).sort(), ['Due today', 'No date #personal']);
});

test('sort by due puts undated last, priority breaks ties', () => {
  const sorted = sortTasks(
    TASKS.filter((task) => matchesTask(task, DEFAULT_FILTER, TODAY)),
    'due',
  );
  assert.equal(sorted[0]?.description, 'Overdue task');
  assert.equal(sorted[1]?.description, 'Due today'); // ⏫ wins the 2026-07-03 tie
  assert.equal(sorted[sorted.length - 1]?.description, 'No date #personal');
});

test('sort by priority ranks highest first', () => {
  const sorted = sortTasks(
    TASKS.filter((task) => matchesTask(task, DEFAULT_FILTER, TODAY)),
    'priority',
  );
  assert.equal(sorted[0]?.description, 'No date #personal'); // 🔺 highest
  assert.equal(sorted[1]?.description, 'Due today'); // ⏫ high
});

test('group by date produces ordered buckets', () => {
  const groups = queryTasks(TASKS, DEFAULT_FILTER, 'due', 'date', TODAY);
  assert.deepEqual(
    groups.map((group) => group.label),
    ['Overdue', 'Today', 'Next 7 days', 'Later', 'No date'],
  );
});

test('group by agenda: per-day buckets, overdue first, later folded, no empty days', () => {
  const groups = queryTasks(TASKS, DEFAULT_FILTER, 'due', 'agenda', TODAY, {
    agendaHorizonDays: 14,
  });
  assert.deepEqual(
    groups.map((group) => group.key),
    ['a-overdue', 'b-2026-07-03', 'b-2026-07-08', 'y-later', 'zz-none'],
  );
  const byKey = new Map(groups.map((group) => [group.key, group]));
  assert.equal(byKey.get('a-overdue')?.label, 'Overdue');
  assert.equal(byKey.get('b-2026-07-03')?.label, 'Today');
  assert.equal(byKey.get('b-2026-07-03')?.sublabel, '3 Jul');
  // Due-today and in-progress-today share the same day bucket.
  assert.deepEqual(
    byKey.get('b-2026-07-03')?.tasks.map((task) => task.description).sort(),
    ['Due today', 'In progress'],
  );
  assert.equal(byKey.get('b-2026-07-08')?.label, 'Wed');
  assert.equal(byKey.get('b-2026-07-08')?.sublabel, '8 Jul');
  assert.equal(byKey.get('y-later')?.label, 'Later');
  assert.equal(byKey.get('zz-none')?.label, 'No date');
});

test('group by agenda: horizon controls the Later cutoff', () => {
  // Horizon 3 → 2026-07-08 (5 days out) folds into Later instead of a day bucket.
  const groups = queryTasks(TASKS, DEFAULT_FILTER, 'due', 'agenda', TODAY, {
    agendaHorizonDays: 3,
  });
  const keys = groups.map((group) => group.key);
  assert.ok(!keys.includes('b-2026-07-08'));
  assert.deepEqual(
    groups.find((group) => group.key === 'y-later')?.tasks.map((task) => task.description).sort(),
    ['Due next week #project', 'Later'],
  );
});

test('group by agenda: falls back to a 14-day horizon when unspecified', () => {
  const groups = queryTasks(TASKS, DEFAULT_FILTER, 'due', 'agenda', TODAY);
  // 2026-07-08 is within 14 days → still its own bucket.
  assert.ok(groups.some((group) => group.key === 'b-2026-07-08'));
});

test('group by folder uses the full subfolder path', () => {
  const byFolder = queryTasks(TASKS, DEFAULT_FILTER, 'due', 'folder', TODAY);
  assert.deepEqual(
    byFolder.map((group) => group.label),
    ['Daily', 'Projects/Alpha', 'Projects/Beta', 'Resources/Books'],
  );
});

test('group by tag', () => {
  const byTag = queryTasks(TASKS, DEFAULT_FILTER, 'due', 'tag', TODAY);
  assert.equal(byTag[byTag.length - 1]?.label, 'No tag');
});

test('group by note pins Inbox first, then one bucket per note', () => {
  const withCaptures = [
    ...TASKS,
    makeTask('- [ ] Cattura volante', '_inbox/Clip.md', 20),
    makeTask('- [ ] Task da daily', 'Daily/2026-07-02.md', 21),
  ];
  const groups = queryTasks(withCaptures, DEFAULT_FILTER, 'due', 'note', TODAY, {
    inboxFolders: ['_inbox', 'Daily'],
  });
  assert.equal(groups[0]?.label, 'Inbox');
  // Both captures + the daily-note task already in TASKS land in Inbox.
  assert.equal(groups[0]?.tasks.length, 3);
  const rest = groups.slice(1);
  assert.ok(rest.every((group) => group.key.startsWith('1-')));
  assert.deepEqual(
    rest.map((group) => group.label),
    ['note', 'note', 'book'],
  );
});

test('group by note without inbox folders has no Inbox bucket', () => {
  const groups = queryTasks(TASKS, DEFAULT_FILTER, 'due', 'note', TODAY);
  assert.ok(groups.every((group) => group.label !== 'Inbox'));
});

test('exactDay filter matches only that effective date and overrides due preset', () => {
  const onDay = TASKS.filter((task) =>
    matchesTask(task, filter({ exactDay: '2026-07-03', due: 'overdue' }), TODAY),
  );
  assert.deepEqual(
    onDay.map((task) => task.description).sort(),
    ['Due today', 'In progress'],
  );
});

test('group none returns a single bucket with everything matched', () => {
  const groups = queryTasks(TASKS, DEFAULT_FILTER, 'due', 'none', TODAY);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.tasks.length, 6);
});
