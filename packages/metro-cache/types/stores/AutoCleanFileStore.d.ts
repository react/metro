/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<b48a572e322053f43ea91adf8f8a2bdb>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-cache/src/stores/AutoCleanFileStore.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Options} from './FileStore';

import FileStore from './FileStore';

type CleanOptions = Readonly<
  Omit<Options, keyof {intervalMs?: number; cleanupThresholdMs?: number}> & {
    intervalMs?: number;
    cleanupThresholdMs?: number;
  }
>;
/**
 * A FileStore that, at a given interval, stats the content of the cache root
 * and deletes any file last modified a set threshold in the past.
 *
 * @deprecated This is not efficiently implemented and may cause significant
 * redundant I/O when caches are large. Prefer your own cleanup scripts, or a
 * custom Metro cache that uses watches, hooks get/set, and/or implements LRU.
 */
declare class AutoCleanFileStore<T> extends FileStore<T> {
  constructor(opts: CleanOptions);
}
export default AutoCleanFileStore;
