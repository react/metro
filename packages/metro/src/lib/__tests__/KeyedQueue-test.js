/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import KeyedQueue from '../KeyedQueue';

function deferred() {
  let resolve: () => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe('KeyedQueue', () => {
  test('runs tasks for the same key one at a time, in order', async () => {
    const queue = new KeyedQueue<string>();
    const log: Array<string> = [];
    const first = deferred();

    const a = queue.enqueue('key', async () => {
      log.push('a:start');
      await first.promise;
      log.push('a:end');
      return 'a';
    });
    const b = queue.enqueue('key', async () => {
      log.push('b');
      return 'b';
    });
    await flushMicrotasks();
    expect(log).toEqual(['a:start']);

    first.resolve();
    expect(await a).toBe('a');
    expect(await b).toBe('b');
    expect(log).toEqual(['a:start', 'a:end', 'b']);
  });

  test('runs tasks for different keys concurrently', async () => {
    const queue = new KeyedQueue<string>();
    const blocked = deferred();
    const log: Array<string> = [];

    void queue.enqueue('one', () => blocked.promise);
    const other = queue.enqueue('two', async () => {
      log.push('two');
    });

    await other;
    expect(log).toEqual(['two']);
    blocked.resolve();
  });

  test('runs later tasks after one fails', async () => {
    const queue = new KeyedQueue<string>();

    const failing = queue.enqueue<void>('key', async () => {
      throw new Error('failed');
    });
    const next = queue.enqueue('key', async () => 'next');

    await expect(failing).rejects.toThrow('failed');
    expect(await next).toBe('next');
  });
  describe('re-entrancy', () => {
    test('runs a task enqueued from within the running task for the same key as part of it', async () => {
      const queue = new KeyedQueue<string>();
      const log: Array<string> = [];

      const outer = queue.enqueue('key', async () => {
        log.push('outer:start');
        // Would wait for itself if queued.
        await queue.enqueue('key', async () => {
          log.push('nested');
        });
        log.push('outer:end');
      });

      await outer;
      expect(log).toEqual(['outer:start', 'nested', 'outer:end']);
    });

    test('queues a task enqueued by a continuation that outlives the running task', async () => {
      const queue = new KeyedQueue<string>();
      const log: Array<string> = [];
      const outlives = deferred();
      const blocker = deferred();
      let late: ?Promise<void> = null;

      await queue.enqueue('key', async () => {
        void outlives.promise.then(() => {
          late = queue.enqueue('key', async () => {
            log.push('late');
          });
        });
      });
      const next = queue.enqueue('key', async () => {
        await blocker.promise;
        log.push('next');
      });

      outlives.resolve();
      await flushMicrotasks();
      // Not run as part of the first task, which has finished.
      expect(log).toEqual([]);

      blocker.resolve();
      await next;
      await late;
      expect(log).toEqual(['next', 'late']);
    });

    test('queues a task enqueued within release() after the running task', async () => {
      const queue = new KeyedQueue<string>();
      const log: Array<string> = [];
      let released: ?Promise<void> = null;

      await queue.enqueue('key', async () => {
        queue.release(() => {
          released = queue.enqueue('key', async () => {
            log.push('released');
          });
        });
        await flushMicrotasks();
        log.push('task:end');
      });
      await released;

      expect(log).toEqual(['task:end', 'released']);
    });

    test('tracks keys separately', async () => {
      const queue = new KeyedQueue<string>();
      const log: Array<string> = [];
      const blocker = deferred();

      void queue.enqueue('other', () => blocker.promise);
      await queue.enqueue('key', async () => {
        expect(queue.isHeld('key')).toBe(true);
        expect(queue.isHeld('other')).toBe(false);
        const other = queue.enqueue('other', async () => {
          log.push('other');
        });
        await flushMicrotasks();
        // Queued behind the blocked task for 'other'.
        expect(log).toEqual([]);
        blocker.resolve();
        await other;
      });
      expect(log).toEqual(['other']);
    });
  });
});
