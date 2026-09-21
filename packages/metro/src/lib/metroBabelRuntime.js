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

import * as path from 'node:path';

// Resolved on first use rather than at module load, so that importing this
// module (e.g. transitively from a resolution context) cannot fail in projects
// that never use Metro's own `@babel/runtime`.
let packageJsonPath: ?string = null;
let version: ?string = null;

/**
 * The `package.json` path of the `@babel/runtime` that metro-runtime depends
 * on, which `metro:babel-runtime` resolves to.
 */
export function getMetroBabelRuntimePackageJsonPath(): string {
  if (packageJsonPath == null) {
    const metroRuntimeDir = path.dirname(
      require.resolve('metro-runtime/package.json'),
    );
    packageJsonPath = require.resolve('@babel/runtime/package.json', {
      paths: [metroRuntimeDir],
    });
  }
  return packageJsonPath;
}

/**
 * The installed version of the `@babel/runtime` that `metro:babel-runtime`
 * resolves to.
 */
export function getMetroBabelRuntimeVersion(): string {
  if (version == null) {
    // $FlowFixMe[unsupported-syntax] Dynamic require of a resolved JSON path
    const packageJson = require(getMetroBabelRuntimePackageJsonPath()) as {
      version: string,
      ...
    };
    version = packageJson.version;
  }
  return version;
}
