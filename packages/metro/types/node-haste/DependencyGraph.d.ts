/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<30d76234544ec70f02b4a784d55cd7af>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/node-haste/DependencyGraph.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {BundlerResolution, TransformResultDependency} from '../DeltaBundler/types';
import type {ResolverInputOptions} from '../shared/types';
import type {ConfigT} from 'metro-config';

import EventEmitter from 'node:events';

declare class DependencyGraph extends EventEmitter {
  constructor(
    config: ConfigT,
    options?: {
      readonly hasReducedPerformance?: boolean;
      readonly watch?: boolean;
    },
  );
  ready(): Promise<void>;
  getAllFiles(): Array<string>;
  /**
   * Used when watcher.unstable_lazySha1 is true
   */
  getOrComputeSha1(mixedPath: string): Promise<{content?: Buffer; sha1: string}>;
  getWatcher(): EventEmitter;
  end(): void;
  /** Given a search context, return a list of file paths matching the query. */
  matchFilesWithContext(from: string, context: Readonly<{recursive: boolean; filter: RegExp}>): Iterable<string>;
  resolveDependency(
    originModulePath: string,
    dependency: TransformResultDependency,
    platform: string | null,
    resolverOptions: ResolverInputOptions,
    $$PARAM_4$$?: {assumeFlatNodeModules: boolean},
  ): BundlerResolution;
  doesFileExist: (filePath: string) => boolean;
  getHasteName(filePath: string): string;
  getDependencies(filePath: string): Array<string>;
}
export default DependencyGraph;
