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

import type {AssetData} from './Assets';
import type {ExplodedSourceMap} from './DeltaBundler/Serializers/getExplodedSourceMap';
import type {RamBundleInfo} from './DeltaBundler/Serializers/getRamBundleInfo';
import type {
  MixedOutput,
  Module,
  ReadOnlyDependencies,
  ReadOnlyGraph,
  TransformInputOptions,
  TransformResult,
} from './DeltaBundler/types';
import type {RevisionId} from './IncrementalBundler';
import type {GraphId} from './lib/getGraphId';
import type {JsonData} from './lib/parseJsonBody';
import type {Reporter} from './lib/reporting';
import type {StackFrameInput, StackFrameOutput} from './Server/symbolicate';
import type {
  BuildOptions,
  BundleOptions,
  GraphOptions,
  ResolverInputOptions,
  SplitBundleOptions,
} from './shared/types';
import type {IncomingMessage} from 'connect';
import type {ServerResponse} from 'http';
import type {CacheStore} from 'metro-cache';
import type {ConfigT, RootPerfLogger} from 'metro-config';
import type {
  ActionLogEntryData,
  ActionStartLogEntry,
} from 'metro-core/private/Logger';
import type {CustomResolverOptions} from 'metro-resolver/private/types';
import type {CustomTransformOptions} from 'metro-transform-worker';

import {getAsset} from './Assets';
import baseJSBundle from './DeltaBundler/Serializers/baseJSBundle';
import getAllFiles from './DeltaBundler/Serializers/getAllFiles';
import getAssets from './DeltaBundler/Serializers/getAssets';
import {getExplodedSourceMap} from './DeltaBundler/Serializers/getExplodedSourceMap';
import getRamBundleInfo from './DeltaBundler/Serializers/getRamBundleInfo';
import {sourceMapStringNonBlocking} from './DeltaBundler/Serializers/sourceMapString';
import IncrementalBundler from './IncrementalBundler';
import ResourceNotFoundError from './IncrementalBundler/ResourceNotFoundError';
import {calculateBundleProgressRatio} from './lib/bundleProgressUtils';
import bundleToString from './lib/bundleToString';
import formatBundlingError from './lib/formatBundlingError';
import getGraphId from './lib/getGraphId';
import parseBundleOptionsFromBundleRequestUrl from './lib/parseBundleOptionsFromBundleRequestUrl';
import parseJsonBody from './lib/parseJsonBody';
import splitBundleOptions from './lib/splitBundleOptions';
import * as transformHelpers from './lib/transformHelpers';
import {UnableToResolveError} from './node-haste/DependencyGraph/ModuleResolution';
import parsePlatformFilePath from './node-haste/lib/parsePlatformFilePath';
import MultipartResponse from './Server/MultipartResponse';
import symbolicate from './Server/symbolicate';
import {SourcePathsMode} from './shared/types';
import {codeFrameColumns} from '@babel/code-frame';
import * as fs from 'graceful-fs';
import * as jscSafeUrl from 'jsc-safe-url';
import {Logger} from 'metro-core';
import mime from 'mime-types';
import nullthrows from 'nullthrows';
import path from 'path';
import {performance} from 'perf_hooks';
import querystring from 'querystring';

// eslint-disable-next-line import/no-commonjs
const debug = require('debug')('Metro:Server');

const {createActionStartEntry, createActionEndEntry, log} = Logger;

const noopLogger: RootPerfLogger = {
  start: () => {},
  point: () => {},
  annotate: () => {},
  subSpan: () => noopLogger,
  end: () => {},
};

export type SegmentLoadData = {[number]: [Array<number>, ?number], ...};
export type BundleMetadata = {
  hash: string,
  otaBuildNumber: ?string,
  mobileConfigs: Array<string>,
  segmentHashes: Array<string>,
  segmentLoadData: SegmentLoadData,
  ...
};

type ProcessStartContext = {
  ...SplitBundleOptions,
  readonly buildNumber: number,
  readonly bundleOptions: BundleOptions,
  readonly graphId: GraphId,
  readonly graphOptions: GraphOptions,
  readonly mres: MultipartResponse | ServerResponse,
  readonly req: IncomingMessage,
  readonly revisionId?: ?RevisionId,
  readonly bundlePerfLogger: RootPerfLogger,
  readonly requestStartTimestamp: number,
};

type ProcessDeleteContext = {
  readonly graphId: GraphId,
  readonly req: IncomingMessage,
  readonly res: ServerResponse,
};

type ProcessEndContext<T> = {
  ...ProcessStartContext,
  readonly result: T,
};

export type ServerOptions = Readonly<{
  hasReducedPerformance?: boolean,
  onBundleBuilt?: (bundlePath: string) => void,
  watch?: boolean,
}>;

const DELTA_ID_HEADER = 'X-Metro-Delta-ID';
const FILES_CHANGED_COUNT_HEADER = 'X-Metro-Files-Changed-Count';

type FetchTiming = {
  graphId: GraphId,
  startTime: number,
  endTime: number | null,
  isPrefetch: boolean,
};

export default class Server {
  _bundler: IncrementalBundler;
  _config: ConfigT;
  _createModuleId: (path: string) => number;
  _isEnded: boolean;
  _logger: typeof Logger;
  _nextBundleBuildNumber: number;
  _platforms: Set<string>;
  _reporter: Reporter;
  _serverOptions: ServerOptions | void;
  _allowedSuffixesForSourceRequests: ReadonlyArray<string>;
  _sourceRequestRoutingMap: ReadonlyArray<
    [pathnamePrefix: string, normalizedRootDir: string],
  >;
  _fetchTimings: Array<FetchTiming>;
  _activeFetchCount: number;

  constructor(config: ConfigT, options?: ServerOptions) {
    this._config = config;
    this._serverOptions = options;

    if (this._config.resetCache) {
      this._config.cacheStores.forEach((store: CacheStore<TransformResult<>>) =>
        store.clear(),
      );
      this._config.reporter.update({type: 'transform_cache_reset'});
    }

    this._reporter = config.reporter;
    this._logger = Logger;
    this._platforms = new Set(this._config.resolver.platforms);
    this._allowedSuffixesForSourceRequests = [
      ...new Set(
        [
          ...this._config.resolver.sourceExts,
          ...this._config.watcher.additionalExts,
          ...this._config.resolver.assetExts,
        ].map(ext => '.' + ext),
      ),
    ];
    this._sourceRequestRoutingMap = [
      ['/[metro-project]/', path.resolve(this._config.projectRoot)],
      ...this._config.watchFolders.map((watchFolder, index) => [
        `/[metro-watchFolders]/${index}/`,
        path.resolve(watchFolder),
      ]),
    ];
    this._isEnded = false;
    this._fetchTimings = [];
    this._activeFetchCount = 0;

    // TODO(T34760917): These two properties should eventually be instantiated
    // elsewhere and passed as parameters, since they are also needed by
    // the HmrServer.
    // The whole bundling/serializing logic should follow as well.
    this._createModuleId = config.serializer.createModuleIdFactory();
    this._bundler = new IncrementalBundler(config, {
      hasReducedPerformance: options && options.hasReducedPerformance,
      watch: options ? options.watch : undefined,
    });
    this._nextBundleBuildNumber = 1;
  }

  async end() {
    if (!this._isEnded) {
      await this._bundler.end();
      this._isEnded = true;
    }
  }

  getBundler(): IncrementalBundler {
    return this._bundler;
  }

  getCreateModuleId(): (path: string) => number {
    return this._createModuleId;
  }

  async _serializeGraph({
    splitOptions,
    prepend,
    graph,
  }: Readonly<{
    splitOptions: SplitBundleOptions,
    prepend: ReadonlyArray<Module<>>,
    graph: ReadOnlyGraph<>,
  }>): Promise<{code: string, map: string}> {
    const {
      entryFile,
      graphOptions,
      resolverOptions,
      serializerOptions,
      transformOptions,
    } = splitOptions;

    const entryPoint = this._getEntryPointAbsolutePath(entryFile);

    const bundleOptions = {
      asyncRequireModulePath: await this._resolveRelativePath(
        this._config.transformer.asyncRequireModulePath,
        {
          relativeTo: 'project',
          resolverOptions,
          transformOptions,
        },
      ),
      processModuleFilter: this._config.serializer.processModuleFilter,
      createModuleId: this._createModuleId,
      getRunModuleStatement: this._config.serializer.getRunModuleStatement,
      globalPrefix: this._config.transformer.globalPrefix,
      dev: transformOptions.dev,
      includeAsyncPaths: graphOptions.lazy,
      projectRoot: this._config.projectRoot,
      modulesOnly: serializerOptions.modulesOnly,
      runBeforeMainModule:
        this._config.serializer.getModulesRunBeforeMainModule(
          path.relative(this._config.projectRoot, entryPoint),
        ),
      runModule: serializerOptions.runModule,
      sourceMapUrl: serializerOptions.sourceMapUrl,
      sourceUrl: serializerOptions.sourceUrl,
      inlineSourceMap: serializerOptions.inlineSourceMap,
      serverRoot:
        this._config.server.unstable_serverRoot ?? this._config.projectRoot,
      shouldAddToIgnoreList: (module: Module<>) =>
        this._shouldAddModuleToIgnoreList(module),
      getSourceUrl: (module: Module<>) =>
        this._getModuleSourceUrl(module, serializerOptions.sourcePaths),
    };
    let bundleCode = null;
    let bundleMap = null;
    if (this._config.serializer.customSerializer) {
      const bundle = await this._config.serializer.customSerializer(
        entryPoint,
        prepend,
        graph,
        bundleOptions,
      );
      if (typeof bundle === 'string') {
        bundleCode = bundle;
      } else {
        bundleCode = bundle.code;
        bundleMap = bundle.map;
      }
    } else {
      bundleCode = bundleToString(
        baseJSBundle(entryPoint, prepend, graph, bundleOptions),
      ).code;
    }
    if (!bundleMap) {
      bundleMap = await sourceMapStringNonBlocking(
        [...prepend, ...this._getSortedModules(graph)],
        {
          excludeSource: serializerOptions.excludeSource,
          processModuleFilter: this._config.serializer.processModuleFilter,
          shouldAddToIgnoreList: bundleOptions.shouldAddToIgnoreList,
          getSourceUrl: (module: Module<>) =>
            this._getModuleSourceUrl(module, serializerOptions.sourcePaths),
        },
      );
    }
    return {
      code: bundleCode,
      map: bundleMap,
    };
  }

  async build(
    bundleOptions: BundleOptions,
    {withAssets}: BuildOptions = {},
  ): Promise<{
    code: string,
    map: string,
    assets?: ReadonlyArray<AssetData>,
    ...
  }> {
    const splitOptions = splitBundleOptions(bundleOptions);
    const {
      entryFile,
      graphOptions,
      onProgress,
      resolverOptions,
      transformOptions,
    } = splitOptions;

    const {prepend, graph} = await this._bundler.buildGraph(
      entryFile,
      transformOptions,
      resolverOptions,
      {
        onProgress,
        shallow: graphOptions.shallow,
        lazy: graphOptions.lazy,
      },
    );

    const [{code, map}, assets] = await Promise.all([
      this._serializeGraph({
        splitOptions,
        prepend,
        graph,
      }),
      withAssets
        ? this._getAssetsFromDependencies(
            graph.dependencies,
            bundleOptions.platform,
          )
        : null,
    ]);

    return {
      code,
      map,
      ...(withAssets ? {assets: nullthrows(assets)} : null),
    };
  }

  async getRamBundleInfo(options: BundleOptions): Promise<RamBundleInfo> {
    const {
      entryFile,
      graphOptions,
      onProgress,
      resolverOptions,
      serializerOptions,
      transformOptions,
    } = splitBundleOptions(options);

    const {prepend, graph} = await this._bundler.buildGraph(
      entryFile,
      transformOptions,
      resolverOptions,
      {
        onProgress,
        shallow: graphOptions.shallow,
        lazy: graphOptions.lazy,
      },
    );

    const entryPoint = this._getEntryPointAbsolutePath(entryFile);

    return await getRamBundleInfo(entryPoint, prepend, graph, {
      asyncRequireModulePath: await this._resolveRelativePath(
        this._config.transformer.asyncRequireModulePath,
        {
          relativeTo: 'project',
          resolverOptions,
          transformOptions,
        },
      ),
      processModuleFilter: this._config.serializer.processModuleFilter,
      createModuleId: this._createModuleId,
      dev: transformOptions.dev,
      excludeSource: serializerOptions.excludeSource,
      getRunModuleStatement: this._config.serializer.getRunModuleStatement,
      getTransformOptions: this._config.transformer.getTransformOptions,
      globalPrefix: this._config.transformer.globalPrefix,
      includeAsyncPaths: graphOptions.lazy,
      platform: transformOptions.platform,
      projectRoot: this._config.projectRoot,
      modulesOnly: serializerOptions.modulesOnly,
      runBeforeMainModule:
        this._config.serializer.getModulesRunBeforeMainModule(
          path.relative(this._config.projectRoot, entryPoint),
        ),
      runModule: serializerOptions.runModule,
      sourceMapUrl: serializerOptions.sourceMapUrl,
      sourceUrl: serializerOptions.sourceUrl,
      inlineSourceMap: serializerOptions.inlineSourceMap,
      serverRoot:
        this._config.server.unstable_serverRoot ?? this._config.projectRoot,
      shouldAddToIgnoreList: (module: Module<>) =>
        this._shouldAddModuleToIgnoreList(module),
      getSourceUrl: (module: Module<>) =>
        this._getModuleSourceUrl(module, serializerOptions.sourcePaths),
    });
  }

  async getAssets(options: BundleOptions): Promise<ReadonlyArray<AssetData>> {
    const {entryFile, onProgress, resolverOptions, transformOptions} =
      splitBundleOptions(options);

    const dependencies = await this._bundler.getDependencies(
      [entryFile],
      transformOptions,
      resolverOptions,
      {onProgress, shallow: false, lazy: false},
    );

    return this._getAssetsFromDependencies(
      dependencies,
      transformOptions.platform,
    );
  }

  async _getAssetsFromDependencies(
    dependencies: ReadOnlyDependencies<>,
    platform: ?string,
  ): Promise<ReadonlyArray<AssetData>> {
    return await getAssets(dependencies, {
      processModuleFilter: this._config.serializer.processModuleFilter,
      assetPlugins: this._config.transformer.assetPlugins,
      platform,
      projectRoot: this._getServerRootDir(),
      publicPath: this._config.transformer.publicPath,
    });
  }

  async getOrderedDependencyPaths(options: {
    readonly dev: boolean,
    readonly entryFile: string,
    readonly minify: boolean,
    readonly platform: ?string,
    ...
  }): Promise<Array<string>> {
    const {
      entryFile,
      onProgress,
      resolverOptions,
      transformOptions,
      /* $FlowFixMe[cannot-spread-inexact](>=0.122.0 site=react_native_fb) This comment suppresses an
       * error found when Flow v0.122.0 was deployed. To see the error, delete
       * this comment and run Flow. */
    } = splitBundleOptions({
      ...Server.DEFAULT_BUNDLE_OPTIONS,
      ...options,
    });

    const {prepend, graph} = await this._bundler.buildGraph(
      entryFile,
      transformOptions,
      resolverOptions,
      {onProgress, shallow: false, lazy: false},
    );

    const platform =
      transformOptions.platform ||
      parsePlatformFilePath(entryFile, this._platforms).platform;

    // $FlowFixMe[incompatible-type]
    return await getAllFiles(prepend, graph, {
      platform,
      processModuleFilter: this._config.serializer.processModuleFilter,
    });
  }

  _rangeRequestMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    data: string | Buffer,
    assetPath: string,
  ): Buffer | string {
    if (req.headers && req.headers.range) {
      const [rangeStart, rangeEnd] = req.headers.range
        .replace(/bytes=/, '')
        .split('-');
      const dataStart = parseInt(rangeStart, 10);
      const dataEnd = rangeEnd ? parseInt(rangeEnd, 10) : data.length - 1;
      const chunksize = dataEnd - dataStart + 1;

      res.writeHead(206, {
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize.toString(),
        'Content-Range': `bytes ${dataStart}-${dataEnd}/${data.length}`,
      });

      return data.slice(dataStart, dataEnd + 1);
    }

    res.setHeader('Content-Length', String(Buffer.byteLength(data)));

    return data;
  }

  async _processSingleAssetRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    debug('Processing single asset request: %s', req.url);
    if (!URL.canParse(req.url, 'resolve://')) {
      throw new Error('Could not parse URL', {cause: req.url});
    }

    const urlObj = new URL(req.url, 'resolve://');
    const formattedUrl = urlObj.toString();
    if (req.url !== formattedUrl) {
      debug('Formatted as:    %s', formattedUrl);
    }

    // using this Metro particular convention for decoding URL paths into file paths
    let [, assetPath] =
      urlObj.pathname
        .split('/')
        .map(segment => decodeURIComponent(segment))
        .join('/')
        .match(/^\/assets\/(.+)$/) || [];
    if (!assetPath && urlObj.searchParams.get('unstable_path')) {
      const [, actualPath, secondaryQuery] = nullthrows(
        (urlObj.searchParams.get('unstable_path') || '').match(
          /^([^?]*)\??(.*)$/,
        ),
      );
      if (secondaryQuery) {
        Object.entries(querystring.parse(secondaryQuery)).forEach(
          ([key, value]) => {
            urlObj.searchParams.set(key, value);
          },
        );
      }
      assetPath = actualPath;
    }

    if (!assetPath) {
      throw new Error('Could not extract asset path from URL');
    }

    const processingAssetRequestLogEntry = log(
      createActionStartEntry({
        action_name: 'Processing asset request',
        asset: assetPath[1],
      }),
    );

    try {
      const depGraph = await this._bundler.getBundler().getDependencyGraph();
      const data = await getAsset(
        assetPath,
        this._config.projectRoot,
        this._config.watchFolders,
        urlObj.searchParams.get('platform'),
        this._config.resolver.assetExts,
        filePath => depGraph.doesFileExist(filePath),
      );
      // Tell clients to cache this for 1 year.
      // This is safe as the asset url contains a hash of the asset.
      // $FlowFixMe[incompatible-type]
      /* $FlowFixMe[invalid-compare] Error discovered during Constant Condition
       * roll out. See https://fburl.com/workplace/4oq3zi07. */
      if (process.env.REACT_NATIVE_ENABLE_ASSET_CACHING === true) {
        res.setHeader('Cache-Control', 'max-age=31536000');
      }
      res.setHeader('Content-Type', mime.lookup(path.basename(assetPath)));
      res.end(this._rangeRequestMiddleware(req, res, data, assetPath));
      process.nextTick(() => {
        log(createActionEndEntry(processingAssetRequestLogEntry));
      });
    } catch (error) {
      console.error(error.stack);
      res.writeHead(404);
      res.end('Asset not found');
    }
  }

  processRequest: (
    IncomingMessage,
    ServerResponse,
    ((e: ?Error) => void),
  ) => void = (
    req: IncomingMessage,
    res: ServerResponse,
    next: (?Error) => void,
  ) => {
    this._processRequest(req, res, next).catch(next);
  };

  _parseOptions(url: string): BundleOptions {
    const {bundleType: _bundleType, ...bundleOptions} =
      parseBundleOptionsFromBundleRequestUrl(
        url,
        new Set(this._config.resolver.platforms),
      );
    return bundleOptions;
  }

  _rewriteAndNormalizeUrl(requestUrl: string): string {
    return jscSafeUrl.toNormalUrl(
      this._config.server.rewriteRequestUrl(jscSafeUrl.toNormalUrl(requestUrl)),
    );
  }

  async _processRequest(
    req: IncomingMessage,
    res: ServerResponse,
    next: (?Error) => void,
  ): Promise<void> {
    const originalUrl = req.url;
    debug('Handling request:    %s', originalUrl);
    req.url = this._rewriteAndNormalizeUrl(req.url);
    if (req.url !== originalUrl) {
      debug('Rewritten to:    %s', req.url);
    }
    const reqHost = req.headers['x-forwarded-host'] || req.headers['host'];
    debug('Request host is:    %s', req.headers['host']);
    if (req.headers['x-forwarded-host']) {
      debug(
        'Request x-forwarded-host is:    %s',
        req.headers['x-forwarded-host'],
      );
    }
    if (!reqHost) {
      throw new Error('No host header was found.');
    }

    const reqProtocol =
      req.headers['x-forwarded-proto'] ||
      // $FlowFixMe[prop-missing] not missing for https requests
      (req.socket?.encrypted === true ? 'https' : 'http');
    const urlObj = new URL(req.url, reqProtocol + '://' + reqHost);

    const formattedUrl = urlObj.toString();
    if (req.url !== formattedUrl) {
      debug('Formatted as:    %s', formattedUrl);
    }

    const pathname = urlObj.pathname || '';

    // using this Metro particular convention for decoding URL paths into file paths
    const filePathname = pathname
      .split('/')
      .map(segment => decodeURIComponent(segment))
      .join('/');

    const buildNumber = this.getNewBuildNumber();
    if (pathname.endsWith('.bundle')) {
      const options = this._parseOptions(formattedUrl);
      await this._processBundleRequest(req, res, options, {
        buildNumber,
        bundlePerfLogger:
          this._config.unstable_perfLoggerFactory?.('BUNDLING_REQUEST', {
            key: buildNumber,
          }) ?? noopLogger,
      });

      if (this._serverOptions && this._serverOptions.onBundleBuilt) {
        this._serverOptions.onBundleBuilt(filePathname);
      }
    } else if (pathname.endsWith('.map')) {
      // Chrome dev tools may need to access the source maps.
      res.setHeader('Access-Control-Allow-Origin', 'devtools://devtools');
      await this._processSourceMapRequest(
        req,
        res,
        this._parseOptions(formattedUrl),
        {
          buildNumber,
          bundlePerfLogger: noopLogger,
        },
      );
    } else if (pathname.endsWith('.assets')) {
      await this._processAssetsRequest(
        req,
        res,
        this._parseOptions(formattedUrl),
        {
          buildNumber,
          bundlePerfLogger: noopLogger,
        },
      );
    } else if (pathname.startsWith('/assets/') || pathname === '/assets') {
      await this._processSingleAssetRequest(req, res);
    } else if (pathname === '/symbolicate') {
      await this._symbolicate(req, res);
    } else {
      let handled = false;
      for (const [pathnamePrefix, normalizedRootDir] of this
        ._sourceRequestRoutingMap) {
        if (filePathname.startsWith(pathnamePrefix)) {
          const relativeFilePathname = filePathname.substr(
            pathnamePrefix.length,
          );
          await this._processSourceRequest(
            relativeFilePathname,
            normalizedRootDir,
            res,
          );
          handled = true;
          break;
        }
      }
      if (!handled) {
        next();
      }
    }
  }

  async _processSourceRequest(
    relativeFilePathname: string,
    rootDir: string,
    res: ServerResponse,
  ): Promise<void> {
    if (
      !this._allowedSuffixesForSourceRequests.some(suffix =>
        relativeFilePathname.endsWith(suffix),
      )
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    const depGraph = await this._bundler.getBundler().getDependencyGraph();
    const filePath = path.join(rootDir, relativeFilePathname);
    try {
      await depGraph.getOrComputeSha1(filePath);
    } catch {
      res.writeHead(404);
      res.end();
      return;
    }
    const mimeType = mime.lookup(path.basename(relativeFilePathname));
    res.setHeader('Content-Type', mimeType);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', error => {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end();
      } else {
        res.writeHead(500);
        res.end();
      }
    });
  }

  _createRequestProcessor<T>({
    bundleType,
    createStartEntry,
    createEndEntry,
    build,
    delete: deleteFn,
    finish,
  }: {
    readonly bundleType: 'assets' | 'bundle' | 'map',
    readonly createStartEntry: (
      context: ProcessStartContext,
    ) => ActionLogEntryData,
    readonly createEndEntry: (
      context: ProcessEndContext<T>,
    ) => Partial<ActionStartLogEntry>,
    readonly build: (context: ProcessStartContext) => Promise<T>,
    readonly delete?: (context: ProcessDeleteContext) => Promise<void>,
    readonly finish: (context: ProcessEndContext<T>) => void,
  }): (
    req: IncomingMessage,
    res: ServerResponse,
    bundleOptions: BundleOptions,
    buildContext: Readonly<{
      buildNumber: number,
      bundlePerfLogger: RootPerfLogger,
    }>,
  ) => Promise<void> {
    return async function requestProcessor(
      this: Server,
      req: IncomingMessage,
      res: ServerResponse,
      bundleOptions: BundleOptions,
      buildContext: Readonly<{
        buildNumber: number,
        bundlePerfLogger: RootPerfLogger,
      }>,
    ): Promise<void> {
      const requestStartTimestamp = performance.timeOrigin + performance.now();
      const {buildNumber} = buildContext;
      const {
        entryFile,
        graphOptions,
        resolverOptions,
        serializerOptions,
        transformOptions,
      } = splitBundleOptions(bundleOptions);

      /**
       * `entryFile` is relative to projectRoot, we need to use resolution function
       * to find the appropriate file with supported extensions.
       */
      let resolvedEntryFilePath;
      try {
        resolvedEntryFilePath = await this._resolveRelativePath(entryFile, {
          relativeTo: 'server',
          resolverOptions,
          transformOptions,
        });
      } catch (error) {
        const formattedError = formatBundlingError(error);

        const status = error instanceof UnableToResolveError ? 404 : 500;
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=UTF-8',
        });
        res.end(JSON.stringify(formattedError));
        return;
      }
      const graphId = getGraphId(resolvedEntryFilePath, transformOptions, {
        unstable_allowRequireContext:
          this._config.transformer.unstable_allowRequireContext,
        resolverOptions,
        shallow: graphOptions.shallow,
        lazy: graphOptions.lazy,
      });

      // For resources that support deletion, handle the DELETE method.
      if (deleteFn && req.method === 'DELETE') {
        const deleteContext = {
          graphId,
          req,
          res,
        };
        try {
          await deleteFn(deleteContext);
        } catch (error) {
          const formattedError = formatBundlingError(error);

          const status = error instanceof ResourceNotFoundError ? 404 : 500;
          res.writeHead(status, {
            'Content-Type': 'application/json; charset=UTF-8',
          });
          res.end(JSON.stringify(formattedError));
        }
        return;
      }

      const mres = MultipartResponse.wrapIfSupported(req, res);

      let onProgress = null;
      let lastRatio = -1;
      if (this._config.reporter) {
        onProgress = (transformedFileCount: number, totalFileCount: number) => {
          const newRatio = calculateBundleProgressRatio(
            transformedFileCount,
            totalFileCount,
            lastRatio,
          );

          if (newRatio > lastRatio) {
            if (mres instanceof MultipartResponse) {
              mres.writeChunk(
                {'Content-Type': 'application/json'},
                JSON.stringify({
                  done: transformedFileCount,
                  total: totalFileCount,
                  percent: Math.floor(newRatio * 100),
                }),
              );
            }

            // The `uncork` called internally in Node via `promise.nextTick()` may not fire
            // until all of the Promises are resolved because the microtask queue we're
            // in could be starving the event loop. This can cause a bug where the progress
            // is not actually sent in the response until after bundling is complete. This
            // would defeat the purpose of sending progress, so we `uncork` the stream now
            // which will force the response to flush to the client immediately.
            // $FlowFixMe[method-unbinding] added when improving typing for this parameters
            if (res.socket != null && res.socket.uncork != null) {
              res.socket.uncork();
            }

            lastRatio = newRatio;
          }

          this._reporter.update({
            buildID: getBuildID(buildNumber),
            type: 'bundle_transform_progressed',
            transformedFileCount,
            totalFileCount,
          });
        };
      }

      this._reporter.update({
        buildID: getBuildID(buildNumber),
        bundleDetails: {
          bundleType,
          customResolverOptions: bundleOptions.customResolverOptions,
          customTransformOptions: bundleOptions.customTransformOptions,
          dev: transformOptions.dev,
          entryFile: resolvedEntryFilePath,
          minify: transformOptions.minify,
          platform: transformOptions.platform,
        },
        isPrefetch: req.method === 'HEAD',
        type: 'bundle_build_started',
      });

      const startContext: ProcessStartContext = {
        buildNumber,
        bundleOptions,
        entryFile: resolvedEntryFilePath,
        graphId,
        graphOptions,
        mres,
        onProgress,
        req,
        resolverOptions,
        serializerOptions,
        transformOptions,
        bundlePerfLogger: buildContext.bundlePerfLogger,
        requestStartTimestamp,
      };
      const logEntry = log(
        createActionStartEntry(createStartEntry(startContext)),
      );

      const fetchTiming: FetchTiming = {
        graphId,
        startTime: requestStartTimestamp,
        endTime: null,
        isPrefetch: req.method === 'HEAD',
      };

      let result;
      try {
        this._fetchTimings.push(fetchTiming);
        this._activeFetchCount++;

        result = await build(startContext);
      } catch (error) {
        const formattedError = formatBundlingError(error);

        const status = error instanceof ResourceNotFoundError ? 404 : 500;
        mres.writeHead(status, {
          'Content-Type': 'application/json; charset=UTF-8',
        });
        mres.end(JSON.stringify(formattedError));

        this._reporter.update({
          buildID: getBuildID(buildNumber),
          type: 'bundle_build_failed',
          bundleOptions,
        });

        this._reporter.update({error, type: 'bundling_error'});

        log({
          action_name: 'bundling_error',
          error_type: formattedError.type,
          log_entry_label: 'bundling_error',
          bundle_id: graphId,
          build_id: getBuildID(buildNumber),
          stack: formattedError.message,
        });

        debug('Bundling error', error);

        buildContext.bundlePerfLogger.end('FAIL');

        return;
      } finally {
        fetchTiming.endTime = performance.timeOrigin + performance.now();

        if (!fetchTiming.isPrefetch) {
          buildContext.bundlePerfLogger.annotate({
            bool: {
              had_competing_prefetch: this._fetchTimings
                // fetching the same bundle as a prefetch don't compete, since they resolve a shared promise for the same graph id
                .filter(t => t.isPrefetch && t.graphId !== graphId)
                .some(prefetch => {
                  const prefetchEndTime =
                    prefetch.endTime ?? Number.MAX_SAFE_INTEGER;
                  const fetchEndTime =
                    fetchTiming.endTime ?? Number.MAX_SAFE_INTEGER;
                  return (
                    prefetch.startTime < fetchEndTime &&
                    prefetchEndTime > fetchTiming.startTime
                  );
                }),
            },
          });
        }

        this._activeFetchCount--;
        if (this._activeFetchCount === 0) {
          this._fetchTimings = [];
        }
      }

      const endContext: ProcessEndContext<T> = {
        ...startContext,
        result,
      };
      finish(endContext);

      this._reporter.update({
        buildID: getBuildID(buildNumber),
        type: 'bundle_build_done',
      });

      log(
        /* $FlowFixMe[cannot-spread-inexact](>=0.122.0 site=react_native_fb) This comment suppresses
         * an error found when Flow v0.122.0 was deployed. To see the error,
         * delete this comment and run Flow. */
        createActionEndEntry({
          ...logEntry,
          ...createEndEntry(endContext),
        }),
      );
    };
  }

  _processBundleRequest: (
    req: IncomingMessage,
    res: ServerResponse,
    bundleOptions: BundleOptions,
    buildContext: Readonly<{
      buildNumber: number,
      bundlePerfLogger: RootPerfLogger,
    }>,
  ) => Promise<void> = this._createRequestProcessor({
    bundleType: 'bundle',
    createStartEntry(context: ProcessStartContext) {
      return {
        action_name: 'Requesting bundle',
        bundle_url: context.req.url,
        bundle_original_url: context.req.originalUrl ?? 'unknown',
        entry_point: context.entryFile,
        bundler: 'delta',
        build_id: getBuildID(context.buildNumber),
        bundle_options: context.bundleOptions,
        bundle_hash: context.graphId,
        user_agent: context.req.headers['user-agent'] ?? 'unknown',
      };
    },
    createEndEntry(
      context: ProcessEndContext<{
        bundle: string,
        lastModifiedDate: Date,
        nextRevId: RevisionId,
        numModifiedFiles: number,
      }>,
    ) {
      return {
        outdated_modules: context.result.numModifiedFiles,
      };
    },
    build: async ({
      entryFile,
      graphId,
      graphOptions,
      onProgress,
      resolverOptions,
      serializerOptions,
      transformOptions,
      bundlePerfLogger,
      requestStartTimestamp,
    }) => {
      bundlePerfLogger.start({
        timestamp: requestStartTimestamp,
      });
      bundlePerfLogger.annotate({
        string: {
          bundle_url: entryFile,
        },
      });
      const revPromise = this._bundler.getRevisionByGraphId(graphId);

      bundlePerfLogger.point('resolvingAndTransformingDependencies_start');
      bundlePerfLogger.annotate({
        bool: {
          initial_build: revPromise == null,
        },
      });
      const {delta, revision} = await (revPromise != null
        ? this._bundler.updateGraph(await revPromise, false)
        : this._bundler.initializeGraph(
            entryFile,
            transformOptions,
            resolverOptions,
            {
              onProgress,
              shallow: graphOptions.shallow,
              lazy: graphOptions.lazy,
            },
          ));

      bundlePerfLogger.annotate({
        int: {
          graph_node_count: revision.graph.dependencies.size,
        },
      });

      bundlePerfLogger.point('resolvingAndTransformingDependencies_end');
      bundlePerfLogger.point('serializingBundle_start');
      const serializer =
        this._config.serializer.customSerializer ||
        ((entryPoint, preModules, graph, options) =>
          bundleToString(baseJSBundle(entryPoint, preModules, graph, options))
            .code);

      const bundle = await serializer(
        entryFile,
        revision.prepend,
        revision.graph,
        {
          asyncRequireModulePath: await this._resolveRelativePath(
            this._config.transformer.asyncRequireModulePath,
            {
              relativeTo: 'project',
              resolverOptions,
              transformOptions,
            },
          ),
          processModuleFilter: this._config.serializer.processModuleFilter,
          createModuleId: this._createModuleId,
          getRunModuleStatement: this._config.serializer.getRunModuleStatement,
          globalPrefix: this._config.transformer.globalPrefix,
          includeAsyncPaths: graphOptions.lazy,
          dev: transformOptions.dev,
          projectRoot: this._config.projectRoot,
          modulesOnly: serializerOptions.modulesOnly,
          runBeforeMainModule:
            this._config.serializer.getModulesRunBeforeMainModule(
              path.relative(this._config.projectRoot, entryFile),
            ),
          runModule: serializerOptions.runModule,
          sourceMapUrl: serializerOptions.sourceMapUrl,
          sourceUrl: serializerOptions.sourceUrl,
          inlineSourceMap: serializerOptions.inlineSourceMap,
          serverRoot:
            this._config.server.unstable_serverRoot ?? this._config.projectRoot,
          shouldAddToIgnoreList: (module: Module<>) =>
            this._shouldAddModuleToIgnoreList(module),
          getSourceUrl: (module: Module<>) =>
            this._getModuleSourceUrl(module, serializerOptions.sourcePaths),
        },
      );
      bundlePerfLogger.point('serializingBundle_end');

      const bundleCode = typeof bundle === 'string' ? bundle : bundle.code;

      return {
        numModifiedFiles: delta.reset
          ? delta.added.size + revision.prepend.length
          : delta.added.size + delta.modified.size + delta.deleted.size,
        lastModifiedDate: revision.date,
        nextRevId: revision.id,
        bundle: bundleCode,
      };
    },
    finish({req, mres, serializerOptions, result, bundlePerfLogger}) {
      bundlePerfLogger.annotate({
        int: {
          bundle_length: result.bundle.length,
          bundle_byte_length: Buffer.byteLength(result.bundle),
        },
      });
      mres.once('error', () => {
        bundlePerfLogger.end('FAIL');
      });
      mres.once('finish', () => {
        bundlePerfLogger.end('SUCCESS');
      });
      if (
        // We avoid parsing the dates since the client should never send a more
        // recent date than the one returned by the Delta Bundler (if that's the
        // case it's fine to return the whole bundle).
        req.headers['if-modified-since'] ===
        result.lastModifiedDate.toUTCString()
      ) {
        bundlePerfLogger.annotate({
          string: {
            http_status: '304',
          },
        });
        debug('Responding with 304');
        mres.writeHead(304);
        mres.end();
      } else {
        bundlePerfLogger.annotate({
          string: {
            http_status: '200',
          },
        });
        mres.setHeader(
          FILES_CHANGED_COUNT_HEADER,
          String(result.numModifiedFiles),
        );
        mres.setHeader(DELTA_ID_HEADER, String(result.nextRevId));
        if (serializerOptions?.sourceUrl != null) {
          mres.setHeader('Content-Location', serializerOptions.sourceUrl);
        }
        mres.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
        mres.setHeader('Last-Modified', result.lastModifiedDate.toUTCString());
        mres.setHeader(
          'Content-Length',
          String(Buffer.byteLength(result.bundle)),
        );
        mres.end(result.bundle);
      }
    },
    delete: async ({graphId, res}) => {
      await this._bundler.endGraph(graphId);
      res.statusCode = 204;
      res.end();
    },
  });

  // This function ensures that modules in source maps are sorted in the same
  // order as in a plain JS bundle.
  _getSortedModules(graph: ReadOnlyGraph<>): ReadonlyArray<Module<>> {
    const modules = [...graph.dependencies.values()];
    // Assign IDs to modules in a consistent order
    for (const module of modules) {
      this._createModuleId(module.path);
    }
    // Sort by IDs
    return modules.sort(
      (a: Module<MixedOutput>, b: Module<MixedOutput>) =>
        this._createModuleId(a.path) - this._createModuleId(b.path),
    );
  }

  _processSourceMapRequest: (
    req: IncomingMessage,
    res: ServerResponse,
    bundleOptions: BundleOptions,
    buildContext: Readonly<{
      buildNumber: number,
      bundlePerfLogger: RootPerfLogger,
    }>,
  ) => Promise<void> = this._createRequestProcessor({
    bundleType: 'map',
    createStartEntry(context: ProcessStartContext) {
      return {
        action_name: 'Requesting sourcemap',
        bundle_url: context.req.url,
        entry_point: context.entryFile,
        bundler: 'delta',
      };
    },
    createEndEntry(context: ProcessEndContext<string>) {
      return {
        bundler: 'delta',
      };
    },
    build: async ({
      entryFile,
      graphId,
      graphOptions,
      onProgress,
      resolverOptions,
      serializerOptions,
      transformOptions,
    }) => {
      let revision;
      const revPromise = this._bundler.getRevisionByGraphId(graphId);
      if (revPromise == null) {
        ({revision} = await this._bundler.initializeGraph(
          entryFile,
          transformOptions,
          resolverOptions,
          {
            onProgress,
            shallow: graphOptions.shallow,
            lazy: graphOptions.lazy,
          },
        ));
      } else {
        ({revision} = await this._bundler.updateGraph(await revPromise, false));
      }

      let {prepend, graph} = revision;
      if (serializerOptions.modulesOnly) {
        prepend = [];
      }

      return await sourceMapStringNonBlocking(
        [...prepend, ...this._getSortedModules(graph)],
        {
          excludeSource: serializerOptions.excludeSource,
          processModuleFilter: this._config.serializer.processModuleFilter,
          shouldAddToIgnoreList: (module: Module<>) =>
            this._shouldAddModuleToIgnoreList(module),
          getSourceUrl: (module: Module<>) =>
            this._getModuleSourceUrl(module, serializerOptions.sourcePaths),
        },
      );
    },
    finish({mres, result}) {
      mres.setHeader('Content-Type', 'application/json');
      mres.end(result.toString());
    },
  });

  _processAssetsRequest: (
    req: IncomingMessage,
    res: ServerResponse,
    bundleOptions: BundleOptions,
    buildContext: Readonly<{
      buildNumber: number,
      bundlePerfLogger: RootPerfLogger,
    }>,
  ) => Promise<void> = this._createRequestProcessor({
    bundleType: 'assets',
    createStartEntry(context: ProcessStartContext) {
      return {
        action_name: 'Requesting assets',
        bundle_url: context.req.url,
        entry_point: context.entryFile,
        bundler: 'delta',
      };
    },
    createEndEntry(context: ProcessEndContext<ReadonlyArray<AssetData>>) {
      return {
        bundler: 'delta',
      };
    },
    build: async ({
      entryFile,
      onProgress,
      resolverOptions,
      transformOptions,
    }) => {
      const dependencies = await this._bundler.getDependencies(
        [entryFile],
        transformOptions,
        resolverOptions,
        {onProgress, shallow: false, lazy: false},
      );

      return await getAssets(dependencies, {
        processModuleFilter: this._config.serializer.processModuleFilter,
        assetPlugins: this._config.transformer.assetPlugins,
        platform: transformOptions.platform,
        publicPath: this._config.transformer.publicPath,
        projectRoot: this._config.projectRoot,
      });
    },
    finish({mres, result}) {
      mres.setHeader('Content-Type', 'application/json');
      mres.end(JSON.stringify(result));
    },
  });

  async _symbolicate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const depGraph = await this._bundler.getBundler().getDependencyGraph();

    const getCodeFrame = (
      urls: Set<string>,
      symbolicatedStack: ReadonlyArray<StackFrameOutput>,
    ) => {
      const allFramesCollapsed = symbolicatedStack.every(
        ({collapse}) => collapse,
      );

      for (let i = 0; i < symbolicatedStack.length; i++) {
        const {collapse, column, file, lineNumber} = symbolicatedStack[i];

        if (
          // If all the frames are collapsed then we should ignore the collapse flag
          // and always show the first valid frame.
          (!allFramesCollapsed && collapse) ||
          lineNumber == null ||
          (file != null && urls.has(file))
        ) {
          continue;
        }

        const fileAbsolute = path.resolve(this._config.projectRoot, file ?? '');
        if (!depGraph.doesFileExist(fileAbsolute)) {
          debug(
            'Skipping code frame for file not in dependency graph.',
            fileAbsolute,
          );
          continue;
        }
        try {
          return {
            content: codeFrameColumns(
              fs.readFileSync(fileAbsolute, 'utf8'),
              {
                // Metro returns 0 based columns but codeFrameColumns expects 1-based columns
                // $FlowFixMe[unsafe-addition]
                start: {column: column + 1, line: lineNumber},
              },
              {forceColor: true},
            ),
            location: {
              row: lineNumber,
              column,
            },
            fileName: file,
          };
        } catch (error) {
          debug(
            'Generating code frame failed on file read.',
            fileAbsolute,
            error,
          );
        }
      }

      return null;
    };

    let inputValidated = false;
    try {
      const symbolicatingLogEntry = log(
        createActionStartEntry('Symbolicating'),
      );
      debug('Start symbolication');

      let parsedBody;
      if ('rawBody' in req) {
        // TODO: Remove this branch once we are no longer targeting React Native
        // < 0.80 and Expo SDK < 53
        // $FlowFixMe[prop-missing] - rawBody assigned by legacy CLI integrations
        const body = await req.rawBody;
        parsedBody = JSON.parse(body) as JsonData;
      } else {
        parsedBody = await parseJsonBody(req, {strict: false});
      }

      let validatedBody: {
        stack: ReadonlyArray<JsonData>,
        extraData?: JsonData,
      };

      if (
        parsedBody != null &&
        typeof parsedBody === 'object' &&
        !Array.isArray(parsedBody) &&
        Array.isArray(parsedBody['stack'])
      ) {
        const maybeStack: Array<JsonData> = parsedBody['stack'];
        const extraData = parsedBody['extraData'];
        validatedBody = {
          stack: maybeStack,
          extraData,
        };
      } else {
        throw new Error(
          `Bad symbolication input, expected object with stack array, got: ${JSON.stringify(parsedBody)}`,
        );
      }

      const validateAndNormalizeStackFrame = (
        frame: JsonData,
      ): StackFrameInput => {
        if (
          frame == null ||
          typeof frame !== 'object' ||
          Array.isArray(frame)
        ) {
          throw new Error('Expected frame to be a JSON object');
        }
        if (frame.file != null && typeof frame.file !== 'string') {
          throw new Error('Expected file to be string or nullish');
        }
        let frameFile = frame.file;
        if (frameFile != null && frameFile.includes('://')) {
          frameFile = this._rewriteAndNormalizeUrl(frameFile);
        }
        if (frame.methodName != null && typeof frame.methodName !== 'string') {
          throw new Error('Expected methodName to be string or nullish');
        }
        if (frame.lineNumber != null && typeof frame.lineNumber !== 'number') {
          throw new Error('Expected lineNumber to be number or nullish');
        }
        if (frame.column != null && typeof frame.column !== 'number') {
          throw new Error('Expected column to be number or nullish');
        }
        return {
          ...frame,
          file: frameFile,
          lineNumber: frame.lineNumber,
          column: frame.column,
          methodName: frame.methodName,
        };
      };

      const stack = validatedBody.stack.map((frame, lineNumber) => {
        try {
          return validateAndNormalizeStackFrame(frame);
        } catch (e) {
          throw new Error(`Bad frame at line ${lineNumber}: ${e.message}`);
        }
      });

      inputValidated = true;
      // In case of multiple bundles / HMR, some stack frames can have different URLs from others
      const urls = new Set<string>();

      stack.forEach(frame => {
        // These urls have been rewritten and normalized above.
        const sourceUrl = frame.file;
        // Skip `/debuggerWorker.js` which does not need symbolication.
        if (
          sourceUrl != null &&
          !urls.has(sourceUrl) &&
          !sourceUrl.endsWith('/debuggerWorker.js') &&
          sourceUrl.startsWith('http')
        ) {
          urls.add(sourceUrl);
        }
      });

      debug('Getting source maps for symbolication');
      const sourceMaps = await Promise.all(
        Array.from(urls.values()).map(normalizedUrl =>
          this._explodedSourceMapForBundleOptions(
            this._parseOptions(normalizedUrl),
          ),
        ),
      );

      debug('Performing fast symbolication');
      const symbolicatedStack = await symbolicate(
        stack,
        zip(urls.values(), sourceMaps),
        this._config,
        validatedBody.extraData ?? {},
      );

      debug('Symbolication done');
      res.end(
        JSON.stringify({
          codeFrame: getCodeFrame(urls, symbolicatedStack),
          stack: symbolicatedStack,
        }),
      );
      process.nextTick(() => {
        log(createActionEndEntry(symbolicatingLogEntry));
      });
    } catch (error) {
      debug('Symbolication failed', error.stack || error);
      res.statusCode = inputValidated ? 500 : 400;
      res.end(JSON.stringify({error: error.message}));
    }
  }

  async _explodedSourceMapForBundleOptions(
    bundleOptions: BundleOptions,
  ): Promise<ExplodedSourceMap> {
    const {
      entryFile,
      graphOptions,
      onProgress,
      resolverOptions,
      serializerOptions,
      transformOptions,
    } = splitBundleOptions(bundleOptions);

    /**
     * `entryFile` is relative to projectRoot, we need to use resolution function
     * to find the appropriate file with supported extensions.
     */
    const resolvedEntryFilePath = await this._resolveRelativePath(entryFile, {
      relativeTo: 'server',
      resolverOptions,
      transformOptions,
    });

    const graphId = getGraphId(resolvedEntryFilePath, transformOptions, {
      unstable_allowRequireContext:
        this._config.transformer.unstable_allowRequireContext,
      resolverOptions,
      shallow: graphOptions.shallow,
      lazy: graphOptions.lazy,
    });
    let revision;
    const revPromise = this._bundler.getRevisionByGraphId(graphId);
    if (revPromise == null) {
      ({revision} = await this._bundler.initializeGraph(
        resolvedEntryFilePath,
        transformOptions,
        resolverOptions,
        {
          onProgress,
          shallow: graphOptions.shallow,
          lazy: graphOptions.lazy,
        },
      ));
    } else {
      ({revision} = await this._bundler.updateGraph(await revPromise, false));
    }

    let {prepend, graph} = revision;
    if (serializerOptions.modulesOnly) {
      prepend = [];
    }

    return getExplodedSourceMap(
      [...prepend, ...this._getSortedModules(graph)],
      {
        processModuleFilter: this._config.serializer.processModuleFilter,
      },
    );
  }

  _resolveWatchFolderPrefix(
    filePath: string,
  ): {rootDir: string, filePath: string} | null {
    const watchFolderMatch = filePath.match(
      /^\.\/\[metro-watchFolders\]\/(\d+)\/(.*)/,
    );
    if (watchFolderMatch != null) {
      const index = parseInt(watchFolderMatch[1], 10);
      const watchFolder = this._config.watchFolders[index];
      if (watchFolder != null) {
        return {
          rootDir: path.resolve(watchFolder),
          filePath:
            '.' + path.sep + watchFolderMatch[2].split('/').join(path.sep),
        };
      }
    }
    const projectMatch = filePath.match(/^\.\/\[metro-project\]\/(.*)/);
    if (projectMatch != null) {
      return {
        rootDir: path.resolve(this._config.projectRoot),
        filePath: '.' + path.sep + projectMatch[1].split('/').join(path.sep),
      };
    }
    return null;
  }

  async _resolveRelativePath(
    filePath: string,
    {
      relativeTo,
      resolverOptions,
      transformOptions,
    }: Readonly<{
      relativeTo: 'project' | 'server',
      resolverOptions: ResolverInputOptions,
      transformOptions: TransformInputOptions,
    }>,
  ): Promise<string> {
    const resolutionFn = await transformHelpers.getResolveDependencyFn(
      this._bundler.getBundler(),
      transformOptions.platform,
      resolverOptions,
    );
    const resolved = this._resolveWatchFolderPrefix(filePath);
    const rootDir =
      resolved != null
        ? resolved.rootDir
        : relativeTo === 'server'
          ? this._getServerRootDir()
          : this._config.projectRoot;
    const resolvedFilePath = resolved != null ? resolved.filePath : filePath;
    return resolutionFn(`${rootDir}/.`, {
      name: resolvedFilePath,
      data: {
        key: resolvedFilePath,
        locs: [],
        asyncType: null,
        isESMImport: false,
      },
    }).filePath;
  }

  getNewBuildNumber(): number {
    return this._nextBundleBuildNumber++;
  }

  getPlatforms(): ReadonlyArray<string> {
    return this._config.resolver.platforms;
  }

  getWatchFolders(): ReadonlyArray<string> {
    return this._config.watchFolders;
  }

  static DEFAULT_GRAPH_OPTIONS: Readonly<{
    customResolverOptions: CustomResolverOptions,
    customTransformOptions: CustomTransformOptions,
    dev: boolean,
    minify: boolean,
    unstable_transformProfile: 'default',
  }> = {
    customResolverOptions: Object.create(null),
    customTransformOptions: Object.create(null),
    dev: true,
    minify: false,
    unstable_transformProfile: 'default',
  };

  static DEFAULT_BUNDLE_OPTIONS: {
    ...typeof Server.DEFAULT_GRAPH_OPTIONS,
    excludeSource: false,
    inlineSourceMap: false,
    lazy: false,
    modulesOnly: false,
    onProgress: null,
    runModule: true,
    shallow: false,
    sourceMapUrl: null,
    sourceUrl: null,
    sourcePaths: SourcePathsMode,
  } = {
    ...Server.DEFAULT_GRAPH_OPTIONS,
    excludeSource: false,
    inlineSourceMap: false,
    lazy: false,
    modulesOnly: false,
    onProgress: null,
    runModule: true,
    shallow: false,
    sourceMapUrl: null,
    sourceUrl: null,
    sourcePaths: SourcePathsMode.Absolute,
  };

  _getServerRootDir(): string {
    return this._config.server.unstable_serverRoot ?? this._config.projectRoot;
  }

  _getEntryPointAbsolutePath(entryFile: string): string {
    const resolved = this._resolveWatchFolderPrefix(entryFile);
    if (resolved != null) {
      return path.resolve(resolved.rootDir, resolved.filePath);
    }
    return path.resolve(this._getServerRootDir(), entryFile);
  }

  // Wait for the server to finish initializing.
  async ready(): Promise<void> {
    await this._bundler.ready();
  }

  _shouldAddModuleToIgnoreList(module: Module<>): boolean {
    // TODO: Add flag to Module signifying whether it represents generated code
    // and clean up these heuristics.
    return (
      // Prelude code, see getPrependedScripts.js
      module.path === '__prelude__' ||
      // Generated require.context() module, see contextModule.js
      module.path.includes('?ctx=') ||
      this._config.serializer.isThirdPartyModule(module)
    );
  }

  // Flow checking is enough to ensure that a value is returned in all cases.
  // eslint-disable-next-line consistent-return
  _getModuleSourceUrl(module: Module<>, mode: SourcePathsMode): string {
    switch (mode) {
      case SourcePathsMode.ServerUrl:
        for (const [pathnamePrefix, normalizedRootDir] of this
          ._sourceRequestRoutingMap) {
          if (module.path.startsWith(normalizedRootDir + path.sep)) {
            const relativePath = module.path.slice(
              normalizedRootDir.length + 1,
            );
            const relativePathPosix = relativePath
              .split(path.sep)
              .map(segment => encodeURIComponent(segment))
              .join('/');
            return pathnamePrefix + relativePathPosix;
          }
        }
        // Ordinarily all files should match one of the roots above. If they
        // don't, try to preserve useful information, even if fetching the path
        // from Metro might fail.
        const modulePathPosix = module.path
          .split(path.sep)
          .map(segment => encodeURIComponent(segment))
          .join('/');
        return modulePathPosix.startsWith('/')
          ? modulePathPosix
          : '/' + modulePathPosix;
      case SourcePathsMode.Absolute:
        return module.path;
    }
  }
}

function* zip<X, Y>(xs: Iterable<X>, ys: Iterable<Y>): Iterable<[X, Y]> {
  //$FlowFixMe[incompatible-type] #9324959
  const ysIter: Iterator<Y> = ys[Symbol.iterator]();
  for (const x of xs) {
    const y = ysIter.next();
    if (y.done) {
      return;
    }
    yield [x, y.value];
  }
}

function getBuildID(buildNumber: number): string {
  return buildNumber.toString(36);
}
