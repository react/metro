/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<4aca97550eb6e579e435254037e38616>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/index.flow.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {AssetData} from './Assets';
import type {ReadOnlyGraph} from './DeltaBundler';
import type {ServerOptions} from './Server';
import type {BuildOptions, OutputOptions, RequestOptions} from './shared/types';
import type {HandleFunction} from 'connect';
import type {TransformProfile} from 'metro-babel-transformer';
import type {ConfigT, InputConfigT, MetroConfig, Middleware} from 'metro-config';
import type {CustomResolverOptions} from 'metro-resolver';
import type {CustomTransformOptions} from 'metro-transform-worker';
import type {Server as HttpServer} from 'node:http';
import type {Server as HttpsServer, ServerOptions as HttpsServerOptions} from 'node:https';
import type {Server as WebSocketServer} from 'ws';
import type $$IMPORT_TYPEOF_1$$ from 'yargs';

import JsonReporter from './lib/JsonReporter';
import TerminalReporter from './lib/TerminalReporter';
import MetroServer from './Server';
import {loadConfig, mergeConfig, resolveConfig} from 'metro-config';
import {Terminal} from 'metro-core';

type Yargs = typeof $$IMPORT_TYPEOF_1$$;
type MetroMiddleWare = {
  attachHmrServer: (httpServer: HttpServer | HttpsServer) => void;
  end: () => Promise<void>;
  metroServer: MetroServer;
  middleware: Middleware;
};
export type RunMetroOptions = Omit<ServerOptions, 'waitForBundler'> & {
  waitForBundler?: boolean;
};
export type RunServerOptions = Readonly<{
  hasReducedPerformance?: boolean;
  host?: string;
  onError?: ($$PARAM_0$$: Error & {code?: string}) => void;
  onReady?: (server: HttpServer | HttpsServer) => void;
  onClose?: () => void;
  secureServerOptions?: HttpsServerOptions;
  secure?: boolean;
  secureCert?: string;
  secureKey?: string;
  unstable_extraMiddleware?: ReadonlyArray<HandleFunction>;
  waitForBundler?: boolean;
  watch?: boolean;
  websocketEndpoints?: Readonly<{[path: string]: WebSocketServer}>;
}>;
export type RunServerResult = {httpServer: HttpServer | HttpsServer};
type BuildGraphOptions = {
  entries: ReadonlyArray<string>;
  customTransformOptions?: CustomTransformOptions;
  dev?: boolean;
  minify?: boolean;
  onProgress?: (transformedFileCount: number, totalFileCount: number) => void;
  platform?: string;
  type?: 'module' | 'script';
};
export type RunBuildOptions = {
  entry: string;
  assets?: boolean;
  dev?: boolean;
  out?: string;
  bundleOut?: string;
  sourceMapOut?: string;
  onBegin?: () => void;
  onComplete?: () => void;
  onProgress?: (transformedFileCount: number, totalFileCount: number) => void;
  minify?: boolean;
  output?: Readonly<{
    build: (
      $$PARAM_0$$: MetroServer,
      $$PARAM_1$$: RequestOptions,
      $$PARAM_2$$: void | BuildOptions,
    ) => Promise<{
      code: string;
      map: string;
      assets?: ReadonlyArray<AssetData>;
    }>;
    save: ($$PARAM_0$$: {code: string; map: string}, $$PARAM_1$$: OutputOptions, $$PARAM_2$$: (logMessage: string) => void) => Promise<unknown>;
  }>;
  platform?: string;
  sourceMap?: boolean;
  sourceMapUrl?: string;
  customResolverOptions?: CustomResolverOptions;
  customTransformOptions?: CustomTransformOptions;
  unstable_transformProfile?: TransformProfile;
};
export type RunBuildResult = {
  code: string;
  map: string;
  assets?: ReadonlyArray<AssetData>;
};
type BuildCommandOptions = Readonly<{[$$Key$$: string]: unknown}> | null;
type ServeCommandOptions = Readonly<{[$$Key$$: string]: unknown}> | null;
type DependenciesCommandOptions = Readonly<{
  [$$Key$$: string]: unknown;
}> | null;
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
export type {ContextMode, RequireContextParams} from './ModuleGraph/worker/collectDependencies';
export type {ServerOptions} from './Server';
export type {MetroConfig, MetroServer};
export declare function runMetro(config: InputConfigT, options?: RunMetroOptions): Promise<MetroServer>;
export {loadConfig, mergeConfig, resolveConfig};
export declare const createConnectMiddleware: (config: ConfigT, options?: RunMetroOptions) => Promise<MetroMiddleWare>;
export declare type createConnectMiddleware = typeof createConnectMiddleware;
export declare const runServer: (config: ConfigT, $$PARAM_1$$?: RunServerOptions) => Promise<RunServerResult>;
export declare type runServer = typeof runServer;
export declare const runBuild: (config: ConfigT, $$PARAM_1$$: RunBuildOptions) => Promise<RunBuildResult>;
export declare type runBuild = typeof runBuild;
export declare const buildGraph: (config: InputConfigT, $$PARAM_1$$: BuildGraphOptions) => Promise<ReadOnlyGraph>;
export declare type buildGraph = typeof buildGraph;
type AttachMetroCLIOptions = {
  build?: BuildCommandOptions;
  serve?: ServeCommandOptions;
  dependencies?: DependenciesCommandOptions;
};
export declare const attachMetroCli: (yargs: Yargs, options?: AttachMetroCLIOptions) => Yargs;
export declare type attachMetroCli = typeof attachMetroCli;
