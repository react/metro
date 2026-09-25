---
id: getting-started
title: Getting Started
---

Install Metro using [`npm`](https://www.npmjs.com/):

```bash
npm install --save-dev metro metro-core
```

Or via [`yarn`](https://yarnpkg.com/):

```bash
yarn add --dev metro metro-core
```

## Running `metro`

You can run Metro by either running the [CLI](./CLI.md) or by calling it programmatically.

### Running Programmatically

First, require the module by doing:

```js
const Metro = require('metro');
```

Within the object returned, several main methods are given:

### Method `runMetro(config)`

Given the config, a `metro-server` will be returned. You can then hook this into a proper HTTP(S) server by using its `processRequest` method:

```js
'use strict';

const http = require('http');
const Metro = require('metro');

// We first load the config from the file system
Metro.loadConfig().then(async (config) => {
  const metroBundlerServer = await Metro.runMetro(config);

  const httpServer = http.createServer(
    metroBundlerServer.processRequest.bind(metroBundlerServer),
  );

  httpServer.listen(8081);
});
```

In order to be also compatible with Express apps, `processRequest` will also call its third parameter when the request could not be handled by Metro. This allows you to integrate the server with your existing server, or to extend a new one:

```js
const httpServer = http.createServer((req, res) => {
  metroBundlerServer.processRequest(req, res, () => {
    // Metro does not know how to handle the request.
  });
});
```

If you are using [Express](http://expressjs.com/), you can just pass `processRequest` as a middleware:

```js
const express = require('express');
const app = express();

app.use(
  metroBundlerServer.processRequest.bind(metroBundlerServer),
);

app.listen(8081);
```

### Method `runServer(config, options)`

Starts a development server based on the given configuration and options. Returns an object with `httpServer`, the Node.js HTTP(S) server.
We recommend using `runMetro` instead of `runServer`, `runMetro` calls this function.

#### Options

* `host (string)`: Where to host the server on.
* `onReady (Function)`: Called when the server is ready to serve requests.
* `onClose (Function)`: Called when the server and all other Metro processes are closed. You can also observe the server close event directly using `httpServer.on('close', () => {});`.

```js
const config = await Metro.loadConfig();

await Metro.runServer(config, {
  onClose: () => {console.log('metro server and all associated processes are closed')}
});

httpServer.on('close', () => {console.log('metro server is closed')});
```
* `secure (boolean)`: **DEPRECATED** Whether the server should run on `https` instead of `http`.
* `secureKey (string)`: **DEPRECATED** The key to use for `https` when `secure` is on.
* `secureCert (string)`: **DEPRECATED** The cert to use for `https` when `secure` is on.
* `secureServerOptions (Object)`: The options object to pass to Metro's HTTPS server. The presence of this object will make Metro's server run on `https`. Refer to the [Node docs](https://nodejs.org/api/https.html#https_https_createserver_options_requestlistener) for valid options.
* `waitForBundler (boolean)`: Whether to wait for the bundler to finish initializing before returning the server instance.

```js
const config = await Metro.loadConfig();

await Metro.runServer(config);
```

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

Given a configuration and a set of options that you would typically pass to a server, plus a set of options specific to the bundle itself, a bundle will be built. The return value is a Promise that resolves to an object with `code`, `map`, and optionally `assets`. This is useful at build time.

#### Options

<!-- TODO(ives): Decide whether we need to show this to the user  * `output (boolean)` -->

* `assets (boolean)`: Whether to include the assets in the result.
* `bundleOut (string)`: Path to save the bundle. No extension will be added.
* `dev (boolean)`: Create a development version of the build (`process.env.NODE_ENV = 'development'`).
* `entry (string)`: Pointing to the entry file to bundle.
* `onBegin (Function)`: Called when the bundling starts.
* `onComplete (Function)`: Called when the bundling finishes.
* `onProgress (Function)`: Called during the bundle, every time there's new information available about the module count/progress.
* `minify (boolean)`: Whether Metro should minify the bundle.
* `out (string)`: Shorthand path to the output bundle and source map. A `.js` extension will be added (if not given) for the bundle and `.map` for the source map. Customize with `bundleOut` / `sourceMapOut`.
* `platform ('web' | 'android' | 'ios')`: Which platform to bundle for if a list of platforms is provided.
* `sourceMap (boolean)`: Whether Metro should generate source maps.
* `sourceMapOut (string)`: Where to save the source map, if `sourceMap == true`. No extension will be added.
* `sourceMapUrl (string)`: URL where the source map can be found. It defaults to the same URL as the bundle, but changing the extension from `.bundle` to `.map`. When `inlineSourceMap` is `true`, this property has no effect.

```js
const config = await Metro.loadConfig();

await Metro.runBuild(config, {
  entry: 'index.js',
  platform: 'ios',
  minify: true,
  out: '/Users/Metro/metro-ios.js'
});
```

### Method `createConnectMiddleware(config)`

Instead of creating the full server, creates a Connect middleware that answers to bundle requests. This middleware can then be plugged into your own servers. The `port` parameter is optional and only used for logging purposes.

#### Options

* `port (number)`: Port for the Connect middleware (only for logging purposes).

```js
const Metro = require('metro');
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

## Available options

### Configuration

Check [Configuring Metro](./Configuration.md) for details on configuration options.

## URL and bundle request

The server has the ability to serve assets, bundles and source maps for those bundles.

### Assets

In order to request an asset, you can freely use the `require` method as if it was another JS file. The server will treat this specific `require` calls  and make them return the path to that file. When an asset is requested (an asset is recognized by its extension, which has to be on the `assetExts` array) it is generally served as-is.

However, the server is also able to serve specific assets depending on the platform and on the requested size (in the case of images). The way you specify the platform is via the dotted suffix (e.g. `.ios`) and the resolution via the at suffix (e.g. `@2x`). This is transparently handled for you when using `require`.

### Bundle

Any JS file can be used as the root for a bundle request. The file will be looked in the `projectRoot`. All files that are required by the root will be recursively included. In order to request a bundle, just change the extension from `.js` to `.bundle`. Options for building the bundle are passed as query parameters (all optional).

* `dev`: build the bundle in development mode or not. Maps 1:1 to the `dev` setting of the bundles. Pass `true` or `false` as strings into the URL.
* `platform`: platform requesting the bundle. Can be `ios` or `android`. Maps 1:1 to the `platform` setting of the bundles.
* `minify`: whether code should be minified or not. Maps 1:1 to the `minify` setting of the bundles. Pass `true` or `false` as strings into the URL.
* `excludeSource`: whether sources should be included in the source map or not. Pass `true` or `false` as strings into the URL.

For instance, requesting `http://localhost:8081/foo/bar/baz.bundle?dev=true&platform=ios` will create a bundle out of `foo/bar/baz.js` for iOS in development mode.

### Source maps

Source maps are built for each bundle by using the same URL as the bundle (thus, the same as the JS file acting as a root). This will only work when `inlineSourceMap` is set to `false`. All options you passed to the bundle will be added to the source map URL; otherwise, they wouldn't match.

## JavaScript transformer

The JavaScript transformer ([`babelTransformerPath`](./Configuration.md#babeltransformerpath)) is the place where JS code will be manipulated; useful for calling Babel. The transformer can export two methods:

### Method `transform(module)`

Mandatory method that will transform code. The object received has information about the module being transformed (e.g its path, code...) and the returned object has to contain an `ast` key that is the AST representation of the transformed code. The default shipped transformer does the bare minimum amount of work by just parsing the code to AST:

```js
const babylon = require('@babel/parser');

module.exports.transform = (file: {filename: string, src: string}) => {
  const ast = babylon.parse(file.src, {sourceType: 'module'});

  return {ast};
};
```

If you would like to plug in Babel, you can simply do that by passing the code to it:

```js
const {transformSync} = require('@babel/core');

module.exports.transform = file => {
  return transformSync(file.src, {
    // Babel options...
  });
};
```

### Method `getCacheKey()`

Optional method that returns the cache key of the transformer. When using different transformers, this allows to correctly tie a transformed file to the transformer that converted it. The result of the method has to be a `string`.
