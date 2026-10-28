---
id: api
title: Bundling API
---

Metro's JavaScript API lets you build a bundle that a React Native app can load offline at startup, start a development server that React Native apps connect to during development to receive the latest changes and hot reloads, or integrate such a server into an existing Node.js server.

In a React Native app, `npx react-native start` already calls [`runServer`](#async-runserverconfig-options) and `npx react-native bundle` already calls [`runBuild`](#async-runbuildconfig-options). You only need this API if your own tooling does this directly. For a guided introduction, see [Getting Started](./GettingStarted.md#running-programmatically).

## Quick Start

All examples assume `const Metro = require('metro');`.

- Build a bundle and write it to disk

  ```js
  const config = await Metro.loadConfig();
  await Metro.runBuild(config, {
    entry: 'index.js',
    out: 'bundle.js',
  });
  ```

- Run a development server that rebuilds bundles as files change

  ```js
  const config = await Metro.loadConfig();
  await Metro.runServer(config);
  ```

- Add Metro to an existing Express or Connect server

  ```js
  const express = require('express');
  const app = express();
  const server = require('http').Server(app);

  Metro.loadConfig().then(async config => {
    const connectMiddleware = await Metro.createConnectMiddleware(config);
    const {server: {port}} = config;

    app.use(connectMiddleware.middleware);
    server.listen(port);
    connectMiddleware.attachHmrServer(server);
  });
  ```

## Reference

The `config` object accepted by the functions below is the [Metro configuration](./Configuration.md) exported by your `metro.config.js` file.

### `loadConfig(<options>, <defaultConfigOverrides>)`

Loads your Metro configuration (`metro.config.js`).

**Options:**

- `config` (string): Path to the [config file](./Configuration.md), e.g. `'/path/to/app/metro.config.dev.js'`. If not given, Metro searches from `cwd` up to the user's home directory.
- `cwd` (string): Directory to start searching from.

`loadConfig` also accepts these [CLI](./CLI.md) options, which override the corresponding config values:

- `port`: Sets [`server.port`](./Configuration.md#port).
- [`projectRoot`](./Configuration.md#projectroot), [`watchFolders`](./Configuration.md#watchfolders) and [`resetCache`](./Configuration.md#resetcache): Set the top-level options of the same names.
- [`assetExts`](./Configuration.md#assetexts), [`sourceExts`](./Configuration.md#sourceexts) and [`platforms`](./Configuration.md#platforms): Set the `resolver` options of the same names.
- [`maxWorkers`](./Configuration.md#maxworkers): Defaults to a number based on `os.availableParallelism()`.
- `transformer`: Sets [`transformer.babelTransformerPath`](./Configuration.md#babeltransformerpath).
- `verbose`: `false` silences Metro's terminal output.

For example, `Metro.loadConfig({port: 8082})` loads your config with `server.port` set to `8082`.

The returned configuration is normalized and merged with Metro's defaults. `defaultConfigOverrides` is applied to the defaults before your config is merged in, e.g. `Metro.loadConfig({}, {resolver: {sourceExts: ['js', 'ts']}})` uses `['js', 'ts']` unless your config sets `resolver.sourceExts` itself. A config file that exports a function receives these modified defaults as its argument.

### `async runMetro(config, <options>)`

Creates and returns a Metro server without starting an HTTP server. Use its `processRequest` method as a request handler or middleware in your own server (see [Getting Started](./GettingStarted.md#method-runmetroconfig)).

Prefer [`createConnectMiddleware`](#createconnectmiddlewareconfig-options) if you also want your config's middleware ([`server.unstable_middleware`](./Configuration.md#unstable_middleware-experimental) and [`server.unstable_priorityMiddleware`](./Configuration.md#unstable_prioritymiddleware-experimental)) and Fast Refresh support.

**Options:**

- `waitForBundler` (boolean): Whether to wait for the [bundler](./Concepts.md#bundling-stages) to finish initializing before returning.
- `hasReducedPerformance` (boolean): Makes Metro's terminal output warn that Metro is operating with reduced performance. Has no other effect.
- `watch` (boolean): Whether to [watch the filesystem for changes](./Concepts.md#file-watching).
- `onBundleBuilt` (Function): Called with the request's URL path when a bundle has been built, e.g. `'/index.bundle'` for a request to `/index.bundle?platform=ios&dev=true`.

### `async runBuild(config, <options>)`

Builds a single bundle for `entry`, like [`metro build`](./CLI.md#build-entry). Resolves to an object with `code`, `map` and, if `assets` is `true`, `assets`. The bundle is written to disk only if `out` or `bundleOut` is given.

**Options:**

- `entry` (string): **Required.** The [entry point](./Concepts.md#entry-point) file to bundle.
- `platform` (string): The [platform](./Concepts.md#platform) to bundle for (e.g. `'web'`, `'android'`, `'ios'`). Defaults to `'web'`.
- `dev` (boolean): Build a development bundle, in which `__DEV__` is `true`. Otherwise, `__DEV__` and `process.env.NODE_ENV` are inlined as `false` and `'production'`. Defaults to `false`.
- `minify` (boolean): Whether to minify the bundle. Defaults to `true`.
- `out` (string): Path for the bundle (with `.js` added if missing) and source map (with `.map` extension). Override either path with `bundleOut` or `sourceMapOut`. For example, `out: 'dist/main'` or `out: 'dist/main.js'` with `sourceMap: true` writes `dist/main.js` and `dist/main.map`.
- `bundleOut` (string): Path to write the bundle to. No extension is added.
- `sourceMap` (boolean): Whether to generate a source map. Defaults to `false`.
- `sourceMapOut` (string): Path to write the source map to, if `sourceMap` is `true`. No extension is added.
- `sourceMapUrl` (string): URL written as the bundle's `sourceMappingURL`, e.g. `'https://example.com/main.map'` adds `//# sourceMappingURL=https://example.com/main.map`. If `sourceMap` is `true` and `sourceMapUrl` is not set, the source map is inlined into the bundle.
- `assets` (boolean): Whether to return an array of `AssetData` in the `assets` property of the result. Defaults to `false`.
- `customResolverOptions` (Object): [Custom resolver options](./Resolution.md#customresolveroptions-string-mixed), e.g. `{foo: 'bar'}`, equivalent to the bundle URL parameter `resolver.foo=bar`.
- `customTransformOptions` (Object): Custom options for the [transformer](./Concepts.md#transformation), e.g. `{foo: 'bar'}`, equivalent to `transform.foo=bar`. A Babel transformer reads it as `options.customTransformOptions.foo`.
- `onBegin` (Function): Called when bundling starts.
- `onProgress` (Function): Called whenever the number of transformed modules is updated.
- `onComplete` (Function): Called when bundling finishes.
- `unstable_transformProfile` (`'default'` | `'hermes-stable'` | `'hermes-canary'`): Passed to the [Babel transformer](./Configuration.md#babeltransformerpath), which can use it to target a specific JavaScript engine. Defaults to `'default'`.
- `output` (Object): Replaces how the bundle is built and written. Defaults to Metro's [plain bundle](./Bundling.md#plain-bundle) output, `metro/private/shared/output/bundle`; e.g. pass `require('metro/private/shared/output/RamBundle')` to write a [RAM bundle](./Bundling.md#ram-bundles). An object with two functions:
  - `build(server, requestOptions, buildOptions)`: Builds the bundle. `runBuild` resolves to its result, which is also passed to `save`. The default output resolves to `{code, map, assets?}`.
  - `save(bundle, outputOptions, log)`: Writes the result of `build` to disk, only if `out` or `bundleOut` is given. `outputOptions` contains `bundleOutput`, `sourcemapOutput`, `dev` and `platform`.

### `async runServer(config, <options>)`

Starts a full Metro HTTP development server, like [`metro serve`](./CLI.md#serve). It listens on `host` and [`server.port`](./Configuration.md#port) and serves bundles for any [entry point](./Concepts.md#entry-point) on request (see [URL and bundle request](./GettingStarted.md#url-and-bundle-request)). Resolves to `{httpServer}`, the Node.js HTTP(S) server, which uses HTTPS if `secureServerOptions` or [`server.tls`](./Configuration.md#tls) is set.

**Options:** `waitForBundler`, `hasReducedPerformance` and `watch` (see [`runMetro`](#async-runmetroconfig-options)), plus:

- `host` (string): Host to listen on.
- `onReady` (Function): Called with the HTTP(S) server when it is ready to serve requests.
- `onError` (Function): Called with the error if the HTTP(S) server fails.
- `onClose` (Function): Called when the server and all other Metro processes are closed. To observe only the HTTP server closing, use `httpServer.on('close', () => {})`.
- `websocketEndpoints` (Object): Map of URL paths to [`ws`](https://github.com/websockets/ws) `WebSocketServer` instances that handle upgrade requests on those paths. For example, to accept connections at `ws://localhost:8081/my-endpoint`:

  ```js
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({noServer: true});
  wss.on('connection', socket => socket.send('hello'));

  await Metro.runServer(config, {
    websocketEndpoints: {'/my-endpoint': wss},
  });
  ```

- `secureServerOptions` (Object): Options for Metro's HTTPS server; setting it enables HTTPS. See the [Node docs](https://nodejs.org/api/https.html#https_https_createserver_options_requestlistener) for valid options.
- `unstable_middleware` (Array): Middleware that runs after the config's [`server.unstable_middleware`](./Configuration.md#unstable_middleware-experimental). Takes the same shape.
- `unstable_priorityMiddleware` (Array): Middleware that runs before the config's [`server.unstable_priorityMiddleware`](./Configuration.md#unstable_prioritymiddleware-experimental). Takes the same shape. Handlers must call `next()` for every request they don't fully handle, so Metro can serve bundles, source maps, assets and its other endpoints.
- `unstable_onServerCreated` (Function): Called with Metro's server instance before the HTTP server starts listening, after the config's [`server.unstable_onServerCreated`](./Configuration.md#unstable_onservercreated-experimental).
- `secure` (boolean), `secureKey` (string), `secureCert` (string): **Deprecated**, to be removed in a later release; use `secureServerOptions` or [`server.tls`](./Configuration.md#tls) instead. Whether to use HTTPS, and paths to the key and cert files when `secure` is set.

### `createConnectMiddleware(config, <options>)`

Creates a [Connect](https://github.com/senchalabs/connect) middleware that serves Metro's bundles, to add Metro to your own Express or Connect server (see the [Quick Start](#quick-start)). It handles the same requests as Metro's own server, for example:

- `/index.bundle?platform=ios&dev=true`: The bundle for `index.js` (see [URL and bundle request](./GettingStarted.md#url-and-bundle-request)).
- `/index.map?platform=ios&dev=true`: The source map for that bundle.
- `/assets/src/images/logo@2x.png?platform=ios`: An asset.
- `/symbolicate`: Symbolicates stack traces (see [Symbolicator Options](./Configuration.md#symbolicator-options)).

Other requests are passed on with `next()`. Resolves to an object with:

- `middleware`: The middleware to pass to `app.use()`, including your config's middleware.
- `attachHmrServer(httpServer)`: Attaches Metro's Fast Refresh endpoint (a WebSocket at `/hot`) to your HTTP server.
- `metroServer`: The Metro server instance.
- `end()`: Shuts down the Metro server.

**Options:** The same as [`runMetro`](#async-runmetroconfig-options): `waitForBundler`, `hasReducedPerformance`, `watch` and `onBundleBuilt`.

### `async buildGraph(config, <options>)`

[Resolves](./Concepts.md#resolution) and [transforms](./Concepts.md#transformation) the [dependency graph](./Concepts.md#dependency-graph) for `entries` and returns it without [serializing](./Concepts.md#serialization) a bundle. This is mostly for tooling that inspects modules and their dependencies.

**Options:**

- `entries` (Array): **Required.** The [entry point](./Concepts.md#entry-point) files.
- `platform` (string): The [platform](./Concepts.md#platform) to build for. Defaults to `'web'`.
- `dev` (boolean): Build in development mode. Defaults to `false`.
- `minify` (boolean): Whether to minify. Defaults to `false`.
- `type` (`'module'` | `'script'`): Transform the files as modules, or as [scripts](./Bundling.md#scripts) (like polyfills), which have no dependencies and are not registered as modules. Defaults to `'module'`.
- `customTransformOptions` (Object): Custom options passed to the transformer.

The graph's `entryPoints` is a `Set` of the entries' absolute paths, and `dependencies` maps each module's absolute path to the module:

```js
const graph = await Metro.buildGraph(config, {entries: ['index.js']});

for (const [modulePath, module] of graph.dependencies) {
  console.log(modulePath, module.dependencies.size);
}
```

### `attachMetroCli(yargs, <options>)`

Registers Metro's [CLI commands](./CLI.md) on a [`yargs`](https://yargs.js.org/) instance, to include them in your own CLI.

**Options:**

- `build`, `serve`, `dependencies`: Pass `null` to omit the corresponding command, e.g. to omit `get-dependencies`:

  ```js
  const {attachMetroCli} = require('metro');
  const yargs = require('yargs');

  const cli = yargs
    .scriptName('my-cli')
    .command('hello', 'Print a greeting', {}, () => console.log('Hello!'));

  attachMetroCli(cli, {dependencies: null}).argv;
  ```
