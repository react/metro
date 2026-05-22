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
> implements FileMapPlugin<null, PerFileData>
{
  +name: string;

  #worker: FileMapPluginWorker;
  #cacheKey: string;
  #files: ?FileMapPluginInitOptions<null, PerFileData>['files'];

  constructor({name, worker, filter, cacheKey}: FileDataPluginOptions) {
    this.name = name;
    this.#worker = {worker, filter};
    this.#cacheKey = cacheKey;
  }

  async initialize(
    initOptions: FileMapPluginInitOptions<null, PerFileData>,
  ): Promise<void> {
    this.#files = initOptions.files;
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
