import assert from 'node:assert/strict';
import { test } from 'node:test';

import { completeRecurring, parseRecurrence } from './recurrence.ts';

const TODAY = '2026-07-03';

test('parseRecurrence covers the supported subset', () => {
  assert.deepEqual(parseRecurrence('🔁 every day'), { unit: 'day', interval: 1, whenDone: false });
  assert.deepEqual(parseRecurrence('🔁 every 3 days'), { unit: 'day', interval: 3, whenDone: false });
  assert.deepEqual(parseRecurrence('🔁 every week'), { unit: 'week', interval: 1, whenDone: false });
  assert.deepEqual(parseRecurrence('🔁 every 2 months'), {
    unit: 'month',
    interval: 2,
    whenDone: false,
  });
  assert.deepEqual(parseRecurrence('🔁 every year when done'), {
    unit: 'year',
    interval: 1,
    whenDone: true,
  });
});

test('parseRecurrence rejects unsupported rules', () => {
  assert.equal(parseRecurrence('- [ ] no rule here'), null);
  assert.equal(parseRecurrence('🔁 every Monday'), null);
  assert.equal(parseRecurrence('🔁 every weekday'), null);
});

test('completeRecurring advances the due date and marks done', () => {
  const result = completeRecurring('- [ ] Standup 🔁 every week 📅 2026-07-03', TODAY);
  assert.ok(result);
  assert.equal(result.nextLine, '- [ ] Standup 🔁 every week 📅 2026-07-10');
  assert.equal(result.completedLine, '- [x] Standup 🔁 every week 📅 2026-07-03 ✅ 2026-07-03');
});

test('completeRecurring shifts due and scheduled independently', () => {
  const result = completeRecurring(
    '- [ ] Report 🔁 every month ⏳ 2026-07-01 📅 2026-07-05',
    TODAY,
  );
  assert.ok(result);
  assert.equal(result.nextLine, '- [ ] Report 🔁 every month ⏳ 2026-08-01 📅 2026-08-05');
});

test('when done measures from the completion date, preserving the scheduled offset', () => {
  // due was 07-01, scheduled 06-29 (offset -2). Completed today 07-03.
  const result = completeRecurring(
    '- [ ] Pay 🔁 every month when done ⏳ 2026-06-29 📅 2026-07-01',
    TODAY,
  );
  assert.ok(result);
  // next due = today + 1 month = 08-03; scheduled keeps the -2 day offset = 08-01.
  assert.equal(result.nextLine, '- [ ] Pay 🔁 every month when done ⏳ 2026-08-01 📅 2026-08-03');
});

test('month recurrence clamps the day', () => {
  const result = completeRecurring('- [ ] X 🔁 every month 📅 2026-01-31', '2026-01-31');
  assert.ok(result);
  assert.equal(result.nextLine, '- [ ] X 🔁 every month 📅 2026-02-28');
});

test('recurring task without a date cannot advance', () => {
  assert.equal(completeRecurring('- [ ] Habit 🔁 every day', TODAY), null);
});

test('unsupported rule returns null', () => {
  assert.equal(completeRecurring('- [ ] X 🔁 every Monday 📅 2026-07-03', TODAY), null);
});
