import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseNaturalDate } from './natural-date.ts';

// Thursday 2026-07-02 is the anchor for weekday math.
const TODAY = '2026-07-02';

test('oggi / domani / dopodomani', () => {
  assert.equal(parseNaturalDate('chiama Marco oggi', TODAY).date, '2026-07-02');
  assert.equal(parseNaturalDate('chiama Marco domani', TODAY).date, '2026-07-03');
  assert.equal(parseNaturalDate('review dopodomani', TODAY).date, '2026-07-04');
});

test('english today/tomorrow', () => {
  assert.equal(parseNaturalDate('ship it today', TODAY).date, '2026-07-02');
  assert.equal(parseNaturalDate('ship it tomorrow', TODAY).date, '2026-07-03');
});

test('strips the date phrase from the description', () => {
  const result = parseNaturalDate('chiama Marco domani', TODAY);
  assert.equal(result.cleaned, 'chiama Marco');
});

test('tra/fra N giorni e settimane', () => {
  assert.equal(parseNaturalDate('x tra 3 giorni', TODAY).date, '2026-07-05');
  assert.equal(parseNaturalDate('x fra 1 giorno', TODAY).date, '2026-07-03');
  assert.equal(parseNaturalDate('x tra 2 settimane', TODAY).date, '2026-07-16');
  assert.equal(parseNaturalDate('x in 5 days', TODAY).date, '2026-07-07');
});

test('prossima settimana / weekend', () => {
  assert.equal(parseNaturalDate('planning prossima settimana', TODAY).date, '2026-07-09');
  // Coming Saturday from Thursday 2026-07-02.
  assert.equal(parseNaturalDate('relax nel weekend', TODAY).date, '2026-07-04');
});

test('weekday names resolve to the nearest future occurrence', () => {
  // Thursday → next Monday.
  assert.equal(parseNaturalDate('call lunedì', TODAY).date, '2026-07-06');
  // Thursday → Friday.
  assert.equal(parseNaturalDate('call venerdì', TODAY).date, '2026-07-03');
  // Same weekday returns today.
  assert.equal(parseNaturalDate('call giovedì', TODAY).date, '2026-07-02');
  assert.equal(parseNaturalDate('call mon', TODAY).date, '2026-07-06');
});

test('ISO date passes through', () => {
  const result = parseNaturalDate('deadline 2026-08-01', TODAY);
  assert.equal(result.date, '2026-08-01');
  assert.equal(result.cleaned, 'deadline');
});

test('DD/MM rolls to next year when already past', () => {
  // 01/06 is before 2026-07-02 → 2027.
  assert.equal(parseNaturalDate('bday 01/06', TODAY).date, '2027-06-01');
  // 10/08 is later this year.
  assert.equal(parseNaturalDate('trip 10/08', TODAY).date, '2026-08-10');
});

test('decimals and ranges mid-text are not misread as DD/MM dates', () => {
  assert.equal(parseNaturalDate('bump versione a 2.1', TODAY).date, null);
  assert.equal(parseNaturalDate('rivedi capitoli 3-4', TODAY).date, null);
});

test('no trailing date returns null and untouched text', () => {
  const result = parseNaturalDate('scrivi il post del blog', TODAY);
  assert.equal(result.date, null);
  assert.equal(result.cleaned, 'scrivi il post del blog');
});

test('a date word mid-sentence is not matched', () => {
  // "oggi" not at the end → left alone.
  assert.equal(parseNaturalDate('il report di oggi è pronto', TODAY).date, null);
});

test('invalid calendar dates are ignored', () => {
  assert.equal(parseNaturalDate('x 2026-02-30', TODAY).date, null);
  assert.equal(parseNaturalDate('x 32/13', TODAY).date, null);
});
