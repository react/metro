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

import type {AssetData} from './Assets';
import type {ReadOnlyGraph} from './DeltaBundler';
import type {ServerOptions} from './Server';
import type {BuildOptions, OutputOptions, RequestOptions} from './shared/types';
import type {HandleFunction} from 'connect';
import type {TransformProfile} from 'metro-babel-transformer';
import type {
  ConfigT,
  InputConfigT,
  MetroConfig,
  Middleware,
} from 'metro-config';
import type {CustomResolverOptions} from 'metro-resolver';
import type {CustomTransformOptions} from 'metro-transform-worker';
import type {Server as HttpServer} from 'node:http';
import type {
  Server as HttpsServer,
  ServerOptions as HttpsServerOptions,
} from 'node:https';
import type {Server as WebSocketServer} from 'ws';
import typeof Yargs from 'yargs';

import makeBuildCommand from './commands/build';
import makeDependenciesCommand from './commands/dependencies';
import makeServeCommand from './commands/serve';
import MetroHmrServer from './HmrServer';
import IncrementalBundler from './IncrementalBundler';
import createWebsocketServer from './lib/createWebsocketServer';
import JsonReporter from './lib/JsonReporter';
import TerminalReporter from './lib/TerminalReporter';
import MetroServer from './Server';
import * as outputBundle from './shared/output/bundle';
import {
  getDefaultConfig,
  loadConfig,
  mergeConfig,
  resolveConfig,
} from 'metro-config';
import {Terminal} from 'metro-core';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import util from 'node:util';
import nullthrows from 'nullthrows';

const DEFAULTS = MetroServer.DEFAULT_BUNDLE_OPTIONS;

type MetroMiddleWare = {
  attachHmrServer: (httpServer: HttpServer | HttpsServer) => void,
  end: () => Promise<void>,
  metroServer: MetroServer,
  middleware: Middleware,
};

export type RunMetroOptions = {
  ...ServerOptions,
  waitForBundler?: boolean,
};

export type RunServerOptions = Readonly<{
  hasReducedPerformance?: boolean,
  host?: string,
  onError?: (Error & {code?: string}) => void,
  onReady?: (server: HttpServer | HttpsServer) => void,
  onClose?: () => void,
  secureServerOptions?: HttpsServerOptions,
  secure?: boolean, // deprecated
  secureCert?: string, // deprecated
  secureKey?: string, // deprecated
  unstable_extraMiddleware?: ReadonlyArray<HandleFunction>,
  waitForBundler?: boolean,
  watch?: boolean,
  websocketEndpoints?: Readonly<{
    [path: string]: WebSocketServer,
  }>,
}>;

export type RunServerResult = {
  httpServer: HttpServer | HttpsServer,
};

type BuildGraphOptions = {
  entries: ReadonlyArray<string>,
  customTransformOptions?: CustomTransformOptions,
  dev?: boolean,
  minify?: boolean,
  onProgress?: (transformedFileCount: number, totalFileCount: number) => void,
  platform?: string,
  type?: 'module' | 'script',
};

export type RunBuildOptions = {
  entry: string,
  assets?: boolean,
  dev?: boolean,
  out?: string,
  bundleOut?: string,
  sourceMapOut?: string,
  onBegin?: () => void,
  onComplete?: () => void,
  onProgress?: (transformedFileCount: number, totalFileCount: number) => void,
  minify?: boolean,
  output?: Readonly<{
    build: (
      MetroServer,
      RequestOptions,
      void | BuildOptions,
    ) => Promise<{
      code: string,
      map: string,
      assets?: ReadonlyArray<AssetData>,
      ...
    }>,
    save: (
      {
        code: string,
        map: string,
        ...
      },
      OutputOptions,
      (logMessage: string) => void,
    ) => Promise<unknown>,
    ...
  }>,
  platform?: string,
  sourceMap?: boolean,
  sourceMapUrl?: string,
  customResolverOptions?: CustomResolverOptions,
  customTransformOptions?: CustomTransformOptions,
  unstable_transformProfile?: TransformProfile,
};

export type RunBuildResult = {
  code: string,
  map: string,
  assets?: ReadonlyArray<AssetData>,
  ...
};

type BuildCommandOptions = Readonly<{[string]: unknown}> | null;
type ServeCommandOptions = Readonly<{[string]: unknown}> | null;
type DependenciesCommandOptions = Readonly<{[string]: unknown}> | null;

export {Terminal, JsonReporter, TerminalReporter};

export type {AssetData} from './Assets';
export type {
  AsyncDependencyType,
  DeltaResult,
  Dependency,
  MixedOutput,
  Module,
  ReadOnlyDependencies,
  ReadOnlyGraph,
  SerializerOptions,
  TransformInputOptions,
  TransformResult,
  TransformResultDependency,
} from './DeltaBundler/types';
export type {default as DependencyGraph} from './node-haste/DependencyGraph';
export type {BundleDetails, Reporter, ReportableEvent} from './lib/reporting';
export type {TerminalReportableEvent} from './lib/TerminalReporter';
export type {
  ContextMode,
  RequireContextParams,
} from './ModuleGraph/worker/collectDependencies';
export type {ServerOptions} from './Server';
export type {MetroConfig, MetroServer};

async function getConfig(config: InputConfigT): Promise<ConfigT> {
  const defaultConfig = await getDefaultConfig(config.projectRoot);
  return mergeConfig(defaultConfig, config);
}

export async function runMetro(
  config: InputConfigT,
  options?: RunMetroOptions,
): Promise<MetroServer> {
  const mergedConfig = await getConfig(config);
  const {
    reporter,
    server: {port},
  } = mergedConfig;

  reporter.update({
    hasReducedPerformance: options
      ? Boolean(options.hasReducedPerformance)
      : false,
    port,
    type: 'initialize_started',
  });

  const {waitForBundler = false, ...serverOptions} = options ?? {};
  const server = new MetroServer(mergedConfig, serverOptions);

  const readyPromise = server
    .ready()
    .then(() => {
      reporter.update({
        type: 'initialize_done',
        port,
      });
    })
    .catch(error => {
      reporter.update({
        type: 'initialize_failed',
        port,
        error,
      });
    });
  if (waitForBundler) {
    await readyPromise;
  }

  return server;
}

export {loadConfig, mergeConfig, resolveConfig};

export const createConnectMiddleware = async function (
  config: ConfigT,
  options?: RunMetroOptions,
): Promise<MetroMiddleWare> {
  const metroServer = await runMetro(config, options);

  let enhancedMiddleware: Middleware = metroServer.processRequest;

  // Enhance the resulting middleware using the config options
  if (config.server.enhanceMiddleware) {
    enhancedMiddleware = config.server.enhanceMiddleware(
      enhancedMiddleware,
      metroServer,
    );
  }

  return {
    attachHmrServer(httpServer: HttpServer | HttpsServer): void {
      const wss = createWebsocketServer({
        websocketServer: new MetroHmrServer(
          metroServer.getBundler(),
          metroServer.getCreateModuleId(),
          config,
        ),
      });
      httpServer.on('upgrade', (request, socket, head) => {
        const {pathname} = new URL(request.url, 'resolve://');
        if (pathname === '/hot') {
          wss.handleUpgrade(request, socket, head, ws => {
            wss.emit('connection', ws, request);
          });
        } else {
          socket.destroy();
        }
      });
    },
    metroServer,
    middleware: enhancedMiddleware,
    async end(): Promise<void> {
      await metroServer.end();
    },
  };
};

export const runServer = async (
  config: ConfigT,
  {
    hasReducedPerformance = false,
    host,
    onError,
    onReady,
    onClose,
    secureServerOptions,
    secure, //deprecated
    secureCert, // deprecated
    secureKey, // deprecated
    unstable_extraMiddleware,
    waitForBundler = false,
    websocketEndpoints: userWebsocketEndpoints = {},
    watch,
  }: RunServerOptions = {},
): Promise<RunServerResult> => {
  await earlyPortCheck(host, config.server.port);

  if (secure != null || secureCert != null || secureKey != null) {
    // eslint-disable-next-line no-console
    console.warn(
      util.styleText(['inverse', 'yellow', 'bold'], ' DEPRECATED '),
      'The `secure`, `secureCert`, and `secureKey` options are now deprecated. ' +
        'Please use the `secureServerOptions` object instead to pass options to ' +
        "Metro's https development server, or `config.server.tls` in Metro's configuration",
    );
  }
  // Lazy require
  // eslint-disable-next-line import/no-commonjs
  const connect = require('connect');

  const serverApp = connect();

  const {
    middleware,
    end: endMiddleware,
    metroServer,
  } = await createConnectMiddleware(config, {
    hasReducedPerformance,
    waitForBundler,
    watch,
  });

  for (const handler of unstable_extraMiddleware ?? []) {
    serverApp.use(handler);
  }

  serverApp.use(middleware);

  let httpServer;

  const {tls} = config.server;
  if (
    secure === true ||
    secureServerOptions != null ||
    typeof tls === 'object'
  ) {
    const options = {
      key:
        typeof tls === 'object'
          ? tls.key
          : typeof secureKey === 'string'
            ? fs.readFileSync(secureKey)
            : undefined,
      cert:
        typeof tls === 'object'
          ? tls.cert
          : typeof secureCert === 'string'
            ? fs.readFileSync(secureCert)
            : undefined,
      ca: typeof tls === 'object' ? tls.ca : undefined,
      requestCert: typeof tls === 'object' ? tls.requestCert : undefined,
      ...(secureServerOptions ?? {}),
    };

    // $FlowFixMe[incompatible-type] 'http' and 'https' Flow types do not match
    httpServer = https.createServer(options, serverApp);
  } else {
    httpServer = http.createServer(serverApp);
  }
  return new Promise((resolve, reject) => {
    httpServer.on('error', error => {
      endMiddleware().finally(() => {
        onError?.(error);
        reject(error);
      });
    });

    httpServer.listen(config.server.port, host, () => {
      const {address, port, family} = httpServer.address();
      config.reporter.update({
        type: 'server_listening',
        address,
        port, // Assigned port if configured with port 0
        family,
      });

      const websocketEndpoints = {
        ...userWebsocketEndpoints,
        '/hot': createWebsocketServer({
          websocketServer: new MetroHmrServer(
            metroServer.getBundler(),
            metroServer.getCreateModuleId(),
            config,
          ),
        }),
      };

      httpServer.on('upgrade', (request, socket, head) => {
        const {pathname} = new URL(request.url, 'resolve://');
        if (pathname != null && websocketEndpoints[pathname]) {
          websocketEndpoints[pathname].handleUpgrade(
            request,
            socket,
            head,
            ws => {
              websocketEndpoints[pathname].emit('connection', ws, request);
            },
          );
        } else {
          socket.destroy();
        }
      });

      if (onReady) {
        onReady(httpServer);
      }

      resolve({httpServer});
    });

    // Disable any kind of automatic timeout behavior for incoming
    // requests in case it takes the packager more than the default
    // timeout of 120 seconds to respond to a request.
    httpServer.timeout = 0;

    httpServer.on('close', () => {
      endMiddleware()?.finally(() => {
        onClose?.();
      });
    });
  });
};

export const runBuild = async (
  config: ConfigT,
  {
    assets = false,
    customResolverOptions = DEFAULTS.customResolverOptions,
    customTransformOptions = DEFAULTS.customTransformOptions,
    dev = false,
    entry,
    onBegin,
    onComplete,
    onProgress,
    minify = true,
    output = outputBundle,
    out,
    bundleOut,
    sourceMapOut,
    platform = 'web',
    sourceMap = false,
    sourceMapUrl,
    unstable_transformProfile = DEFAULTS.unstable_transformProfile,
  }: RunBuildOptions,
): Promise<RunBuildResult> => {
  const metroServer = await runMetro(config, {
    watch: false,
  });

  try {
    const requestOptions = {
      dev,
      entryFile: entry,
      inlineSourceMap: sourceMap && !sourceMapUrl,
      minify,
      platform,
      ...(sourceMap === false ? {} : {sourceMapUrl}),
      createModuleIdFactory: config.serializer.createModuleIdFactory,
      onProgress,
      customResolverOptions,
      customTransformOptions,
      unstable_transformProfile,
    };

    if (onBegin) {
      onBegin();
    }

    const metroBundle = await output.build(metroServer, requestOptions, {
      withAssets: assets,
    });
    const result: RunBuildResult = {...metroBundle};

    if (assets && result.assets == null) {
      result.assets = await metroServer.getAssets({
        ...MetroServer.DEFAULT_BUNDLE_OPTIONS,
        ...requestOptions,
      });
    }

    if (onComplete) {
      onComplete();
    }

    if (out != null || bundleOut != null) {
      const bundleOutput =
        bundleOut ?? nullthrows(out).replace(/(\.js)?$/, '.js');

      const sourcemapOutput =
        sourceMap === false
          ? undefined
          : (sourceMapOut ?? out?.replace(/(\.js)?$/, '.map'));

      const outputOptions: OutputOptions = {
        bundleOutput,
        sourcemapOutput,
        dev,
        platform,
      };

      await output.save(metroBundle, outputOptions, message =>
        config.reporter.update({
          type: 'bundle_save_log',
          message,
        }),
      );
    }

    return result;
  } finally {
    await metroServer.end();
  }
};

export const buildGraph = async function (
  config: InputConfigT,
  {
    customTransformOptions = Object.create(null),
    dev = false,
    entries,
    minify = false,
    onProgress,
    platform = 'web',
    type = 'module',
  }: BuildGraphOptions,
): Promise<ReadOnlyGraph<>> {
  const mergedConfig = await getConfig(config);

  const bundler = new IncrementalBundler(mergedConfig);

  try {
    const {customResolverOptions, ...defaultTransformInputOptions} =
      MetroServer.DEFAULT_GRAPH_OPTIONS;
    return await bundler.buildGraphForEntries(
      entries,
      {
        ...defaultTransformInputOptions,
        customTransformOptions,
        dev,
        minify,
        platform,
        type,
      },
      {customResolverOptions, dev},
    );
  } finally {
    await bundler.end();
  }
};

type AttachMetroCLIOptions = {
  build?: BuildCommandOptions,
  serve?: ServeCommandOptions,
  dependencies?: DependenciesCommandOptions,
  ...
};

export const attachMetroCli = function (
  yargs: Yargs,
  options?: AttachMetroCLIOptions = {},
): Yargs {
  const {build = {}, serve = {}, dependencies = {}} = options;

  yargs.strict();

  if (build) {
    yargs.command(makeBuildCommand());
  }
  if (serve) {
    yargs.command(makeServeCommand());
  }
  if (dependencies) {
    yargs.command(makeDependenciesCommand());
  }

  return yargs;
};

async function earlyPortCheck(host: void | string, port: number) {
  const server = net.createServer(c => c.end());
  try {
    await new Promise((resolve, reject) => {
      server.on('error', err => {
        reject(err);
      });
      server.listen(port, host, undefined, () => resolve());
    });
  } finally {
    await new Promise(resolve => server.close(() => resolve()));
  }
}
