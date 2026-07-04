import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isChildNote, noteIndentFor, noteLine, noteTextOf } from './task-note.ts';

test('isChildNote accepts a deeper non-task line', () => {
  assert.ok(isChildNote('- [ ] Task', '\t- una nota'));
  assert.ok(isChildNote('- [ ] Task', '\tuna nota senza bullet'));
  assert.ok(isChildNote('  - [ ] Nested task', '  \t- nota'));
});

test('isChildNote rejects same-level, empty, or task lines', () => {
  assert.ok(!isChildNote('- [ ] Task', '- [ ] Altro task'));
  assert.ok(!isChildNote('- [ ] Task', '- pari livello'));
  assert.ok(!isChildNote('- [ ] Task', '\t   '));
  assert.ok(!isChildNote('- [ ] Task', '\t- [ ] sub-task'));
  assert.ok(!isChildNote('- [ ] Task', undefined));
});

test('noteTextOf strips indent and bullet', () => {
  assert.equal(noteTextOf('\t- una nota'), 'una nota');
  assert.equal(noteTextOf('\tuna nota'), 'una nota');
  assert.equal(noteTextOf('    - 1. dettaglio'), '1. dettaglio');
});

test('noteLine indents one level deeper than the task', () => {
  assert.equal(noteLine('- [ ] Task', 'nota'), '\t- nota');
  assert.equal(noteLine('  - [ ] Task', 'nota'), '  \t- nota');
});

test('noteIndentFor adds a tab to the task indentation', () => {
  assert.equal(noteIndentFor('- [ ] Task'), '\t');
  assert.equal(noteIndentFor('\t- [ ] Task'), '\t\t');
});
