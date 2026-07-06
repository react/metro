/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<6c7d6cff28e917c03235af1d0c98db4e>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/Serializers/sourceMapGenerator.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Module} from '../types';

import {fromRawMappingsIndexed} from 'metro-source-map';

export type SourceMapGeneratorOptions = Readonly<{
  excludeSource: boolean;
  processModuleFilter: (module: Module) => boolean;
  shouldAddToIgnoreList: (module: Module) => boolean;
  getSourceUrl: null | undefined | ((module: Module) => string);
}>;
declare function sourceMapGenerator(
  modules: ReadonlyArray<Module>,
  options: SourceMapGeneratorOptions,
): ReturnType<typeof fromRawMappingsIndexed>;
declare function sourceMapGeneratorNonBlocking(
  modules: ReadonlyArray<Module>,
  options: SourceMapGeneratorOptions,
): Promise<ReturnType<typeof fromRawMappingsIndexed>>;
export {sourceMapGenerator, sourceMapGeneratorNonBlocking};
