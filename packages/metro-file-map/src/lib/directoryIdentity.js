/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import {promises as fsPromises} from 'node:fs';

export type DirectoryIdentity = Readonly<{dev: bigint, ino: bigint}>;

/**
 * The identity of the directory at `absolutePath`, or null if there is none,
 * i.e. the path is missing, is not a directory, or can't be read. A directory
 * that is deleted and recreated, or replaced by another, has a new identity.
 */
export async function getDirectoryIdentity(
  absolutePath: string,
): Promise<?DirectoryIdentity> {
  let stats;
  try {
    // Windows file IDs exceed Number.MAX_SAFE_INTEGER, so compare them exactly.
    // $FlowFixMe[extra-arg] Flow's Node types lack the `bigint` option.
    stats = await fsPromises.stat(absolutePath, {bigint: true});
  } catch {
    return null;
  }
  if (!stats.isDirectory()) {
    return null;
  }
  // $FlowFixMe[incompatible-type] Flow's Node types lack bigint stats.
  const identity: DirectoryIdentity = {dev: stats.dev, ino: stats.ino};
  return identity;
}

export function isSameDirectory(
  a: ?DirectoryIdentity,
  b: ?DirectoryIdentity,
): boolean {
  return a != null && b != null && a.dev === b.dev && a.ino === b.ino;
}
