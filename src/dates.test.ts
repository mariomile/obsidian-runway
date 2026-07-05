import assert from 'node:assert/strict';
import { test } from 'node:test';

import { agendaDayLabel, dayOfWeek } from './dates.ts';

const TODAY = '2026-07-03'; // a Friday

test('dayOfWeek is Sunday-indexed', () => {
  assert.equal(dayOfWeek('2026-07-03'), 5); // Fri
  assert.equal(dayOfWeek('2026-07-08'), 3); // Wed
});

test('agendaDayLabel: today and tomorrow are words', () => {
  assert.deepEqual(agendaDayLabel(TODAY, TODAY), { primary: 'Today', secondary: '3 Jul' });
  assert.deepEqual(agendaDayLabel('2026-07-04', TODAY), {
    primary: 'Tomorrow',
    secondary: '4 Jul',
  });
});

test('agendaDayLabel: further days show the weekday + date', () => {
  assert.deepEqual(agendaDayLabel('2026-07-08', TODAY), { primary: 'Wed', secondary: '8 Jul' });
});

test('agendaDayLabel: secondary carries the month across a boundary', () => {
  assert.deepEqual(agendaDayLabel('2026-08-01', TODAY), { primary: 'Sat', secondary: '1 Aug' });
});
