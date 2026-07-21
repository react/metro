/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<2f4c251ae251c041be068cf3d50ce560>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/Server/symbolicate.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {ExplodedSourceMap} from '../DeltaBundler/Serializers/getExplodedSourceMap';
import type {ConfigT} from 'metro-config';

export type StackFrameInput = {
  readonly file: null | undefined | string;
  readonly lineNumber: null | undefined | number;
  readonly column: null | undefined | number;
  readonly methodName: null | undefined | string;
};
export type IntermediateStackFrame = Omit<StackFrameInput, 'collapse'> & {
  collapse?: boolean;
};
export type StackFrameOutput = Readonly<IntermediateStackFrame>;
declare function symbolicate(stack: ReadonlyArray<StackFrameInput>, maps: Iterable<[string, ExplodedSourceMap]>, config: ConfigT, extraData: unknown): Promise<ReadonlyArray<StackFrameOutput>>;
export default symbolicate;
