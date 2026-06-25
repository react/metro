/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<2f0ab0435f64798986366df74674d02a>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/Serializers/getExplodedSourceMap.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Module} from '../types';
import type {
  FBSourceFunctionMap,
  MetroSourceMapSegmentTuple,
  VlqMap,
} from 'metro-source-map';

export type ExplodedSourceMap = ReadonlyArray<{
  readonly map: Array<MetroSourceMapSegmentTuple> | VlqMap;
  readonly firstLine1Based: number;
  readonly functionMap: null | undefined | FBSourceFunctionMap;
  readonly path: string;
}>;
export declare function getExplodedSourceMap(
  modules: ReadonlyArray<Module>,
  options: {readonly processModuleFilter: (module: Module) => boolean},
): ExplodedSourceMap;
