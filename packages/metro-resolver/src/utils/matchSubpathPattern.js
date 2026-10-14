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

/**
 * If a subpath pattern expands to the passed subpath, return the subpath match
 * (value to substitute for '*'). Otherwise, return `null`.
 *
 * See https://nodejs.org/docs/latest-v19.x/api/packages.html#subpath-patterns.
 */
export function matchSubpathPattern(
  subpathPattern: string,
  subpath: string,
): string | null {
  const wildcardIndex = subpathPattern.indexOf('*');
  if (wildcardIndex === -1 || subpathPattern.indexOf('*', wildcardIndex + 1) !== -1) {
    return null;
  }
  const patternBase = subpathPattern.substring(0, wildcardIndex);
  const patternTrailer = subpathPattern.substring(wildcardIndex + 1);

  if (
    subpath.startsWith(patternBase) &&
    (patternTrailer.length === 0 ||
      (subpath.endsWith(patternTrailer) &&
        subpath.length >= subpathPattern.length))
  ) {
    return subpath.substring(
      patternBase.length,
      subpath.length - patternTrailer.length,
    );
  }

  return null;
}
