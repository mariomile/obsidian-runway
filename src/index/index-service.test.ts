import assert from 'node:assert/strict';
import test from 'node:test';
import type { App, Plugin, TFile } from 'obsidian';

import { TaskIndexService } from './index-service.ts';

// queueNotify debounces through window timers.
(globalThis as { window?: unknown }).window ??= globalThis;

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness(
  read: () => Promise<string>,
  isProjectNote: (path: string) => boolean = () => false,
): {
  service: TaskIndexService;
  stop: () => void;
  emitChanged: (path: string, data: string, cache: unknown) => void;
} {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const file = {
    path: 'Tasks.md',
    extension: 'md',
  } as TFile;
  const cache = {
    listItems: [
      {
        task: ' ',
        position: { start: { line: 0 } },
      },
    ],
  };
  const cleanups: Array<() => void> = [];
  const app = {
    metadataCache: {
      getFileCache: () => cache,
      on: (name: string, handler: (...args: unknown[]) => void) => {
        handlers.set(name, handler);
        return {};
      },
    },
    vault: {
      cachedRead: read,
      getFileByPath: () => file,
      getMarkdownFiles: () => [file],
      on: () => ({}),
    },
    workspace: {
      onLayoutReady: () => undefined,
    },
  } as unknown as App;
  const plugin = {
    registerEvent: () => undefined,
    register: (cleanup: () => void) => {
      cleanups.push(cleanup);
    },
  } as unknown as Plugin;
  const service = new TaskIndexService(app, () => false, isProjectNote);
  service.start(plugin);
  return {
    service,
    stop: () => {
      for (const cleanup of cleanups) cleanup();
    },
    emitChanged: (path, data, metadata) => handlers.get('changed')?.({ path }, data, metadata),
  };
}

test('a stale rescan cannot overwrite a newer completed rescan', async () => {
  const stale = deferred<string>();
  let reads = 0;
  const { service } = harness(() => {
    reads += 1;
    return reads === 1 ? stale.promise : Promise.resolve('- [ ] Fresh task');
  });

  const first = service.rescan(() => false);
  // The scan yields before reading: wait until the stale read is in flight.
  while (reads === 0) await new Promise((done) => window.setTimeout(done, 0));
  const second = service.rescan(() => false);
  await second;
  stale.resolve('- [ ] Stale task');
  await first;

  assert.equal(service.isReady(), true);
  assert.equal(service.all()[0]?.description, 'Fresh task');
});

test('an in-flight scan cannot publish after plugin unload', async () => {
  const pending = deferred<string>();
  let reads = 0;
  const { service, stop } = harness(() => {
    reads += 1;
    return pending.promise;
  });

  const scan = service.rescan(() => false);
  // The scan yields before reading: wait until the read is in flight.
  while (reads === 0) await new Promise((done) => window.setTimeout(done, 0));
  stop();
  pending.resolve('- [ ] Late task');
  await scan;

  assert.equal(service.isReady(), false);
  assert.deepEqual(service.all(), []);
});

test('an edit to a project note without tasks still re-renders the panels', async () => {
  const { service, stop, emitChanged } = harness(
    () => Promise.resolve(''),
    (path) => path.startsWith('Projects/'),
  );
  let notified = 0;
  service.subscribe(() => {
    notified += 1;
  });

  emitChanged('Notes/Plain.md', 'status: paused', {});
  emitChanged('Projects/Alpha.md', 'status: paused', {});
  await new Promise((done) => setTimeout(done, 350));
  stop();

  assert.equal(notified, 1);
});

test('an edit to a plain note without tasks does not re-render the panels', async () => {
  const { service, stop, emitChanged } = harness(() => Promise.resolve(''));
  let notified = 0;
  service.subscribe(() => {
    notified += 1;
  });

  emitChanged('Notes/Plain.md', 'just text', {});
  await new Promise((done) => setTimeout(done, 350));
  stop();

  assert.equal(notified, 0);
});
