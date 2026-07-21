/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<54f6248424a42ea2eb7966fc06105eb3>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/plugins/FileDataPlugin.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {FileMapPlugin, FileMapPluginInitOptions, FileMapPluginWorker, ReadonlyFileSystemChanges, V8Serializable} from '../flow-types';

export type FileDataPluginOptions = Readonly<
  Omit<FileMapPluginWorker, 'name' | 'cacheKey'> & {
    name: string;
    cacheKey: string;
  }
>;
/**
 * Base class for FileMap plugins that store per-file data via a worker and
 * have no separate serializable state. Provides default no-op implementations
 * of lifecycle methods that subclasses can override as needed.
 */
declare class FileDataPlugin<PerFileData extends void | V8Serializable = void | V8Serializable> implements FileMapPlugin<null, PerFileData> {
  readonly name: string;
  constructor($$PARAM_0$$: FileDataPluginOptions);
  initialize(initOptions: FileMapPluginInitOptions<null, PerFileData>): Promise<void>;
  getFileSystem(): FileMapPluginInitOptions<null, PerFileData>['files'];
  onChanged(_changes: ReadonlyFileSystemChanges<null | undefined | PerFileData>): void;
  assertValid(): void;
  getSerializableSnapshot(): null;
  getCacheKey(): string;
  getWorker(): FileMapPluginWorker;
}
export default FileDataPlugin;
