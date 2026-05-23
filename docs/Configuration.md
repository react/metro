---
id: configuration
title: Configuring Metro
---

A Metro config can be created in these three ways (ordered by priority):

1.  `metro.config.js`
2.  `metro.config.json`
3.  The `metro` field in `package.json`

You can also give a custom file to the configuration by specifying `--config <path/to/config>` when calling the CLI.

:::note

When Metro is started via the React Native CLI, some defaults are different from those mentioned below.
See the [React Native repository](https://github.com/facebook/react-native/blob/main/packages/community-cli-plugin/src/utils/loadMetroConfig.js) for details.

:::

## Configuration Structure

The configuration is based on [our concepts](./Concepts.md), which means that for every module we have a separate config option. A common configuration structure in Metro looks like this:

```js
module.exports = {
  /* general options */

  resolver: {
    /* resolver options */
  },
  transformer: {
    /* transformer options */
  },
  serializer: {
    /* serializer options */
  },
  server: {
    /* server options */
  },
  watcher: {
    /* watcher options */
    watchman: {
      /* Watchman-specific options */
    }
  }
};
```

### General Options


#### `cacheStores`

Type: `CacheStores` (see details below)

A list of storage adapters for Metro's [transformer cache](./Caching.md). This can be any combination of [built-in cache stores](./Caching.md#built-in-cache-stores) and [custom cache stores](./Caching.md#custom-cache-stores). Defaults to using a temporary directory on disk as the only cache store.

When Metro needs to transform a module, it first computes a machine-independent cache key for that file, and uses it to try to read from each of the stores in order. Once Metro has obtained the output of the transformer (whether already cached or not), it writes the transform result to *all* of the stores that returned `null` (a cache miss) for that key.

```flow
type CacheStores =
  | Array<CacheStore<Buffer | JsonSerializable>>
  | ((MetroCache) => Array<
      CacheStore<Buffer | JsonSerializable>
    >);

// The exports of 'metro-cache'
type MetroCache = {
  FileStore,
  AutoCleanFileStore,
  HttpStore,
  HttpGetStore,
  ...
};

type JsonSerializable = /* Any JSON-serializable value */;
```

#### `cacheVersion`

Type: `string`

An arbitrary string appended to all cache keys in the project before they are hashed. There is generally no need to set this explicitly, as Metro will automatically derive the correct cache keys from your project config and the contents of source files.

#### `projectRoot`

Type: `string`

The root folder of your project. If your project depends on any files outside this root, their containing directories must be listed in [`watchFolders`](#watchfolders).

:::note
If your Metro project is developed in a monorepo and includes files from multiple logical packages, you'll generally want to set `projectRoot` to the root of your repository, or at least high enough in the hierarchy that all relevant files are reachable without separately configuring `watchFolders`.
:::

#### `watchFolders`

Type: `Array<string>`

A list of directories outside of [`projectRoot`](#projectroot) that can contain source files for the project.

:::note
Despite the naming of this option, it isn't related solely to file watching. Even in an offline build (for example, in CI), all files must be visible to Metro through the combination of `watchFolders` and `projectRoot`.
:::

:::info

Note that, as with any other file Metro needs to resolve, targets of any symlinks within your `watchFolders` *must also be within `watchFolders`* and not otherwise excluded.

If you have a Metro project within a workspace, such as a [Yarn workspace](https://classic.yarnpkg.com/lang/en/docs/workspaces/) (a subdirectory of a Yarn workspace root), it's likely you'll want to include your workspace *root* path in your configured `watchFolders` so that Metro can resolve other workspaces or hoisted `node_modules`. Similarly, to use [linked packages](https://classic.yarnpkg.com/lang/en/docs/cli/link/), you'll need to list those package source locations (or a containing directory) in `watchFolders`.

:::

#### `transformerPath`

Type: `string`

The absolute path of a module (or a package name resolvable from the `metro` package) that implements a transformer.

See the implementation of Metro's default transformer ([`metro-transform-worker`](https://github.com/facebook/metro/blob/main/packages/metro-transform-worker/src/index.js)) for more information about the transformer interface.

#### `reporter`

Type: `{update: (event: ReportableEvent) => void}`

Used to report the status of the bundler during the bundling process. The default implementation prints most events to the terminal.

See also the [definition of `ReportableEvent`](https://github.com/facebook/metro/blob/main/packages/metro/src/lib/reporting.js) in Metro's source code.

#### `resetCache`

Type: `boolean`

If `true`, Metro will reset the transformer cache (see [`cacheStores`](#cachestores)) and the file map cache (see [`fileMapCacheDirectory`](#filemapcachedirectory)) on startup.

#### `stickyWorkers`

Type: `boolean`

If `true`, Metro will use a stable mapping from files to transformer workers, so the same file is always transformed by the same worker. This can improve initial build performance if the transformer is expensive to initialize, but can slow down concurrent builds with different configurations (e.g. multiple React Native apps connected to one Metro server). Defaults to `true`.

#### `maxWorkers`

Type: `number`

The number of workers to use for parallel processing in Metro. Defaults to approximately half of the number of cores available on the machine, as reported by [`os.availableParallelism()`](https://nodejs.org/api/os.html#osavailableparallelism).

:::note
1. Values exceeding the number of available cores have no effect.
2. If `maxWorkers` is set to 1 or lower, worker code will run in the main Metro process instead of concurrently.
3. Metro has two separate worker pools - one for transformation and one for building the file map. Each pool has its worker count set to `maxWorkers` independently.
:::

#### `fileMapCacheDirectory`

Type: `string`

The path to the `metro-file-map` cache directory, defaults to `os.tmpdir()`.

#### `hasteMapCacheDirectory` <div class="label deprecated">Deprecated</div>

Type: `string`

Alias of [`fileMapCacheDirectory`](#filemapcachedirectory)

#### `unstable_perfLoggerFactory`

Type: `PerfLoggerFactory`

A logger factory function that can be used to get insights about Metro performance timings and metadata for events including startup, bundling and HMR. Metro expects `unstable_perfLoggerFactory` to have the following signature:

```flow
function unstable_perfLoggerFactory(
  type: string,
  opts: $ReadOnly<{
    key?: string
  }>,
): RootPerfLogger {
  // ...
};
```

* **`type`** Type of event being logged, e.g. `'STARTUP'`, `'BUNDLING_REQUEST'`, `'HMR'`. See type definition of [PerfLoggerFactory](https://github.com/facebook/metro/blob/main/packages/metro-config/src/types.js) for a full list of event types.
* **`opts`**
  * **`key`**: An opaque identifier to distinguish between instances of an event type (e.g. multiple, possibly concurrent, HMR requests).

`unstable_perfLoggerFactory` should return an object implementing the [RootPerfLogger](https://github.com/facebook/metro/blob/main/packages/metro-config/src/types.js) interface. For example, a factory function returning a no-op RootPerfLogger could be implemented as follows:


```javascript
const unstable_perfLoggerFactory = (type, factoryOpts) => {
  const getLogger = subSpanLabel => {
    const logger = {
      start(opts) {},
      end(status, opts) {},
      subSpan(label) {
        return getLogger(`${subSpanLabel ?? ''}/${label}`);
      },
      point(name, opts) {},
      annotate(annotations) {},
    };
    return logger;
  };

  return getLogger();
};
```

---
### Resolver Options

#### `assetExts`

Type: `Array<string>`

The list of asset file extensions to include in the bundle. For example, including `'ttf'` allows Metro bundles to reference `.ttf` files. This is used primarily to enable React Native's [image asset support](https://reactnative.dev/docs/images). The default list includes many common image, video and audio file extensions. See [Metro's source code](https://github.com/facebook/metro/blob/main/packages/metro-config/src/defaults/defaults.js#L16) for the full list.

#### `sourceExts`

Type: `Array<string>`

The list of source file extensions to include in the bundle. For example, including `'ts'` allows Metro to include `.ts` files in the bundle.

The order of these extensions defines the order to match files on disk. For more information, see [Module Resolution](https://metrobundler.dev/docs/resolution).

Defaults to `['js', 'jsx', 'json', 'ts', 'tsx']`.

#### `resolverMainFields`

Type: `Array<string>`

The list of fields in `package.json` that Metro will treat as describing a package's entry points. The default is `['browser', 'main']`, so the resolver will use the `browser` field if it exists and `main` otherwise.

Metro's default resolver processes each of these fields according to the [`browser` field spec](https://github.com/defunctzombie/package-browser-field-spec), including the ability to [replace](https://github.com/defunctzombie/package-browser-field-spec#replace-specific-files---advanced) and [ignore](https://github.com/defunctzombie/package-browser-field-spec#ignore-a-module) specific files. For more information, see [Module Resolution](https://metrobundler.dev/docs/resolution).

:::note

When using React Native, `resolverMainFields` defaults to `['react-native', 'browser', 'main']`.

:::

#### `disableHierarchicalLookup`

Type: `boolean`

Whether to disable [looking up modules in `node_modules` folders](https://nodejs.org/api/modules.html#modules_loading_from_node_modules_folders). This only affects the default search through the directory tree, not other Metro options like `extraNodeModules` or `nodeModulesPaths`. Defaults to `false`.

#### `emptyModulePath`

Type: `string`

What module to use as the canonical "empty" module when one is needed. Defaults to using the one included in `metro-runtime`. You only need to change this if Metro is installed outside of your project.

#### `enableGlobalPackages`

Type: `boolean`.

Whether to automatically resolve references to first-party packages (e.g. workspaces) in your project. Any `package.json` file with a valid `name` property within `projectRoot` or `watchFolders` (but outside of `node_modules`) counts as a package for this purpose. Defaults to `false`.

#### `extraNodeModules`

Type: `{[string]: string}`

A mapping of package names to directories that is consulted after the standard lookup through `node_modules` as well as any [`nodeModulesPaths`](#nodemodulespaths). For more information, see [Module Resolution](https://metrobundler.dev/docs/resolution).

#### `nodeModulesPaths`

Type: `Array<string>`

A list of paths to check for modules after looking through all `node_modules` directories. This is useful if third-party dependencies are installed in a different location outside of the direct path of source files. For more information, see [Module Resolution](https://metrobundler.dev/docs/resolution).

#### `resolveRequest`

Type: [`?CustomResolver`](./Resolution.md#resolverequest-customresolver)

An optional function used to override the default resolution algorithm. This is particularly useful for cases where aliases or custom protocols are used. For example:

```javascript
resolveRequest: (context, moduleName, platform) => {
  if (moduleName.startsWith('my-custom-resolver:')) {
    // Logic to resolve the module name to a file path...
    // NOTE: Throw an error if there is no resolution.
    return {
      filePath: 'path/to/file',
      type: 'sourceFile',
    };
  }
  // Optionally, chain to the standard Metro resolver.
  return context.resolveRequest(context, moduleName, platform);
}
```

For more information on customizing the resolver, see [Module Resolution](https://metrobundler.dev/docs/resolution).

#### `useWatchman`

Type: `boolean`

If set to `false`, prevents Metro from using Watchman (even if it's installed).

#### `blockList`

Type: `RegExp` or `Array<RegExp>`

A regular expression (or list of regular expressions) defining which paths to exclude from Metro's file map. Files whose absolute paths match these patterns are effectively hidden from Metro and cannot be resolved or imported in the current project. Additionally, blocked files cannot be served via the `/assets/` endpoint.

#### `hasteImplModulePath`

Type: `?string`

The path to the Haste implementation for the current project. Haste is an opt-in mechanism for importing modules by their globally-unique name anywhere in the project, e.g. `import Foo from 'Foo'`.

Metro expects this module to have the following signature:

```flow
module.exports = {
  getHasteName(filePath: string): ?string {
    // ...
  },
};
```

`getHasteName` should return a short, globally unique name for the module whose path is `filePath`, or `null` if the module should not be accessible via Haste.

#### `platforms`

Type: `Array<string>`

Additional platforms to resolve. Defaults to `['ios', 'android', 'windows', 'web']`.

For more information, see [Module Resolution](./Resolution.md) and [React Native's documentation for platform-specific extensions](https://reactnative.dev/docs/platform-specific-code#platform-specific-extensions).

#### `requireCycleIgnorePatterns`

Type: `Array<RegExp>`

In development mode, suppress require cycle warnings for any cycle involving a module that matches any of these expressions. This is useful for third-party code and first-party expected cycles.

Note that if you specify your own value for this config option it will replace (not concatenate with) Metro's default.

Defaults to `[/(^|\/|\\)node_modules($|\/|\\)/]`.

#### `unstable_conditionNames` <div class="label experimental">Experimental</div>

Type: `Array<string>`

:::note

This setting will take effect when [`unstable_enablePackageExports`](#unstable_enablepackageexports-experimental)  is `true` (the default). It may not behave as described while this feature is experimental.

:::

The set of [condition names](https://nodejs.org/docs/latest-v18.x/api/packages.html#conditional-exports) to assert globally when interpreting the [`"exports"` field](https://nodejs.org/docs/latest-v18.x/api/packages.html#exports) in package.json.

Conditions may be any string value and are resolved in the order specified by each package. Node.js documents a number of [community conditions](https://nodejs.org/docs/latest-v18.x/api/packages.html#community-conditions-definitions) which are commonly used by package authors. The `default` condition is always matched.

Defaults to `['require']`.

:::note

When using React Native, `unstable_conditionNames` defaults to `['require', 'react-native']`.

:::

#### `unstable_conditionsByPlatform` <div class="label experimental">Experimental</div>

Type: `{[platform: string]: Array<string>}`

:::note

This setting will take effect when [`unstable_enablePackageExports`](#unstable_enablepackageexports-experimental)  is `true` (the default). It may not behave as described while this feature is experimental.

:::

The set of additional [condition names](https://nodejs.org/docs/latest-v18.x/api/packages.html#conditional-exports) to dynamically assert by platform (see [`platforms`](#platforms)) when interpreting the [`"exports"` field](https://nodejs.org/docs/latest-v18.x/api/packages.html#exports) in package.json.

Matched conditions are merged with [`unstable_conditionNames`](#unstable-conditionnames) before resolution. With the defaults for both options, the conditions `new Set(['require', 'browser'])` will be asserted when requesting a `web` bundle, and `new Set(['require'])` otherwise. Again, these are resolved in the order specified by each package.

Defaults to `‌{ web: ['browser'] }`.

#### `unstable_enablePackageExports` <div class="label experimental">Experimental</div>

Type: `boolean`

Enable experimental [Package Exports](https://nodejs.org/docs/latest-v18.x/api/packages.html#package-entry-points) support. Under this mode, Metro will read the [`"exports"` field](https://nodejs.org/docs/latest-v18.x/api/packages.html#exports) in `package.json` files when present and use it to resolve package entry points.

When no match is found in `"exports"`, Metro will log a warning and fall back to resolving modules without considering `"exports"`. This makes this mode largely backwards-compatible, with the following exceptions:

- If a module is matched in `"exports"`, [`sourceExts`](#sourceexts) and [`platforms`](#platforms) will not be considered (i.e. platform-specific extensions will not be used). This is done for compatibility with Node.
- If a module exists at a file path that is also listed in `"exports"`, and the `"exports"` entry maps to a different file, the `"exports"` entry will be preferred.

Defaults to `true` since Metro 0.82.0.

:::note

In a future release of Metro, this option will be removed.

:::

---

### Transformer Options

<!-- Keep old links to `asyncRequireModulePath` working -->
<a name="asyncrequiremodulepath"></a>

#### `asyncRequireModulePath` <div class="label deprecated">Deprecated</div>

Type: `string`

The name of a module that provides the `asyncRequire` function, which is used to implement [dynamic `import()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import) at runtime. Defaults to [`metro-runtime/src/modules/asyncRequire`](https://github.com/facebook/metro/blob/main/packages/metro-runtime/src/modules/asyncRequire.js).

:::note
The module named by `asyncRequireModulePath` is [resolved](./Resolution.md) relative to the module containing the original `import()` call. In particular, assuming the default value of `asyncRequireModulePath` is in use, the project must have a compatible version of `metro-runtime` installed in `node_modules`.
:::

:::info
In older versions of Metro, a custom `asyncRequireModulePath` could be used as part of a bundle splitting solution. This usage is now deprecated in favor of the [`__loadBundleAsync`](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0605-lazy-bundling.md#__loadbundleasync-in-metro) API.
:::

#### `dynamicDepsInPackages`

Type: `'throwAtRuntime' | 'reject'`

Controls how Metro handles dependencies that cannot be statically analyzed at build time. For example, `require('./' + someFunction() + '.js')` cannot be resolved without knowing what `someFunction()` will return.

* **`'throwAtRuntime'`** (the default): Metro does not stop bundling, but the `require` call will throw at runtime.
* **`'reject'`**: Metro will stop bundling and report an error to the user.

#### `getTransformOptions`

Type: Function (see details below)

A function called by Metro to calculate additional options for the transformer and serializer based on the specific bundle being built.

Metro expects `getTransformOptions` to have the following signature:

```flow
function getTransformOptions(
  entryPoints: $ReadOnlyArray<string>,
  options: {
    dev: boolean,
    hot: boolean,
    platform: ?string,
  },
  getDependenciesOf: (path: string) => Promise<Array<string>>,
): Promise<ExtraTransformOptions> {
  // ...
}
```

`getTransformOptions` receives these parameters:

* **`entryPoints`**: Absolute paths to the bundle's entry points (typically just one).
* **`options`**:
  * **`dev`**: Whether the bundle is being built in development mode.
  * **`hot`**: <div class="label deprecated">Deprecated</div> Always true.
  * **`platform`**: The target platform (e.g. `ios`, `android`).
* **`getDependenciesOf`**: A function which, given an absolute path to a module, returns a promise that resolves to the absolute paths of the module's transitive dependencies.

`getTransformOptions` should return a promise that resolves to an object with the following properties:

```flow
type ExtraTransformOptions = {
  preloadedModules?: {[path: string]: true} | false,
  ramGroups?: Array<string>,
  transform?: {
    inlineRequires?: {blockList: {[string]: true}} | boolean,
    nonInlinedRequires?: $ReadOnlyArray<string>,
  },
};
```

* **`preloadedModules`**: A plain object whose keys represent a set of absolute paths. When serializing an [indexed RAM bundle](https://reactnative.dev/docs/ram-bundles-inline-requires#enable-the-ram-format), the modules in this set will be marked for eager evaluation at runtime.
* **`ramGroups`**: An array of absolute paths. When serializing an [indexed RAM bundle](https://reactnative.dev/docs/ram-bundles-inline-requires#enable-the-ram-format), each of the listed modules will be serialized along with its transitive dependencies. At runtime, the modules will all be parsed together as soon as any one of them is evaluated.
* **`transform`**: Advanced options for the transformer.
  * **`inlineRequires`**:
    * If `inlineRequires` is a boolean, it controls whether [inline requires](https://reactnative.dev/docs/optimizing-javascript-loading#advanced-automatically-inline-require-calls) are enabled in this bundle.
    * If `inlineRequires` is an object, inline requires are enabled in all modules, except ones whose absolute paths appear as keys of `inlineRequires.blockList`.
  * **`nonInlinedRequires`**: An array of unresolved module specifiers (e.g. `react`, `react-native`) to never inline, even when inline requires are enabled.

#### `globalPrefix`

Prefix added to all module system globals (e.g. `__r` or `__d`).

#### `minifierPath`

Type: `string` (default: `'metro-minify-terser'`)

Path, or package name resolvable from `metro-transform-worker`, to the minifier that minifies the code after transformation.

#### `minifierConfig`

Type: `{[key: string]: mixed}`

Configuration object that will be passed to the minifier (it should be serializable).

#### `optimizationSizeLimit`

Type: `number`

Define a threshold (in bytes) to disable some expensive optimizations for big files.

#### React Native Only

#### `assetPlugins`

Type: `Array<string>`

List of modules to call to modify Asset data

#### `assetRegistryPath`

Type: `string`

Where to fetch the assets from.

### Babel-specific transformer options

#### `babelTransformerPath`

Type: `string`

The name of a module that compiles code with Babel, returning an AST and optional metadata. Defaults to `metro-babel-transformer`.

Refer to the source code of [`metro-babel-transformer`](https://github.com/facebook/metro/blob/main/packages/metro-babel-transformer/src/index.js) and [`@react-native/metro-babel-transformer`](https://github.com/facebook/react-native/blob/main/packages/react-native-babel-transformer/src/index.js) for details on implementing a custom Babel transformer.

:::note
This option only has an effect under the default [`transformerPath`](#transformerpath). Custom transformers may ignore it.
:::

#### `enableBabelRCLookup`

Type: `boolean`

Whether to enable searching for Babel configuration files. This is passed to Babel as the [`babelrc`](https://babeljs.io/docs/en/options#babelrc) config option. Defaults to `true`.

:::note
This option only has an effect under the default [`transformerPath`](#transformerpath). Custom transformers may ignore it. Custom [Babel transformers](#babeltransformerpath) should respect this option.
:::

#### `enableBabelRuntime`

Type: `boolean | string`

Whether the transformer should use the `@babel/transform/runtime` plugin. Defaults to `true`.

If the value is a string, it is treated as a runtime version number and passed as `version` to the `@babel/plugin-transform-runtime` configuration. This allows you to optimize the generated Babel runtime calls based on the version installed in your project.

:::note
This option only works under the default settings for React Native. It may have no effect in a project that uses custom [`transformerPath`](#transformerpath), a custom [`babelTransformerPath`](#babeltransformerpath) or a custom [Babel config file](https://babeljs.io/docs/en/config-files).
:::

#### `hermesParser`

Type: `boolean`

Whether to use the [`hermes-parser`](https://www.npmjs.com/package/hermes-parser) package to parse JavaScript source files, instead of Babel. Defaults to `false`.

:::note
This option only has an effect under the default [`transformerPath`](#transformerpath) and the [Babel transformers](#babeltransformerpath) built into Metro. Custom transformers and custom [Babel transformers](#babeltransformerpath) may ignore it.
:::

---
### Serializer Options

#### `getRunModuleStatement`

Type: `(moduleId: number | string, globalPrefix: string) => string`

Specify the format of the initial require statements that are appended at the end of the bundle. By default is `__r(${moduleId});` or `${__METRO_GLOBAL_PREFIX__}__r(${moduleId});` when [`globalPrefix`](#globalprefix) is defined.

#### `createModuleIdFactory`

Type: `() => (path: string) => number`

Used to generate the module id for `require` statements.

#### `getPolyfills`

Type: `({platform: ?string}) => $ReadOnlyArray<string>`

An optional list of polyfills to include in the bundle. The list defaults to a set of common polyfills for Number, String, Array, Object...

#### `getModulesRunBeforeMainModule`

Type: `(entryFilePath: string) => Array<string>`

An array of modules to be required before the entry point. It should contain the absolute path of each module. Note that this will add the additional require statements only if the passed modules are already included as part of the bundle.

#### `processModuleFilter`

Type: `(module: Array<Module>) => boolean`

A filter function to discard specific modules from the output.

#### `isThirdPartyModule`

Type: `(module: {path: string, ...}) => boolean`

A function that determines which modules are added to the [`x_google_ignoreList`](https://developer.chrome.com/articles/x-google-ignore-list/) field of the source map. This supports ["Just My Code"](https://developer.chrome.com/blog/devtools-modern-web-debugging/#just-my-code) debugging in Chrome DevTools and other compatible debuggers.

Defaults to returning `true` for modules with a path component named `node_modules`.

:::note
In addition to modules marked as ignored by `isThirdPartyModule`, Metro will also automatically add modules generated by the bundler itself to the ignore list.
:::

---
### Server Options

These options are used when Metro serves the content.

#### `port`

Type: `number`

Which port to listen on.

#### `useGlobalHotkey`

Type: `boolean`

Whether we should enable CMD+R hotkey for refreshing the bundle.

#### `enhanceMiddleware` <div class="label deprecated">Deprecated</div>

Type: `(Middleware, MetroServer) => Middleware`

A function that allows attaching custom [`connect`](https://www.npmjs.com/package/connect) middleware to Metro. For example:

:::tip
You can use [`connect()`](https://www.npmjs.com/package/connect#mount-middleware) as a utility to extend the base `metroMiddleware` and to mount additional middleware handlers.
:::

```ts
enhanceMiddleware: (metroMiddleware: Middleware, metroServer: MetroServer) => {
  return connect()
    .use(metroMiddleware)
    .use('/custom-endpoint', customEndpointMiddleware());
},
```

The `Middleware` type is an alias for [`connect.HandleFunction`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/876b9ec96ba02d0c84b1e49af5890c8f5aa2dfe3/types/connect/index.d.ts#L29).

#### `rewriteRequestUrl`

Type: `string => string`

A function that will be called every time Metro processes a "URL" (see note), after normalization of non-standard query-string delimiters using [`jsc-safe-url`](https://www.npmjs.com/package/jsc-safe-url). Metro will use the return value of this function as if it were the original URL provided by the client. This applies to all incoming HTTP requests (after any custom middleware), as well as bundle URLs in `/symbolicate` request payloads and within the hot reloading protocol.

:::note

The input may be either an absolute URL (e.g. `https://example.com/foo/bar?baz=qux`) or a path (e.g. `/foo/bar?baz=qux`). The output should use the same form as the input - i.e. the returned value should be an absolute URL if and only if the input is an absolute URL.

:::

#### `forwardClientLogs`

Type: `boolean`

Enable forwarding of `client_log` events (when client logs are [configured](https://github.com/facebook/metro/blob/614ad14a85b22958129ee94e04376b096f03ccb1/packages/metro/src/lib/createWebsocketServer.js#L20)) to the reporter. Defaults to `true`.

#### `tls`

Type: `false | object`

If not provided or is `false` Metro will start an HTTP server with WS WebSocket endpoints.

If an object, Metro will start an HTTPS server with WSS WebSocket endpoints using the passed TLS options:

```ts
ca?: string | Buffer,      // Certificate authority (contents, not path)
cert?: string | Buffer,    // Server certificate (contents, not path)
key?: string | Buffer,     // Private key (contents, not path)
requestCert?: boolean,     // Whether to authenticate the remote peer by requesting a certificate
```

Notice that when overriding the base config, object tls configs extend the base tls config, false overrides the base tls configs, and `null` and `undefined` are ignored.

When running Metro with `Metro.runServer` with the `secureServerOptions` property Metro will likewise start an HTTPS server merging with the `config.server.tls` object if provided, overriding it.

---

### Watcher Options

Options for the filesystem watcher.

:::note

Dot notation in this section indicates a nested configuration object, e.g. `watchman.deferStates` → `watchman: { deferStates: ... }`.

:::

#### `additionalExts`

Type: `Array<string>`

The extensions which Metro should watch in addition to `sourceExts`, but which will not be automatically tried by the resolver.

Therefore, the two behavior differences from `resolver.sourceExts` when importing a module are:

- Modules can only be required when fully specified (e.g. `import moduleA from 'moduleA.mjs'`).
- No platform-specific resolution is performed.

Defaults to `['cjs', 'mjs']`.

#### `healthCheck.enabled`

Type: `boolean`

Whether to periodically check the health of the filesystem watcher by writing a temporary file to the project and waiting for it to be observed.

The default value is `false`.

#### `healthCheck.filePrefix`

Type: `string`

If watcher health checks are enabled, this property controls the name of the temporary file that will be written into the project filesystem.

The default value is `'.metro-health-check'`.

:::note

There's no need to commit health check files to source control. If you choose to enable health checks in your project, make sure you add `.metro-health-check*` to your `.gitignore` file to avoid generating unnecessary changes.

:::

#### `healthCheck.interval`

Type: `number`

If watcher health checks are enabled, this property controls how often they occur (in milliseconds).

The default value is 30000.

#### `healthCheck.timeout`

Type: `number`

If watcher health checks are enabled, this property controls the time (in milliseconds) Metro will wait for a file change to be observed before considering the check to have failed.

The default value is 5000.

#### `watchman.deferStates`

Type: `Array<string>`

Applies when using Watchman. Metro will [defer processing filesystem updates](https://facebook.github.io/watchman/docs/cmd/subscribe.html#defer) while these [states](https://facebook.github.io/watchman/docs/cmd/state-enter.html) are asserted in the watch. This is useful for debouncing builds while the filesystem hasn't settled, e.g. during large source control operations.

The default value is `['hg.update']`.

## Merging Configurations

Using the `metro-config` package it is possible to merge multiple configurations together.

| Method                                  | Description                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `mergeConfig(...configs): MergedConfig` | Returns the merged configuration of two or more configuration objects or functions. |

`configs` may be any combination of (promises resolving to) configuration objects or functions. Functions are called with the merged config of all configs to the left, which may be useful for complex merges with the previous config.

If any arguments are promises or async functions, `mergeConfig` will return a `Promise`, otherwise it will return the merged config synchronously.

:::note

Arrays and function based config parameters do not deeply merge and will instead override any pre-existing config parameters.
This allows overriding and removing default config parameters such as `platforms` or `getModulesRunBeforeMainModule` that may not be required in your environment.

:::

#### Merging Example

```js
// metro.config.js
const { mergeConfig } = require('metro-config');

const configA = {
  /* general options */

  resolver: {
    /* resolver options */
  },
  transformer: {
    /* transformer options */
  },
  serializer: {
    /* serializer options */
  },
  server: {
    /* server options */
  }
};

const configB = {
  /* general options */

  resolver: {
    /* resolver options */
  },
  transformer: {
    /* transformer options */
  },
  serializer: {
    /* serializer options */
  },
  server: {
    /* server options */
  }
};

// Function forms may be used to access the previous configuration
configCFn = (previousConfig /* result of mergeConfig(configA, configB) */) => {
  return {
    watchFolders: [...previousConfig.watchFolders, 'my-watch-folder'],
  }
}

module.exports = mergeConfig(configA, configB, configCFn);
```
