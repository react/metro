/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<edf96165fc2c0bfc8f5e49c02021a841>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/Server.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {AssetData} from './Assets';
import type {RamBundleInfo} from './DeltaBundler/Serializers/getRamBundleInfo';
import type {BuildOptions, BundleOptions} from './shared/types';
import type {IncomingMessage} from 'connect';
import type {ConfigT} from 'metro-config';
import type {CustomResolverOptions} from 'metro-resolver/private/types';
import type {CustomTransformOptions} from 'metro-transform-worker';
import type {ServerResponse} from 'node:http';

import IncrementalBundler from './IncrementalBundler';
import {SourcePathsMode} from './shared/types';

export type SegmentLoadData = {
  [$$Key$$: number]: [Array<number>, null | undefined | number];
};
export type BundleMetadata = {
  hash: string;
  otaBuildNumber: null | undefined | string;
  mobileConfigs: Array<string>;
  segmentHashes: Array<string>;
  segmentLoadData: SegmentLoadData;
};
export type ServerOptions = Readonly<{
  hasReducedPerformance?: boolean;
  onBundleBuilt?: (bundlePath: string) => void;
  watch?: boolean;
}>;
declare class Server {
  constructor(config: ConfigT, options?: ServerOptions);
  end(): void;
  getBundler(): IncrementalBundler;
  getCreateModuleId(): (path: string) => number;
  build(bundleOptions: BundleOptions, $$PARAM_1$$?: BuildOptions): Promise<{code: string; map: string; assets?: ReadonlyArray<AssetData>}>;
  getRamBundleInfo(options: BundleOptions): Promise<RamBundleInfo>;
  getAssets(options: BundleOptions): Promise<ReadonlyArray<AssetData>>;
  getOrderedDependencyPaths(options: {readonly dev: boolean; readonly entryFile: string; readonly minify: boolean; readonly platform: null | undefined | string}): Promise<Array<string>>;
  processRequest: ($$PARAM_0$$: IncomingMessage, $$PARAM_1$$: ServerResponse, $$PARAM_2$$: (e: null | undefined | Error) => void) => void;
  getNewBuildNumber(): number;
  getPlatforms(): ReadonlyArray<string>;
  getWatchFolders(): ReadonlyArray<string>;
  static DEFAULT_GRAPH_OPTIONS: Readonly<{
    customResolverOptions: CustomResolverOptions;
    customTransformOptions: CustomTransformOptions;
    dev: boolean;
    minify: boolean;
    unstable_transformProfile: 'default';
  }>;
  static DEFAULT_BUNDLE_OPTIONS: Omit<
    typeof Server.DEFAULT_GRAPH_OPTIONS,
    'excludeSource' | 'inlineSourceMap' | 'lazy' | 'modulesOnly' | 'onProgress' | 'runModule' | 'shallow' | 'sourceMapUrl' | 'sourceUrl' | 'sourcePaths'
  > & {
    excludeSource: false;
    inlineSourceMap: false;
    lazy: false;
    modulesOnly: false;
    onProgress: null;
    runModule: true;
    shallow: false;
    sourceMapUrl: null;
    sourceUrl: null;
    sourcePaths: SourcePathsMode;
  };
  ready(): Promise<void>;
}
export default Server;
