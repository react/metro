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

const path = require('node:path');

// TODO: fix on windows
const BROKEN_ON_WINDOWS = [
  // path mismatches
  'packages/metro/src/__tests__/HmrServer-test.js',
  'packages/metro/src/DeltaBundler/__tests__/buildSubgraph-test.js',
  'packages/metro/src/DeltaBundler/__tests__/Graph-test.js',
  'packages/metro/src/DeltaBundler/Serializers/helpers/__tests__/js-test.js',
  'packages/metro/src/node-haste/lib/__tests__/AssetPaths-test.js',
  'packages/metro/src/Server/__tests__/Server-test.js',
  'packages/metro-config/src/__tests__/loadConfig-test.js',
  'packages/metro-symbolicate/src/__tests__/symbolicate-test.js',
  'packages/metro-file-map/src/__tests__/index-test.js',
  'packages/metro-file-map/src/crawlers/__tests__/node-test.js',

  // resolveModulePath failed
  'packages/metro-resolver/src/__tests__/assets-test.js',
  'packages/metro-resolver/src/__tests__/platform-extensions-test.js',
  'packages/metro-resolver/src/__tests__/symlinks-test.js',

  // const {_cwd} = this; resolution issue in `metro-memory-fs/src/index.js:1294:15`
  'packages/metro/src/__tests__/Assets-test.js',
  'packages/metro/src/DeltaBundler/__tests__/resolver-test.js',
  'packages/buck-worker-tool/src/__tests__/worker-test.js',
  'packages/metro-transform-worker/src/__tests__/index-test.js',
  'packages/metro-cache/src/stores/__tests__/AutoCleanFileStore-test.js',
  'packages/metro-cache/src/stores/__tests__/FileStore-test.js',

  // endless loading
  'packages/metro-resolver/src/__tests__/browser-spec-test.js',
  'packages/metro-resolver/src/__tests__/package-exports-test.js',
  'packages/metro-resolver/src/__tests__/index-test.js',

  // flow-api-translator line ending issues
  'scripts/__tests__/ts-defs-sync-test.js',

  // unclear issue
  'packages/metro/src/DeltaBundler/__tests__/DeltaCalculator-test.js',
  'packages/metro-file-map/src/crawlers/__tests__/integration-test.js',
];

const SKIPPED_PATHS = process.platform === 'win32' ? BROKEN_ON_WINDOWS : [];
if (process.env.NIGHTLY_TESTS_NO_LOCKFILE != null) {
  // Skip: only support babel types common to all supported babel versions
  SKIPPED_PATHS.push('scripts/__tests__/babel-lib-defs-test.js');
}

module.exports = (
  absoluteTestPaths /*: ReadonlyArray<string> */,
) /*: {filtered: Array<{test: string}>}*/ => {
  const skippedPathsSet = new Set(
    SKIPPED_PATHS.map(relativePath =>
      path.resolve(__dirname, '..', relativePath),
    ),
  );

  const allowedPaths =
    skippedPathsSet.size > 0
      ? absoluteTestPaths.filter(testPath => !skippedPathsSet.has(testPath))
      : absoluteTestPaths;

  return {
    filtered: allowedPaths.map(allowedPath => ({test: allowedPath})),
  };
};
