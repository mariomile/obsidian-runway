import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BOARD_COLUMNS, columnStatus, onBoard } from './board.ts';
import { parseTaskLine } from './parse.ts';
import type { Task } from '../types.ts';

const TODAY = '2026-10-10';

function makeTask(line: string): Task {
  const parsed = parseTaskLine(line);
  if (!parsed) throw new Error(`fixture must parse: ${line}`);
  return { ...parsed, path: 'note.md', line: 0, rawText: line, folder: '' };
}

test('open tasks are always on the board', () => {
  assert.ok(onBoard(makeTask('- [ ] Todo'), TODAY));
  assert.ok(onBoard(makeTask('- [/] Doing'), TODAY));
});

test('done tasks stay on the board for seven days only', () => {
  assert.ok(onBoard(makeTask('- [x] Today ✅ 2026-10-10'), TODAY));
  assert.ok(onBoard(makeTask('- [x] Week ago ✅ 2026-10-03'), TODAY));
  assert.ok(!onBoard(makeTask('- [x] Too old ✅ 2026-10-02'), TODAY));
  assert.ok(!onBoard(makeTask('- [x] Undated done'), TODAY));
});

test('cancelled tasks never reach the board', () => {
  assert.ok(!onBoard(makeTask('- [-] Dropped ❌ 2026-10-10'), TODAY));
});

test('columns map back to the status a drop should set', () => {
  assert.deepEqual(
    BOARD_COLUMNS.map((column) => columnStatus(column.key)),
    ['todo', 'in-progress', 'done'],
  );
  assert.equal(columnStatus('3-cancelled'), null);
});
