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

'use strict';

describe('Cache', () => {
  let Cache;
  let Logger;
  let log;

  function createStore(name: string = '') {
    // eslint-disable-next-line no-eval
    const TempClass = eval(`(class ${name} {})`);

    // $FlowFixMe[unsafe-object-assign]
    return Object.assign(new TempClass(), {
      get: jest.fn().mockImplementation(() => null),
      set: jest.fn(),
    });
  }

  beforeEach(() => {
    Logger = require('metro-core').Logger;
    Cache = require('../Cache').default;

    Logger.on('log', item => {
      log.push({
        a: item.action_name,
        l: item.log_entry_label,
        p: item.action_phase,
      });
    });

    log = [] as Array<
      $FlowFixMe | {a: void | string, l: string, p: void | string},
    >;
  });

  afterEach(() => {
    jest.resetModules().restoreAllMocks();
  });

  test('returns null when no result is found', async () => {
    const store1 = createStore();
    const store2 = createStore();
    const cache = new Cache([store1, store2]);

    // Calling a wrapped method.
    const result = await cache.get(Buffer.from('foo'));

    expect(result).toBe(null);
    expect(store1.get).toHaveBeenCalledTimes(1);
    expect(store2.get).toHaveBeenCalledTimes(1);
  });

  test('sequentially searches up until it finds a valid result', async () => {
    const store1 = createStore();
    const store2 = createStore();
    const store3 = createStore();
    const cache = new Cache([store1, store2, store3]);

    // Only cache 2 can return results.
    store2.get.mockImplementation(() => 'hit!');

    const result = await cache.get(Buffer.from('foo'));

    expect(result).toBe('hit!');
    expect(store1.get).toHaveBeenCalledTimes(1);
    expect(store2.get).toHaveBeenCalledTimes(1);
    expect(store3.get).not.toHaveBeenCalled();
  });

  test('skips all cache stores when a hit is produced, based on the same key', async () => {
    const store1 = createStore();
    const store2 = createStore();
    const store3 = createStore();
    const cache = new Cache([store1, store2, store3]);
    const key = Buffer.from('foo');

    store2.get.mockImplementation(() => 'hit!');

    // Get and set. Set should only affect store 1, not 2 (hit) and 3 (after).
    await Promise.all([cache.get(key), cache.set(key)]);

    expect(store1.set).toHaveBeenCalledTimes(1);
    expect(store2.set).not.toHaveBeenCalled();
    expect(store3.set).not.toHaveBeenCalled();
  });

  test('awaits for promises on stores, even if they return undefined', async () => {
    let resolve;

    const store1 = createStore();
    const store2 = createStore();
    const promise = new Promise((res, rej) => (resolve = res));
    const cache = new Cache([store1, store2]);

    store1.get.mockImplementation(() => promise);
    const get = cache.get(Buffer.from('foo'));

    // Store 1 returns a promise, so store 2 is not called until it resolves.
    expect(store1.get).toHaveBeenCalledTimes(1);
    expect(store2.get).not.toHaveBeenCalled();

    if (!resolve) {
      throw new Error('Flow needs this');
    }

    resolve(undefined);
    await Promise.all([promise, get]);

    expect(store1.get).toHaveBeenCalledTimes(1);
    expect(store2.get).toHaveBeenCalledTimes(1);
  });

  test('throws all errors on a buggy store set', async () => {
    const goodStore = createStore('GoodStore');
    const badAsyncStore = createStore('BadAsyncStore');
    const badSyncStore = createStore('BadSyncStore');
    const cache = new Cache([goodStore, badAsyncStore, badSyncStore]);
    let error = null;

    goodStore.set.mockImplementation(() => null);
    badAsyncStore.set.mockImplementation(() =>
      Promise.reject(new RangeError('foo')),
    );
    badSyncStore.set.mockImplementation(() => {
      throw new TypeError('bar');
    });

    try {
      await cache.set(Buffer.from('foo'), 'arg');
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(AggregateError);
    expect(error?.message).toBe(
      'Cache write failed for store(s): BadSyncStore, BadAsyncStore',
    );
    expect(error?.errors).toHaveLength(2);
    expect(error?.errors[0].cause).toEqual(TypeError('bar'));
    expect(error?.errors[1].cause).toEqual(RangeError('foo'));
  });

  test('throws on a buggy store get', async () => {
    const store1 = createStore();
    const store2 = createStore();
    const cache = new Cache([store1, store2]);
    let error = null;

    store1.get.mockImplementation(() => null);
    store2.get.mockImplementation(() => Promise.reject(new TypeError('bar')));

    try {
      await cache.get(Buffer.from('foo'));
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(TypeError);
  });

  test('logs the right messages when getting without errors', async () => {
    const store1 = createStore('Local');
    const store2 = createStore('Network');
    const cache = new Cache([store1, store2]);

    store1.get.mockImplementation(() => null);
    store2.get.mockImplementation(() => 'le potato');

    await cache.get(Buffer.from('foo'));

    expect(log).toEqual([
      {a: 'Cache get', l: 'Local::666f6f', p: 'start'},
      {a: 'Cache get', l: 'Local::666f6f', p: 'end'},
      {a: 'Cache miss', l: 'Local::666f6f', p: undefined},
      {a: 'Cache get', l: 'Network::666f6f', p: 'start'},
      {a: 'Cache get', l: 'Network::666f6f', p: 'end'},
      {a: 'Cache hit', l: 'Network::666f6f', p: undefined},
    ]);
  });

  test('logs the right messages when getting with errors', async () => {
    const store1 = createStore('Local');
    const store2 = createStore('Network');
    const cache = new Cache([store1, store2]);

    store1.get.mockImplementation(() => null);
    store2.get.mockImplementation(() => Promise.reject(new TypeError('bar')));

    try {
      await cache.get(Buffer.from('foo'));
    } catch (err) {
      // Do nothing, we care about the logs.
    }

    expect(log).toEqual([
      {a: 'Cache get', l: 'Local::666f6f', p: 'start'},
      {a: 'Cache get', l: 'Local::666f6f', p: 'end'},
      {a: 'Cache miss', l: 'Local::666f6f', p: undefined},
      {a: 'Cache get', l: 'Network::666f6f', p: 'start'},
      {a: 'Cache get', l: 'Network::666f6f', p: 'end'},
      {a: 'Cache miss', l: 'Network::666f6f', p: undefined},
    ]);
  });

  test('logs the right messages when setting', async () => {
    const store1 = createStore('Local');
    const store2 = createStore('Network');
    const cache = new Cache([store1, store2]);

    await cache.set(Buffer.from('foo'));

    expect(log).toEqual([
      {a: 'Cache set', l: 'Local::666f6f', p: 'start'},
      {a: 'Cache set', l: 'Network::666f6f', p: 'start'},
      {a: 'Cache set', l: 'Local::666f6f', p: 'end'},
      {a: 'Cache set', l: 'Network::666f6f', p: 'end'},
    ]);
  });

  describe('disabled cache', () => {
    test('returns null for reads', async () => {
      const cache = new Cache<string>([]);

      const result = await cache.get(Buffer.from('foo'));

      expect(result).toBe(null);
    });

    test('ignores writes', async () => {
      const cache = new Cache<string>([]);

      await cache.set(Buffer.from('foo'), 'value');
      const result = await cache.get(Buffer.from('foo'));

      expect(result).toBe(null);
    });

    test('logs nothing', async () => {
      const cache = new Cache<string>([]);

      await cache.set(Buffer.from('foo'), 'value');
      await cache.get(Buffer.from('foo'));

      expect(log).toEqual([]);
    });
  });
});
