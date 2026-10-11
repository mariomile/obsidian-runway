import assert from 'node:assert/strict';
import { test } from 'node:test';

import { newlyCompleted } from './completion.ts';
import { parseTaskLine } from './parse.ts';
import type { Task } from '../types.ts';

function task(line: string, lineNo: number): Task {
  const parsed = parseTaskLine(line);
  if (!parsed) throw new Error(`fixture must parse: ${line}`);
  return { ...parsed, path: 'n.md', line: lineNo, rawText: line, folder: '' };
}

test('a box ticked in the editor is reported once', () => {
  const before = [task('- [ ] Call Luca', 0), task('- [ ] Other', 1)];
  const after = [task('- [x] Call Luca', 0), task('- [ ] Other', 1)];
  assert.deepEqual(newlyCompleted(before, after).map((t) => t.description), ['Call Luca']);
});

test('already dated completions are not reported again', () => {
  const before = [task('- [ ] Call Luca', 0)];
  const after = [task('- [x] Call Luca ✅ 2026-10-10', 0)];
  assert.deepEqual(newlyCompleted(before, after), []);
});

test('a done task that was never seen open is left alone', () => {
  assert.deepEqual(newlyCompleted([], [task('- [x] Pasted', 0)]), []);
  const before = [task('- [x] Old', 0)];
  assert.deepEqual(newlyCompleted(before, [task('- [x] Old', 0)]), []);
});

test('a line that shifted is matched by its text', () => {
  const before = [task('- [/] Draft deck', 0)];
  const after = [task('- [ ] New on top', 0), task('- [x] Draft deck', 1)];
  assert.deepEqual(newlyCompleted(before, after).map((t) => t.description), ['Draft deck']);
});

test('ambiguous duplicate text away from its line is skipped', () => {
  const before = [task('- [ ] Same', 0), task('- [ ] Same', 1)];
  const after = [task('- [ ] Top', 0), task('- [ ] Same', 1), task('- [x] Same', 2)];
  assert.deepEqual(newlyCompleted(before, after), []);
});
