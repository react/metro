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

const SKIPPED_ON_WINDOWS = [
  // flow-api-translator emits os.EOL line endings in generated comments.
  // Snapshots are generated and verified on posix only.
  'scripts/__tests__/api-snapshots-sync-test.js',

  // TODO: Windows product bugs
  // Stack trace parsing does not support drive letters
  'packages/metro-symbolicate/src/__tests__/symbolicate-test.js',
];

const SKIPPED_PATHS = process.platform === 'win32' ? SKIPPED_ON_WINDOWS : [];
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
