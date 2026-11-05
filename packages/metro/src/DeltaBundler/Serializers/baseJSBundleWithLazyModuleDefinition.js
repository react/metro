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

import type {Module, ReadOnlyGraph, SerializerOptions} from '../types';
import type {LazyModuleSwitchEntry} from './helpers/lazyModuleSwitch';

import getAppendScripts from '../../lib/getAppendScripts';
import getSourceMapInfo from './helpers/getSourceMapInfo';
import {isJsModule, wrapModule} from './helpers/js';
import {appendLazyModuleSwitch} from './helpers/lazyModuleSwitch';
import processModules from './helpers/processModules';
import {BundleBuilder, fromRawMappings} from 'metro-source-map';

type Options = Readonly<{
  ...SerializerOptions,
  excludeSource?: boolean,
}>;

/**
 * Serializes a bundle in which the graph's modules are placed inside a single
 * segment definer -- `__registerSegment(0, function (moduleId) { switch (...) })`
 * -- so that each module's `__d(...)` call runs lazily on first require instead
 * of eagerly at startup. Polyfills and the require runtime (pre-modules) and the
 * run-module calls (append scripts) are emitted eagerly, as usual.
 *
 * This is the OSS equivalent of the metro-buck "plain bundle with switch"
 * output, gated behind `serializer.unstable_lazilyDefineModules`. Unlike
 * `baseJSBundle` + `bundleToString`, which keep modules as independently
 * addressable top-level `__d(...)` statements, the switch form wraps them all in
 * one function -- so the code and source map must be assembled together (a
 * `BundleBuilder`), rather than via the flat index-map path which assumes the
 * plain layout.
 *
 * The structured graph is untouched, so deltas and HMR (which address modules
 * individually via `hmrJSBundle`) are unaffected: an HMR update is still a
 * top-level `__d(...)` that shadows the switch branch. The runtime materialises
 * a not-yet-required module on demand via its segment definer (see
 * `ensureModuleRegistered` in the require polyfill), so Fast Refresh keeps
 * working with behaviour identical to an eager bundle.
 */
export default function baseJSBundleWithLazyModuleDefinition(
  entryPoint: string,
  preModules: ReadonlyArray<Module<>>,
  graph: ReadOnlyGraph<>,
  options: Options,
): {code: string, map: string} {
  // Assign ids up front so ordering and dependency-map ids are stable, matching
  // `baseJSBundle`.
  for (const module of graph.dependencies.values()) {
    options.createModuleId(module.path);
  }

  const excludeSource = options.excludeSource === true;

  const wrapOptions = {
    createModuleId: options.createModuleId,
    dev: options.dev,
    includeAsyncPaths: options.includeAsyncPaths,
    projectRoot: options.projectRoot,
    serverRoot: options.serverRoot,
    sourceUrl: options.sourceUrl,
    dependencyMapReservedName: options.dependencyMapReservedName,
    unstable_inlineDependencyMap: options.unstable_inlineDependencyMap,
    unstable_getAsyncDependencyPath: options.unstable_getAsyncDependencyPath,
  };

  const mapOptions = {
    excludeSource,
    shouldAddToIgnoreList: options.shouldAddToIgnoreList,
    getSourceUrl: options.getSourceUrl,
  };

  const builder = new BundleBuilder(options.sourceUrl ?? 'bundle.js');

  const getModuleEntry = (module: Module<>): LazyModuleSwitchEntry => {
    const code = wrapModule(module, wrapOptions);
    const info = getSourceMapInfo(module, mapOptions);
    // Per-module map in its own coordinate space; `BundleBuilder` offsets each
    // section by the current output position, so the wrapping (`case N:` prefix,
    // segment preamble, preceding modules) is accounted for automatically.
    const map = fromRawMappings([info]).toMap(undefined, {excludeSource});
    return {
      code,
      map,
      moduleId: options.createModuleId(module.path),
      sourcePath: module.path,
    };
  };

  const appendModule = (module: Module<>): void => {
    const entry = getModuleEntry(module);
    builder.append(entry.code, entry.map);
  };

  // Pre-modules (polyfills + require runtime) are emitted eagerly at the top.
  if (!options.modulesOnly) {
    for (const module of preModules) {
      if (isJsModule(module) && options.processModuleFilter(module)) {
        appendModule(module);
        builder.append('\n');
      }
    }
  }

  const modules = [...graph.dependencies.values()]
    .filter(isJsModule)
    .filter(options.processModuleFilter)
    .sort(
      (a, b) => options.createModuleId(a.path) - options.createModuleId(b.path),
    );

  builder.append('__registerSegment(0, function defSeg0(moduleId) {');
  appendLazyModuleSwitch(builder, modules.map(getModuleEntry), {
    globalPrefix: options.globalPrefix,
  });
  builder.append('});\n');

  // Run-module calls (and the trailing sourceMappingURL comment) stay eager,
  // after registration.
  const postScripts = processModules(
    getAppendScripts(entryPoint, [...preModules, ...modules], {
      asyncRequireModulePath: options.asyncRequireModulePath,
      createModuleId: options.createModuleId,
      getRunModuleStatement: options.getRunModuleStatement,
      globalPrefix: options.globalPrefix,
      inlineSourceMap: options.inlineSourceMap,
      processModuleFilter: options.processModuleFilter,
      runBeforeMainModule: options.runBeforeMainModule,
      runModule: options.runModule,
      shouldAddToIgnoreList: options.shouldAddToIgnoreList,
      sourceMapUrl: options.sourceMapUrl,
      sourceUrl: options.sourceUrl,
      getSourceUrl: options.getSourceUrl,
    }),
    {
      filter: options.processModuleFilter,
      ...wrapOptions,
    },
  );
  for (const [, code] of postScripts) {
    if (code.length > 0) {
      builder.append(code + '\n');
    }
  }

  return {
    code: builder.getCode(),
    map: JSON.stringify(builder.getMap()),
  };
}
