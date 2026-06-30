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

import Cache from './Cache';
import stableHash from './stableHash';
import AutoCleanFileStore from './stores/AutoCleanFileStore';
import FileStore from './stores/FileStore';
import HttpGetStore from './stores/HttpGetStore';
import HttpStore from './stores/HttpStore';

export type {Options as FileOptions} from './stores/FileStore';
export type {Options as HttpOptions} from './stores/HttpStore';
export type {CacheStore} from './types';

export {
  AutoCleanFileStore,
  Cache,
  FileStore,
  HttpGetStore,
  HttpStore,
  stableHash,
};

export interface MetroCache {
  readonly AutoCleanFileStore: typeof AutoCleanFileStore;
  readonly Cache: typeof Cache;
  readonly FileStore: typeof FileStore;
  readonly HttpGetStore: typeof HttpGetStore;
  readonly HttpStore: typeof HttpStore;
  readonly stableHash: typeof stableHash;
}
