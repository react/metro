/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<6d7a6c754c0072c22e60af364433386e>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-transform-plugins/src/utils/createInlinePlatformChecks.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Scope} from '@babel/traverse';
import type * as $$IMPORT_TYPEOF_1$$ from '@babel/types';
import type {CallExpression, MemberExpression} from '@babel/types';

type Types = typeof $$IMPORT_TYPEOF_1$$;
type PlatformChecks = {
  isPlatformNode: (node: MemberExpression, scope: Scope, isWrappedModule: boolean, filename?: string) => boolean;
  isPlatformSelectNode: (node: CallExpression, scope: Scope, isWrappedModule: boolean, filename?: string) => boolean;
};
declare function createInlinePlatformChecks(t: Types, requireName?: string): PlatformChecks;
export default createInlinePlatformChecks;
