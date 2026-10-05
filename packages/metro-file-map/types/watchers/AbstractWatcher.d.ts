/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @generated SignedSource<<73dcfda27ad8d16345f50153d8a0035b>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/watchers/AbstractWatcher.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {
  WatcherBackend,
  WatcherBackendChangeEvent,
  WatcherBackendOptions,
  WatcherIncludedFiles,
} from '../flow-types';

export type Listeners = Readonly<{
  onFileEvent: (event: WatcherBackendChangeEvent) => void;
  onError: (error: Error) => void;
}>;
export declare class AbstractWatcher implements WatcherBackend {
  readonly root: string;
  readonly ignored: null | undefined | RegExp;
  readonly included: null | undefined | WatcherIncludedFiles;
  readonly doIgnore: (path: string) => boolean;
  constructor(dir: string, opts: WatcherBackendOptions);
  onFileEvent(listener: (event: WatcherBackendChangeEvent) => void): () => void;
  onError(listener: (error: Error) => void): () => void;
  startWatching(): Promise<void>;
  stopWatching(): Promise<void>;
  emitFileEvent(event: Omit<WatcherBackendChangeEvent, 'root'>): void;
  emitError(error: Error): void;
  getPauseReason(): null | undefined | string;
}
