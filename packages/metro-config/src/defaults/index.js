/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

import type {ConfigT} from '../types';

import {
  DEFAULT_METRO_MINIFIER_PATH,
  additionalExts,
  assetExts,
  assetResolutions,
  defaultCreateModuleIdFactory,
  noopPerfLoggerFactory,
  platforms,
  sourceExts,
} from './defaults';
import exclusionList from './exclusionList';
import getMaxWorkers from './getMaxWorkers';
import {FileStore} from 'metro-cache';
import {Terminal} from 'metro-core';
import TerminalReporter from 'metro/private/lib/TerminalReporter';
import * as os from 'os';
import * as path from 'path';

const getDefaultValues = (projectRoot: ?string): ConfigT => ({
  resolver: {
    assetExts,
    assetResolutions,
    platforms,
    sourceExts,
    blockList: exclusionList(),
    dependencyExtractor: undefined,
    disableHierarchicalLookup: false,
    emptyModulePath: require.resolve(
      'metro-runtime/src/modules/empty-module.js',
    ),
    enableGlobalPackages: false,
    extraNodeModules: {},
    hasteImplModulePath: undefined,
    nodeModulesPaths: [],
    resolveRequest: null,
    resolverMainFields: ['browser', 'main'],
    unstable_conditionNames: [],
    unstable_conditionsByPlatform: {
      web: ['browser'],
    },
    unstable_enablePackageExports: true,
    unstable_incrementalResolution: false,
    useWatchman: true,
    requireCycleIgnorePatterns: [/(^|\/|\\)node_modules($|\/|\\)/],
    unstable_forceFullRefreshPatterns: [],
  },

  serializer: {
    polyfillModuleNames: [],
    getRunModuleStatement: (moduleId: number | string, globalPrefix: string) =>
      `__r(${JSON.stringify(moduleId)});`,
    getPolyfills: () => [],
    getModulesRunBeforeMainModule: () => [],
    processModuleFilter: module => true,
    createModuleIdFactory: defaultCreateModuleIdFactory,
    experimentalSerializerHook: () => {},
    customSerializer: null,
    isThirdPartyModule: module =>
      /(?:^|[/\\])node_modules[/\\]/.test(module.path),
  },

  server: {
    enhanceMiddleware: (middleware, _) => middleware,
    forwardClientLogs: true,
    port: 8081,
    rewriteRequestUrl: url => url,
    unstable_serverRoot: null,
    useGlobalHotkey: true,
    verifyConnections: false,
    tls: false,
  },

  symbolicator: {
    customizeFrame: () => {},
    customizeStack: async (stack, _) => stack,
  },

  transformer: {
    assetPlugins: [],
    asyncRequireModulePath: 'metro-runtime/src/modules/asyncRequire',
    assetRegistryPath: 'missing-asset-registry-path',
    babelTransformerPath: 'metro-babel-transformer',
    dynamicDepsInPackages: 'throwAtRuntime',
    enableBabelRCLookup: true,
    enableBabelRuntime: true,
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: false,
      },
      preloadedModules: false,
      ramGroups: [],
    }),
    globalPrefix: '',
    hermesParser: false,
    minifierConfig: {
      mangle: {
        toplevel: false,
      },
      output: {
        ascii_only: true,
        quote_style: 3,
        wrap_iife: true,
      },
      sourceMap: {
        includeSources: false,
      },
      toplevel: false,
      compress: {
        // reduce_funcs inlines single-use functions, which cause perf regressions.
        reduce_funcs: false,
      },
    },
    minifierPath: DEFAULT_METRO_MINIFIER_PATH,
    optimizationSizeLimit: 150 * 1024, // 150 KiB.
    transformVariants: {default: {}},
    publicPath: '/assets',
    allowOptionalDependencies: false,
    unstable_allowRequireContext: false,
    unstable_dependencyMapReservedName: null,
    unstable_disableModuleWrapping: false,
    unstable_disableNormalizePseudoGlobals: false,
    unstable_renameRequire: true,
    unstable_compactOutput: false,
    unstable_memoizeInlineRequires: false,
    unstable_workerThreads: false,
  },
  watcher: {
    additionalExts,
    healthCheck: {
      enabled: false,
      filePrefix: '.metro-health-check',
      interval: 30000,
      timeout: 5000,
    },
    unstable_lazySha1: true,
    unstable_autoSaveCache: {
      enabled: true,
      debounceMs: 5000,
    },
    watchman: {
      deferStates: ['hg.update'],
    },
  },
  cacheStores: [
    new FileStore({
      root: path.join(os.tmpdir(), 'metro-cache'),
    }),
  ],
  cacheVersion: '1.0',
  // We assume the default project path is two levels up from
  // node_modules/metro/
  projectRoot: projectRoot || path.resolve(__dirname, '../../..'),
  stickyWorkers: true,
  watchFolders: [],
  transformerPath: 'metro-transform-worker',
  maxWorkers: getMaxWorkers(),
  resetCache: false,
  reporter: new TerminalReporter(new Terminal(process.stdout)),
  unstable_perfLoggerFactory: noopPerfLoggerFactory,
});

async function getDefaultConfig(rootPath: ?string): Promise<ConfigT> {
  // We can add more logic here to get a sensible default configuration, for
  // now we just return a stub.

  return getDefaultValues(rootPath);
}

getDefaultConfig.getDefaultValues = getDefaultValues;

export default getDefaultConfig as interface {
  (rootPath?: string): Promise<ConfigT>,
  getDefaultValues: (rootPath?: string) => ConfigT,
};
