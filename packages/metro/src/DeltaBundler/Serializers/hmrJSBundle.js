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

import type {DeltaResult, Module, ReadOnlyGraph} from '../types';
import type {HmrModule} from 'metro-runtime/src/modules/types';

import {isJsModule, wrapModule} from './helpers/js';
import debugModule from 'debug';
import * as jscSafeUrl from 'jsc-safe-url';
import {addParamsToDefineCall} from 'metro-transform-plugins';
import path from 'node:path';

const debug = debugModule('Metro:HMR');

type Options = Readonly<{
  clientUrl: URL,
  createModuleId: string => number,
  includeAsyncPaths: boolean,
  projectRoot: string,
  serverRoot: string,
  ...
}>;

function generateModules(
  sourceModules: Iterable<Module<>>,
  graph: ReadOnlyGraph<>,
  options: Options,
): ReadonlyArray<HmrModule> {
  const modules = [];

  for (const module of sourceModules) {
    if (isJsModule(module)) {
      const getPathname = (extension: 'bundle' | 'map') => {
        return (
          path
            .relative(
              options.serverRoot ?? options.projectRoot,
              path.join(
                path.dirname(module.path),
                path.basename(module.path, path.extname(module.path)) +
                  '.' +
                  extension,
              ),
            )
            .split(path.sep)
            // using this Metro particular convention for encoding file paths as URL paths.
            .map(segment => encodeURIComponent(segment))
            .join('/')
        );
      };

      const clientUrl = new URL(options.clientUrl);
      clientUrl.searchParams.delete('excludeSource');

      clientUrl.pathname = getPathname('map');
      const sourceMappingURL = clientUrl.toString();

      clientUrl.pathname = getPathname('bundle');
      const sourceURL = jscSafeUrl.toJscSafeUrl(clientUrl.toString());

      debug(
        'got sourceMappingURL: %s\nand sourceURL: %s\nfor module: %s',
        sourceMappingURL,
        sourceURL,
        module.path,
      );

      const code =
        prepareModule(module, graph, options) +
        `\n//# sourceMappingURL=${sourceMappingURL}\n` +
        `//# sourceURL=${sourceURL}\n`;

      modules.push({
        module: [options.createModuleId(module.path), code],
        sourceMappingURL,
        sourceURL,
      });
    }
  }

  return modules;
}

function prepareModule(
  module: Module<>,
  graph: ReadOnlyGraph<>,
  options: Options,
): string {
  const code = wrapModule(module, {
    ...options,
    sourceUrl: options.clientUrl.toString(),
    dev: true,
  });

  const inverseDependencies = getInverseDependencies(module.path, graph);
  // Transform the inverse dependency paths to ids.
  const inverseDependenciesById = Object.create(null);
  Object.keys(inverseDependencies).forEach((path: string) => {
    // $FlowFixMe[prop-missing]
    // $FlowFixMe[invalid-computed-prop]
    inverseDependenciesById[options.createModuleId(path)] = inverseDependencies[
      path
    ].map(options.createModuleId);
  });
  return addParamsToDefineCall(code, inverseDependenciesById);
}

/**
 * Instead of adding the whole inverseDependncies object into each changed
 * module (which can be really huge if the dependency graph is big), we only
 * add the needed inverseDependencies for each changed module (we do this by
 * traversing upwards the dependency graph).
 */
function getInverseDependencies(
  path: string,
  graph: ReadOnlyGraph<>,
  inverseDependencies: {[key: string]: Array<string>, ...} = {},
): {[key: string]: Array<string>, ...} {
  // Dependency alredy traversed.
  if (path in inverseDependencies) {
    return inverseDependencies;
  }

  const module = graph.dependencies.get(path);
  if (!module) {
    return inverseDependencies;
  }

  inverseDependencies[path] = [];
  for (const inverse of module.inverseDependencies) {
    inverseDependencies[path].push(inverse);
    getInverseDependencies(inverse, graph, inverseDependencies);
  }

  return inverseDependencies;
}

export default function hmrJSBundle(
  delta: DeltaResult<>,
  graph: ReadOnlyGraph<>,
  options: Options,
): {
  readonly added: ReadonlyArray<HmrModule>,
  readonly deleted: ReadonlyArray<number>,
  readonly modified: ReadonlyArray<HmrModule>,
} {
  return {
    added: generateModules(delta.added.values(), graph, options),
    modified: generateModules(delta.modified.values(), graph, options),
    deleted: [...delta.deleted].map((path: string) =>
      options.createModuleId(path),
    ),
  };
}
