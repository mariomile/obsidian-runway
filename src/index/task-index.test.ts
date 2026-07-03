import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseTaskLine } from '../core/parse.ts';
import { TaskIndexCore } from './task-index.ts';
import { topLevelFolder } from '../utils.ts';
import type { Task } from '../types.ts';

function makeTask(line: string, path: string, lineNo: number): Task {
  const parsed = parseTaskLine(line);
  if (!parsed) throw new Error(`fixture must parse: ${line}`);
  return { ...parsed, path, line: lineNo, rawText: line, folder: topLevelFolder(path) };
}

test('setFile replaces a bucket and invalidates the snapshot', () => {
  const core = new TaskIndexCore();
  core.setFile('a.md', [makeTask('- [ ] Uno', 'a.md', 0)]);
  core.setFile('b.md', [makeTask('- [ ] Due', 'b.md', 0)]);
  assert.equal(core.all().length, 2);
  core.setFile('a.md', [makeTask('- [ ] Uno', 'a.md', 0), makeTask('- [ ] Tre', 'a.md', 1)]);
  assert.equal(core.all().length, 3);
});

test('setFile with no tasks removes the bucket', () => {
  const core = new TaskIndexCore();
  core.setFile('a.md', [makeTask('- [ ] Uno', 'a.md', 0)]);
  core.setFile('a.md', []);
  assert.equal(core.all().length, 0);
  assert.equal(core.fileCount(), 0);
});

test('removeFile and clear', () => {
  const core = new TaskIndexCore();
  core.setFile('a.md', [makeTask('- [ ] Uno', 'a.md', 0)]);
  core.removeFile('a.md');
  assert.equal(core.all().length, 0);
  core.setFile('b.md', [makeTask('- [ ] Due', 'b.md', 0)]);
  core.clear();
  assert.equal(core.all().length, 0);
});

test('renameFile rewrites path and folder on every task', () => {
  const core = new TaskIndexCore();
  core.setFile('Active/a.md', [makeTask('- [ ] Uno', 'Active/a.md', 0)]);
  core.renameFile('Active/a.md', 'Atlas/b.md', 'Atlas');
  const tasks = core.all();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.path, 'Atlas/b.md');
  assert.equal(tasks[0]?.folder, 'Atlas');
});

test('subscribe/notify round trip', () => {
  const core = new TaskIndexCore();
  let called = 0;
  const unsubscribe = core.subscribe(() => {
    called += 1;
  });
  core.notify();
  unsubscribe();
  core.notify();
  assert.equal(called, 1);
});

test('snapshot identity is stable until a mutation', () => {
  const core = new TaskIndexCore();
  core.setFile('a.md', [makeTask('- [ ] Uno', 'a.md', 0)]);
  const first = core.all();
  assert.equal(core.all(), first);
  core.setFile('b.md', [makeTask('- [ ] Due', 'b.md', 0)]);
  assert.notEqual(core.all(), first);
});
