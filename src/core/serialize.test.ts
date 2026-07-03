import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  removeDateField,
  rewriteDate,
  rewriteDescription,
  rewritePriority,
  transitionStatus,
} from './serialize.ts';

test('rewriteDate replaces an existing date in place', () => {
  assert.equal(
    rewriteDate('- [ ] Task 📅 2026-07-10 #tag', '📅', '2026-07-15'),
    '- [ ] Task 📅 2026-07-15 #tag',
  );
});

test('rewriteDate appends when the field is missing', () => {
  assert.equal(rewriteDate('- [ ] Task #tag', '📅', '2026-07-15'), '- [ ] Task #tag 📅 2026-07-15');
});

test('rewriteDate inserts before a block id', () => {
  assert.equal(
    rewriteDate('- [ ] Task ^abc', '📅', '2026-07-15'),
    '- [ ] Task 📅 2026-07-15 ^abc',
  );
});

test('removeDateField drops the field and its whitespace', () => {
  assert.equal(removeDateField('- [ ] Task 📅 2026-07-10 #tag', '📅'), '- [ ] Task #tag');
  assert.equal(removeDateField('- [x] Task ✅ 2026-07-03', '✅'), '- [x] Task');
});

test('transitionStatus todo → done writes ✅ today', () => {
  assert.equal(
    transitionStatus('- [ ] Task 📅 2026-07-10', 'done', '2026-07-03'),
    '- [x] Task 📅 2026-07-10 ✅ 2026-07-03',
  );
});

test('transitionStatus done → todo removes ✅', () => {
  assert.equal(
    transitionStatus('- [x] Task 📅 2026-07-10 ✅ 2026-07-03', 'todo', '2026-07-04'),
    '- [ ] Task 📅 2026-07-10',
  );
});

test('transitionStatus re-done updates the existing ✅', () => {
  assert.equal(
    transitionStatus('- [x] Task ✅ 2026-07-01', 'done', '2026-07-03'),
    '- [x] Task ✅ 2026-07-03',
  );
});

test('transitionStatus to in-progress and cancelled', () => {
  assert.equal(transitionStatus('- [ ] Task', 'in-progress', '2026-07-03'), '- [/] Task');
  assert.equal(transitionStatus('- [ ] Task', 'cancelled', '2026-07-03'), '- [-] Task');
  assert.equal(
    transitionStatus('- [-] Task', 'todo', '2026-07-03'),
    '- [ ] Task',
  );
});

test('transitionStatus never touches unknown statuses or non-tasks', () => {
  assert.equal(transitionStatus('- [6] Task', 'done', '2026-07-03'), '- [6] Task');
  assert.equal(transitionStatus('plain text', 'done', '2026-07-03'), 'plain text');
});

test('rewritePriority replaces, inserts before dates, and removes', () => {
  assert.equal(rewritePriority('- [ ] Task 🔼 📅 2026-07-10', 'high'), '- [ ] Task ⏫ 📅 2026-07-10');
  assert.equal(rewritePriority('- [ ] Task 📅 2026-07-10', 'highest'), '- [ ] Task 🔺 📅 2026-07-10');
  assert.equal(rewritePriority('- [ ] Task', 'low'), '- [ ] Task 🔽');
  assert.equal(rewritePriority('- [ ] Task ⏫ 📅 2026-07-10', null), '- [ ] Task 📅 2026-07-10');
});

test('rewriteDescription keeps every field token', () => {
  assert.equal(
    rewriteDescription('- [ ] Vecchio testo 🔺 📅 2026-07-10 ^abc', 'Nuovo testo'),
    '- [ ] Nuovo testo 🔺 📅 2026-07-10 ^abc',
  );
});

test('rewriteDescription refuses empty text', () => {
  assert.equal(rewriteDescription('- [ ] Testo 📅 2026-07-10', '   '), '- [ ] Testo 📅 2026-07-10');
});

test('indentation and marker are preserved through edits', () => {
  assert.equal(
    transitionStatus('  - [ ] Nested task', 'done', '2026-07-03'),
    '  - [x] Nested task ✅ 2026-07-03',
  );
  assert.equal(
    rewriteDate('3. [ ] Numerato 📅 2026-09-01', '📅', '2026-09-02'),
    '3. [ ] Numerato 📅 2026-09-02',
  );
});
