/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<9685e297be806c39ff9bf6b57103357c>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/DeltaCalculator.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {DeltaResult, Options} from './types';

import {Graph} from './Graph';
import EventEmitter from 'node:events';
/**
 * This class is in charge of calculating the delta of changed modules that
 * happen between calls. To do so, it subscribes to file changes, so it can
 * traverse the files that have been changed between calls and avoid having to
 * traverse the whole dependency tree for trivial small changes.
 */
declare class DeltaCalculator<T> extends EventEmitter {
  constructor(entryPoints: ReadonlySet<string>, changeEventSource: EventEmitter, options: Options<T>);
  /**
   * Stops listening for file changes and clears all the caches.
   */
  end(): void;
  /**
   * Main method to calculate the delta of modules. It returns a DeltaResult,
   * which contain the modified/added modules and the removed modules.
   */
  getDelta($$PARAM_0$$: {reset: boolean; shallow: boolean}): Promise<DeltaResult<T>>;
  /**
   * Returns the graph with all the dependencies. Each module contains the
   * needed information to do the traversing (dependencies, inverseDependencies)
   * plus some metadata.
   */
  getGraph(): Graph<T>;
}
export default DeltaCalculator;
