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

import type {Options} from './FileStore';

import FileStore from './FileStore';
import fs from 'node:fs';
import path from 'node:path';

type CleanOptions = Readonly<{
  ...Options,
  intervalMs?: number,
  cleanupThresholdMs?: number,
}>;

/**
 * A FileStore that, at a given interval, stats the content of the cache root
 * and deletes any file last modified a set threshold in the past.
 *
 * @deprecated This is not efficiently implemented and may cause significant
 * redundant I/O when caches are large. Prefer your own cleanup scripts, or a
 * custom Metro cache that uses watches, hooks get/set, and/or implements LRU.
 */
export default class AutoCleanFileStore<T> extends FileStore<T> {
  readonly #intervalMs: number;
  readonly #cleanupThresholdMs: number;
  readonly #root: string;

  constructor(opts: CleanOptions) {
    super({root: opts.root});

    this.#root = opts.root;
    this.#intervalMs = opts.intervalMs ?? 10 * 60 * 1000; // 10 minutes
    this.#cleanupThresholdMs =
      opts.cleanupThresholdMs ?? 3 * 24 * 60 * 60 * 1000; // 3 days

    this.#scheduleCleanup();
  }

  #scheduleCleanup() {
    setTimeout(() => this.#doCleanup(), this.#intervalMs);
  }

  #doCleanup() {
    const dirents = fs.readdirSync(this.#root, {
      recursive: true,
      withFileTypes: true,
    });

    let warned = false;
    const minModifiedTime = Date.now() - this.#cleanupThresholdMs;
    dirents
      .filter(dirent => dirent.isFile())
      .forEach(dirent => {
        const absolutePath = path.join(
          // $FlowFixMe[prop-missing] - dirent.parentPath added in Node 20.12
          dirent.parentPath,
          dirent.name.toString(),
        );
        try {
          if (fs.statSync(absolutePath).mtimeMs < minModifiedTime) {
            fs.unlinkSync(absolutePath);
          }
        } catch (e) {
          if (!warned) {
            console.warn(
              'Problem cleaning up cache for ' +
                absolutePath +
                ': ' +
                e.message,
            );
            warned = true;
          }
        }
      });
    this.#scheduleCleanup();
  }
}
