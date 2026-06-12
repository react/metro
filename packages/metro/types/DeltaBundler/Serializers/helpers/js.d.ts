/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<f332db8ca81e616de34223b3fb433926>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/Serializers/helpers/js.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {MixedOutput, Module} from '../../types';
import type {JsOutput} from 'metro-transform-worker';

export type Options = Readonly<{
  createModuleId: ($$PARAM_0$$: string) => number | string;
  dev: boolean;
  includeAsyncPaths: boolean;
  projectRoot: string;
  serverRoot: string;
  sourceUrl: null | undefined | string;
}>;
export declare function wrapModule(module: Module, options: Options): string;
export declare function getModuleParams(module: Module, options: Options): Array<unknown>;
export declare function getJsOutput(module: Readonly<{output: ReadonlyArray<MixedOutput>; path?: string}>): JsOutput;
export declare function isJsModule(module: Module): boolean;
