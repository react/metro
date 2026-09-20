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

type MetroRequire = {
  (number): unknown,
  importAll: <T>(number) => T,
  ...
};

declare var require: MetroRequire;

// When using `unstable_getAsyncDependencyPath`, path values may be any
// JSON-serialisable value. By default, they are string URLs - otherwise a
// custom `__loadBundleAsync` implementation must be provided.
type ReadonlyJsonData =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<ReadonlyJsonData>
  | Readonly<{[string]: ReadonlyJsonData}>;

type DependencyMapPaths = ?Readonly<{
  [moduleID: number | string]: ReadonlyJsonData,
}>;

type AsyncRequire = {
  <T>(
    moduleID: number,
    paths: DependencyMapPaths,
    moduleName?: string,
  ): Promise<T>,
  unstable_importMaybeSync<T>(
    moduleID: number,
    paths: DependencyMapPaths,
  ): Promise<T> | T,
  prefetch(
    moduleID: number,
    paths: DependencyMapPaths,
    moduleName?: string,
  ): void,
  ...
};

declare var __METRO_GLOBAL_PREFIX__: string;

function maybeLoadBundle(
  moduleID: number,
  paths: DependencyMapPaths,
): void | Promise<void> {
  const loadBundle: (bundlePath: unknown) => Promise<void> =
    global[`${__METRO_GLOBAL_PREFIX__}__loadBundleAsync`];

  if (loadBundle != null) {
    const stringModuleID = String(moduleID);
    if (paths != null) {
      const bundlePath = paths[stringModuleID];
      if (bundlePath != null) {
        // NOTE: Errors will be swallowed by asyncRequire.prefetch
        return loadBundle(bundlePath);
      }
    }
  }

  return undefined;
}

function asyncRequireImpl<T>(
  moduleID: number,
  paths: DependencyMapPaths,
): Promise<T> | T {
  const maybeLoadBundlePromise = maybeLoadBundle(moduleID, paths);
  const importAll = () => require.importAll<T>(moduleID);

  if (maybeLoadBundlePromise != null) {
    return maybeLoadBundlePromise.then(importAll);
  }

  return importAll();
}

async function asyncRequire<T>(
  moduleID: number,
  paths: DependencyMapPaths,
  moduleName?: string, // unused
): Promise<T> {
  return asyncRequireImpl<T>(moduleID, paths);
}

// Synchronous version of asyncRequire, which can still return a promise
// if the module is split.
asyncRequire.unstable_importMaybeSync = function unstable_importMaybeSync<T>(
  moduleID: number,
  paths: DependencyMapPaths,
): Promise<T> | T {
  return asyncRequireImpl(moduleID, paths);
};

asyncRequire.prefetch = function (
  moduleID: number,
  paths: DependencyMapPaths,
  moduleName?: string, // unused
): void {
  maybeLoadBundle(moduleID, paths)?.then(
    () => {},
    () => {},
  );
};

// The explicit type carries the statics through to generated type definitions.
module.exports = asyncRequire as AsyncRequire;
