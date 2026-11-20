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

import type {Module, ReadOnlyGraph} from '../types';

import {getAssetFiles} from '../../Assets';
import {isVirtualModulePath} from '../../lib/modulePath';
import {getJsOutput, isJsModule} from './helpers/js';

type Options = {
  platform: ?string,
  readonly processModuleFilter: (module: Module<>) => boolean,
};

export default async function getAllFiles(
  pre: ReadonlyArray<Module<>>,
  graph: ReadOnlyGraph<>,
  options: Options,
): Promise<ReadonlyArray<string>> {
  const modules = graph.dependencies;
  const {processModuleFilter} = options;

  const promises: Array<Promise<Array<string>> | Array<string>> = [];

  for (const module of pre) {
    if (processModuleFilter(module)) {
      promises.push([module.path]);
    }
  }

  for (const module of modules.values()) {
    if (
      !isJsModule(module) ||
      !processModuleFilter(module) ||
      // A virtual module has no file.
      isVirtualModulePath(module.path)
    ) {
      continue;
    }

    if (getJsOutput(module).type === 'js/module/asset') {
      promises.push(getAssetFiles(module.path, options.platform));
    } else {
      promises.push([module.path]);
    }
  }

  const dependencies = await Promise.all(promises);
  const output: Array<string> = [];

  for (const dependencyArray of dependencies) {
    output.push(...dependencyArray);
  }

  return output;
}
