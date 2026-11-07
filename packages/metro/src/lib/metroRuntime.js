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

// Resolved on first use rather than at module load, for consistency with
// `metroBabelRuntime`.
let packageJsonPath: ?string = null;

/**
 * The `package.json` path of the metro-runtime that Metro depends on, which
 * `metro:runtime` resolves into.
 */
export function getMetroRuntimePackageJsonPath(): string {
  if (packageJsonPath == null) {
    packageJsonPath = require.resolve('metro-runtime/package.json');
  }
  return packageJsonPath;
}
