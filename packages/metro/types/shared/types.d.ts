/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<6d2429c6b34b624881402caa12117d34>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/shared/types.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Options as DeltaBundlerOptions, TransformInputOptions} from '../DeltaBundler/types';
import type {TransformProfile} from 'metro-babel-transformer';
import type {CustomResolverOptions} from 'metro-resolver';
import type {MetroSourceMapSegmentTuple, MixedSourceMap} from 'metro-source-map';
import type {CustomTransformOptions, MinifierOptions} from 'metro-transform-worker';

type MetroSourceMapOrMappings = MixedSourceMap | Array<MetroSourceMapSegmentTuple>;
export declare enum SourcePathsMode {
  Absolute = 'absolute',
  ServerUrl = 'url-server',
}
export declare namespace SourcePathsMode {
  export function cast(value: string | null | undefined): SourcePathsMode;
  export function isValid(value: string | null | undefined): value is SourcePathsMode;
  export function members(): IterableIterator<SourcePathsMode>;
  export function getName(value: SourcePathsMode): string;
}
export type ReadonlySourceLocation = Readonly<{
  start: Readonly<{line: number; column: number}>;
  end: Readonly<{line: number; column: number}>;
}>;
export type BundleOptions = {
  readonly customResolverOptions: CustomResolverOptions;
  customTransformOptions: CustomTransformOptions;
  dev: boolean;
  entryFile: string;
  readonly excludeSource: boolean;
  readonly inlineSourceMap: boolean;
  readonly lazy: boolean;
  minify: boolean;
  readonly modulesOnly: boolean;
  onProgress: null | undefined | ((doneCont: number, totalCount: number) => unknown);
  readonly platform: null | undefined | string;
  readonly runModule: boolean;
  readonly shallow: boolean;
  sourceMapUrl: null | undefined | string;
  sourceUrl: null | undefined | string;
  createModuleIdFactory?: () => (path: string) => number;
  readonly unstable_transformProfile: TransformProfile;
  readonly sourcePaths: SourcePathsMode;
};
export type BuildOptions = Readonly<{withAssets?: boolean}>;
export type ResolverInputOptions = Readonly<{
  customResolverOptions?: CustomResolverOptions;
  dev: boolean;
}>;
export type SerializerOptions = {
  readonly sourceMapUrl: null | undefined | string;
  readonly sourceUrl: null | undefined | string;
  readonly runModule: boolean;
  readonly excludeSource: boolean;
  readonly inlineSourceMap: boolean;
  readonly modulesOnly: boolean;
  readonly sourcePaths: SourcePathsMode;
};
export type GraphOptions = {
  readonly lazy: boolean;
  readonly shallow: boolean;
};
export type SplitBundleOptions = Readonly<{
  entryFile: string;
  resolverOptions: ResolverInputOptions;
  transformOptions: TransformInputOptions;
  serializerOptions: SerializerOptions;
  graphOptions: GraphOptions;
  onProgress: DeltaBundlerOptions['onProgress'];
}>;
export type ModuleGroups = {
  groups: Map<number, Set<number>>;
  modulesById: Map<number, ModuleTransportLike>;
  modulesInGroups: Set<number>;
};
export type ModuleTransportLike = {
  readonly code: string;
  readonly id: number;
  readonly map: null | undefined | MetroSourceMapOrMappings;
  readonly name?: string;
  readonly sourcePath: string;
};
export type ModuleTransportLikeStrict = {
  readonly code: string;
  readonly id: number;
  readonly map: null | undefined | MetroSourceMapOrMappings;
  readonly name?: string;
  readonly sourcePath: string;
};
export type RamModuleTransport = Omit<ModuleTransportLikeStrict, 'source' | 'type'> & {readonly source: string; readonly type: string};
export type OutputOptions = {
  bundleOutput: string;
  bundleEncoding?: 'utf8' | 'utf16le' | 'ascii';
  dev?: boolean;
  indexedRamBundle?: boolean;
  platform: string;
  sourcemapOutput?: string;
  sourcemapSourcesRoot?: string;
  sourcemapUseAbsolutePath?: boolean;
};
type SafeOptionalProps<T> = {
  [K in keyof T]: T[K] extends void ? void | T[K] : T[K];
};
export type RequestOptions = Readonly<
  SafeOptionalProps<{
    entryFile: string;
    inlineSourceMap?: boolean;
    sourceMapUrl?: string;
    dev?: boolean;
    minify: boolean;
    platform: string;
    createModuleIdFactory?: () => (path: string) => number;
    onProgress?: (transformedFileCount: number, totalFileCount: number) => void;
    customResolverOptions?: CustomResolverOptions;
    customTransformOptions?: CustomTransformOptions;
    unstable_transformProfile?: TransformProfile;
  }>
>;
export type {MinifierOptions};
