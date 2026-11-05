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

import {sep} from 'node:path';

const {PackageCache} = require('../PackageCache');

const mockReadFileSync = jest.fn();
jest.mock('node:fs', () => ({
  readFileSync: (...args) => mockReadFileSync(...args),
}));

type ClosestPackageMap = Map<
  string,
  ?{packageJsonPath: string, packageRelativePath: string},
>;

function createPackageCache(closestPackageByModule: ClosestPackageMap) {
  return new PackageCache({
    getClosestPackage: absoluteFilePath =>
      closestPackageByModule.get(absoluteFilePath) ?? null,
  });
}

function mockPackageJson(filePath: string, json: {name: string, ...}) {
  mockReadFileSync.mockImplementation((path, encoding) => {
    if (path === filePath && encoding === 'utf8') {
      return JSON.stringify(json);
    }
    throw new Error(`ENOENT: no such file: ${String(path)}`);
  });
}

beforeEach(() => {
  mockReadFileSync.mockReset();
});

const PKG_ROOT = sep + ['project', 'src'].join(sep);
const PKG_PATH = PKG_ROOT + sep + 'package.json';
const MODULE_A = PKG_ROOT + sep + 'moduleA.js';
const MODULE_B = PKG_ROOT + sep + 'moduleB.js';

describe('PackageCache', () => {
  test('reads each package.json once, however many modules it contains', () => {
    const closestPackages: ClosestPackageMap = new Map([
      [
        MODULE_A,
        {packageJsonPath: PKG_PATH, packageRelativePath: 'moduleA.js'},
      ],
      [
        MODULE_B,
        {packageJsonPath: PKG_PATH, packageRelativePath: 'moduleB.js'},
      ],
    ]);
    const cache = createPackageCache(closestPackages);
    mockPackageJson(PKG_PATH, {name: 'test-pkg'});

    expect(cache.getPackageForModule(MODULE_A)?.packageRelativePath).toBe(
      'moduleA.js',
    );
    expect(cache.getPackageForModule(MODULE_B)?.packageRelativePath).toBe(
      'moduleB.js',
    );
    cache.getPackageForModule(MODULE_A);

    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  });

  test('re-reads an invalidated package.json, for every module in the package', () => {
    const closestPackages: ClosestPackageMap = new Map([
      [
        MODULE_A,
        {packageJsonPath: PKG_PATH, packageRelativePath: 'moduleA.js'},
      ],
      [
        MODULE_B,
        {packageJsonPath: PKG_PATH, packageRelativePath: 'moduleB.js'},
      ],
    ]);
    const cache = createPackageCache(closestPackages);
    mockPackageJson(PKG_PATH, {name: 'test-pkg'});

    // Read and parse the package.json
    const resultA1 = cache.getPackageForModule(MODULE_A);
    const resultB1 = cache.getPackageForModule(MODULE_B);
    expect(resultA1?.packageJson.name).toBe('test-pkg');
    expect(resultB1?.packageJson.name).toBe('test-pkg');

    // Invalidate the package.json
    cache.invalidate(PKG_PATH);

    // Update the mock to return new content
    mockPackageJson(PKG_PATH, {name: 'updated-pkg'});

    // Both modules should now return the updated package
    const resultA2 = cache.getPackageForModule(MODULE_A);
    const resultB2 = cache.getPackageForModule(MODULE_B);
    expect(resultA2?.packageJson.name).toBe('updated-pkg');
    expect(resultB2?.packageJson.name).toBe('updated-pkg');
  });
});

describe('readPackageJson option', () => {
  const INJECTED_ROOT = sep + ['project', 'injected'].join(sep);
  const INJECTED_PKG_PATH = INJECTED_ROOT + sep + 'package.json';
  const INJECTED_MODULE = INJECTED_ROOT + sep + 'index.js';

  test('is used in place of reading the filesystem', () => {
    const readPackageJson = jest.fn<[string], {name: string}>(() => ({
      name: 'in-memory-pkg',
    }));
    const cache = new PackageCache({
      getClosestPackage: () => ({
        packageJsonPath: INJECTED_PKG_PATH,
        packageRelativePath: 'index.js',
      }),
      readPackageJson,
    });

    expect(cache.getPackageForModule(INJECTED_MODULE)?.packageJson.name).toBe(
      'in-memory-pkg',
    );
    expect(readPackageJson).toHaveBeenCalledWith(INJECTED_PKG_PATH);
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  test('results are cached per package.json path', () => {
    const readPackageJson = jest.fn<[string], {name: string}>(() => ({
      name: 'in-memory-pkg',
    }));
    const cache = new PackageCache({
      getClosestPackage: () => ({
        packageJsonPath: INJECTED_PKG_PATH,
        packageRelativePath: 'index.js',
      }),
      readPackageJson,
    });

    cache.getPackage(INJECTED_PKG_PATH);
    cache.getPackage(INJECTED_PKG_PATH);

    expect(readPackageJson).toHaveBeenCalledTimes(1);
  });
});
