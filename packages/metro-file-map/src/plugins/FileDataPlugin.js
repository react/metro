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
  FileMapPlugin,
  FileMapPluginInitOptions,
  FileMapPluginWorker,
  ReadonlyFileSystemChanges,
  V8Serializable,
} from '../flow-types';

export type FileDataPluginOptions = Readonly<{
  ...FileMapPluginWorker,
  name: string,
  cacheKey: string,
}>;

/**
 * Base class for FileMap plugins that store per-file data via a worker and
 * have no separate serializable state. Provides default no-op implementations
 * of lifecycle methods that subclasses can override as needed.
 */
export default class FileDataPlugin<
  in PerFileData extends void | V8Serializable = void | V8Serializable,
> implements FileMapPlugin<null, PerFileData> {
  readonly name: string;

  #worker: FileMapPluginWorker;
  #cacheKey: string;
  #files: ?FileMapPluginInitOptions<null, PerFileData>['files'];
  #processFile: ?FileMapPluginInitOptions<null, PerFileData>['processFile'];

  constructor(opts: FileDataPluginOptions) {
    this.name = opts.name;
    this.#worker = {
      worker: opts.worker,
      filter: opts.filter,
      lazy: opts.lazy,
    };
    this.#cacheKey = opts.cacheKey;
  }

  async initialize(
    initOptions: FileMapPluginInitOptions<null, PerFileData>,
  ): Promise<void> {
    this.#files = initOptions.files;
    this.#processFile = initOptions.processFile;
  }

  /**
   * Run this plugin's worker now on the file at `mixedPath`, store its data
   * and return it. A lazy plugin calls this for a file whose data, as given by
   * `getFileSystem().lookup()`, is `undefined`.
   */
  processFile(
    mixedPath: string,
  ): ReturnType<FileMapPluginInitOptions<null, PerFileData>['processFile']> {
    const processFile = this.#processFile;
    if (processFile == null) {
      throw new Error(`${this.name} plugin has not been initialized`);
    }
    return processFile(mixedPath);
  }

  getFileSystem(): FileMapPluginInitOptions<null, PerFileData>['files'] {
    const files = this.#files;
    if (files == null) {
      throw new Error(`${this.name} plugin has not been initialized`);
    }
    return files;
  }

  onChanged(_changes: ReadonlyFileSystemChanges<?PerFileData>): void {}

  assertValid(): void {}

  getSerializableSnapshot(): null {
    return null;
  }

  getCacheKey(): string {
    return this.#cacheKey;
  }

  getWorker(): FileMapPluginWorker {
    return this.#worker;
  }
}
