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

import writeFile from '../writeFile';

export default function writeSourcemap(
  fileName: string,
  contents: string,
  log: (...args: Array<string>) => void,
): Promise<unknown> {
  if (!fileName) {
    return Promise.resolve();
  }
  log('Writing sourcemap output to:', fileName);
  const writeMap = writeFile(fileName, contents);
  // $FlowFixMe[unused-promise]
  writeMap.then(() => log('Done writing sourcemap output'));
  return writeMap;
}
