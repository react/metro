---
id: getting-started
title: Getting Started
---

Metro is the JavaScript bundler used by React Native. This page shows how to install Metro and run it from the command line or your own Node.js code. For how Metro works, see [Concepts](./Concepts.md).

:::note Using React Native?
React Native projects already include Metro: `npx react-native start` starts a Metro development server, and `npx react-native bundle` builds a bundle. To customize Metro, edit your `metro.config.js` (see [Configuring Metro](./Configuration.md)). Read on to use Metro outside React Native or build your own tooling on it.
:::

Install Metro using [`npm`](https://www.npmjs.com/) or [`yarn`](https://yarnpkg.com/):

```bash
npm install --save-dev metro metro-core
```

```bash
yarn add --dev metro metro-core
```

## Running `metro`

From the command line:

```bash
# Start a development server
npx metro serve
# Build a bundle from index.js into bundle.js
npx metro build index.js --out bundle.js
```

See [Metro CLI Options](./CLI.md) for all commands and options.

### Running Programmatically

The `metro` module (`const Metro = require('metro')`) exports these main functions:

- [`runServer`](#method-runserverconfig-options): Start a complete development server, as `npx react-native start` does.
- [`runBuild`](#method-runbuildconfig-options): Build a bundle once, e.g. in a build step, as `npx react-native bundle` does.
- [`createConnectMiddleware`](#method-createconnectmiddlewareconfig-options): Add Metro to an existing Express or Connect server.
- [`runMetro`](#method-runmetroconfig): Get a Metro server and handle HTTP yourself.

Each takes your Metro configuration, loaded from `metro.config.js` with [`Metro.loadConfig()`](./API.md#loadconfigoptions-defaultconfigoverrides), as the first argument. The [Bundling API](./API.md) reference lists every function and option.

### Method `runMetro(config)`

Creates and returns a Metro server without starting an HTTP server. Pass its `processRequest` method to your own HTTP(S) server. Like Express middleware, `processRequest` calls its third argument when Metro can't handle a request, so you can combine it with your own request handling:

```js
const http = require('http');
const Metro = require('metro');

Metro.loadConfig().then(async (config) => {
  const metroBundlerServer = await Metro.runMetro(config);

  const httpServer = http.createServer((req, res) => {
    metroBundlerServer.processRequest(req, res, error => {
      // Called when Metro doesn't serve this URL (it serves bundles, source
      // maps, assets, etc..), or with an error if handling the request failed.
      res.statusCode = error ? 500 : 404;
      res.end();
    });
  });

  httpServer.listen(8081);
});
```

With [Express](http://expressjs.com/), pass `processRequest` directly as a middleware:

```js
const app = require('express')();
app.use(metroBundlerServer.processRequest.bind(metroBundlerServer));
app.listen(8081);
```

### Method `runServer(config, options)`

Starts a complete development server and resolves to `{httpServer}`, the Node.js HTTP(S) server. `runServer` calls `runMetro` internally; use `runMetro` instead to attach Metro to your own HTTP server.

#### Options

Commonly used options include `host`, [`watch`](./Concepts.md#file-watching), `onReady` and `secureServerOptions`. See [`runServer`](./API.md#async-runserverconfig-options) for the full list. For example, to serve over HTTPS:

```js
const fs = require('fs');

const config = await Metro.loadConfig();
await Metro.runServer(config, {
  secureServerOptions: {
    ca: fs.readFileSync('path/to/ca'),
    cert: fs.readFileSync('path/to/cert'),
    key: fs.readFileSync('path/to/key'),
  }
});
```

### Method `runBuild(config, options)`

Builds a bundle once. Resolves to an object with `code`, `map` and, optionally, `assets`.

#### Options

The only required option is `entry`. Commonly used options include `platform`, `dev`, `minify` and `out`. See [`runBuild`](./API.md#async-runbuildconfig-options) for the full list and defaults.

```js
const config = await Metro.loadConfig();
await Metro.runBuild(config, {
  entry: 'index.js',
  platform: 'ios',
  minify: true,
  out: '/Users/Metro/metro-ios.js'
});
```

### Method `createConnectMiddleware(config, options)`

Creates a [Connect](https://github.com/senchalabs/connect) middleware that serves bundle requests, to plug Metro into your own Express or Connect server.

#### Options

For example, to serve Metro's bundles from an Express server, with Fast Refresh:

```js
const express = require('express');
const http = require('http');
const Metro = require('metro');

const app = express();
const httpServer = http.createServer(app);

Metro.loadConfig().then(async config => {
  const {middleware, attachHmrServer} = await Metro.createConnectMiddleware(config);
  app.use(middleware);
  attachHmrServer(httpServer);
  httpServer.listen(8081);
});
```

See [`createConnectMiddleware`](./API.md#createconnectmiddlewareconfig-options) for its options and return value.

## Available options

### Configuration

Metro reads its configuration from `metro.config.js` in the project root, and merges it with its defaults. For example, to also watch a shared directory outside the project, limit Metro to two worker processes, and serve on another port:

```js
// metro.config.js
const path = require('path');

module.exports = {
  watchFolders: [path.resolve(__dirname, '../shared')],
  maxWorkers: 2,
  server: {
    port: 8082,
  },
};
```

See [Configuring Metro](./Configuration.md) for all configuration options.

## URL and bundle request

A running Metro server serves bundles, source maps and assets over HTTP. In development, a React Native app loads its JavaScript by requesting a URL like `http://localhost:8081/index.bundle?platform=ios&dev=true` from Metro.

### Assets

Require an asset like a JavaScript file, e.g. `require('./logo.png')`. Metro recognizes assets by their file extension, which must be listed in [`resolver.assetExts`](./Configuration.md#assetexts), and makes `require` return the path to the file. Assets are generally served as-is.

Metro can also serve a variant of an asset for a specific [platform](./Concepts.md#platform) (dotted suffix, e.g. `.ios`) or, for images, resolution (`@` suffix, e.g. `@2x`): `logo@2x.ios.png` is the 2x iOS variant of `logo.png`. `require` handles this for you.

### Bundle

Any JS file in the [project root](./Concepts.md#project-root-and-watch-folders) can be the [entry point](./Concepts.md#entry-point) of a bundle, which includes the file and, recursively, everything it requires. To request a bundle, use the file's path relative to the project root (or [`server.unstable_serverRoot`](./Configuration.md#unstable_serverroot-experimental), if set), with `.js` changed to `.bundle`.

Pass build options as query parameters. All are optional. Boolean ones take `true` or `false` and default to `false` unless noted. `dev`, `platform` and `minify` correspond to the bundle's settings of the same name.

- `dev`: Build in development mode. Defaults to `true`.
- `platform`: The [platform](./Concepts.md#platform) requesting the bundle (e.g. `ios`). Defaults to the platform suffix of the requested file name, if any (e.g. `ios` for `index.ios.bundle`).
- `minify`: Minify the code.
- `excludeSource`: Leave the source code out of the source map, e.g. `/index.map?platform=ios&dev=true&excludeSource=true` returns a source map without `sourcesContent`.
- `inlineSourceMap`: Append the source map to the bundle as a base64 `data:` URL.
- `lazy`: Leave modules loaded with [`import()`](./ModuleAPI.md) out of the bundle and load them on demand.
- `modulesOnly`: Leave out Metro's runtime and polyfills, serving only the modules.
- `runModule`: End the bundle with the statements that run the entry point. Defaults to `true`.
- `shallow`: Include only the entry module, without its dependencies.
- `sourcePaths`: Reference source files in the source map as absolute file paths (`absolute`) or URL paths on the server (`url-server`). Defaults to `absolute`.
- `unstable_transformProfile`: Passed to the [Babel transformer](./Configuration.md#babeltransformerpath) to target a specific JavaScript engine (`default`, `hermes-stable` or `hermes-canary`). Defaults to `default`.
- `resolver.<key>` and `transform.<key>`: [Custom resolver options](./Resolution.md#customresolveroptions-string-mixed) and custom transform options, e.g. `transform.foo=bar` passes `{foo: 'bar'}` to the transformer.

For example, `http://localhost:8081/foo/bar/baz.bundle?dev=true&platform=ios` builds a development bundle for iOS from `foo/bar/baz.js`.

### Source maps

Metro builds a source map for each bundle. To request it, use the bundle's URL with `.map` instead of `.bundle` and the same query parameters, or the source map won't match the bundle. For example, the source map of `http://localhost:8081/index.bundle?platform=ios&dev=true` is `http://localhost:8081/index.map?platform=ios&dev=true`, which the bundle references with a `//# sourceMappingURL=` comment. This only works when `inlineSourceMap` is `false`.

## JavaScript transformer

The JavaScript transformer ([`babelTransformerPath`](./Configuration.md#babeltransformerpath)) manipulates each file's JS code, usually by calling Babel (see [Transformation](./Concepts.md#transformation)). React Native's default config sets one up (`@react-native/metro-babel-transformer`), so you only need your own for custom transformations. It can export two methods:

### Method `transform(module)`

Required. Transforms a module's code. It receives an object with:

- `filename`: The path of the file, relative to the project root.
- `src`: The source code.
- `options`: Options for this transformation, e.g. `dev`, `platform`, `minify`, `projectRoot`, `customTransformOptions` and `unstable_transformProfile`.
- `plugins`: Babel plugins that Metro wants applied to the code.

It must return an object with an `ast` key containing the Babel AST of the transformed code, and optionally Babel `metadata`. For example, using Babel:

```js
const {transformSync} = require('@babel/core');

module.exports.transform = ({filename, src, plugins}) =>
  transformSync(src, {ast: true, filename, plugins /* , other Babel options */});
```

### Method `getCacheKey(options)`

Optional. Receives `{projectRoot, enableBabelRCLookup}` and returns the transformer's cache key as a `string`, e.g. a hash of the Babel config files it reads. With multiple transformers, this lets Metro tie each transformed file to the transformer that produced it.
