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

let normalizePathSeparatorsToSystem;
if (path.sep === '/') {
  normalizePathSeparatorsToSystem = (filePath: string): string => filePath;
} else {
  normalizePathSeparatorsToSystem = (filePath: string): string =>
    filePath.replace(/\//g, path.sep);
}

export default normalizePathSeparatorsToSystem as (filePath: string) => string;
