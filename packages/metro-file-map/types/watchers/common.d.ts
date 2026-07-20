/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<b1f992864b487f099044c1da57f1db9b>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/watchers/common.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

/**
 * Originally vendored from
 * https://github.com/amasad/sane/blob/64ff3a870c42e84f744086884bf55a4f9c22d376/src/common.js
 */

import type {ChangeEventMetadata} from '../flow-types';
import type {Stats} from 'node:fs';
/**
 * Constants
 */
export declare const DELETE_EVENT: 'delete';
export declare type DELETE_EVENT = typeof DELETE_EVENT;
export declare const TOUCH_EVENT: 'touch';
export declare type TOUCH_EVENT = typeof TOUCH_EVENT;
export declare const RECRAWL_EVENT: 'recrawl';
export declare type RECRAWL_EVENT = typeof RECRAWL_EVENT;
export declare const ALL_EVENT: 'all';
export declare type ALL_EVENT = typeof ALL_EVENT;
export type WatcherOptions = Readonly<{
  globs: ReadonlyArray<string>;
  dot: boolean;
  ignored: null | undefined | RegExp;
  watchmanDeferStates: ReadonlyArray<string>;
  watchman?: unknown;
  watchmanPath?: string;
}>;
/**
 * Checks a file relative path against the globs array.
 */
export declare function includedByGlob(type: null | undefined | ('f' | 'l' | 'd'), globs: ReadonlyArray<string>, dot: boolean, relativePath: string): boolean;
/**
 * Whether the given filePath matches the given RegExp, after converting
 * (on Windows only) system separators to posix separators.
 *
 * Conversion to posix is for backwards compatibility with the previous
 * anymatch matcher, which normlises all inputs[1]. This may not be consistent
 * with other parts of metro-file-map.
 *
 * [1]: https://github.com/micromatch/anymatch/blob/3.1.1/index.js#L50
 */
export declare const posixPathMatchesPattern: (pattern: RegExp, filePath: string) => boolean;
export declare type posixPathMatchesPattern = typeof posixPathMatchesPattern;
export declare function typeFromStat(stat: Stats): null | undefined | ChangeEventMetadata['type'];
