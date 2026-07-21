/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<31a9b3b916ff14dc24a254ab9039a8c9>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/createDefaultContext.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {ResolutionContext} from './types';
import type {TransformResultDependency} from 'metro/private/DeltaBundler/types';

type PartialContext = Readonly<
  Omit<ResolutionContext, 'redirectModulePath'> & {
    redirectModulePath?: ResolutionContext['redirectModulePath'];
  }
>;
/**
 * Helper used by the `metro` package to create the `ResolutionContext` object.
 * As context values can be overridden by callers, this occurs externally to
 * `resolve.js`.
 */
declare function createDefaultContext(context: PartialContext, dependency: TransformResultDependency): ResolutionContext;
export default createDefaultContext;
