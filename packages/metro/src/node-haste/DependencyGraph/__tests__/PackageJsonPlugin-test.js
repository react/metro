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

import type {FileDataResult, Observations} from 'metro-file-map';

import PackageJsonPlugin from '../PackageJsonPlugin';

const PackageJsonWorker = require('../packageJsonWorker');

describe('PackageJsonPlugin', () => {
  let fileMapEntries: Map<
    string,
    FileDataResult<?{readonly name: string} | SyntaxError>,
  >;
  let getOrComputeFileData: JestMockFn<
    [string, ?Observations],
    FileDataResult<?{readonly name: string} | SyntaxError>,
  >;
  let plugin: PackageJsonPlugin;

  const setData = (filePath: string, data: ?{readonly name: string}) =>
    fileMapEntries.set(filePath, {
      exists: true,
      type: 'f',
      realPath: filePath,
      data,
    });

  beforeEach(async () => {
    fileMapEntries = new Map();
    getOrComputeFileData = jest.fn(
      mixedPath => fileMapEntries.get(mixedPath) ?? {exists: false},
    );
    plugin = new PackageJsonPlugin();
    await plugin.initialize({
      files: {
        fileIterator: () => [],
        lookup: () => ({exists: false}),
      },
      pluginState: null,
      getOrComputeFileData,
    });
  });

  test('is lazy, with a portable cache key', () => {
    expect(plugin.getWorker().lazy).toBe(true);
    // The cache key must not depend on where Metro or the project lives
    expect(plugin.getCacheKey()).not.toMatch(/[\\/]/);
  });

  test('returns the stored object, and asks the file map each time', () => {
    const stored = {name: 'stored'};
    setData('/project/package.json', stored);
    const observations = {
      existence: new Set<string>(),
      content: new Set<string>(),
    };
    expect(plugin.readPackageJson('/project/package.json', observations)).toBe(
      stored,
    );
    expect(plugin.readPackageJson('/project/package.json', observations)).toBe(
      stored,
    );
    expect(getOrComputeFileData.mock.calls).toEqual([
      ['/project/package.json', observations],
      ['/project/package.json', observations],
    ]);
  });

  test('throws the stored error for a manifest that is not valid JSON', () => {
    fileMapEntries.set('/project/package.json', {
      exists: true,
      type: 'f',
      realPath: '/project/package.json',
      data: new SyntaxError('Unexpected end of JSON input'),
    });
    expect(() => plugin.readPackageJson('/project/package.json')).toThrow(
      new SyntaxError('Unexpected end of JSON input'),
    );
  });

  test('throws for a path that is not a regular file in the file map', () => {
    fileMapEntries.set('/project/dir/package.json', {exists: true, type: 'd'});
    expect(() =>
      plugin.readPackageJson('/project/missing/package.json'),
    ).toThrow(
      '/project/missing/package.json is not a regular file in the file map',
    );
    expect(() => plugin.readPackageJson('/project/dir/package.json')).toThrow(
      '/project/dir/package.json is not a regular file in the file map',
    );
  });
});

describe('packageJsonWorker', () => {
  test('returns the parsed contents of the file', () => {
    const worker = new PackageJsonWorker();
    expect(
      worker.processFile(
        {filePath: '/project/package.json'},
        {getContent: () => Buffer.from('{"name": "café"}\n')},
      ),
    ).toEqual({name: 'café'});
  });

  test('returns the SyntaxError for invalid JSON', () => {
    const worker = new PackageJsonWorker();
    const result = worker.processFile(
      {filePath: '/project/package.json'},
      {getContent: () => Buffer.from('{"name": ')},
    );
    let expected;
    try {
      JSON.parse('{"name": ');
    } catch (error) {
      expected = error;
    }
    expect(result).toBeInstanceOf(SyntaxError);
    expect(result).toEqual(expected);
  });
});
