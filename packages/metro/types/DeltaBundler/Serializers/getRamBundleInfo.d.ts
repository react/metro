/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<bcd308a7c5f1b890724eca3d2db068e9>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/Serializers/getRamBundleInfo.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {ModuleTransportLike} from '../../shared/types';
import type {Module, ReadOnlyGraph, SerializerOptions} from '../types';
import type {SourceMapGeneratorOptions} from './sourceMapGenerator';
import type {GetTransformOptions} from 'metro-config';

type Options = Readonly<
  Omit<SerializerOptions, keyof SourceMapGeneratorOptions | 'getTransformOptions' | 'platform'> &
    Omit<SourceMapGeneratorOptions, 'getTransformOptions' | 'platform'> & {
      getTransformOptions: null | undefined | GetTransformOptions;
      platform: null | undefined | string;
    }
>;
export type RamBundleInfo = {
  getDependencies: ($$PARAM_0$$: string) => Set<string>;
  startupModules: ReadonlyArray<ModuleTransportLike>;
  lazyModules: ReadonlyArray<ModuleTransportLike>;
  groups: Map<number, Set<number>>;
};
declare function getRamBundleInfo(entryPoint: string, pre: ReadonlyArray<Module>, graph: ReadOnlyGraph, options: Options): Promise<RamBundleInfo>;
export default getRamBundleInfo;
