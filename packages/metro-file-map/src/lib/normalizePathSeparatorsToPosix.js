/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 */

import * as path from 'node:path';

let normalizePathSeparatorsToPosix;
if (path.sep === '/') {
  normalizePathSeparatorsToPosix = (filePath: string): string => filePath;
} else {
  normalizePathSeparatorsToPosix = (filePath: string): string =>
    filePath.replace(/\\/g, '/');
}

export default normalizePathSeparatorsToPosix as (filePath: string) => string;
