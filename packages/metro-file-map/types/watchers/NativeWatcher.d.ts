/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @generated SignedSource<<cc212ccae826adc69c1f83b1859707d0>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/watchers/NativeWatcher.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {WatcherIncludedFiles} from '../flow-types';

import {AbstractWatcher} from './AbstractWatcher';
/**
 * NativeWatcher uses Node's native fs.watch API with recursive: true.
 *
 * Supported on macOS (and potentially Windows), because both natively have a
 * concept of recurisve watching, via FSEvents and ReadDirectoryChangesW
 * respectively. Notably Linux lacks this capability at the OS level.
 *
 * Node.js has at times supported the `recursive` option to fs.watch on Linux
 * by walking the directory tree and creating a watcher on each directory, but
 * this fits poorly with the synchronous `watch` API - either it must block for
 * arbitrarily large IO, or it may drop changes after `watch` returns. See:
 * https://github.com/nodejs/node/issues/48437
 *
 * Therefore, we retain a fallback to our own application-level recursive
 * FallbackWatcher for Linux, which has async `startWatching`.
 *
 * On Windows, this watcher could be used in principle, but needs work around
 * some Windows-specific edge cases handled in FallbackWatcher, like
 * deduping file change events, ignoring directory changes, and handling EPERM.
 */
declare class NativeWatcher extends AbstractWatcher {
  static isSupported(): boolean;
  constructor(
    dir: string,
    opts: Readonly<{
      ignored: null | undefined | RegExp;
      included: null | undefined | WatcherIncludedFiles;
    }>,
  );
  startWatching(): Promise<void>;
  /**
   * End watching.
   */
  stopWatching(): Promise<void>;
  _handleEvent(event: string, relativePath: string): void;
}
export default NativeWatcher;
