/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<85fbaab46b394d6f88bab75eee343d36>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-babel-transformer/src/index.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {BabelFileMetadata} from '@babel/core';
import type {File as BabelNodeFile} from '@babel/types';

import {transformFromAstSync} from '@babel/core';

type BabelTransformOptions = NonNullable<Parameters<typeof transformFromAstSync>[2]>;
export type CustomTransformOptions = {
  [$$Key$$: string]: unknown;
};
export type TransformProfile = 'default' | 'hermes-stable' | 'hermes-canary';
type BabelTransformerOptions = Readonly<{
  customTransformOptions?: CustomTransformOptions;
  dev: boolean;
  enableBabelRCLookup?: boolean;
  enableBabelRuntime: boolean | string;
  extendsBabelConfigPath?: string;
  experimentalImportSupport?: boolean;
  hermesParser?: boolean;
  minify: boolean;
  platform: null | undefined | string;
  projectRoot: string;
  publicPath: string;
  unstable_transformProfile?: TransformProfile;
  globalPrefix: string;
  inlineRequires?: void;
}>;
export type BabelTransformerArgs = Readonly<{
  filename: string;
  options: BabelTransformerOptions;
  plugins?: BabelTransformOptions['plugins'];
  src: string;
}>;
export type BabelFileFunctionMapMetadata = Readonly<{
  names: ReadonlyArray<string>;
  mappings: string;
}>;
export type BabelFileImportLocsMetadata = ReadonlySet<string>;
export type MetroBabelFileMetadata = Omit<BabelFileMetadata, 'metro'> & {
  metro?:
    | null
    | undefined
    | {
        functionMap?: null | undefined | BabelFileFunctionMapMetadata;
        unstable_importDeclarationLocs?: null | undefined | BabelFileImportLocsMetadata;
      };
};
export type BabelTransformerCacheKeyOptions = Readonly<{
  projectRoot?: string;
  enableBabelRCLookup?: boolean;
}>;
export type BabelTransformer = Readonly<{
  transform: ($$PARAM_0$$: BabelTransformerArgs) => Readonly<{
    ast: BabelNodeFile;
    functionMap?: BabelFileFunctionMapMetadata;
    metadata?: MetroBabelFileMetadata;
  }>;
  getCacheKey?: (options?: BabelTransformerCacheKeyOptions) => string;
}>;
declare function transform($$PARAM_0$$: BabelTransformerArgs): ReturnType<BabelTransformer['transform']>;
/**
 * Generates a cache key component based on the user's Babel configuration files.
 * This uses Babel's loadPartialConfigSync to resolve which config files apply
 * to a given file, and includes their contents in the cache key so that changes
 * to babel.config.js or .babelrc will invalidate the transform cache.
 *
 * This is called once by the main thread (not on worker instances).
 */
declare function getCacheKey(options?: BabelTransformerCacheKeyOptions): string;
export {transform, getCacheKey};
