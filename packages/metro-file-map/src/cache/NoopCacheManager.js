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

import type {CacheData, CacheManager} from '../flow-types';

/**
 * A `CacheManager` that never reads or writes.
 */
export class NoopCacheManager implements CacheManager {
  async read(): Promise<?CacheData> {
    return null;
  }

  async write(): Promise<void> {}

  async end(): Promise<void> {}
}
