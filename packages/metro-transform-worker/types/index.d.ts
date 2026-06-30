/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<42a021f72552951fbd1a0bdc2c2bb138>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-transform-worker/src/index.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {
  CustomTransformOptions,
  TransformProfile,
} from 'metro-babel-transformer';
import type {
  BasicSourceMap,
  FBSourceFunctionMap,
  MetroSourceMapSegmentTuple,
  VlqMap,
} from 'metro-source-map';
import type {TransformResultDependency} from 'metro/private/DeltaBundler';
import type {AllowOptionalDependencies} from 'metro/private/DeltaBundler/types';
import type {DynamicRequiresBehavior} from 'metro/private/ModuleGraph/worker/collectDependencies';

type MinifierConfig = Readonly<{[$$Key$$: string]: unknown}>;
export type MinifierOptions = {
  code: string;
  map: null | undefined | BasicSourceMap;
  filename: string;
  reserved: ReadonlyArray<string>;
  config: MinifierConfig;
};
export type MinifierResult = {code: string; map?: BasicSourceMap};
export type Minifier = (
  $$PARAM_0$$: MinifierOptions,
) => MinifierResult | Promise<MinifierResult>;
export type Type = 'script' | 'module' | 'asset';
export type JsTransformerConfig = Readonly<{
  assetPlugins: ReadonlyArray<string>;
  assetRegistryPath: string;
  asyncRequireModulePath: string;
  babelTransformerPath: string;
  dynamicDepsInPackages: DynamicRequiresBehavior;
  enableBabelRCLookup: boolean;
  enableBabelRuntime: boolean | string;
  globalPrefix: string;
  hermesParser: boolean;
  minifierConfig: MinifierConfig;
  minifierPath: string;
  optimizationSizeLimit: number;
  publicPath: string;
  allowOptionalDependencies: AllowOptionalDependencies;
  unstable_dependencyMapReservedName: null | undefined | string;
  unstable_disableModuleWrapping: boolean;
  unstable_disableNormalizePseudoGlobals: boolean;
  unstable_compactOutput: boolean;
  /** Enable `require.context` statements which can be used to import multiple files in a directory. */
  unstable_allowRequireContext: boolean;
  /** With inlineRequires, enable a module-scope memo var and inline as (v || v=require('foo')) */
  unstable_memoizeInlineRequires?: boolean;
  /** With inlineRequires, do not memoize these module specifiers */
  unstable_nonMemoizedInlineRequires?: ReadonlyArray<string>;
  /** Whether to rename scoped `require` functions to `_$$_REQUIRE`, usually an extraneous operation when serializing to iife (default). */
  unstable_renameRequire?: boolean;
  /** Store source maps as compact VLQ-encoded strings (`VlqMap`) instead of decoded tuple arrays. Reduces source-map memory ~51% on the heap. Opt-in; changes `JsOutput.data.map` for consumers. */
  unstable_compactSourceMaps?: boolean;
}>;
export type {CustomTransformOptions} from 'metro-babel-transformer';
export type JsTransformOptions = Readonly<{
  customTransformOptions?: CustomTransformOptions;
  dev: boolean;
  experimentalImportSupport?: boolean;
  inlinePlatform: boolean;
  inlineRequires: boolean;
  minify: boolean;
  nonInlinedRequires?: ReadonlyArray<string>;
  platform: null | undefined | string;
  type: Type;
  unstable_memoizeInlineRequires?: boolean;
  unstable_nonMemoizedInlineRequires?: ReadonlyArray<string>;
  unstable_staticHermesOptimizedRequire?: boolean;
  unstable_transformProfile: TransformProfile;
}>;
type JSFileType = 'js/script' | 'js/module' | 'js/module/asset';
export type JsOutput = Readonly<{
  data: Readonly<{
    code: string;
    lineCount: number;
    map: Array<MetroSourceMapSegmentTuple> | VlqMap;
    functionMap: null | undefined | FBSourceFunctionMap;
  }>;
  type: JSFileType;
}>;
type TransformResponse = Readonly<{
  dependencies: ReadonlyArray<TransformResultDependency>;
  output: ReadonlyArray<JsOutput>;
}>;
export declare const transform: (
  config: JsTransformerConfig,
  projectRoot: string,
  filename: string,
  data: Buffer,
  options: JsTransformOptions,
) => Promise<TransformResponse>;
export declare type transform = typeof transform;
export declare const getCacheKey: (
  config: JsTransformerConfig,
  opts?: Readonly<{projectRoot: string}>,
) => string;
export declare type getCacheKey = typeof getCacheKey;
