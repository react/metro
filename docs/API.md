---
id: api
title: Bundling API
---

## Quick Start

- Compile a file

  ```js
  const config = await Metro.loadConfig();

  await Metro.runBuild(config, {
    entry: 'index.js',
    out: 'bundle.js',
  });
  ```

- Run a server and watch the filesystem for changes

  ```js
  const config = await Metro.loadConfig();

  await Metro.runServer(config);
  ```

- Create a Connect middleware and plug it into a server

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

## Reference

All functions exposed below accept an additional `config` option. This object should be the [Metro configuration](CLI.md) exposed by your `metro.config.js` file - you can obtain it using `Metro.loadConfig`.

### `loadConfig(<options>)`

**Basic options:** `config`, `cwd`

Load the Metro configuration, either from `config` in options if specified, or by traversing the directory hierarchy from `cwd` to the root until it finds a file (by default `metro.config.js`). The returned configuration will have been normalized and merged with Metro's default values.

### `async runMetro(config)`

Creates a Metro server based on the config and returns it. You can use this as a middleware in your existing server.

### `async runBuild(config, <options>)`

**Required options:** `entry`, `out`

**Basic options:** `dev`, `minify`, `platform`, `sourceMap`, `sourceMapUrl`, `assets`

Bundles `entry` for the given `platform`, and saves it to location `out`. If `sourceMap` is set, also generates a source map. The source map will be inlined, unless `sourceMapUrl` is also defined. In the latter case, a new file will be generated with the basename of the `sourceMapUrl` parameter. If `assets` is `true`, an array of `AssetData` will be generated and returned in the `assets` property of the result object.

### `async runServer(config, <options>)`

**Basic options:** `host`, `port`, `secureServerOptions`, `secure (DEPRECATED)`, `secureKey (DEPRECATED)`, `secureCert (DEPRECATED)`

Starts a full Metro HTTP server. It will listen on the specified `host:port`, and can then be queried to retrieve bundles for various entry points. If the `secureServerOptions` family of options are present, the server will be exposed over HTTPS.

`secure`, `secureKey`, `secureCert` are now deprecated and will be removed in a later release. The presence of `secureServerOptions`, along with its options will make Metro run over https.

### `createConnectMiddleware(config, <options>)`

**Basic options:** `port`, `onBundleBuilt`

Instead of creating the full server, creates a Connect middleware that answers to bundle requests. This middleware can then be plugged into your own servers. The `port` parameter is optional and only used for logging purposes. The `onBundleBuilt` function is optional, is passed the bundle name, and is called when the server has finished creating the bundle.
