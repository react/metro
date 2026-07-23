/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<e3641a502fcdb817619db54a07c9ae43>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/Serializers/helpers/js.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {MixedOutput, Module} from '../../types';
import type {JsOutput} from 'metro-transform-worker';

import path from 'node:path';

export type Options = Readonly<{
  createModuleId: ($$PARAM_0$$: string) => number | string;
  dev: boolean;
  includeAsyncPaths: boolean;
  projectRoot: string;
  serverRoot: string;
  sourceUrl: null | undefined | string;
  dependencyMapReservedName?: null | undefined | string;
  unstable_inlineDependencyMap?: boolean;
}>;
export declare function wrapModule(module: Module, options: Options): string;
export declare function getModuleParams(module: Module, options: Options): Array<unknown>;
/**
 * Fast path for inlining module IDs as a cheap string operation, requiring
 * neither parsing nor any adjustment to the source map.
 *
 * Assumptions:
 * 1. `dependencyMapReservedName` is a globally reserved string; there are
 *    no false positives.
 * 2. The longest module ID in the bundle does not exceed a length of
 *    `dependencyMapReservedName.length + 3`. (We assert this below.)
 * 3. False negatives (failing to inline occasionally if an assumption
 *    isn't met) are rare to nonexistent, but safe if they do occur.
 *
 * Syntax definitions:
 * 1. A dependency map reference is a member expression which, if parsed,
 *    would have the form:
 *      MemberExpression
 *      ├──object: Identifier (name = dependencyMapReservedName)
 *      ├──property: NumericLiteral (value = some integer)
 *      └──computed: true
 * 2. The concrete form of a dependency map reference may contain embedded
 *    tabs or spaces, but no newlines (which would complicate source maps),
 *    parens (which would complicate detection) or comments (likewise).
 * 3. The numeric literal in a dependency map reference is a base-10
 *    integer printed as a simple sequence of digits.
 */
export declare function inlineModuleIdReferences(
  code: string,
  dependencyMapReservedName: string,
  dependencyIds: ReadonlyArray<number | string>,
  $$PARAM_3$$?: Readonly<{ignoreMissingDependencyMapReference?: boolean}>,
): string;
export declare function getJsOutput(module: Readonly<{output: ReadonlyArray<MixedOutput>; path?: string}>): JsOutput;
export declare function isJsModule(module: Module): boolean;
