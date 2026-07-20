/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {BuildParameters, FileMapPlugin} from '../../flow-types';
import typeof PathModule from 'node:path';

import rootRelativeCacheKeys from '../rootRelativeCacheKeys';

// $FlowExpectedError[incompatible-type] Partial mock
const getMockPlugin = (cacheKey: string): FileMapPlugin<> => ({
  getCacheKey: jest.fn(() => cacheKey),
});

const buildParameters: BuildParameters = {
  computeSha1: false,
  enableSymlinks: false,
  extensions: ['a'],
  ignorePattern: /a/,
  plugins: [getMockPlugin('1')],
  retainAllFiles: false,
  rootDir: '/root',
  roots: ['a', 'b'],
  cacheBreaker: 'a',
};

jest.mock(
  '/haste/1',
  () => ({
    getCacheKey: () => 'haste/1',
  }),
  {virtual: true},
);
jest.mock(
  '/haste/2',
  () => ({
    getCacheKey: () => 'haste/2',
  }),
  {virtual: true},
);
jest.mock(
  '/extractor/1',
  () => ({
    getCacheKey: () => 'extractor/1',
  }),
  {virtual: true},
);
jest.mock(
  '/extractor/2',
  () => ({
    getCacheKey: () => 'extractor/2',
  }),
  {virtual: true},
);

test('returns a distinct cache key for any change', () => {
  const {rootDir: __, plugins: ___, ...simpleParameters} = buildParameters;

  const varyDefault = <T extends keyof typeof simpleParameters>(
    key: T,
    newVal: BuildParameters[T],
  ): BuildParameters => {
    // $FlowFixMe[invalid-computed-prop] Can't use a union for a computed prop
    // $FlowFixMe[incompatible-indexer]
    return {...buildParameters, [key]: newVal};
  };

  const configs = Object.keys(simpleParameters).map(key => {
    switch (key) {
      // Boolean
      case 'computeSha1':
      case 'enableSymlinks':
      case 'retainAllFiles':
        return varyDefault(key, !buildParameters[key]);
      // Strings
      case 'cacheBreaker':
        return varyDefault(key, 'foo');
      // String arrays
      case 'extensions':
      case 'roots':
        return varyDefault(key, ['foo']);
      // Regexp
      case 'ignorePattern':
        return varyDefault(key, /foo/);
      default:
        key as empty;
        throw new Error('Unrecognised key in build parameters: ' + key);
    }
  });
  configs.push(buildParameters);
  configs.push({...buildParameters, plugins: []});
  configs.push({...buildParameters, plugins: [getMockPlugin('2')]});

  // Generate hashes for each config
  const configHashes = configs.map(
    config => rootRelativeCacheKeys(config).relativeConfigHash,
  );

  // We expect them all to have distinct hashes
  const seen = new Map<string, number>();
  for (const [i, configHash] of configHashes.entries()) {
    const seenIndex = seen.get(configHash);
    if (seenIndex != null) {
      // Two configs have the same hash - let Jest print the differences
      expect(configs[seenIndex]).toEqual(configs[i]);
    }
    seen.set(configHash, i);
  }
});

describe('cross-platform cache keys', () => {
  afterEach(() => {
    jest.unmock('node:path');
  });

  test('returns the same cache key for Windows and POSIX path parameters', () => {
    let mockPathModule;
    jest.mock('node:path', () => mockPathModule);

    jest.resetModules();
    mockPathModule = jest.requireActual<PathModule>('path').posix;
    const configHashPosix = require('../rootRelativeCacheKeys').default({
      ...buildParameters,
      rootDir: '/root',
      roots: ['/root/a', '/b/c'],
    }).relativeConfigHash;

    jest.resetModules();
    mockPathModule = jest.requireActual<PathModule>('path').win32;
    const configHashWin32 = require('../rootRelativeCacheKeys').default({
      ...buildParameters,
      rootDir: 'c:\\root',
      roots: ['c:\\root\\a', 'c:\\b\\c'],
    }).relativeConfigHash;
    expect(configHashWin32).toEqual(configHashPosix);
  });
});
