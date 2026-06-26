/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<35bb62d836afac725c73389319206389>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/Serializers/sourceMapGenerator.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Module} from '../types';

import {fromRawMappings, fromRawMappingsIndexed} from 'metro-source-map';

export type SourceMapGeneratorOptions = Readonly<{
  excludeSource: boolean;
  processModuleFilter: (module: Module) => boolean;
  shouldAddToIgnoreList: (module: Module) => boolean;
  getSourceUrl: null | undefined | ((module: Module) => string);
  allowIndexMap?: boolean;
}>;
declare function sourceMapGenerator(
  modules: ReadonlyArray<Module>,
  options: SourceMapGeneratorOptions,
):
  | ReturnType<typeof fromRawMappings>
  | ReturnType<typeof fromRawMappingsIndexed>;
declare function sourceMapGeneratorNonBlocking(
  modules: ReadonlyArray<Module>,
  options: SourceMapGeneratorOptions,
): Promise<
  ReturnType<typeof fromRawMappings> | ReturnType<typeof fromRawMappingsIndexed>
>;
export {sourceMapGenerator, sourceMapGeneratorNonBlocking};
