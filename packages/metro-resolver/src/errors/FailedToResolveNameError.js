/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

export default class FailedToResolveNameError extends Error {
  dirPaths: ReadonlyArray<string>;
  extraPaths: ReadonlyArray<string>;

  constructor(
    dirPaths: ReadonlyArray<string>,
    extraPaths: ReadonlyArray<string>,
  ) {
    const displayDirPaths = dirPaths.concat(extraPaths);
    const hint = displayDirPaths.length ? ' or in these directories:' : '';
    super(
      `Module does not exist in the Haste module map${hint}\n` +
        displayDirPaths.map(dirPath => `  ${dirPath}`).join('\n') +
        '\n',
    );

    this.dirPaths = dirPaths;
    this.extraPaths = extraPaths;
  }
}
