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

import type {AssetResolution, ResolutionContext} from './types';

import path from 'node:path';

/**
 * Resolve a file path as an asset. Returns the set of files found after
 * expanding asset resolutions (e.g. `icon@2x.png`). Users may override this
 * behaviour via `context.resolveAsset`.
 */
export default function resolveAsset(
  context: ResolutionContext,
  filePath: string,
): AssetResolution | null {
  const dirPath = path.dirname(filePath);
  const extension = path.extname(filePath);
  const basename = path.basename(filePath, extension);

  try {
    if (!/@\d+(?:\.\d+)?x$/.test(basename)) {
      const assets = context.resolveAsset(dirPath, basename, extension);
      if (assets != null) {
        return {
          type: 'assetFiles',
          filePaths: assets,
        };
      }
    }
  } catch (e) {}

  return null;
}
