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
 * Find a segment that Node.js PACKAGE_TARGET_RESOLVE rejects in the part of a
 * target following "./".
 */
export function findInvalidPathSegment(subpath: string): ?string {
  for (const segment of subpath.split(/[\\/]/)) {
    if (segment === '.' || segment === '..' || segment === 'node_modules') {
      return segment;
    }
  }

  return null;
}

/**
 * Whether the part of a subpath matched by a pattern includes a segment that
 * Node.js PACKAGE_TARGET_RESOLVE rejects. Node.js allows empty segments here.
 */
export function hasInvalidPatternMatchSegment(patternMatch: string): boolean {
  return /(?:^|[\\/])(?:\.\.?|node_modules)(?:[\\/]|$)/i.test(patternMatch);
}
