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

import type {HandleFunction, Server} from 'connect';
import type {CacheStore, MetroCache} from 'metro-cache';
import type {CacheManagerFactory, InputFileMapPlugin} from 'metro-file-map';
import type {CustomResolver} from 'metro-resolver';
import type {JsTransformerConfig} from 'metro-transform-worker';
import type {
  DeltaResult,
  Module,
  ReadOnlyGraph,
  SerializerOptions,
  TransformResult,
} from 'metro/private/DeltaBundler/types';
import type {Reporter} from 'metro/private/lib/reporting';
import type MetroServer from 'metro/private/Server';
import type {IntermediateStackFrame} from 'metro/private/Server/symbolicate';

export type ExtraTransformOptions = Readonly<{
  preloadedModules?: Readonly<{[path: string]: true, ...}> | false,
  ramGroups?: ReadonlyArray<string>,
  transform?: Readonly<{
    experimentalImportSupport?: boolean,
    inlineRequires?:
      | Readonly<{
          blockList: Readonly<{[absoluteModulePath: string]: true, ...}>,
          ...
        }>
      | boolean,
    nonInlinedRequires?: ReadonlyArray<string>,
    unstable_memoizeInlineRequires?: boolean,
    unstable_nonMemoizedInlineRequires?: ReadonlyArray<string>,
  }>,
  ...
}>;

export type GetTransformOptionsOpts = {
  dev: boolean,
  /**
   * @deprecated Always true
   */
  hot: true,
  platform: ?string,
};

export type GetTransformOptions = (
  entryPoints: ReadonlyArray<string>,
  options: GetTransformOptionsOpts,
  getDependenciesOf: (absoluteFilePath: string) => Promise<Array<string>>,
) => Promise<Partial<ExtraTransformOptions>>;

export type Middleware = HandleFunction;

type PerfAnnotations = Partial<{
  string: Readonly<{[key: string]: string}>,
  int: Readonly<{[key: string]: number}>,
  double: Readonly<{[key: string]: number}>,
  bool: Readonly<{[key: string]: boolean}>,
  string_array: Readonly<{[key: string]: ReadonlyArray<string>}>,
  int_array: Readonly<{[key: string]: ReadonlyArray<number>}>,
  double_array: Readonly<{[key: string]: ReadonlyArray<number>}>,
  bool_array: Readonly<{[key: string]: ReadonlyArray<boolean>}>,
}>;

type PerfLoggerPointOptions = Readonly<{
  // The time this event point occurred, if it differs from the time the point was logged.
  timestamp?: number,
}>;

export interface PerfLogger {
  point(name: string, opts?: PerfLoggerPointOptions): void;
  annotate(annotations: PerfAnnotations): void;
  subSpan(label: string): PerfLogger;
}

export interface RootPerfLogger extends PerfLogger {
  start(opts?: PerfLoggerPointOptions): void;
  end(
    status: 'SUCCESS' | 'FAIL' | 'CANCEL',
    opts?: PerfLoggerPointOptions,
  ): void;
}

export type PerfLoggerFactoryOptions = Readonly<{
  key?: number,
}>;

export type PerfLoggerFactory = (
  type: 'START_UP' | 'BUNDLING_REQUEST' | 'HMR',
  opts?: PerfLoggerFactoryOptions,
) => RootPerfLogger;

type ResolverConfigT = {
  assetExts: ReadonlyArray<string>,
  assetResolutions: ReadonlyArray<string>,
  blockList: RegExp | Array<RegExp>,
  disableHierarchicalLookup: boolean,
  dependencyExtractor: ?string,
  emptyModulePath: string,
  enableGlobalPackages: boolean,
  extraNodeModules: {[name: string]: string, ...},
  hasteImplModulePath: ?string,
  nodeModulesPaths: ReadonlyArray<string>,
  platforms: ReadonlyArray<string>,
  resolveRequest: ?CustomResolver,
  resolverMainFields: ReadonlyArray<string>,
  sourceExts: ReadonlyArray<string>,
  unstable_conditionNames: ReadonlyArray<string>,
  unstable_conditionsByPlatform: Readonly<{
    [platform: string]: ReadonlyArray<string>,
  }>,
  unstable_enablePackageExports: boolean,
  unstable_incrementalResolution: boolean,
  useWatchman: boolean,
  requireCycleIgnorePatterns: ReadonlyArray<RegExp>,
  unstable_forceFullRefreshPatterns: ReadonlyArray<RegExp>,
};

type SerializerConfigT = {
  createModuleIdFactory: () => (path: string) => number,
  customSerializer: ?(
    entryPoint: string,
    preModules: ReadonlyArray<Module<>>,
    graph: ReadOnlyGraph<>,
    options: SerializerOptions,
  ) => Promise<string | {code: string, map: string}>,
  experimentalSerializerHook: (
    graph: ReadOnlyGraph<>,
    delta: DeltaResult<>,
  ) => unknown,
  getModulesRunBeforeMainModule: (entryFilePath: string) => Array<string>,
  getPolyfills: ({platform: ?string, ...}) => ReadonlyArray<string>,
  getRunModuleStatement: (
    moduleId: number | string,
    globalPrefix: string,
  ) => string,
  polyfillModuleNames: ReadonlyArray<string>,
  processModuleFilter: (modules: Module<>) => boolean,
  isThirdPartyModule: (module: Readonly<{path: string, ...}>) => boolean,
};

type TransformerConfigT = {
  ...JsTransformerConfig,
  getTransformOptions: GetTransformOptions,
  // TODO(moti): Remove this Meta-internal option from Metro's public config
  transformVariants: {readonly [name: string]: Partial<ExtraTransformOptions>},
  publicPath: string,
  unstable_workerThreads: boolean,
};

type MetalConfigT = {
  cacheVersion: string,
  fileMapCacheDirectory?: string,
  hasteMapCacheDirectory?: string, // Deprecated, alias of fileMapCacheDirectory
  unstable_fileMapCacheManagerFactory?: CacheManagerFactory,
  unstable_fileMapPlugins?: ReadonlyArray<InputFileMapPlugin>,
  maxWorkers: number,
  unstable_perfLoggerFactory?: ?PerfLoggerFactory,
  projectRoot: string,
  stickyWorkers: boolean,
  transformerPath: string,
  reporter: Reporter,
  resetCache: boolean,
  watchFolders: ReadonlyArray<string>,
};

type CacheStoresConfigT = ReadonlyArray<CacheStore<TransformResult<>>>;

type ServerConfigT = {
  /** @deprecated */
  enhanceMiddleware: (Middleware, MetroServer) => Middleware | Server,
  forwardClientLogs: boolean,
  port: number,
  rewriteRequestUrl: string => string,
  unstable_serverRoot: ?string,
  useGlobalHotkey: boolean,
  verifyConnections: boolean,
  tls:
    | false
    | {
        ca?: string | Buffer,
        cert?: string | Buffer,
        key?: string | Buffer,
        requestCert?: boolean,
      },
};

type SymbolicatorConfigT = {
  customizeFrame: ({
    readonly file: ?string,
    readonly lineNumber: ?number,
    readonly column: ?number,
    readonly methodName: ?string,
    ...
  }) =>
    | ?{readonly collapse?: boolean}
    | Promise<?{readonly collapse?: boolean}>,
  customizeStack: (
    Array<IntermediateStackFrame>,
    unknown,
  ) => Array<IntermediateStackFrame> | Promise<Array<IntermediateStackFrame>>,
};

type WatcherConfigT = {
  additionalExts: ReadonlyArray<string>,
  healthCheck: Readonly<{
    enabled: boolean,
    interval: number,
    timeout: number,
    filePrefix: string,
  }>,
  unstable_autoSaveCache: Readonly<{
    enabled: boolean,
    debounceMs?: number,
  }>,
  unstable_lazySha1: boolean,
  watchman: Readonly<{
    deferStates: ReadonlyArray<string>,
  }>,
};

export type InputConfigT = Partial<
  Readonly<
    MetalConfigT & {
      cacheStores: CacheStoresConfigT | (MetroCache => CacheStoresConfigT),
      resolver: Readonly<Partial<ResolverConfigT>>,
      server: Readonly<Partial<ServerConfigT>>,
      serializer: Readonly<Partial<SerializerConfigT>>,
      symbolicator: Readonly<Partial<SymbolicatorConfigT>>,
      transformer: Readonly<Partial<TransformerConfigT>>,
      watcher: Partial<
        Readonly<
          Omit<
            WatcherConfigT,
            'healthCheck' | 'unstable_autoSaveCache' | 'watchman',
          > & {
            healthCheck: Partial<Readonly<WatcherConfigT['healthCheck']>>,
            unstable_autoSaveCache: Partial<
              Readonly<WatcherConfigT['unstable_autoSaveCache']>,
            >,
            watchman: Partial<Readonly<WatcherConfigT['watchman']>>,
          },
        >,
      >,
    },
  >,
>;

export type MetroConfig = InputConfigT;

export type ConfigT = Readonly<
  MetalConfigT & {
    cacheStores: CacheStoresConfigT,
    resolver: Readonly<ResolverConfigT>,
    server: Readonly<ServerConfigT>,
    serializer: Readonly<SerializerConfigT>,
    symbolicator: Readonly<SymbolicatorConfigT>,
    transformer: Readonly<TransformerConfigT>,
    watcher: Readonly<WatcherConfigT>,
  },
>;

export type YargArguments = Readonly<{
  config?: string,
  cwd?: string,
  port?: string | number,
  host?: string,
  projectRoot?: string,
  watchFolders?: Array<string>,
  assetExts?: Array<string>,
  sourceExts?: Array<string>,
  platforms?: Array<string>,
  'max-workers'?: string | number,
  maxWorkers?: string | number,
  transformer?: string,
  'reset-cache'?: boolean,
  resetCache?: boolean,
  verbose?: boolean,
  ...
}>;
