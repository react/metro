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

import type {Module} from '../../types';

import {isJsModule, wrapModule} from './js';

export default function processModules(
  modules: ReadonlyArray<Module<>>,
  {
    filter = () => true,
    createModuleId,
    dev,
    includeAsyncPaths,
    projectRoot,
    serverRoot,
    sourceUrl,
    dependencyMapReservedName,
    unstable_inlineDependencyMap,
  }: Readonly<{
    filter?: (module: Module<>) => boolean,
    createModuleId: string => number,
    dev: boolean,
    includeAsyncPaths: boolean,
    projectRoot: string,
    serverRoot: string,
    sourceUrl: ?string,
    dependencyMapReservedName?: ?string,
    unstable_inlineDependencyMap?: boolean,
  }>,
): ReadonlyArray<[Module<>, string]> {
  return [...modules]
    .filter(isJsModule)
    .filter(filter)
    .map((module: Module<>) => [
      module,
      wrapModule(module, {
        createModuleId,
        dev,
        includeAsyncPaths,
        projectRoot,
        serverRoot,
        sourceUrl,
        dependencyMapReservedName,
        unstable_inlineDependencyMap,
      }),
    ]);
}
