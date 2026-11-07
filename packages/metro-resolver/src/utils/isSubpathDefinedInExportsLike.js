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

/**
 * Identifies whether the given subpath is defined in the given "exports"-like
 * mapping. Does not reduce exports conditions (therefore does not identify
 * whether the subpath is mapped to a value).
 */
import type {NormalizedExportsLikeMap} from '../types';

import {matchSubpathPattern} from './matchSubpathPattern';

export function isSubpathDefinedInExportsLike(
  exportsLikeMap: NormalizedExportsLikeMap,
  subpath: string,
): boolean {
  if (exportsLikeMap.has(subpath)) {
    return true;
  }

  // Attempt to match after expanding any subpath pattern keys
  for (const key of exportsLikeMap.keys()) {
    if (
      key.split('*').length === 2 &&
      matchSubpathPattern(key, subpath) != null
    ) {
      return true;
    }
  }

  return false;
}
