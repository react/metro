/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

type WatchmanQuery = {[key: string]: unknown};
type WatchmanQuerySince = unknown;

export declare function planQuery(
  args: Readonly<{
    since: WatchmanQuerySince;
    directoryFilters: ReadonlyArray<string>;
    extensions: ReadonlyArray<string>;
    includeSha1: boolean;
    includeSymlinks: boolean;
  }>,
): {
  query: WatchmanQuery;
  queryGenerator: string;
};
