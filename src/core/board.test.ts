import assert from 'node:assert/strict';
import { test } from 'node:test';

import { boardGroup, columnAddIntent, columnDropAction } from './board.ts';

test('columnAddIntent pre-fills only where creation is unambiguous', () => {
  // status: only Todo can be created from a "+"
  assert.deepEqual(columnAddIntent('status', '0-todo', '2026-07-12'), {});
  assert.equal(columnAddIntent('status', '2-done', '2026-07-12'), null);
  assert.equal(columnAddIntent('status', '1-in-progress', '2026-07-12'), null);
  // time: Today pre-fills a due date, No date is plain, others are null
  assert.deepEqual(columnAddIntent('time', 'b-today', '2026-07-12'), { date: '2026-07-12' });
  assert.deepEqual(columnAddIntent('time', 'zz-none', '2026-07-12'), { date: null });
  assert.equal(columnAddIntent('time', 'a-overdue', '2026-07-12'), null);
  assert.equal(columnAddIntent('time', 'c-week', '2026-07-12'), null);
  // priority: every priority column pre-fills, incl. clearing
  assert.deepEqual(columnAddIntent('priority', '0-highest', '2026-07-12'), { priority: 'highest' });
  assert.deepEqual(columnAddIntent('priority', '5-none', '2026-07-12'), { priority: null });
  assert.equal(columnAddIntent('priority', 'zz-bogus', '2026-07-12'), null);
});

test('boardGroup maps the column dimension to a TaskGroup', () => {
  assert.equal(boardGroup('status'), 'status');
  assert.equal(boardGroup('time'), 'date');
  assert.equal(boardGroup('priority'), 'priority');
});

test('status columns drop to a status transition', () => {
  assert.deepEqual(columnDropAction('status', '0-todo', '2026-07-10'), { kind: 'status', status: 'todo' });
  assert.deepEqual(columnDropAction('status', '1-in-progress', '2026-07-10'), {
    kind: 'status',
    status: 'in-progress',
  });
  assert.deepEqual(columnDropAction('status', '2-done', '2026-07-10'), { kind: 'status', status: 'done' });
  assert.deepEqual(columnDropAction('status', '3-cancelled', '2026-07-10'), {
    kind: 'status',
    status: 'cancelled',
  });
});

test('time columns: only Today (reschedule) and No date (clear) are droppable', () => {
  assert.deepEqual(columnDropAction('time', 'b-today', '2026-07-10'), { kind: 'reschedule', date: '2026-07-10' });
  assert.deepEqual(columnDropAction('time', 'zz-none', '2026-07-10'), { kind: 'clearDate' });
  assert.deepEqual(columnDropAction('time', 'a-overdue', '2026-07-10'), { kind: 'none' });
  assert.deepEqual(columnDropAction('time', 'c-week', '2026-07-10'), { kind: 'none' });
  assert.deepEqual(columnDropAction('time', 'd-later', '2026-07-10'), { kind: 'none' });
});

test('priority columns drop to a priority set (incl. clearing)', () => {
  assert.deepEqual(columnDropAction('priority', '0-highest', '2026-07-10'), { kind: 'priority', priority: 'highest' });
  assert.deepEqual(columnDropAction('priority', '5-none', '2026-07-10'), { kind: 'priority', priority: null });
});

test('columnDropAction falls back to {kind:"none"} for unrecognized keys', () => {
  assert.deepEqual(columnDropAction('status', 'zz-bogus', '2026-07-10'), { kind: 'none' });
  assert.deepEqual(columnDropAction('priority', 'zz-bogus', '2026-07-10'), { kind: 'none' });
  assert.deepEqual(columnDropAction('time', 'garbage', '2026-07-10'), { kind: 'none' });
});
