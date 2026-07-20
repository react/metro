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
  BuildParameters,
  CacheData,
  CacheManager,
  CacheManagerFactoryOptions,
  CacheManagerWriteOptions,
} from '../flow-types';

import rootRelativeCacheKeys from '../lib/rootRelativeCacheKeys';
import debugModule from 'debug';
import {promises as fsPromises} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Timeout, clearTimeout, setTimeout} from 'node:timers';
import {deserialize, serialize} from 'node:v8';

const debug = debugModule('Metro:FileMapCache');

type AutoSaveOptions = Readonly<{
  debounceMs: number,
}>;

type DiskCacheConfig = Readonly<{
  autoSave?: Partial<AutoSaveOptions> | boolean,
  cacheFilePrefix?: ?string,
  cacheDirectory?: ?string,
}>;

const DEFAULT_PREFIX = 'metro-file-map';
const DEFAULT_DIRECTORY = tmpdir();
const DEFAULT_AUTO_SAVE_DEBOUNCE_MS = 5000;

export class DiskCacheManager implements CacheManager {
  readonly #autoSaveOpts: ?AutoSaveOptions;
  readonly #cachePath: string;
  #debounceTimeout: ?Timeout = null;
  #writePromise: Promise<void> = Promise.resolve();
  #hasUnwrittenChanges: boolean = false;
  #tryWrite: ?() => Promise<void>;
  #stopListening: ?() => void;

  constructor(
    {buildParameters}: CacheManagerFactoryOptions,
    {autoSave = {}, cacheDirectory, cacheFilePrefix}: DiskCacheConfig,
  ) {
    this.#cachePath = DiskCacheManager.getCacheFilePath(
      buildParameters,
      cacheFilePrefix,
      cacheDirectory,
    );

    // Normalise auto-save options.
    if (autoSave) {
      const {debounceMs = DEFAULT_AUTO_SAVE_DEBOUNCE_MS} =
        autoSave === true ? {} : autoSave;
      this.#autoSaveOpts = {debounceMs};
    }
  }

  static getCacheFilePath(
    buildParameters: BuildParameters,
    cacheFilePrefix?: ?string,
    cacheDirectory?: ?string,
  ): string {
    const {rootDirHash, relativeConfigHash} =
      rootRelativeCacheKeys(buildParameters);

    return path.join(
      cacheDirectory ?? DEFAULT_DIRECTORY,
      `${
        cacheFilePrefix ?? DEFAULT_PREFIX
      }-${rootDirHash}-${relativeConfigHash}`,
    );
  }

  getCacheFilePath(): string {
    return this.#cachePath;
  }

  async read(): Promise<?CacheData> {
    try {
      return deserialize(await fsPromises.readFile(this.#cachePath));
    } catch (e) {
      if (e?.code === 'ENOENT') {
        // Cache file not found - not considered an error.
        return null;
      }
      // Rethrow anything else.
      throw e;
    }
  }

  async write(
    getSnapshot: () => CacheData,
    {
      changedSinceCacheRead,
      eventSource,
      onWriteError,
    }: CacheManagerWriteOptions,
  ): Promise<void> {
    // Initialise a writer function using a promise queue to ensure writes are
    // sequenced.
    const tryWrite = (this.#tryWrite = () => {
      this.#writePromise = this.#writePromise
        .then(async () => {
          if (!this.#hasUnwrittenChanges) {
            return;
          }
          const data = getSnapshot();
          this.#hasUnwrittenChanges = false;
          await fsPromises.writeFile(this.#cachePath, serialize(data));
          debug('Written cache to %s', this.#cachePath);
        })
        .catch(onWriteError);
      return this.#writePromise;
    });

    // Set up auto-save on changes, if enabled.
    if (this.#autoSaveOpts) {
      const autoSave = this.#autoSaveOpts;
      this.#stopListening?.();
      this.#stopListening = eventSource.onChange(() => {
        this.#hasUnwrittenChanges = true;
        if (this.#debounceTimeout) {
          this.#debounceTimeout.refresh();
        } else {
          this.#debounceTimeout = setTimeout(
            () => tryWrite(),
            autoSave.debounceMs,
          ).unref();
        }
      });
    }

    // Write immediately if state has changed since the cache was read.
    if (changedSinceCacheRead) {
      this.#hasUnwrittenChanges = true;
      await tryWrite();
    }
  }

  async end(): Promise<void> {
    // Clear any timers
    if (this.#debounceTimeout) {
      clearTimeout(this.#debounceTimeout);
    }

    // Remove event listeners
    this.#stopListening?.();

    // Flush unwritten changes to disk (no-op if no changes)
    await this.#tryWrite?.();
  }
}
