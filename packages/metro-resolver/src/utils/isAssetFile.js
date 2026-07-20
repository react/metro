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

import path from 'node:path';

/**
 * Determine if a file path should be considered an asset file based on the
 * given `assetExts`.
 */
export default function isAssetFile(
  filePath: string,
  assetExts: ReadonlySet<string>,
): boolean {
  const baseName = path.basename(filePath);

  for (let i = baseName.length - 1; i >= 0; i--) {
    if (baseName[i] === '.') {
      const ext = baseName.slice(i + 1);

      if (assetExts.has(ext)) {
        return true;
      }
    }
  }

  return false;
}
