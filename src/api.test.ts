import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRunwayApi } from './api.ts';
import type { Task } from './types.ts';

const task = {
  path: 'Tasks.md',
  line: 3,
  rawText: '- [x] Done 📅 2026-07-18 ✅ 2026-07-18 🔁 every week',
  indent: '',
  listMarker: '-',
  gap: ' ',
  statusChar: 'x',
  status: 'done',
  sep: ' ',
  tokens: [
    { kind: 'text', raw: 'Done' },
    { kind: 'date', raw: ' 📅 2026-07-18', emoji: '📅', date: '2026-07-18' },
    { kind: 'date', raw: ' ✅ 2026-07-18', emoji: '✅', date: '2026-07-18' },
    { kind: 'unknown', raw: ' 🔁 every week' },
  ],
  description: 'Done',
  due: '2026-07-18',
  doneDate: '2026-07-18',
  priority: null,
  tags: [],
  links: [],
  folder: '',
} as Task;

describe('Runway shared task API', () => {
  it('publishes lifecycle and complete task fields for sibling plugins', () => {
    const listener = (): void => undefined;
    const unsubscribe = (): void => undefined;
    const index = {
      isReady: () => true,
      all: () => [task],
      subscribe: (value: () => void) => {
        assert.equal(value, listener);
        return unsubscribe;
      },
    };
    const api = createRunwayApi(index as never, {} as never, async () => undefined);

    assert.equal(api.isReady(), true);
    assert.equal(api.subscribe(listener), unsubscribe);
    assert.deepEqual(api.allTasks()[0], {
      path: 'Tasks.md',
      line: 3,
      rawText: task.rawText,
      description: 'Done',
      status: 'done',
      statusChar: 'x',
      done: true,
      recurring: true,
      due: '2026-07-18',
      scheduled: undefined,
      doneDate: '2026-07-18',
      cancelledDate: undefined,
      priority: null,
      tags: [],
    });
  });
});
