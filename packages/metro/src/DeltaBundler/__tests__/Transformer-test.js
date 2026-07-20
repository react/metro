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
});
