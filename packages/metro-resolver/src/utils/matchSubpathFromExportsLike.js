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

import type {NormalizedExportsLikeMap, ResolutionContext} from '../types';

import {matchSubpathPattern} from './matchSubpathPattern';
import {reduceExportsLikeMap} from './reduceExportsLikeMap';

/**
 * Get the mapped replacement for the given subpath.
 *
 * Implements modern package resolution behaviour based on the [Package Entry
 * Points spec](https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points).
 */
export function matchSubpathFromExportsLike(
  context: ResolutionContext,
  /**
   * The package-relative subpath (beginning with '.') to match against either
   * an exact subpath key or subpath pattern key in "exports".
   */
  subpath: string,
  exportsLikeMap: NormalizedExportsLikeMap,
  platform: string | null,
  createConfigError: (reason: string) => Error,
): Readonly<{
  target: string | null,
  patternMatch: string | null,
}> {
  const conditionNames = new Set([
    'default',
    context.isESMImport === true ? 'import' : 'require',
    ...context.unstable_conditionNames,
    ...(platform != null
      ? (context.unstable_conditionsByPlatform[platform] ?? [])
      : []),
  ]);

  const exportsLikeMapAfterConditions = reduceExportsLikeMap(
    exportsLikeMap,
    conditionNames,
    createConfigError,
  );

  let target = null;
  let patternMatch = null;

  // Attempt to match subpath pattern keys only if there is no exact key. An
  // exact key takes precedence even when its target is null. See step 2 of
  // `PACKAGE_IMPORTS_EXPORTS_RESOLVE` in:
  // https://nodejs.org/api/esm.html#resolution-algorithm-specification
  if (exportsLikeMapAfterConditions.has(subpath)) {
    target = exportsLikeMapAfterConditions.get(subpath);
  } else {
    // Gather keys which are subpath patterns in descending order of specificity
    // For ordering, see `PATTERN_KEY_COMPARE` in:
    // https://nodejs.org/api/esm.html#resolution-algorithm-specification
    const expansionKeys = [...exportsLikeMapAfterConditions.keys()]
      .map(key => ({key, baseLength: key.indexOf('*')}))
      .filter(data => data.baseLength !== -1)
      .sort((a, b) => {
        if (a.baseLength === b.baseLength) {
          // If wildcards are in equal positions, the longer key is more
          // specific
          return b.key.length - a.key.length;
        }
        return b.baseLength - a.baseLength;
      });

    for (const {key} of expansionKeys) {
      const value = exportsLikeMapAfterConditions.get(key);

      patternMatch = matchSubpathPattern(key, subpath);

      if (patternMatch != null) {
        target = value;
        break;
      }
    }
  }

  return {target: target ?? null, patternMatch};
}
