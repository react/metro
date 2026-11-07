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

import type {Module} from '../types';
import type {
  FBSourceFunctionMap,
  MetroSourceMapSegmentTuple,
  VlqMap,
} from 'metro-source-map';

import {getJsOutput, isJsModule} from './helpers/js';

export type ExplodedSourceMap = ReadonlyArray<{
  readonly map: Array<MetroSourceMapSegmentTuple> | VlqMap,
  readonly firstLine1Based: number,
  readonly functionMap: ?FBSourceFunctionMap,
  readonly path: string,
}>;

export function getExplodedSourceMap(
  modules: ReadonlyArray<Module<>>,
  options: {
    readonly processModuleFilter: (module: Module<>) => boolean,
  },
): ExplodedSourceMap {
  const modulesToProcess = modules
    .filter(isJsModule)
    .filter(options.processModuleFilter);

  const result = [];
  let firstLine1Based = 1;

  for (const module of modulesToProcess) {
    const {path} = module;
    const {lineCount, functionMap, map} = getJsOutput(module).data;
    result.push({firstLine1Based, functionMap, path, map});
    firstLine1Based += lineCount;
  }
  return result;
}
