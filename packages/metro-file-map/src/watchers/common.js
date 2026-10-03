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
 * Originally vendored from
 * https://github.com/amasad/sane/blob/64ff3a870c42e84f744086884bf55a4f9c22d376/src/common.js
 */

import type {ChangeEventMetadata, WatcherFileFilter} from '../flow-types';
import type {Stats} from 'node:fs';

import path from 'node:path';

/**
 * Constants
 */
export const DELETE_EVENT = 'delete';
export const TOUCH_EVENT = 'touch';
export const RECRAWL_EVENT = 'recrawl';
export const ALL_EVENT = 'all';

export type WatcherOptions = Readonly<{
  fileFilter: ?WatcherFileFilter,
  ignored: ?RegExp,
  watchmanDeferStates: ReadonlyArray<string>,
  watchman?: unknown,
  watchmanPath?: string,
}>;

/**
 * Whether a watcher should report a change at the given relative path. Only
 * regular files are checked against `fileFilter`, and a null filter includes
 * every file.
 */
export function includedByFilter(
  type: ?('f' | 'l' | 'd'),
  fileFilter: ?WatcherFileFilter,
  relativePath: string,
): boolean {
  if (fileFilter == null || type !== 'f') {
    return true;
  }
  const basename = path.basename(relativePath);
  return (
    fileFilter.extensions.has(path.extname(basename).slice(1)) ||
    fileFilter.fileNames.has(basename) ||
    fileFilter.fileNamePrefixes.some(prefix => basename.startsWith(prefix))
  );
}

/**
 * Whether the given filePath matches the given RegExp, after converting
 * (on Windows only) system separators to posix separators.
 *
 * Conversion to posix is for backwards compatibility with the previous
 * anymatch matcher, which normalises all inputs[1]. This may not be consistent
 * with other parts of metro-file-map.
 *
 * [1]: https://github.com/micromatch/anymatch/blob/3.1.1/index.js#L50
 */
export const posixPathMatchesPattern: (
  pattern: RegExp,
  filePath: string,
) => boolean =
  path.sep === '/'
    ? (pattern, filePath) => pattern.test(filePath)
    : (pattern, filePath) => pattern.test(filePath.replaceAll(path.sep, '/'));

export function typeFromStat(stat: Stats): ?ChangeEventMetadata['type'] {
  // Note: These tests are not mutually exclusive - a symlink passes isFile
  if (stat.isSymbolicLink()) {
    return 'l';
  }
  if (stat.isDirectory()) {
    return 'd';
  }
  if (stat.isFile()) {
    return 'f'; // "Regular" file
  }
  return null;
}
