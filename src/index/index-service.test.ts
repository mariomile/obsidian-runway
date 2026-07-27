import assert from 'node:assert/strict';
import test from 'node:test';
import type { App, Plugin, TFile } from 'obsidian';

import { TaskIndexService } from './index-service.ts';

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

function harness(read: () => Promise<string>): {
  service: TaskIndexService;
  stop(): void;
} {
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
      on: () => ({}),
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
  const service = new TaskIndexService(app, () => false);
  service.start(plugin);
  return {
    service,
    stop: () => {
      for (const cleanup of cleanups) cleanup();
    },
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
  await Promise.resolve();
  const second = service.rescan(() => false);
  await second;
  stale.resolve('- [ ] Stale task');
  await first;

  assert.equal(service.isReady(), true);
  assert.equal(service.all()[0]?.description, 'Fresh task');
});

test('an in-flight scan cannot publish after plugin unload', async () => {
  const pending = deferred<string>();
  const { service, stop } = harness(() => pending.promise);

  const scan = service.rescan(() => false);
  await Promise.resolve();
  stop();
  pending.resolve('- [ ] Late task');
  await scan;

  assert.equal(service.isReady(), false);
  assert.deepEqual(service.all(), []);
});
