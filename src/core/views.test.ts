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
