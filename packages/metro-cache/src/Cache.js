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

  constructor(stores: ReadonlyArray<CacheStore<T>>) {
    this.#stores = stores;
  }

  async get(key: Buffer): Promise<?T> {
    const stores = this.#stores;
    const length = stores.length;

    for (let i = 0; i < length; i++) {
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
  }

  async set(key: Buffer, value: T): Promise<void> {
    const stores = this.#stores;
    const stop = this.#hits.get(key);
    const length = stores.length;
    const promises = [];
    const writeErrors = [];
    const storesWithErrors = new Set<string>();

    for (let i = 0; i < length && stores[i] !== stop; i++) {
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
            await stores[i].set(key, value);
            Logger.log(Logger.createActionEndEntry(logStart));
          } catch (e) {
            Logger.log(Logger.createActionEndEntry(logStart, e));
            storesWithErrors.add(storeName);
            writeErrors.push(
              new Error(`Cache write failed for ${name}`, {cause: e}),
            );
          }
        })(),
      );
    }

    await Promise.allSettled(promises);
    if (writeErrors.length > 0) {
      throw new AggregateError(
        writeErrors,
        `Cache write failed for store(s): ${Array.from(storesWithErrors).join(', ')}`,
      );
    }
  }

  // Returns true if the current configuration disables the cache, such that
  // writing to the cache is a no-op and reading from the cache will always
  // return null.
  get isDisabled(): boolean {
    return this.#stores.length === 0;
  }
}
