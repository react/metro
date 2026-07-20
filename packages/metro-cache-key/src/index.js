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

import crypto from 'node:crypto';
import fs from 'node:fs';

export function getCacheKey(files: ReadonlyArray<string>): string {
  return files
    .reduce(
      (hash, file) => hash.update('\0', 'utf8').update(fs.readFileSync(file)),
      crypto.createHash('md5'),
    )
    .digest('hex');
}
