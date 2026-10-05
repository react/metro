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

import type {FileMapRoot} from 'metro-file-map';

import {normalizePathSeparatorsToPosix} from './pathUtils';
import crypto from 'node:crypto';

/**
 * The number of hex digits in a dynamic root id. A `watchFolders` index never
 * has this many digits (`RootUrlMap` ensures it), so a URL path segment
 * of this length is always an id.
 */
export const DYNAMIC_ROOT_ID_LENGTH = 8;

/**
 * A directory the file map holds that is neither `projectRoot` nor one of the
 * configured `watchFolders`, having been added while Metro is running.
 */
export type DynamicRoot = Readonly<{
  // Identifies the root in `[metro-watchFolders]/<id>/` URL paths, in place
  // of a `watchFolders` index.
  id: string,
  rootDir: string,
}>;

/**
 * The id of a dynamic root is a hash of its path relative to the project
 * root, with `/` separators. Unlike a `watchFolders` index, it does not depend
 * on which other roots exist or the order they were added in, and it is the
 * same on any machine or OS with the same layout, so a URL containing it (and
 * any cache key derived from one) is portable.
 *
 * `rootRelativePath` is in metro-file-map's relative form, which reaches a
 * root on another Windows drive as if the drive were a top-level directory,
 * e.g. `..\..\D:\store`.
 */
export function getDynamicRootId(rootRelativePath: string): string {
  return crypto
    .hash('sha1', normalizePathSeparatorsToPosix(rootRelativePath), 'hex')
    .slice(0, DYNAMIC_ROOT_ID_LENGTH);
}

/**
 * The dynamic roots among all of the file map's roots. They are ordered so
 * that a root always precedes any root nested within it, and the order depends
 * only on the set of roots.
 *
 * Throws if two roots have the same id, which would otherwise make URLs in one
 * of them resolve to files in the other.
 */
export function getDynamicRoots(
  fileMapRoots: ReadonlyArray<FileMapRoot>,
): ReadonlyArray<DynamicRoot> {
  const dynamicRoots = fileMapRoots
    .filter(root => root.dynamic)
    .sort(
      (a, b) =>
        a.absolutePath.length - b.absolutePath.length ||
        (a.absolutePath < b.absolutePath ? -1 : 1),
    )
    .map(({absolutePath, rootRelativePath}) => ({
      id: getDynamicRootId(rootRelativePath),
      rootDir: absolutePath,
    }));
  const rootDirsById = new Map<string, string>();
  for (const {id, rootDir} of dynamicRoots) {
    const existingRootDir = rootDirsById.get(id);
    if (existingRootDir != null) {
      throw new Error(
        `Roots '${existingRootDir}' and '${rootDir}' have the same id ` +
          `'${id}', so URLs cannot tell them apart.`,
      );
    }
    rootDirsById.set(id, rootDir);
  }
  return dynamicRoots;
}
