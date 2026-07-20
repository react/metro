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

function mockMultiplePackageJsons(
  packages: Array<[string, {name: string, ...}]>,
) {
  mockReadFileSync.mockImplementation((path, encoding) => {
    if (encoding === 'utf8') {
      for (const [filePath, json] of packages) {
        if (path === filePath) {
          return JSON.stringify(json);
        }
      }
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

const PKG2_ROOT = sep + ['project', 'lib'].join(sep);
const PKG2_PATH = PKG2_ROOT + sep + 'package.json';
const MODULE_C = PKG2_ROOT + sep + 'moduleC.js';

const MODULE_NO_PKG = sep + ['orphan', 'module.js'].join(sep);

describe('PackageCache', () => {
  describe('invalidate', () => {
    test('invalidates a package.json and clears module lookups pointing to it', () => {
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

      // Populate cache
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

    test('invalidates a module file and clears its cached result', () => {
      const closestPackages: ClosestPackageMap = new Map([
        [
          MODULE_A,
          {packageJsonPath: PKG_PATH, packageRelativePath: 'moduleA.js'},
        ],
      ]);
      const cache = createPackageCache(closestPackages);
      mockPackageJson(PKG_PATH, {name: 'test-pkg'});

      // Populate cache
      cache.getPackageForModule(MODULE_A);
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);

      // Module result is cached - no new reads
      cache.getPackageForModule(MODULE_A);
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);

      // Invalidate the module
      cache.invalidate(MODULE_A);

      // Next lookup should re-resolve
      cache.getPackageForModule(MODULE_A);
      // package.json is still cached, so no additional readFileSync
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    });

    test('invalidating a module cleans up the reverse index to prevent memory leaks', () => {
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

      // Populate both modules
      cache.getPackageForModule(MODULE_A);
      cache.getPackageForModule(MODULE_B);

      // Invalidate module A
      cache.invalidate(MODULE_A);

      // Invalidate the package.json - only module B should need re-resolution
      cache.invalidate(PKG_PATH);
      mockPackageJson(PKG_PATH, {name: 'updated-pkg'});

      // Module B should re-resolve to the updated package
      const resultB = cache.getPackageForModule(MODULE_B);
      expect(resultB?.packageJson.name).toBe('updated-pkg');

      // Module A should also re-resolve (it was already invalidated)
      const resultA = cache.getPackageForModule(MODULE_A);
      expect(resultA?.packageJson.name).toBe('updated-pkg');
    });

    test('null-cached results are invalidated when a new package.json is created', () => {
      const closestPackages = new Map<
        string,
        ?{packageJsonPath: string, packageRelativePath: string},
      >([[MODULE_NO_PKG, null]]);
      const cache = createPackageCache(closestPackages);

      // Module resolves to null (no enclosing package.json)
      expect(cache.getPackageForModule(MODULE_NO_PKG)).toBe(null);

      // Cached null is returned
      expect(cache.getPackageForModule(MODULE_NO_PKG)).toBe(null);

      // Simulate creation of a new package.json that now covers this module
      const newPkgRoot = sep + 'orphan';
      const newPkgPath = newPkgRoot + sep + 'package.json';
      closestPackages.set(MODULE_NO_PKG, {
        packageJsonPath: newPkgPath,
        packageRelativePath: 'module.js',
      });
      mockPackageJson(newPkgPath, {name: 'new-pkg'});

      // Invalidate the new package.json (file watcher would trigger this)
      cache.invalidate(newPkgPath);

      // Module should now resolve to the new package, not stale null
      const result = cache.getPackageForModule(MODULE_NO_PKG);
      expect(result?.packageJson.name).toBe('new-pkg');
      expect(result?.packageRelativePath).toBe('module.js');
    });

    test('null-cached results are not invalidated by non-package.json file changes', () => {
      const closestPackages: ClosestPackageMap = new Map<
        string,
        ?{packageJsonPath: string, packageRelativePath: string},
      >([[MODULE_NO_PKG, null]]);
      const cache = createPackageCache(closestPackages);

      // Module resolves to null
      expect(cache.getPackageForModule(MODULE_NO_PKG)).toBe(null);

      // Invalidate an unrelated file (not a package.json)
      cache.invalidate(sep + ['orphan', 'other.js'].join(sep));

      // Null result should still be cached (closestPackages unchanged)
      expect(cache.getPackageForModule(MODULE_NO_PKG)).toBe(null);
    });

    test('invalidating a module with null result cleans up null-tracking set', () => {
      const closestPackages = new Map<
        string,
        ?{packageJsonPath: string, packageRelativePath: string},
      >([
        [MODULE_NO_PKG, null],
        [
          MODULE_A,
          {packageJsonPath: PKG_PATH, packageRelativePath: 'moduleA.js'},
        ],
      ]);
      const cache = createPackageCache(closestPackages);
      mockPackageJson(PKG_PATH, {name: 'test-pkg'});

      // Populate caches
      expect(cache.getPackageForModule(MODULE_NO_PKG)).toBe(null);
      expect(cache.getPackageForModule(MODULE_A)?.packageJson.name).toBe(
        'test-pkg',
      );

      // Invalidate the null-cached module directly
      cache.invalidate(MODULE_NO_PKG);

      // Re-resolve - still null since closestPackages hasn't changed
      expect(cache.getPackageForModule(MODULE_NO_PKG)).toBe(null);
    });

    test('modules across different packages are independently invalidated', () => {
      const closestPackages: ClosestPackageMap = new Map([
        [
          MODULE_A,
          {packageJsonPath: PKG_PATH, packageRelativePath: 'moduleA.js'},
        ],
        [
          MODULE_C,
          {packageJsonPath: PKG2_PATH, packageRelativePath: 'moduleC.js'},
        ],
      ]);
      const cache = createPackageCache(closestPackages);
      mockMultiplePackageJsons([
        [PKG_PATH, {name: 'pkg1'}],
        [PKG2_PATH, {name: 'pkg2'}],
      ]);

      // Populate cache
      expect(cache.getPackageForModule(MODULE_A)?.packageJson.name).toBe(
        'pkg1',
      );
      expect(cache.getPackageForModule(MODULE_C)?.packageJson.name).toBe(
        'pkg2',
      );

      // Invalidate only pkg1's package.json
      cache.invalidate(PKG_PATH);
      mockMultiplePackageJsons([
        [PKG_PATH, {name: 'pkg1-updated'}],
        [PKG2_PATH, {name: 'pkg2'}],
      ]);

      // Module A should re-resolve to updated pkg1
      expect(cache.getPackageForModule(MODULE_A)?.packageJson.name).toBe(
        'pkg1-updated',
      );

      // Module C should still return cached pkg2 (unchanged)
      expect(cache.getPackageForModule(MODULE_C)?.packageJson.name).toBe(
        'pkg2',
      );
    });

    test('package.json deletion invalidates associated modules and null results', () => {
      const closestPackages = new Map<
        string,
        ?{packageJsonPath: string, packageRelativePath: string},
      >([
        [
          MODULE_A,
          {packageJsonPath: PKG_PATH, packageRelativePath: 'moduleA.js'},
        ],
        [MODULE_NO_PKG, null],
      ]);
      const cache = createPackageCache(closestPackages);
      mockPackageJson(PKG_PATH, {name: 'test-pkg'});

      // Populate both caches
      cache.getPackageForModule(MODULE_A);
      expect(cache.getPackageForModule(MODULE_NO_PKG)).toBe(null);

      // Simulate package.json deletion - module A's closest package changes
      closestPackages.set(MODULE_A, null);

      // Invalidate the deleted package.json
      cache.invalidate(PKG_PATH);

      // Module A should re-resolve (now to null)
      expect(cache.getPackageForModule(MODULE_A)).toBe(null);

      // The orphan module's null cache was also cleared (package.json invalidation)
      // so it re-resolves, still to null
      expect(cache.getPackageForModule(MODULE_NO_PKG)).toBe(null);
    });

    test('invalidating the same file twice is safe', () => {
      const closestPackages: ClosestPackageMap = new Map([
        [
          MODULE_A,
          {packageJsonPath: PKG_PATH, packageRelativePath: 'moduleA.js'},
        ],
      ]);
      const cache = createPackageCache(closestPackages);
      mockPackageJson(PKG_PATH, {name: 'test-pkg'});

      cache.getPackageForModule(MODULE_A);

      // Double invalidation should not throw
      cache.invalidate(MODULE_A);
      cache.invalidate(MODULE_A);

      cache.invalidate(PKG_PATH);
      cache.invalidate(PKG_PATH);

      mockPackageJson(PKG_PATH, {name: 'updated-pkg'});
      expect(cache.getPackageForModule(MODULE_A)?.packageJson.name).toBe(
        'updated-pkg',
      );
    });

    test('invalidating a file not in any cache is a no-op', () => {
      const closestPackages: ClosestPackageMap = new Map([
        [
          MODULE_A,
          {packageJsonPath: PKG_PATH, packageRelativePath: 'moduleA.js'},
        ],
      ]);
      const cache = createPackageCache(closestPackages);
      mockPackageJson(PKG_PATH, {name: 'test-pkg'});

      cache.getPackageForModule(MODULE_A);

      // Invalidating an unrelated file should not affect anything
      cache.invalidate(sep + ['unrelated', 'file.js'].join(sep));

      // Cached result is still valid
      const result = cache.getPackageForModule(MODULE_A);
      expect(result?.packageJson.name).toBe('test-pkg');
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    });

    test('multiple null-cached modules are all invalidated when package.json appears', () => {
      const moduleD = sep + ['orphan', 'deep', 'moduleD.js'].join(sep);
      const moduleE = sep + ['orphan', 'deep', 'moduleE.js'].join(sep);
      const closestPackages: ClosestPackageMap = new Map<
        string,
        ?{packageJsonPath: string, packageRelativePath: string},
      >([
        [moduleD, null],
        [moduleE, null],
      ]);
      const cache = createPackageCache(closestPackages);

      // Both resolve to null
      expect(cache.getPackageForModule(moduleD)).toBe(null);
      expect(cache.getPackageForModule(moduleE)).toBe(null);

      // New package.json created
      const newPkgRoot = sep + ['orphan', 'deep'].join(sep);
      const newPkgPath = newPkgRoot + sep + 'package.json';
      closestPackages.set(moduleD, {
        packageJsonPath: newPkgPath,
        packageRelativePath: 'moduleD.js',
      });
      closestPackages.set(moduleE, {
        packageJsonPath: newPkgPath,
        packageRelativePath: 'moduleE.js',
      });
      mockPackageJson(newPkgPath, {name: 'orphan-pkg'});

      cache.invalidate(newPkgPath);

      // Both modules should now resolve
      expect(cache.getPackageForModule(moduleD)?.packageJson.name).toBe(
        'orphan-pkg',
      );
      expect(cache.getPackageForModule(moduleE)?.packageJson.name).toBe(
        'orphan-pkg',
      );
    });
  });
});
