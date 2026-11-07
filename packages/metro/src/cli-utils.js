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

import fs from 'node:fs';

export const watchFile = async function (
  filename: string,
  callback: () => unknown,
): Promise<void> {
  fs.watchFile(filename, () => {
    callback();
  });

  await callback();
};

export const makeAsyncCommand =
  <T>(command: (argv: T) => Promise<void>): ((argv: T) => void) =>
  (argv: T) => {
    Promise.resolve(command(argv)).catch(error => {
      console.error(error.stack);
      process.exitCode = 1;
    });
  };
