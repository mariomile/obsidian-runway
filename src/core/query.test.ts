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
  makeTask('- [ ] Overdue task 📅 2026-06-30', 'Active/Projects/Exo/note.md', 1),
  makeTask('- [ ] Due today ⏫ 📅 2026-07-03', 'Active/Projects/Exo/note.md', 2),
  makeTask('- [ ] Due next week 📅 2026-07-08 #deepagent', 'Journal/Daily/03-07-2026.md', 3),
  makeTask('- [ ] Later 📅 2026-08-01', 'Resources/Books/book.md', 4),
  makeTask('- [ ] No date 🔺 #captoo', 'Active/Projects/Captoo/note.md', 5),
  makeTask('- [x] Done ✅ 2026-07-01 📅 2026-07-01', 'Journal/Daily/01-07-2026.md', 6),
  makeTask('- [/] In progress 📅 2026-07-03', 'Active/Projects/Exo/note.md', 7),
  makeTask('- [-] Cancelled', 'Active/Projects/Exo/note.md', 8),
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
  assert.deepEqual(none.map((task) => task.description), ['No date #captoo']);
});

test('tag filter matches exact and namespace prefix', () => {
  const tagged = TASKS.filter((task) => matchesTask(task, filter({ tags: ['#captoo'] }), TODAY));
  assert.deepEqual(tagged.map((task) => task.description), ['No date #captoo']);

  const withNested = makeTask('- [ ] Nested tag #domain/product', 'Atlas/x.md', 9);
  assert.ok(matchesTask(withNested, filter({ tags: ['#domain'] }), TODAY));
  assert.ok(!matchesTask(withNested, filter({ tags: ['#dom'] }), TODAY));
});

test('folder filter is a path prefix', () => {
  const active = TASKS.filter(
    (task) => matchesTask(task, filter({ folder: 'Active/Projects/Exo' }), TODAY),
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
  assert.deepEqual(high.map((task) => task.description).sort(), ['Due today', 'No date #captoo']);
});

test('sort by due puts undated last, priority breaks ties', () => {
  const sorted = sortTasks(
    TASKS.filter((task) => matchesTask(task, DEFAULT_FILTER, TODAY)),
    'due',
  );
  assert.equal(sorted[0]?.description, 'Overdue task');
  assert.equal(sorted[1]?.description, 'Due today'); // ⏫ wins the 2026-07-03 tie
  assert.equal(sorted[sorted.length - 1]?.description, 'No date #captoo');
});

test('sort by priority ranks highest first', () => {
  const sorted = sortTasks(
    TASKS.filter((task) => matchesTask(task, DEFAULT_FILTER, TODAY)),
    'priority',
  );
  assert.equal(sorted[0]?.description, 'No date #captoo'); // 🔺 highest
  assert.equal(sorted[1]?.description, 'Due today'); // ⏫ high
});

test('group by date produces ordered buckets', () => {
  const groups = queryTasks(TASKS, DEFAULT_FILTER, 'due', 'date', TODAY);
  assert.deepEqual(
    groups.map((group) => group.label),
    ['Overdue', 'Today', 'Next 7 days', 'Later', 'No date'],
  );
});

test('group by folder uses the full subfolder path', () => {
  const byFolder = queryTasks(TASKS, DEFAULT_FILTER, 'due', 'folder', TODAY);
  assert.deepEqual(
    byFolder.map((group) => group.label),
    ['Active/Projects/Captoo', 'Active/Projects/Exo', 'Journal/Daily', 'Resources/Books'],
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
    makeTask('- [ ] Task da daily', 'Journal/Daily/02-07-2026.md', 21),
  ];
  const groups = queryTasks(withCaptures, DEFAULT_FILTER, 'due', 'note', TODAY, {
    inboxFolders: ['_inbox', 'Journal/Daily'],
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
