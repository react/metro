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

import type {PackageJson} from 'metro-resolver/private/types';

import {readFileSync} from 'node:fs';
import {dirname, sep} from 'node:path';

type GetClosestPackageFn = (absoluteFilePath: string) => ?{
  packageJsonPath: string,
  packageRelativePath: string,
};

type PackageForModule = Readonly<{
  packageJson: PackageJson,
  rootPath: string,
  packageRelativePath: string,
}>;

export class PackageCache {
  #getClosestPackage: GetClosestPackageFn;
  #packageCache: Map<
    string,
    {
      rootPath: string,
      packageJson: PackageJson,
    },
  >;
  // Single cache: module path → pre-built result object, or null (no allocation on hit)
  #resultByModulePath: Map<string, PackageForModule | null>;
  // Reverse index for invalidation: package.json path → set of module paths
  #modulePathsByPackagePath: Map<string, Set<string>>;
  // Module paths that resolved to no package.json (null), for invalidation
  #modulePathsWithNoPackage: Set<string>;

  constructor(options: {getClosestPackage: GetClosestPackageFn, ...}) {
    this.#getClosestPackage = options.getClosestPackage;
    this.#packageCache = new Map();
    this.#resultByModulePath = new Map();
    this.#modulePathsByPackagePath = new Map();
    this.#modulePathsWithNoPackage = new Set();
  }

  getPackage(filePath: string): Readonly<{
    rootPath: string,
    packageJson: PackageJson,
  }> {
    let cached = this.#packageCache.get(filePath);
    if (cached == null) {
      cached = {
        rootPath: dirname(filePath),
        packageJson: JSON.parse(readFileSync(filePath, 'utf8')),
      };
      this.#packageCache.set(filePath, cached);
    }
    return cached;
  }

  getPackageForModule(absoluteModulePath: string): ?PackageForModule {
    const cached = this.#resultByModulePath.get(absoluteModulePath);

    // Distinguish between `null` (positively no closest package) and
    // `undefined` (no cached result yet)
    // eslint-disable-next-line lint/strictly-null
    if (cached !== undefined) {
      return cached;
    }

    const closest = this.#getClosestPackage(absoluteModulePath);
    if (closest == null) {
      this.#resultByModulePath.set(absoluteModulePath, null);
      this.#modulePathsWithNoPackage.add(absoluteModulePath);
      return null;
    }

    const packagePath = closest.packageJsonPath;

    // Track module→package for invalidation
    let modulePaths = this.#modulePathsByPackagePath.get(packagePath);
    if (modulePaths == null) {
      modulePaths = new Set();
      this.#modulePathsByPackagePath.set(packagePath, modulePaths);
    }
    modulePaths.add(absoluteModulePath);

    const pkg = this.getPackage(packagePath);
    if (pkg == null) {
      return null;
    }

    // Cache the pre-built result object — no allocation on future hits
    const result: PackageForModule = {
      packageJson: pkg.packageJson,
      packageRelativePath: closest.packageRelativePath,
      rootPath: pkg.rootPath,
    };
    this.#resultByModulePath.set(absoluteModulePath, result);
    return result;
  }

  invalidate(filePath: string) {
    this.#packageCache.delete(filePath);

    // Clean up any cached result for this module path (including null).
    // Derive the package.json path from the cached result to clean up the
    // reverse index.
    const cachedResult = this.#resultByModulePath.get(filePath);
    this.#resultByModulePath.delete(filePath);
    this.#modulePathsWithNoPackage.delete(filePath);

    if (cachedResult != null) {
      const packagePath = cachedResult.rootPath + sep + 'package.json';
      const modules = this.#modulePathsByPackagePath.get(packagePath);
      if (modules != null) {
        modules.delete(filePath);
        if (modules.size === 0) {
          this.#modulePathsByPackagePath.delete(packagePath);
        }
      }
    }

    // If filePath is a package.json, invalidate all module lookups pointing to it
    const modulePaths = this.#modulePathsByPackagePath.get(filePath);
    if (modulePaths != null) {
      for (const modulePath of modulePaths) {
        this.#resultByModulePath.delete(modulePath);
      }
      this.#modulePathsByPackagePath.delete(filePath);
    }

    // If a package.json was created, modified, or deleted, invalidate all
    // null-cached module results, since modules that previously had no
    // enclosing package.json may now resolve to this one.
    if (filePath.endsWith(sep + 'package.json')) {
      for (const modulePath of this.#modulePathsWithNoPackage) {
        this.#resultByModulePath.delete(modulePath);
      }
      this.#modulePathsWithNoPackage.clear();
    }
  }
}
