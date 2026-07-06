import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseTaskLine } from './parse.ts';
import { serializeTask } from './serialize.ts';

/** Synthetic fixtures covering the supported task syntax. */
const VAULT_FIXTURES = [
  '- [ ] Semplice task senza date',
  '- [ ] Task con due 📅 2026-07-10',
  '- [x] Fatto ✅ 2026-07-03',
  '- [ ] Preparare demo 🔺 ⏳ 2026-05-04',
  '- [ ] Task completo 🔺 ➕ 2026-05-02 ⏳ 2026-05-04',
  '- [ ] Review [[Project Roadmap]] 📅 2026-07-05 #project',
  '- [/] In progress con tag #personal #domain/product',
  '- [-] Cancellato',
  '- [x] Done con data corrotta ✅ 2026-05-0',
  '- [6] Status sconosciuto',
  '  - [ ] Task indentato sotto altro 📅 2026-08-01',
  '* [ ] Marker asterisco ⏫',
  '3. [ ] Task numerato 🔽 📅 2026-09-01',
  '- [ ] Con block id 📅 2026-07-08 ^abc-123',
  '- [ ] Ricorrente 🔁 every week 📅 2026-07-07',
  '- [ ] Con start 🛫 2026-07-01 e due 📅 2026-07-09',
];

test('parse → serialize is identity on every fixture', () => {
  for (const line of VAULT_FIXTURES) {
    const parsed = parseTaskLine(line);
    assert.ok(parsed, `should parse: ${line}`);
    assert.equal(serializeTask(parsed), line);
  }
});

test('non-task lines return null', () => {
  for (const line of ['plain text', '- bullet senza checkbox', '## Heading', '', '-[ ] no space']) {
    assert.equal(parseTaskLine(line), null, `should not parse: ${line}`);
  }
});

test('statuses map correctly', () => {
  assert.equal(parseTaskLine('- [ ] a')?.status, 'todo');
  assert.equal(parseTaskLine('- [x] a')?.status, 'done');
  assert.equal(parseTaskLine('- [X] a')?.status, 'done');
  assert.equal(parseTaskLine('- [/] a')?.status, 'in-progress');
  assert.equal(parseTaskLine('- [-] a')?.status, 'cancelled');
  assert.equal(parseTaskLine('- [6] a')?.status, 'unknown');
});

test('date fields are extracted', () => {
  const parsed = parseTaskLine('- [x] Task 📅 2026-07-10 ⏳ 2026-07-05 ✅ 2026-07-03');
  assert.equal(parsed?.due, '2026-07-10');
  assert.equal(parsed?.scheduled, '2026-07-05');
  assert.equal(parsed?.doneDate, '2026-07-03');
});

test('malformed dates stay in the description, valid ones do not', () => {
  const parsed = parseTaskLine('- [x] Done con data corrotta ✅ 2026-05-0');
  assert.ok(parsed);
  assert.equal(parsed.doneDate, undefined);
  assert.ok(parsed.description.includes('✅ 2026-05-0'));

  const valid = parseTaskLine('- [x] Fatto ✅ 2026-05-01');
  assert.ok(valid);
  assert.equal(valid.doneDate, '2026-05-01');
  assert.equal(valid.description, 'Fatto');
});

test('invalid calendar dates are rejected (2026-02-30)', () => {
  const parsed = parseTaskLine('- [ ] Task 📅 2026-02-30');
  assert.equal(parsed?.due, undefined);
  assert.ok(parsed?.description.includes('📅 2026-02-30'));
});

test('priority emojis map to levels', () => {
  assert.equal(parseTaskLine('- [ ] a 🔺')?.priority, 'highest');
  assert.equal(parseTaskLine('- [ ] a ⏫')?.priority, 'high');
  assert.equal(parseTaskLine('- [ ] a 🔼')?.priority, 'medium');
  assert.equal(parseTaskLine('- [ ] a 🔽')?.priority, 'low');
  assert.equal(parseTaskLine('- [ ] a ⏬')?.priority, 'lowest');
  assert.equal(parseTaskLine('- [ ] a')?.priority, null);
});

test('tags and links are extracted from text only', () => {
  const parsed = parseTaskLine('- [ ] Review [[Project Roadmap|roadmap]] #project #domain/product 📅 2026-07-05');
  assert.deepEqual(parsed?.tags, ['#project', '#domain/product']);
  assert.deepEqual(parsed?.links, ['Project Roadmap']);
});

test('recurrence and unmanaged fields survive as unknown tokens', () => {
  const line = '- [ ] Ricorrente 🔁 every week 📅 2026-07-07';
  const parsed = parseTaskLine(line);
  assert.ok(parsed);
  assert.ok(parsed.tokens.some((token) => token.kind === 'unknown' && token.raw.includes('🔁')));
  assert.equal(parsed.due, '2026-07-07');
  assert.equal(parsed.description, 'Ricorrente');
});

test('block id is its own trailing token', () => {
  const parsed = parseTaskLine('- [ ] Con block id 📅 2026-07-08 ^abc-123');
  assert.ok(parsed);
  const last = parsed.tokens[parsed.tokens.length - 1];
  assert.equal(last?.kind, 'blockid');
  assert.equal(last?.raw, ' ^abc-123');
});

test('description collapses whitespace and strips fields', () => {
  const parsed = parseTaskLine('- [ ] Task completo 🔺 ➕ 2026-05-02 ⏳ 2026-05-04');
  assert.equal(parsed?.description, 'Task completo');
});
