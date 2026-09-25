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
import {dirname} from 'node:path';

type GetClosestPackageFn = (absoluteFilePath: string) => ?{
  packageJsonPath: string,
  packageRelativePath: string,
};

type ReadPackageJsonFn = (absolutePackageJsonPath: string) => PackageJson;

const readPackageJsonSync: ReadPackageJsonFn = absolutePackageJsonPath =>
  JSON.parse(readFileSync(absolutePackageJsonPath, 'utf8'));

type PackageForModule = Readonly<{
  packageJson: PackageJson,
  rootPath: string,
  packageRelativePath: string,
}>;

export class PackageCache {
  #getClosestPackage: GetClosestPackageFn;
  #readPackageJson: ReadPackageJsonFn;
  #packageCache: Map<
    string,
    {
      rootPath: string,
      packageJson: PackageJson,
    },
  >;

  constructor(options: {
    getClosestPackage: GetClosestPackageFn,
    readPackageJson?: ReadPackageJsonFn,
    ...
  }) {
    this.#getClosestPackage = options.getClosestPackage;
    this.#readPackageJson = options.readPackageJson ?? readPackageJsonSync;
    this.#packageCache = new Map();
  }

  getPackage(filePath: string): Readonly<{
    rootPath: string,
    packageJson: PackageJson,
  }> {
    let cached = this.#packageCache.get(filePath);
    if (cached == null) {
      cached = {
        rootPath: dirname(filePath),
        packageJson: this.#readPackageJson(filePath),
      };
      this.#packageCache.set(filePath, cached);
    }
    return cached;
  }

  /**
   * The closest package is looked up on every call rather than remembered per
   * module path. Only the parsed contents of each `package.json` are cached.
   */
  getPackageForModule(absoluteModulePath: string): ?PackageForModule {
    const closest = this.#getClosestPackage(absoluteModulePath);
    if (closest == null) {
      return null;
    }
    const pkg = this.getPackage(closest.packageJsonPath);
    return {
      packageJson: pkg.packageJson,
      packageRelativePath: closest.packageRelativePath,
      rootPath: pkg.rootPath,
    };
  }

  invalidate(filePath: string) {
    this.#packageCache.delete(filePath);
  }
}
