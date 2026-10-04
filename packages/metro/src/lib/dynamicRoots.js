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

import {normalizePathSeparatorsToPosix} from './pathUtils';
import crypto from 'node:crypto';
import * as path from 'node:path';

/**
 * A directory the file map holds that is neither `projectRoot` nor one of the
 * configured `watchFolders`, having been added while Metro is running.
 */
export type DynamicRoot = Readonly<{
  // Identifies the root in `[metro-watchFolders]/<id>/` URL paths. Never
  // numeric, so that it cannot be mistaken for a `watchFolders` index.
  id: string,
  rootDir: string,
}>;

/**
 * The id of a dynamic root is a hash of its location relative to the project
 * root. Unlike a `watchFolders` index, it does not depend on which other roots
 * exist or the order they were added in, so a URL containing it means the same
 * directory in any Metro process for the project.
 */
export function getDynamicRootId(projectRoot: string, rootDir: string): string {
  return (
    'h' +
    crypto
      .createHash('sha1')
      .update(
        normalizePathSeparatorsToPosix(
          path.relative(path.resolve(projectRoot), path.resolve(rootDir)),
        ),
      )
      .digest('hex')
      .slice(0, 16)
  );
}

/**
 * Given all of the file map's roots, returns those that are dynamic. They are
 * ordered so that a root always precedes any root nested within it, and the
 * order depends only on the set of roots.
 */
export function getDynamicRoots(
  projectRoot: string,
  watchFolders: ReadonlyArray<string>,
  fileMapRoots: ReadonlyArray<string>,
): ReadonlyArray<DynamicRoot> {
  const configuredRoots = new Set(
    [projectRoot, ...watchFolders].map(root => path.resolve(root)),
  );
  return [...new Set(fileMapRoots.map(root => path.resolve(root)))]
    .filter(rootDir => !configuredRoots.has(rootDir))
    .sort((a, b) => a.length - b.length || (a < b ? -1 : 1))
    .map(rootDir => ({id: getDynamicRootId(projectRoot, rootDir), rootDir}));
}
