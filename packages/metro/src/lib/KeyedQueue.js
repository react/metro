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

import {AsyncLocalStorage} from 'node:async_hooks';

type Hold<K> = {
  readonly key: K,
  readonly parent: ?Hold<K>,
  released: boolean,
};

/**
 * Runs async tasks one at a time per key, in the order they were enqueued.
 * A task that fails doesn't prevent later tasks from running.
 *
 * Re-entrant: a task enqueued from within the running task for the same key -
 * directly, or from code that task calls or awaits - runs immediately as part
 * of it, rather than waiting for it to finish (and so, if awaited, for itself).
 *
 * "Within" follows the async context, so it also covers work the task starts
 * without awaiting (e.g. a timer callback) that runs before the task finishes;
 * once the task has finished, such work queues normally. A running task should
 * therefore await whatever it starts that uses the queue, or start it with
 * `release()`, which queues it normally.
 */
export default class KeyedQueue<K> {
  #tails: Map<K, Promise<void>> = new Map();
  #holds: AsyncLocalStorage<?Hold<K>> = new AsyncLocalStorage();

  enqueue<T>(key: K, task: () => Promise<T>): Promise<T> {
    if (this.isHeld(key)) {
      return task();
    }
    const run = async (): Promise<T> => {
      const hold = {key, parent: this.#holds.getStore(), released: false};
      try {
        return await this.#holds.run(hold, task);
      } finally {
        // Anything the task started but didn't await, and which outlives it,
        // is no longer part of it.
        hold.released = true;
      }
    };
    const result = (this.#tails.get(key) ?? Promise.resolve()).then(run);
    const tail = result.then(
      () => {},
      () => {},
    );
    this.#tails.set(key, tail);
    void tail.then(() => {
      if (this.#tails.get(key) === tail) {
        this.#tails.delete(key);
      }
    });
    return result;
  }

  /**
   * Whether the caller is (part of) the running task for `key`.
   */
  isHeld(key: K): boolean {
    for (let hold = this.#holds.getStore(); hold != null; hold = hold.parent) {
      if (hold.key === key && !hold.released) {
        return true;
      }
    }
    return false;
  }

  /**
   * Calls `fn` as if from outside any running task, so that anything it starts
   * is queued normally rather than run as part of the running task.
   */
  release<T>(fn: () => T): T {
    return this.#holds.exit(fn);
  }
}
