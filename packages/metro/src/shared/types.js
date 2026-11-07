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
  Options as DeltaBundlerOptions,
  TransformInputOptions,
} from '../DeltaBundler/types';
import type {TransformProfile} from 'metro-babel-transformer';
import type {CustomResolverOptions} from 'metro-resolver';
import type {
  MetroSourceMapSegmentTuple,
  MixedSourceMap,
} from 'metro-source-map';
import type {
  CustomTransformOptions,
  MinifierOptions,
} from 'metro-transform-worker';

type MetroSourceMapOrMappings =
  MixedSourceMap | Array<MetroSourceMapSegmentTuple>;

export enum SourcePathsMode {
  /* Use absolute paths for source files in source maps (default). */
  Absolute = 'absolute',
  /* Use server-relative URL paths for source files in source maps. */
  ServerUrl = 'url-server',
}

export type ReadonlySourceLocation = Readonly<{
  start: Readonly<{
    line: number,
    column: number,
  }>,
  end: Readonly<{
    line: number,
    column: number,
  }>,
}>;

export type BundleOptions = {
  readonly customResolverOptions: CustomResolverOptions,
  customTransformOptions: CustomTransformOptions,
  dev: boolean,
  entryFile: string,
  readonly excludeSource: boolean,
  readonly inlineSourceMap: boolean,
  readonly lazy: boolean,
  minify: boolean,
  readonly modulesOnly: boolean,
  onProgress: ?(doneCont: number, totalCount: number) => unknown,
  readonly platform: ?string,
  readonly runModule: boolean,
  readonly shallow: boolean,
  sourceMapUrl: ?string,
  sourceUrl: ?string,
  createModuleIdFactory?: () => (path: string) => number,
  readonly unstable_transformProfile: TransformProfile,
  readonly sourcePaths: SourcePathsMode,
};

export type BuildOptions = Readonly<{
  withAssets?: boolean,
}>;

export type ResolverInputOptions = Readonly<{
  customResolverOptions?: CustomResolverOptions,
  dev: boolean,
}>;

export type SerializerOptions = {
  readonly sourceMapUrl: ?string,
  readonly sourceUrl: ?string,
  readonly runModule: boolean,
  readonly excludeSource: boolean,
  readonly inlineSourceMap: boolean,
  readonly modulesOnly: boolean,
  readonly sourcePaths: SourcePathsMode,
};

export type GraphOptions = {
  readonly lazy: boolean,
  readonly shallow: boolean,
};

// Stricter representation of BundleOptions.
export type SplitBundleOptions = Readonly<{
  entryFile: string,
  resolverOptions: ResolverInputOptions,
  transformOptions: TransformInputOptions,
  serializerOptions: SerializerOptions,
  graphOptions: GraphOptions,
  onProgress: DeltaBundlerOptions<>['onProgress'],
}>;

export type ModuleGroups = {
  groups: Map<number, Set<number>>,
  modulesById: Map<number, ModuleTransportLike>,
  modulesInGroups: Set<number>,
};

export type ModuleTransportLike = {
  readonly code: string,
  readonly id: number,
  readonly map: ?MetroSourceMapOrMappings,
  readonly name?: string,
  readonly sourcePath: string,
  ...
};
export type ModuleTransportLikeStrict = {
  readonly code: string,
  readonly id: number,
  readonly map: ?MetroSourceMapOrMappings,
  readonly name?: string,
  readonly sourcePath: string,
};
export type RamModuleTransport = {
  ...ModuleTransportLikeStrict,
  readonly source: string,
  readonly type: string,
};

export type OutputOptions = {
  bundleOutput: string,
  bundleEncoding?: 'utf8' | 'utf16le' | 'ascii',
  dev?: boolean,
  indexedRamBundle?: boolean,
  platform: string,
  sourcemapOutput?: string,
  sourcemapSourcesRoot?: string,
  sourcemapUseAbsolutePath?: boolean,
  ...
};

type SafeOptionalProps<T> = {
  [K in keyof T]: T[K] extends void ? void | T[K] : T[K],
};

export type RequestOptions = Readonly<
  SafeOptionalProps<{
    entryFile: string,
    inlineSourceMap?: boolean,
    sourceMapUrl?: string,
    dev?: boolean,
    minify: boolean,
    platform: string,
    createModuleIdFactory?: () => (path: string) => number,
    onProgress?: (transformedFileCount: number, totalFileCount: number) => void,
    customResolverOptions?: CustomResolverOptions,
    customTransformOptions?: CustomTransformOptions,
    unstable_transformProfile?: TransformProfile,
  }>,
>;

export type {MinifierOptions};
