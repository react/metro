/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

import type {CacheStore} from './types';

import {Logger} from 'metro-core';

// A `get` in progress: the store it is reading, and what to call once it has
// finished.
type Reading = {
  index: number,
  onSettled: ?Array<() => void>,
};

/**
 * Main cache class. Receives an array of cache instances, and sequentially
 * traverses them to return a previously stored value. It also ensures setting
 * the value in all instances.
 *
 * All get/set operations are logged via Metro's logger.
 */
export default class Cache<T> {
  readonly #stores: ReadonlyArray<CacheStore<T>>;
  readonly #hits: WeakMap<Buffer, CacheStore<T>> = new WeakMap();
  readonly #reading: WeakMap<Buffer, Reading> = new WeakMap();

  constructor(stores: ReadonlyArray<CacheStore<T>>) {
    this.#stores = stores;
  }

  async get(key: Buffer): Promise<?T> {
    const stores = this.#stores;
    const length = stores.length;
    const reading: Reading = {index: 0, onSettled: null};
    this.#reading.set(key, reading);

    try {
      for (let i = 0; i < length; i++) {
        reading.index = i;
        const store = stores[i];
        const storeName = store.name ?? store.constructor.name;
        const name = storeName + '::' + key.toString('hex');
        let value = null;

        const logStart = Logger.log(
          Logger.createActionStartEntry({
            action_name: 'Cache get',
            log_entry_label: name,
          }),
        );

        try {
          const valueOrPromise = store.get(key);

          if (valueOrPromise && typeof valueOrPromise.then === 'function') {
            value = await valueOrPromise;
          } else {
            value = valueOrPromise;
          }
        } finally {
          const hitOrMiss = value != null ? 'hit' : 'miss';
          Logger.log({
            ...Logger.createActionEndEntry(logStart),
            action_result: hitOrMiss,
          });

          // Deprecated - will be removed () - use 'Cache get' and action_result
          // (above) instead.
          // TODO: T196506422
          Logger.log(
            Logger.createEntry({
              action_name: 'Cache ' + hitOrMiss,
              log_entry_label: name,
            }),
          );

          if (value != null) {
            this.#hits.set(key, store);

            return value;
          }
        }
      }

      return null;
    } finally {
      if (this.#reading.get(key) === reading) {
        this.#reading.delete(key);
      }
      for (const onSettled of reading.onSettled ?? []) {
        onSettled();
      }
    }
  }

  async set(key: Buffer, value: T): Promise<void> {
    const reading = this.#reading.get(key);
    let failures;
    if (reading == null) {
      failures = await this.#write(key, value, 0, this.#stopIndex(key));
    } else {
      // A read of this key is still under way, as when a caller raced it
      // against computing the value. The stores before the one it is reading
      // have missed and are written now. Whether that store or a later one
      // has the value is not known yet, so they are written once the read
      // settles, up to the store it hit: the same stores a set after the read
      // would write.
      const passed = reading.index;
      const settled = new Promise<void>(resolve => {
        if (reading.onSettled == null) {
          reading.onSettled = [];
        }
        reading.onSettled.push(resolve);
      });
      const [before, after] = await Promise.all([
        this.#write(key, value, 0, passed),
        settled.then(() =>
          this.#write(key, value, passed, this.#stopIndex(key)),
        ),
      ]);
      failures = [...before, ...after];
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures.map(failure => failure.error),
        `Cache write failed for store(s): ${Array.from(
          new Set(failures.map(failure => failure.storeName)),
        ).join(', ')}`,
      );
    }
  }

  // Index of the store that served the last hit for this key: it and the
  // stores after it already have the value.
  #stopIndex(key: Buffer): number {
    const stop = this.#hits.get(key);
    const index = stop == null ? -1 : this.#stores.indexOf(stop);
    return index === -1 ? this.#stores.length : index;
  }

  async #write(
    key: Buffer,
    value: T,
    from: number,
    to: number,
  ): Promise<Array<{error: Error, storeName: string}>> {
    const stores = this.#stores;
    const promises = [];
    const failures: Array<{error: Error, storeName: string}> = [];

    for (let i = from; i < to; i++) {
      const store = stores[i];
      const storeName = store.name ?? store.constructor.name;
      const name = storeName + '::' + key.toString('hex');

      const logStart = Logger.log(
        Logger.createActionStartEntry({
          action_name: 'Cache set',
          log_entry_label: name,
        }),
      );

      promises.push(
        (async () => {
          try {
            await store.set(key, value);
            Logger.log(Logger.createActionEndEntry(logStart));
          } catch (e) {
            Logger.log(Logger.createActionEndEntry(logStart, e));
            failures.push({
              error: new Error(`Cache write failed for ${name}`, {cause: e}),
              storeName,
            });
          }
        })(),
      );
    }

    await Promise.allSettled(promises);
    return failures;
  }

  // Returns true if the current configuration disables the cache, such that
  // writing to the cache is a no-op and reading from the cache will always
  // return null.
  get isDisabled(): boolean {
    return this.#stores.length === 0;
  }
}
