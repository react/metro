/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<9225c6d36e106c7936277e8158e90dc0>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/DeltaBundler/Serializers/helpers/processModules.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Module} from '../../types';

declare function processModules(
  modules: ReadonlyArray<Module>,
  $$PARAM_1$$: Readonly<{
    filter?: (module: Module) => boolean;
    createModuleId: ($$PARAM_0$$: string) => number;
    dev: boolean;
    includeAsyncPaths: boolean;
    projectRoot: string;
    serverRoot: string;
    sourceUrl: null | undefined | string;
    dependencyMapReservedName?: null | undefined | string;
    unstable_inlineDependencyMap?: boolean;
  }>,
): ReadonlyArray<[Module, string]>;
export default processModules;
