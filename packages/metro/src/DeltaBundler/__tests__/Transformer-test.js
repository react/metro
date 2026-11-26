/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

jest
  .setMock('jest-worker', () => ({}))
  .mock('node:fs', () => new (require('metro-memory-fs'))())
  .mock('node:assert')
  .mock('../getTransformCacheKey', () => jest.fn(() => 'hash'))
  .mock('../WorkerFarm')
  .mock('/path/to/transformer.js', () => ({}), {virtual: true});

// Must be required after mocks above
const Transformer = require('../Transformer').default;
const {getDefaultValues} = require('metro-config').getDefaultConfig;
const {mergeConfig} = require('metro-config/private/loadConfig');
const path = require('node:path');

const fs = jest.requireMock('node:fs');

describe('Transformer', function () {
  let watchFolders;
  let projectRoot;
  let commonOptions;
  const getOrComputeSha1 = jest.fn(() => ({
    sha1: '0123456789012345678901234567890123456789',
  }));

  beforeEach(function () {
    const baseConfig = {
      resolver: {
        extraNodeModules: {},
        resolverMainFields: [],
      },
      transformer: {
        assetRegistryPath: '/AssetRegistry.js',
        enableBabelRCLookup: true,
      },
      cacheStores: [],
      cacheVersion: 'smth',
      projectRoot: '/root',
      resetCache: false,
      transformerPath: '/path/to/transformer.js',
      watchFolders: ['/root'],
    };

    commonOptions = mergeConfig(getDefaultValues('/'), baseConfig);

    projectRoot = '/root';
    watchFolders = [projectRoot];

    fs.mkdirSync('/path/to', {recursive: true});
    fs.mkdirSync('/root', {recursive: true});
    fs.writeFileSync('/path/to/transformer.js', '');

    require('../getTransformCacheKey').mockClear();
  });

  test('uses new cache layers when transforming if requested to do so', async () => {
    const get = jest.fn();
    const set = jest.fn();

    const transformerInstance = new Transformer(
      {
        ...commonOptions,
        cacheStores: [{get, set}],
        watchFolders,
      },
      {getOrComputeSha1},
    );

    require('../WorkerFarm').default.prototype.transform.mockReturnValue({
      sha1: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
      result: {},
    });

    await transformerInstance.transformFile('./foo.js', {});

    // We got the SHA-1 of the file from the dependency graph.
    expect(getOrComputeSha1).toBeCalledWith('./foo.js');

    // Only one get, with the original SHA-1.
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0].toString('hex')).toMatch(
      '0123456789012345678901234567890123456789',
    );

    // Only one set, with the *modified* SHA-1. This happens when the file gets
    // modified between querying the caches and saving.
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0].toString('hex')).toMatch(
      'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
    );

    // But, the common part of the key remains the same.
    expect(get.mock.calls[0][0].toString('hex').substr(0, 32)).toBe(
      set.mock.calls[0][0].toString('hex').substr(0, 32),
    );
  });

  test.each([
    [true, true],
    [false, undefined],
  ])(
    'with resolver.unstable_allowVirtualModules: %s, sets unstable_supportsInlineModules in the keyed worker config to %s',
    (unstable_allowVirtualModules, expected) => {
      // eslint-disable-next-line no-new
      new Transformer(
        {
          ...commonOptions,
          cacheStores: [{get: jest.fn(), set: jest.fn()}],
          resolver: {...commonOptions.resolver, unstable_allowVirtualModules},
          // The resolver option is the only source of this value.
          transformer: {
            ...commonOptions.transformer,
            unstable_supportsInlineModules: !unstable_allowVirtualModules,
          },
          watchFolders,
        },
        {getOrComputeSha1},
      );

      const {transformerConfig} = require('../getTransformCacheKey').mock
        .calls[0][0].transformerConfig;
      expect(transformerConfig.unstable_supportsInlineModules).toBe(expected);
      expect(
        Object.hasOwn(transformerConfig, 'unstable_supportsInlineModules'),
      ).toBe(expected === true);

      const WorkerFarm = require('../WorkerFarm').default;
      expect(WorkerFarm.mock.lastCall[1].transformerConfig).toBe(
        transformerConfig,
      );
    },
  );

  test('keeps transformer.unstable_shareTransformResults out of the keyed worker config', () => {
    // eslint-disable-next-line no-new
    new Transformer(
      {
        ...commonOptions,
        cacheStores: [{get: jest.fn(), set: jest.fn()}],
        transformer: {
          ...commonOptions.transformer,
          unstable_shareTransformResults: true,
        },
        watchFolders,
      },
      {getOrComputeSha1},
    );

    const {transformerConfig} = require('../getTransformCacheKey').mock
      .calls[0][0].transformerConfig;
    expect(
      Object.hasOwn(transformerConfig, 'unstable_shareTransformResults'),
    ).toBe(false);
  });

  test.each([
    [true, 1, true],
    [false, 2, false],
  ])(
    'with transformer.unstable_shareTransformResults: %s, two transforms of one file read the cache %s time(s), sharing output: %s',
    async (unstable_shareTransformResults, expectedReads, expectShared) => {
      const result = {
        dependencies: [],
        output: [{type: 'js/module', data: {code: '__d(function() {});'}}],
      };
      // Return a new copy on each read, as a deserializing store does.
      const get = jest.fn(() => structuredClone(result));
      const transformerInstance = new Transformer(
        {
          ...commonOptions,
          cacheStores: [{get, set: jest.fn()}],
          transformer: {
            ...commonOptions.transformer,
            unstable_shareTransformResults,
          },
          watchFolders,
        },
        {getOrComputeSha1},
      );

      const first = await transformerInstance.transformFile('./foo.js', {});
      const second = await transformerInstance.transformFile('./foo.js', {});

      expect(get).toHaveBeenCalledTimes(expectedReads);
      expect(second.output === first.output).toBe(expectShared);
      expect(second.output).toEqual(first.output);
      expect(second.unstable_transformResultKey).toBe(
        first.unstable_transformResultKey,
      );
    },
  );

  test('with transformer.unstable_shareTransformResults, does not share between transform options', async () => {
    const get = jest.fn(() => ({
      dependencies: [],
      output: [{type: 'js/module', data: {code: ''}}],
    }));
    const transformerInstance = new Transformer(
      {
        ...commonOptions,
        cacheStores: [{get, set: jest.fn()}],
        transformer: {
          ...commonOptions.transformer,
          unstable_shareTransformResults: true,
        },
        watchFolders,
      },
      {getOrComputeSha1},
    );

    const dev = await transformerInstance.transformFile('./foo.js', {
      dev: true,
    });
    const prod = await transformerInstance.transformFile('./foo.js', {
      dev: false,
    });

    expect(get).toHaveBeenCalledTimes(2);
    expect(prod.output).not.toBe(dev.output);
    expect(prod.unstable_transformResultKey).not.toBe(
      dev.unstable_transformResultKey,
    );
  });

  test('with transformer.unstable_shareTransformResults, releaseSharedResults drops released results whose output is not held', async () => {
    const get = jest.fn(() => ({
      dependencies: [],
      output: [{type: 'js/module', data: {code: ''}}],
    }));
    const transformerInstance = new Transformer(
      {
        ...commonOptions,
        cacheStores: [{get, set: jest.fn()}],
        transformer: {
          ...commonOptions.transformer,
          unstable_shareTransformResults: true,
        },
        watchFolders,
      },
      {getOrComputeSha1},
    );

    const first = await transformerInstance.transformFile('./foo.js', {});
    transformerInstance.releaseSharedResults({
      paths: ['./foo.js'],
      heldOutputs: new Set([first.output]),
    });
    await transformerInstance.transformFile('./foo.js', {});
    expect(get).toHaveBeenCalledTimes(1);

    transformerInstance.releaseSharedResults({
      paths: ['./foo.js'],
      heldOutputs: new Set(),
    });
    const third = await transformerInstance.transformFile('./foo.js', {});
    expect(get).toHaveBeenCalledTimes(2);
    expect(third.output).not.toBe(first.output);
  });

  test('with transformer.unstable_shareTransformResults and empty cacheStores, transforms once and shares the result', async () => {
    const transform = require('../WorkerFarm').default.prototype.transform;
    transform.mockClear();
    transform.mockImplementation(async () => ({
      sha1: '0123456789012345678901234567890123456789',
      result: {dependencies: [], output: [{type: 'js/module', data: {}}]},
    }));
    const transformerInstance = new Transformer(
      {
        ...commonOptions,
        cacheStores: [],
        transformer: {
          ...commonOptions.transformer,
          unstable_shareTransformResults: true,
        },
        watchFolders,
      },
      {getOrComputeSha1},
    );

    const first = await transformerInstance.transformFile('./foo.js', {});
    const second = await transformerInstance.transformFile('./foo.js', {});

    expect(transform).toHaveBeenCalledTimes(1);
    expect(second.output).toBe(first.output);
    transform.mockReset();
  });

  test('with transformer.unstable_shareTransformResults, keys a result by the SHA-1 the worker transformed', async () => {
    const set = jest.fn();
    const transformerInstance = new Transformer(
      {
        ...commonOptions,
        cacheStores: [{get: jest.fn(), set}],
        transformer: {
          ...commonOptions.transformer,
          unstable_shareTransformResults: true,
        },
        watchFolders,
      },
      {getOrComputeSha1},
    );
    // The file changed between hashing and transforming it.
    require('../WorkerFarm').default.prototype.transform.mockReturnValue({
      sha1: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
      result: {dependencies: [], output: [{type: 'js/module', data: {}}]},
    });

    const result = await transformerInstance.transformFile('./foo.js', {});

    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0].toString('hex')).toMatch(
      'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
    );
    expect(result.unstable_transformResultKey).toBe(
      set.mock.calls[0][0].toString(),
    );
  });

  test('with transformer.unstable_shareTransformResults, reports one cache read error for concurrent requests', async () => {
    const readError = new Error('Cache read error');
    const get = jest.fn(async () => {
      throw readError;
    });
    const mockReporter = {update: jest.fn()};
    const transformerInstance = new Transformer(
      {
        ...commonOptions,
        reporter: mockReporter,
        cacheStores: [{get, set: jest.fn()}],
        transformer: {
          ...commonOptions.transformer,
          unstable_shareTransformResults: true,
        },
        watchFolders,
      },
      {getOrComputeSha1},
    );

    const results = await Promise.allSettled([
      transformerInstance.transformFile('./foo.js', {}),
      transformerInstance.transformFile('./foo.js', {}),
    ]);

    expect(results).toEqual([
      {status: 'rejected', reason: readError},
      {status: 'rejected', reason: readError},
    ]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(mockReporter.update).toHaveBeenCalledTimes(1);
    expect(mockReporter.update).toBeCalledWith({
      type: 'cache_read_error',
      error: readError,
    });
  });

  test('logs cache read errors to reporter', async () => {
    const readError = new Error('Cache write error');
    const get = jest.fn().mockImplementation(() => {
      throw readError;
    });
    const set = jest.fn();
    const mockReporter = {
      update: jest.fn(),
    };

    const transformerInstance = new Transformer(
      {
        ...commonOptions,
        reporter: mockReporter,
        cacheStores: [{get, set}],
        watchFolders,
      },
      {getOrComputeSha1},
    );

    require('../WorkerFarm').default.prototype.transform.mockReturnValue({
      sha1: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
      result: {},
    });

    await expect(
      transformerInstance.transformFile('./foo.js', {}),
    ).rejects.toBe(readError);

    expect(get).toHaveBeenCalledTimes(1);

    expect(mockReporter.update).toBeCalledWith({
      type: 'cache_read_error',
      error: readError,
    });
  });

  test('logs cache write errors to reporter', async () => {
    class MockStore {
      get = jest.fn();
      set = jest.fn().mockImplementation(() => {
        throw writeError;
      });
    }
    const store = new MockStore();
    const writeError = new Error('Cache write error');
    const mockReporter = {
      update: jest.fn(),
    };

    const transformerInstance = new Transformer(
      {
        ...commonOptions,
        reporter: mockReporter,
        cacheStores: [store],
        watchFolders,
      },
      {getOrComputeSha1},
    );

    require('../WorkerFarm').default.prototype.transform.mockReturnValue({
      sha1: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
      result: {},
    });

    let resolve;
    const waitForError = new Promise(r => {
      resolve = r;
    });
    mockReporter.update.mockImplementation(event => {
      if (event.type === 'cache_write_error') {
        resolve();
      }
    });

    await Promise.all([
      transformerInstance.transformFile('./foo.js', {}),
      waitForError,
    ]);

    expect(store.set).toHaveBeenCalledTimes(1);

    expect(mockReporter.update).toBeCalledWith({
      type: 'cache_write_error',
      error: new AggregateError(
        [writeError],
        'Cache write failed for store(s): MockStore',
      ),
    });
  });

  test('short-circuits the transformer cache key when the cache is disabled', async () => {
    const transformerInstance = new Transformer(
      {
        ...commonOptions,
        cacheStores: [],
        watchFolders,
      },
      {getOrComputeSha1},
    );

    require('../WorkerFarm').default.prototype.transform.mockReturnValue({
      sha1: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
      result: {},
    });

    await transformerInstance.transformFile('./foo.js', {});

    expect(require('../getTransformCacheKey')).not.toBeCalled();
  });

  test('passes an indexed watch folder URL path to asset transforms', async () => {
    const workerTransform =
      require('../WorkerFarm').default.prototype.transform;
    workerTransform.mockClear();
    workerTransform.mockReturnValue({
      sha1: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
      result: {},
    });
    fs.mkdirSync('/external', {recursive: true});

    const transformerInstance = new Transformer(
      {
        ...commonOptions,
        cacheStores: [],
        watchFolders: ['/root', '/external'],
      },
      {getOrComputeSha1},
    );

    await transformerInstance.transformFile('/external/imgs/a.png', {
      type: 'asset',
    });

    expect(workerTransform).toHaveBeenCalledWith(
      path.join('..', 'external', 'imgs', 'a.png'),
      {type: 'asset'},
      undefined,
      '[metro-watchFolders]/1/imgs/a.png',
    );
  });

  test('passes a dynamic root URL path to asset transforms, reading roots on each transform', async () => {
    const workerTransform =
      require('../WorkerFarm').default.prototype.transform;
    workerTransform.mockClear();
    workerTransform.mockReturnValue({
      sha1: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
      result: {},
    });
    let dynamicRoots: ReadonlyArray<{id: string, rootDir: string}> = [];
    const getDynamicRoots = jest.fn(() => dynamicRoots);

    const transformerInstance = new Transformer(
      {
        ...commonOptions,
        cacheStores: [],
        watchFolders: ['/root'],
      },
      {getDynamicRoots, getOrComputeSha1},
    );
    dynamicRoots = [{id: '01234567', rootDir: '/other'}];

    await transformerInstance.transformFile('/other/imgs/a.png', {
      type: 'asset',
    });

    expect(getDynamicRoots).toHaveBeenCalled();
    expect(workerTransform).toHaveBeenCalledWith(
      path.join('..', 'other', 'imgs', 'a.png'),
      {type: 'asset'},
      undefined,
      '[metro-watchFolders]/01234567/imgs/a.png',
    );
  });

  test('does not start workers if the transformer cache key throws', () => {
    const error = new Error("Cannot find module 'babel-preset-expo'");
    require('../getTransformCacheKey').mockImplementationOnce(() => {
      throw error;
    });
    const WorkerFarm = require('../WorkerFarm').default;
    WorkerFarm.mockClear();

    expect(
      () =>
        new Transformer(
          {
            ...commonOptions,
            cacheStores: [{get: jest.fn(), set: jest.fn()}],
            watchFolders,
          },
          {getOrComputeSha1},
        ),
    ).toThrow(error);
    expect(WorkerFarm).not.toBeCalled();
  });

  describe('with unstable_hedgeCacheReadsAfterMs', () => {
    const SLOW_SHA1 = 'ffffffffffffffffffffffffffffffffffffffff';
    const local = {
      sha1: '0123456789012345678901234567890123456789',
      result: {output: 'local'},
    };
    let transform;

    beforeEach(() => {
      jest.useFakeTimers();
      transform = require('../WorkerFarm').default.prototype.transform;
      transform.mockReset();
      transform.mockResolvedValue(local);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    function createTransformer(get) {
      return new Transformer(
        {
          ...commonOptions,
          cacheStores: [{get, set: jest.fn()}],
          unstable_hedgeCacheReadsAfterMs: 100,
          watchFolders,
        },
        {getOrComputeSha1},
      );
    }

    function after(ms, value) {
      return new Promise(resolve => setTimeout(() => resolve(value), ms));
    }

    test('uses a cache hit that arrives within the delay', async () => {
      const transformer = createTransformer(() => after(50, {output: 'cache'}));
      const promise = transformer.transformFile('./foo.js', {});
      await jest.advanceTimersByTimeAsync(50);

      expect(await promise).toMatchObject({output: 'cache'});
      expect(transform).not.toHaveBeenCalled();
    });

    test('transforms immediately on a cache miss within the delay', async () => {
      const transformer = createTransformer(() => after(50, null));
      const promise = transformer.transformFile('./foo.js', {});
      await jest.advanceTimersByTimeAsync(50);

      expect(await promise).toMatchObject({output: 'local'});
      expect(transform).toHaveBeenCalledTimes(1);
    });

    test('uses the local transform when the cache is slower', async () => {
      const transformer = createTransformer(() =>
        after(1000, {output: 'cache'}),
      );
      const promise = transformer.transformFile('./foo.js', {});
      await jest.advanceTimersByTimeAsync(100);

      expect(await promise).toMatchObject({output: 'local'});
      expect(transform).toHaveBeenCalledTimes(1);
    });

    test('uses a slow cache hit that beats the local transform', async () => {
      transform.mockImplementation(() => after(1000, local));
      const transformer = createTransformer(() =>
        after(200, {output: 'cache'}),
      );
      const promise = transformer.transformFile('./foo.js', {});
      await jest.advanceTimersByTimeAsync(200);

      expect(await promise).toMatchObject({output: 'cache'});
    });

    test('does not start queued speculative transforms once the cache answers', async () => {
      // Two slots (maxWorkers * 2) are busy with required transforms.
      transform.mockImplementation(() => after(1000, local));
      const transformer = new Transformer(
        {
          ...commonOptions,
          maxWorkers: 1,
          cacheStores: [
            {
              get: key =>
                key.toString('hex').endsWith(SLOW_SHA1)
                  ? after(300, {output: 'cache'})
                  : Promise.resolve(null),
              set: jest.fn(),
            },
          ],
          unstable_hedgeCacheReadsAfterMs: 100,
          watchFolders,
        },
        {getOrComputeSha1},
      );
      const busy = [
        transformer.transformFile('./a.js', {}),
        transformer.transformFile('./b.js', {}),
      ];
      getOrComputeSha1.mockReturnValueOnce({sha1: SLOW_SHA1});
      const slow = transformer.transformFile('./slow.js', {});
      await jest.advanceTimersByTimeAsync(300);

      expect(await slow).toMatchObject({output: 'cache'});
      await jest.advanceTimersByTimeAsync(1000);
      await Promise.all(busy);
      expect(transform).toHaveBeenCalledTimes(2);
    });

    test('uses a slow cache hit when the local transform fails first', async () => {
      transform.mockImplementation(() =>
        after(50, null).then(() => {
          throw new Error('worker crashed');
        }),
      );
      const transformer = createTransformer(() =>
        after(300, {output: 'cache'}),
      );
      const promise = transformer.transformFile('./foo.js', {});
      await jest.advanceTimersByTimeAsync(300);

      expect(await promise).toMatchObject({output: 'cache'});
    });

    test('fails with the local error when the cache then misses', async () => {
      transform.mockImplementation(() =>
        after(50, null).then(() => {
          throw new Error('worker crashed');
        }),
      );
      const transformer = createTransformer(() => after(300, null));
      const promise = transformer.transformFile('./foo.js', {}).catch(e => e);
      await jest.advanceTimersByTimeAsync(300);

      expect(await promise).toEqual(new Error('worker crashed'));
    });

    test('does not write a local winner to the remote store that then hits', async () => {
      const remoteSet = jest.fn();
      const transformer = new Transformer(
        {
          ...commonOptions,
          cacheStores: [
            {get: () => null, set: jest.fn()},
            {get: () => after(1000, {output: 'cache'}), set: remoteSet},
          ],
          unstable_hedgeCacheReadsAfterMs: 100,
          watchFolders,
        },
        {getOrComputeSha1},
      );
      const promise = transformer.transformFile('./foo.js', {});
      await jest.advanceTimersByTimeAsync(100);

      expect(await promise).toMatchObject({output: 'local'});
      await jest.advanceTimersByTimeAsync(1000);
      expect(remoteSet).not.toHaveBeenCalled();
    });

    test('does not start a queued speculative transform after the cache read fails', async () => {
      // Two slots (maxWorkers * 2) are busy with required transforms.
      transform.mockImplementation(() => after(1000, local));
      const transformer = new Transformer(
        {
          ...commonOptions,
          maxWorkers: 1,
          cacheStores: [
            {
              get: key =>
                key.toString('hex').endsWith(SLOW_SHA1)
                  ? after(300, null).then(() => {
                      throw new Error('cache unavailable');
                    })
                  : Promise.resolve(null),
              set: jest.fn(),
            },
          ],
          unstable_hedgeCacheReadsAfterMs: 100,
          watchFolders,
        },
        {getOrComputeSha1},
      );
      const busy = [
        transformer.transformFile('./a.js', {}),
        transformer.transformFile('./b.js', {}),
      ];
      getOrComputeSha1.mockReturnValueOnce({sha1: SLOW_SHA1});
      const slow = transformer.transformFile('./slow.js', {}).catch(e => e);
      await jest.advanceTimersByTimeAsync(300);

      expect(await slow).toEqual(new Error('cache unavailable'));
      await jest.advanceTimersByTimeAsync(1000);
      await Promise.all(busy);
      expect(transform).toHaveBeenCalledTimes(2);
    });
  });
});
