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

import type {ModuleTransportLike, RamModuleTransport} from '../../shared/types';
import type {Module, ReadOnlyGraph, SerializerOptions} from '../types';
import type {SourceMapGeneratorOptions} from './sourceMapGenerator';
import type {GetTransformOptions} from 'metro-config';

import {createRamBundleGroups} from '../../Bundler/util';
import getAppendScripts from '../../lib/getAppendScripts';
import getTransitiveDependencies from './helpers/getTransitiveDependencies';
import {isJsModule, wrapModule} from './helpers/js';
import {sourceMapObject} from './sourceMapObject';
import path from 'node:path';
import nullthrows from 'nullthrows';

type Options = Readonly<{
  ...SerializerOptions,
  ...SourceMapGeneratorOptions,
  getTransformOptions: ?GetTransformOptions,
  platform: ?string,
}>;

export type RamBundleInfo = {
  getDependencies: string => Set<string>,
  startupModules: ReadonlyArray<ModuleTransportLike>,
  lazyModules: ReadonlyArray<ModuleTransportLike>,
  groups: Map<number, Set<number>>,
};

export default async function getRamBundleInfo(
  entryPoint: string,
  pre: ReadonlyArray<Module<>>,
  graph: ReadOnlyGraph<>,
  options: Options,
): Promise<RamBundleInfo> {
  let modules: ReadonlyArray<Module<>> = [
    ...pre,
    ...graph.dependencies.values(),
  ];
  modules = modules.concat(getAppendScripts(entryPoint, modules, options));

  modules.forEach((module: Module<>) => options.createModuleId(module.path));

  const ramModules: Array<RamModuleTransport> = modules
    .filter(isJsModule)
    .filter(options.processModuleFilter)
    .map((module: Module<>): RamModuleTransport => ({
      id: options.createModuleId(module.path),
      code: wrapModule(module, options),
      map: sourceMapObject([module], {
        excludeSource: options.excludeSource,
        processModuleFilter: options.processModuleFilter,
        shouldAddToIgnoreList: options.shouldAddToIgnoreList,
        getSourceUrl: options.getSourceUrl,
      }),
      name: path.basename(module.path),
      sourcePath: module.path,
      source: module.getSource().toString(),
      type: nullthrows(module.output.find(({type}) => type.startsWith('js')))
        .type,
    }));

  const {preloadedModules, ramGroups} = await _getRamOptions(
    entryPoint,
    {
      dev: options.dev,
      platform: options.platform,
    },
    (filePath: string) => getTransitiveDependencies(filePath, graph),
    options.getTransformOptions,
  );

  const startupModules = [];
  const lazyModules = [];

  ramModules.forEach((module: RamModuleTransport) => {
    if (preloadedModules.hasOwnProperty(module.sourcePath)) {
      startupModules.push(module);
      return;
    }

    if (module.type.startsWith('js/script')) {
      startupModules.push(module);
      return;
    }

    if (module.type.startsWith('js/module')) {
      lazyModules.push(module);
    }
  });

  const groups = createRamBundleGroups(
    ramGroups,
    lazyModules,
    (
      module: ModuleTransportLike,
      dependenciesByPath: Map<string, ModuleTransportLike>,
    ): Set<number> => {
      const deps = getTransitiveDependencies(module.sourcePath, graph);
      const output = new Set<number>();

      for (const dependency of deps) {
        const module = dependenciesByPath.get(dependency);

        if (module) {
          output.add(module.id);
        }
      }

      return output;
    },
  );

  return {
    getDependencies: (filePath: string): Set<string> =>
      getTransitiveDependencies(filePath, graph),
    groups,
    lazyModules,
    startupModules,
  };
}

/**
 * Returns the options needed to create a RAM bundle.
 */
async function _getRamOptions(
  entryFile: string,
  options: {
    dev: boolean,
    platform: ?string,
    ...
  },
  getDependencies: string => Iterable<string>,
  getTransformOptions: ?GetTransformOptions,
): Promise<
  Readonly<{
    preloadedModules: Readonly<{[string]: true, ...}>,
    ramGroups: ReadonlyArray<string>,
  }>,
> {
  if (getTransformOptions == null) {
    return {
      preloadedModules: {},
      ramGroups: [],
    };
  }

  const {preloadedModules, ramGroups} = await getTransformOptions(
    [entryFile],
    {dev: options.dev, hot: true, platform: options.platform},
    /* $FlowFixMe[incompatible-type](>=0.99.0 site=react_native_fb) This comment suppresses an
     * error found when Flow v0.99 was deployed. To see the error, delete this
     * comment and run Flow. */
    async (x: string) => Array.from(getDependencies),
  );

  return {
    // $FlowFixMe[sketchy-null-bool]
    preloadedModules: preloadedModules || {},
    ramGroups: ramGroups || [],
  };
}
