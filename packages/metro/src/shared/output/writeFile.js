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

import fs from 'node:fs';
import throat from 'throat';

const writeFileWithThroat: typeof fs.promises.writeFile = throat(
  128,
  fs.promises.writeFile,
);

export default function writeFile(
  filePath: string,
  data: string | Buffer | Uint8Array,
  encoding?: string,
): Promise<void> {
  return writeFileWithThroat(filePath, data, encoding);
}
