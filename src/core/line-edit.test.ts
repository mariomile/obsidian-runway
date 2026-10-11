import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyLineEdit, removeTaskBlock } from './line-edit.ts';
import { isChildNote } from './task-note.ts';

const CONTENT = ['# Note', '', '- [ ] Task uno', '- [ ] Task due', '- [ ] Task uno'].join('\n');

test('edits the line at the expected index', () => {
  const result = applyLineEdit(CONTENT, { line: 3, rawText: '- [ ] Task due' }, () => '- [x] Task due');
  assert.ok(result.changed);
  assert.ok(result.content.includes('- [x] Task due'));
});

test('falls back to a unique exact match when the line drifted', () => {
  const result = applyLineEdit(CONTENT, { line: 0, rawText: '- [ ] Task due' }, () => '- [x] Task due');
  assert.ok(result.changed);
});

test('aborts on ambiguous matches', () => {
  const result = applyLineEdit(CONTENT, { line: 0, rawText: '- [ ] Task uno' }, () => '- [x] Task uno');
  assert.ok(!result.changed);
  assert.equal(result.content, CONTENT);
});

test('aborts when the line no longer exists', () => {
  const result = applyLineEdit(CONTENT, { line: 2, rawText: '- [ ] Sparito' }, () => 'x');
  assert.ok(!result.changed);
});

test('no-op transform reports unchanged', () => {
  const result = applyLineEdit(CONTENT, { line: 3, rawText: '- [ ] Task due' }, (line) => line);
  assert.ok(!result.changed);
});

test('removeTaskBlock removes the captured child note with the task', () => {
  const content = '- [ ] Task\n\t- private note\nNext';
  assert.deepEqual(
    removeTaskBlock(content, { line: 0, rawText: '- [ ] Task' }, '\t- private note', isChildNote),
    { content: 'Next', removed: true },
  );
});

test('removeTaskBlock refuses removal when the child note changed', () => {
  const content = '- [ ] Task\n\t- edited note\nNext';
  assert.deepEqual(
    removeTaskBlock(content, { line: 0, rawText: '- [ ] Task' }, '\t- old note', isChildNote),
    { content, removed: false },
  );
});
