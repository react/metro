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

import type {
  ExportMapWithFallbacks,
  ExportsField,
  ExportsLikeMap,
  FileResolution,
  NormalizedExportsLikeMap,
  ResolutionContext,
} from './types';

import InvalidPackageConfigurationError from './errors/InvalidPackageConfigurationError';
import PackagePathNotExportedError from './errors/PackagePathNotExportedError';
import resolveAsset from './resolveAsset';
import isAssetFile from './utils/isAssetFile';
import {isSubpathDefinedInExportsLike} from './utils/isSubpathDefinedInExportsLike';
import {matchSubpathFromExportsLike} from './utils/matchSubpathFromExportsLike';
import {systemToPosixPath} from './utils/paths';
import path from 'node:path';

/**
 * Resolve a package subpath based on the entry points defined in the package's
 * "exports" field. If there is no match for the given subpath (which may be
 * augmented by resolution of conditional exports for the passed `context`),
 * throws a `PackagePathNotExportedError`.
 *
 * Implements modern package resolution behaviour based on the [Package Entry
 * Points spec](https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points).
 *
 * @throws {InvalidPackageConfigurationError} Raised if configuration specified
 *   by `exportsField` is invalid.
 * @throws {InvalidModuleSpecifierError} Raised if the resolved module specifier
 *   is invalid.
 * @throws {PackagePathNotExportedError} Raised when the requested subpath is
 *   not exported.
 */
export function resolvePackageTargetFromExports(
  context: ResolutionContext,
  /**
   * The path to the containing npm package directory.
   */
  packagePath: string,
  /**
   * The unresolved absolute path to the target module. This will be converted
   * to a package-relative subpath for comparison.
   */
  modulePath: string,
  packageRelativePath: string,
  exportsField: ExportsField,
  platform: string | null,
): FileResolution {
  const createConfigError = (reason: string) => {
    return new InvalidPackageConfigurationError({
      reason,
      packagePath,
    });
  };

  const subpath = getExportsSubpath(packageRelativePath);
  const exportMap = normalizeExportsField(exportsField, createConfigError);

  if (!isSubpathDefinedInExportsLike(exportMap, subpath)) {
    throw new PackagePathNotExportedError(
      `Attempted to import the module "${modulePath}" which is not listed ` +
        `in the "exports" of "${packagePath}" under the requested subpath ` +
        `"${subpath}".`,
    );
  }

  const {target, patternMatch} = matchSubpathFromExportsLike(
    context,
    subpath,
    exportMap,
    platform,
    createConfigError,
  );

  if (target != null) {
    const invalidSegmentInTarget = findInvalidPathSegment(target.slice(2));

    if (invalidSegmentInTarget != null) {
      throw createConfigError(
        `The target for "${subpath}" defined in "exports" is "${target}", ` +
          'however this value is an invalid subpath or subpath pattern ' +
          `because it includes "${invalidSegmentInTarget}".`,
      );
    }

    const filePath = path.join(
      packagePath,
      patternMatch != null ? target.replaceAll('*', patternMatch) : target,
    );

    if (isAssetFile(filePath, context.assetExts)) {
      const assetResult = resolveAsset(context, filePath);

      if (assetResult != null) {
        return assetResult;
      }
    }

    const lookupResult = context.fileSystemLookup(filePath);
    if (lookupResult.exists && lookupResult.type === 'f') {
      return {
        type: 'sourceFile',
        filePath: lookupResult.realPath,
      };
    }

    throw createConfigError(
      `The resolution for "${modulePath}" defined in "exports" is ${filePath}, ` +
        'however this file does not exist.',
    );
  }

  throw new PackagePathNotExportedError(
    `Attempted to import the module "${modulePath}" which is listed in the ` +
      `"exports" of "${packagePath}", however no match was resolved for this ` +
      `request (platform = ${platform ?? 'null'}).`,
  );
}

/**
 * Convert a module path to the package-relative subpath key to attempt for
 * "exports" field lookup.
 */
function getExportsSubpath(packageSubpath: string): string {
  return packageSubpath === '' ? '.' : './' + systemToPosixPath(packageSubpath);
}

/**
 * Maintain a WeakMap cache of the results of normalizedExportsField.
 * Particularly in a large project, many source files depend on the same
 * packages (eg @babel/runtime), and this avoids normalising the same JSON
 * many times. Note that ExportsField is immutable, and the upstream package
 * cache gives us a stable reference.
 *
 * The case where ExportsField is a string (not weakly referencable) has to be
 * excluded, but those are very cheap to process anyway.
 *
 * (Ultimately this should be coupled more closely to the package cache, so that
 * we can clean up immediately rather than on GC.)
 */
type ExcludeString<T> = T extends string ? empty : T;
const _normalizedExportsFields: WeakMap<
  ExcludeString<ExportsField>,
  NormalizedExportsLikeMap,
> = new WeakMap();

/**
 * Normalise an "exports"-like field by parsing string shorthand and conditions
 * shorthand at root, and flattening any legacy Node.js <13.7 array values.
 *
 * See https://nodejs.org/docs/latest-v19.x/api/packages.html#exports-sugar.
 */
function normalizeExportsField(
  exportsField: ExportsField,
  createConfigError: (reason: string) => Error,
): NormalizedExportsLikeMap {
  let rootValue;

  if (typeof exportsField === 'string') {
    return new Map([['.', exportsField]]);
  }

  const cachedValue = _normalizedExportsFields.get(exportsField);
  if (cachedValue) {
    return cachedValue;
  }

  if (Array.isArray(exportsField)) {
    // If an array of strings, use first value with valid specifier (root shorthand)
    if (exportsField.every(value => typeof value === 'string')) {
      // $FlowFixMe[incompatible-type] exportsField is refined to `string[]`
      rootValue = exportsField.find((value: string) => value.startsWith('./'));
    } else {
      // Otherwise, should be a condition map and fallback string (Node.js <13.7)
      rootValue = exportsField[0];
    }
  } else {
    rootValue = exportsField;
  }

  if (rootValue == null || Array.isArray(rootValue)) {
    throw createConfigError(
      'Could not parse non-standard array value at root of "exports" field.',
    );
  }

  if (typeof rootValue === 'string') {
    const result: NormalizedExportsLikeMap = new Map([['.', rootValue]]);
    _normalizedExportsFields.set(exportsField, result);
    return result;
  }

  const firstLevelKeys = Object.keys(rootValue);
  const subpathKeys = firstLevelKeys.filter(key => key.startsWith('.'));
  const importKeys = firstLevelKeys.filter(key => key.startsWith('#'));

  if (importKeys.length + subpathKeys.length === firstLevelKeys.length) {
    const result: NormalizedExportsLikeMap = new Map(
      Object.entries(flattenLegacySubpathValues(rootValue, createConfigError)),
    );
    _normalizedExportsFields.set(exportsField, result);
    return result;
  }

  if (subpathKeys.length !== 0) {
    throw createConfigError(
      'The "exports" field cannot have keys which are both subpaths and ' +
        'condition names at the same level.',
    );
  }

  const result: NormalizedExportsLikeMap = new Map([
    ['.', flattenLegacySubpathValues(rootValue, createConfigError)],
  ]);
  _normalizedExportsFields.set(exportsField, result);
  return result;
}

/**
 * Flatten legacy Node.js <13.7 array subpath values in an exports mapping.
 */
function flattenLegacySubpathValues(
  exportMap: ExportsLikeMap | ExportMapWithFallbacks,
  createConfigError: (reason: string) => Error,
): ExportsLikeMap {
  return Object.entries(exportMap).reduce(
    (result, [subpath, value]) => {
      // We do not support empty or nested arrays (non-standard)
      if (Array.isArray(value)) {
        if (!value.length || Array.isArray(value[0])) {
          throw createConfigError(
            'Could not parse non-standard array value in "exports" field.',
          );
        }
        result[subpath] = value[0];
      } else {
        result[subpath] = value;
      }
      return result;
    },
    {} as {[subpathOrCondition: string]: string | ExportsLikeMap | null},
  );
}

function findInvalidPathSegment(subpath: string): ?string {
  for (const segment of subpath.split(/[\\/]/)) {
    if (
      segment === '' ||
      segment === '.' ||
      segment === '..' ||
      segment === 'node_modules'
    ) {
      return segment;
    }
  }

  return null;
}
