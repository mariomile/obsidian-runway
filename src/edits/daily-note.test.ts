import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appendTaskLine, applyDailyTemplate, dailyNotePath, formatDayKey } from './daily-note.ts';
import { DEFAULT_SETTINGS } from '../settings.ts';

test('formatDayKey supports DD/MM/YYYY tokens', () => {
  assert.equal(formatDayKey('2026-07-03', 'DD-MM-YYYY'), '03-07-2026');
  assert.equal(formatDayKey('2026-07-03', 'YYYY-MM-DD'), '2026-07-03');
  assert.equal(formatDayKey('2026-12-31', 'DD/MM/YYYY'), '31/12/2026');
});

test('dailyNotePath uses folder and format from settings', () => {
  assert.equal(
    dailyNotePath(DEFAULT_SETTINGS, '2026-07-03'),
    '2026-07-03.md',
  );
});

test('applyDailyTemplate expands date tokens', () => {
  const template = '---\ntype: log\ndate: {{date:YYYY-MM-DD}}\n---\n# {{title}}\n';
  assert.equal(
    applyDailyTemplate(template, '2026-07-03', '03-07-2026'),
    '---\ntype: log\ndate: 2026-07-03\n---\n# 03-07-2026\n',
  );
});

test('appendTaskLine appends at end with a single trailing newline', () => {
  assert.equal(appendTaskLine('# Note\n\ntext\n\n', '- [ ] Nuovo', ''), '# Note\n\ntext\n- [ ] Nuovo\n');
  assert.equal(appendTaskLine('', '- [ ] Nuovo', ''), '- [ ] Nuovo\n');
});

test('appendTaskLine inserts after the configured heading block', () => {
  const content = '# Daily\n\n## Tasks\n- [ ] Esistente\n\n## Note\ntext\n';
  const result = appendTaskLine(content, '- [ ] Nuovo', '## Tasks');
  assert.equal(
    result,
    '# Daily\n\n## Tasks\n- [ ] Esistente\n- [ ] Nuovo\n\n## Note\ntext\n',
  );
});

test('appendTaskLine falls back to end when heading is missing', () => {
  const result = appendTaskLine('# Daily\ntext\n', '- [ ] Nuovo', '## Tasks');
  assert.equal(result, '# Daily\ntext\n- [ ] Nuovo\n');
});
