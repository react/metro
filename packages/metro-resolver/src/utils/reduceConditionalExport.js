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

import type {ExportsLikeMap} from '../types';

import InvalidPackageConfigurationError from '../errors/InvalidPackageConfigurationError';

const NO_MATCH: symbol = Symbol('no-match');

/**
 * Reduce an "exports"-like subpath value after asserting the passed
 * `conditionNames` in any nested conditions.
 *
 * Returns `NO_MATCH` in the case that none of the asserted `conditionNames`
 * are matched.
 *
 * See https://nodejs.org/docs/latest-v19.x/api/packages.html#conditional-exports.
 */
export function reduceConditionalExport(
  subpathValue: Values<ExportsLikeMap>,
  conditionNames: ReadonlySet<string>,
  createConfigError: (reason: string) => Error,
  validateTarget?: (target: string) => void,
): string | null | symbol {
  if (subpathValue == null) {
    return null;
  }
  if (typeof subpathValue === 'string') {
    if (!subpathValue.startsWith('./')) {
      throw createConfigError(
        'One or more mappings for subpaths defined in "exports" are invalid. ' +
          'All values must begin with "./".',
      );
    }
    validateTarget?.(subpathValue);
    return subpathValue;
  }
  if (typeof subpathValue !== 'object') {
    throw createConfigError(
      'A conditional target must be a string, an object, or null.',
    );
  }
  if (Array.isArray(subpathValue)) {
    if (subpathValue.length === 0) {
      return null;
    }
    let lastResult: Error | null | symbol = NO_MATCH;
    for (const target of subpathValue) {
      let resolved;
      try {
        resolved = reduceConditionalExport(
          target,
          conditionNames,
          createConfigError,
          validateTarget,
        );
      } catch (error) {
        if (!(error instanceof InvalidPackageConfigurationError)) {
          throw error;
        }
        lastResult = error;
        continue;
      }
      if (resolved === NO_MATCH) {
        continue;
      }
      if (resolved == null) {
        lastResult = null;
        continue;
      }
      return resolved;
    }
    if (lastResult instanceof Error) {
      throw lastResult;
    }
    return lastResult;
  }

  for (const conditionName in subpathValue) {
    if (conditionNames.has(conditionName)) {
      const resolved = reduceConditionalExport(
        subpathValue[conditionName],
        conditionNames,
        createConfigError,
        validateTarget,
      );
      // Null excludes this entry; only an unmatched condition falls through.
      if (resolved !== NO_MATCH) {
        return resolved;
      }
    }
  }

  return NO_MATCH;
}
