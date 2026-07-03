import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_SETTINGS, isExcludedPath, parseSettings } from './settings.ts';

test('parseSettings falls back to defaults on garbage', () => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('nope'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings([]), DEFAULT_SETTINGS);
});

test('parseSettings keeps valid values and coerces invalid ones', () => {
  const parsed = parseSettings({
    excludeFolders: ['.archive', 'Resources/Readwise', 42],
    sidebarUpcomingDays: 99,
    defaultSort: 'priority',
    defaultGroup: 'nonsense',
  });
  assert.deepEqual(parsed.excludeFolders, ['.archive', 'Resources/Readwise']);
  assert.equal(parsed.sidebarUpcomingDays, 31);
  assert.equal(parsed.defaultSort, 'priority');
  assert.equal(parsed.defaultGroup, DEFAULT_SETTINGS.defaultGroup);
});

test('isExcludedPath matches folder prefixes only', () => {
  const folders = ['.archive', 'Resources/Readwise'];
  assert.ok(isExcludedPath('.archive/old.md', folders));
  assert.ok(isExcludedPath('Resources/Readwise/book.md', folders));
  assert.ok(!isExcludedPath('Resources/Readwise2/book.md', folders));
  assert.ok(!isExcludedPath('Active/note.md', folders));
  assert.ok(!isExcludedPath('archive/x.md', folders));
});
