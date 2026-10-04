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
  return (
    'h' +
    crypto
      .createHash('sha1')
      .update(normalizePathSeparatorsToPosix(rootRelativePath))
      .digest('hex')
      .slice(0, 16)
  );
}
