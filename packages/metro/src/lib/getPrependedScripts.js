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

import type Bundler from '../Bundler';
import type {Module, default as DeltaBundler} from '../DeltaBundler';
import type {TransformInputOptions} from '../DeltaBundler/types';
import type {ResolverInputOptions} from '../shared/types';
import type {ConfigT} from 'metro-config';

import CountingSet from './CountingSet';
import countLines from './countLines';
import getPreludeCode from './getPreludeCode';
import * as transformHelpers from './transformHelpers';
import * as defaults from 'metro-config/private/defaults/defaults';

export default async function getPrependedScripts(
  config: ConfigT,
  options: Omit<TransformInputOptions, 'type'>,
  resolverOptions: ResolverInputOptions,
  bundler: Bundler,
  deltaBundler: DeltaBundler<>,
): Promise<ReadonlyArray<Module<>>> {
  // Get all the polyfills from the relevant option params (the
  // `getPolyfills()` method and the `polyfillModuleNames` variable).
  const polyfillModuleNames = config.serializer
    .getPolyfills({
      platform: options.platform,
    })
    .concat(config.serializer.polyfillModuleNames);

  const transformOptions: TransformInputOptions = {
    ...options,
    type: 'script',
  };

  const resolve = await transformHelpers.getResolveDependencyFn(
    bundler,
    options.platform,
    resolverOptions,
  );
  const dependencyGraph = await bundler.getDependencyGraph();

  const moduleSystem = resolve(`${config.projectRoot}/.`, {
    name: defaults.moduleSystem,
    data: {
      key: defaults.moduleSystem,
      locs: [],
      asyncType: null,
      isESMImport: false,
    },
  }).filePath;

  // A bundle with no module system builds successfully but fails at runtime.
  if (dependencyGraph.isEmptyModule(moduleSystem)) {
    throw new Error(
      `The module system ('${defaults.moduleSystem}') resolved to an empty ` +
        'module. A custom `resolver.resolveRequest` must delegate this ' +
        'specifier to `context.resolveRequest`, or resolve it to a file.',
    );
  }

  const dependencies = await deltaBundler.getDependencies(
    [moduleSystem, ...polyfillModuleNames],
    {
      resolve,
      transform: await transformHelpers.getTransformFn(
        [moduleSystem, ...polyfillModuleNames],
        bundler,
        deltaBundler,
        config,
        transformOptions,
        resolverOptions,
      ),
      unstable_allowRequireContext:
        config.transformer.unstable_allowRequireContext,
      transformOptions,
      onProgress: null,
      lazy: false,
      unstable_enablePackageExports:
        config.resolver.unstable_enablePackageExports,
      unstable_incrementalResolution:
        config.resolver.unstable_incrementalResolution,
      shallow: false,
    },
  );

  return [
    _getPrelude({
      dev: options.dev,
      globalPrefix: config.transformer.globalPrefix,
      requireCycleIgnorePatterns: config.resolver.requireCycleIgnorePatterns,
      unstable_forceFullRefreshPatterns:
        config.resolver.unstable_forceFullRefreshPatterns,
    }),
    ...dependencies.values(),
  ];
}

function _getPrelude({
  dev,
  globalPrefix,
  requireCycleIgnorePatterns,
  unstable_forceFullRefreshPatterns,
}: {
  dev: boolean,
  globalPrefix: string,
  requireCycleIgnorePatterns: ReadonlyArray<RegExp>,
  unstable_forceFullRefreshPatterns: ReadonlyArray<RegExp>,
  ...
}): Module<> {
  const code = getPreludeCode({
    isDev: dev,
    globalPrefix,
    requireCycleIgnorePatterns,
    unstable_forceFullRefreshPatterns,
  });
  const name = '__prelude__';

  return {
    dependencies: new Map(),
    getSource: (): Buffer => Buffer.from(code),
    inverseDependencies: new CountingSet(),
    path: name,
    output: [
      {
        type: 'js/script/virtual',
        data: {
          code,
          lineCount: countLines(code),
          map: [],
        },
      },
    ],
  };
}
