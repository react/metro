---
id: configuration
title: Configuring Metro
---

A Metro config can be created in the following file formats (ordered by priority):

1.  `metro.config.js` / `metro.config.cjs` / `metro.config.mjs` (CommonJS or ESM)
2.  `metro.config.json`
3.  `metro.config.ts` / `metro.config.cts` / `metro.config.mts` (TypeScript)
4.  `.config/metro.js` / `.config/metro.cjs` / `.config/metro.mjs` / `.config/metro.json` / `.config/metro.ts` / `.config/metro.cts` / `.config/metro.mts`
5.  The `metro` field in `package.json`

You can also give a custom file to the configuration by specifying `--config <path/to/config>` when calling the CLI.

:::info TypeScript Config Support

Metro uses Node.js native TypeScript support to load `.*ts` config files. For Node.js 22.18.0 and later or 24.0.0 and later, _erasable_ TypeScript is supported out of the box. For Node.js 22.6.0 to 22.17.x, use the `--experimental-strip-types` flag. See https://nodejs.org/learn/typescript/run-natively.

:::

:::note

When Metro is started via the React Native CLI, some defaults are different from those mentioned below.
See the [React Native repository](https://github.com/facebook/react-native/blob/main/packages/community-cli-plugin/src/utils/loadMetroConfig.js) for details.

:::

## Configuration Structure

The configuration is based on [our concepts](./Concepts.md), which means that for every module we have a separate config option. A basic configuration structure in Metro looks like this:

```typescript
// metro.config.mts
import type {MetroConfig} from 'metro-config';

const config: MetroConfig = {
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
  symbolicator: {
    /* symbolicator options */
  },
  watcher: {
    /* watcher options */
    watchman: {
      /* Watchman-specific options */
    }
  }
};

export default config;
```

:::note

See [Merging Configurations](#merging-configurations) below for more advanced forms.

:::

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

See the implementation of Metro's default transformer ([`metro-transform-worker`](https://github.com/react/metro/blob/main/packages/metro-transform-worker/src/index.js)) for more information about the transformer interface.

#### `reporter`

Type: `{update: (event: ReportableEvent) => void}`

Used to report the status of the bundler during the bundling process. The default implementation prints most events to the terminal.

See also the [definition of `ReportableEvent`](https://github.com/react/metro/blob/main/packages/metro/src/lib/reporting.js) in Metro's source code.

#### `resetCache`

Type: `boolean`

If `true`, Metro will reset the transformer cache (see [`cacheStores`](#cachestores)) and the file map cache (see [`fileMapCacheDirectory`](#filemapcachedirectory)) on startup.

#### `stickyWorkers`

Type: `boolean`

If `true`, Metro will use a stable mapping from files to transformer workers, so the same file is always transformed by the same worker. This can improve initial build performance if the transformer is expensive to initialize, but can slow down concurrent builds with different configurations (e.g. multiple React Native apps connected to one Metro server). Defaults to `true`.

#### `maxWorkers`

Type: `number`

The number of workers to use for parallel processing in Metro. Defaults to roughly 75% of the cores available on the machine (as reported by [`os.availableParallelism()`](https://nodejs.org/api/os.html#osavailableparallelism)) for up to 8 cores, falling to 50% for 48 or more, e.g. 6 workers on 8 cores, 10 on 16 and 32 on 64.

:::note
1. If `maxWorkers` is set to 1 or lower, worker code will run in the main Metro process instead of concurrently.
2. Metro has two separate worker pools - one for transformation and one for building the file map. Each pool has its worker count set to `maxWorkers` independently.
:::

#### `fileMapCacheDirectory`

Type: `string`

The path to the `metro-file-map` cache directory, defaults to `os.tmpdir()`. Created on first write if it doesn't exist.

#### `hasteMapCacheDirectory` <div class="label deprecated">Deprecated</div>

Type: `string`

Alias of [`fileMapCacheDirectory`](#filemapcachedirectory)

#### `unstable_perfLoggerFactory`

Type: `PerfLoggerFactory`

A logger factory function that can be used to get insights about Metro performance timings and metadata for events including startup, bundling and HMR. Metro expects `unstable_perfLoggerFactory` to have the following signature:

```flow
function unstable_perfLoggerFactory(
  type: 'START_UP' | 'BUNDLING_REQUEST' | 'HMR',
  opts?: $ReadOnly<{
    key?: number
  }>,
): RootPerfLogger {
  // ...
};
```

* **`type`** Type of event being logged, e.g. `'START_UP'`, `'BUNDLING_REQUEST'`, `'HMR'`. See type definition of [PerfLoggerFactory](https://github.com/react/metro/blob/main/packages/metro-config/src/types.js) for a full list of event types.
* **`opts`**
  * **`key`**: An opaque identifier to distinguish between instances of an event type (e.g. multiple, possibly concurrent, HMR requests).

`unstable_perfLoggerFactory` should return an object implementing the [RootPerfLogger](https://github.com/react/metro/blob/main/packages/metro-config/src/types.js) interface. For example, a factory function returning a no-op RootPerfLogger could be implemented as follows:


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

The list of asset file extensions to include in the bundle. For example, including `'ttf'` allows Metro bundles to reference `.ttf` files. This is used primarily to enable React Native's [image asset support](https://reactnative.dev/docs/images). The default list includes many common image, video and audio file extensions. See [Metro's source code](https://github.com/react/metro/blob/main/packages/metro-config/src/defaults/defaults.js#L16) for the full list.

#### `assetResolutions`

Type: `Array<string>` (default: `['1', '1.5', '2', '3', '4']`)

The list of asset density suffixes Metro will look for when resolving an asset. For each entry, the default `resolveAsset` implementation tries `${assetName}@${resolution}x${extension}` alongside the unsuffixed file, so `icon.png` also matches `icon@2x.png` and `icon@3x.png`.

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

#### `schemeResolvers`

Type: `{[scheme: string]: `[`CustomResolver`](./Resolution.md#resolverequest-customresolver)`}`

An object of custom resolvers for import specifiers prefixed with a URI scheme, keyed by lowercase scheme name (the prefix before the first `:`, without the colon). When Metro's default resolution encounters a specifier whose scheme matches a registered key (for example `my-scheme:foo` matching `'my-scheme'`), the corresponding resolver is invoked with the full specifier.

```javascript
schemeResolvers: {
  'my-scheme': (context, specifier, platform) => {
    // `specifier` is the full 'my-scheme:...' string.
    // Resolve it to a file, or delegate back to the default resolver via
    // `context.resolveRequest(context, someOtherName, platform)`.
    return {
      type: 'sourceFile',
      filePath: '/absolute/path/to/file.js',
    };
  },
},
```

This differs from [`resolveRequest`](#resolverequest) in a few ways:

- Scheme resolvers run *within* Metro's default resolution rather than replacing it. A user [`resolveRequest`](#resolverequest) still takes precedence, and can delegate back into default resolution (via `context.resolveRequest`), at which point scheme resolvers apply.
- Only specifiers matching a registered scheme are dispatched. Relative (`./`, `../`) and subpath (`#…`) imports are resolved first and are never treated as schemes.
- The resolver receives a `context` whose [`resolveRequest`](./Resolution.md#resolverequest-customresolver) delegates to Metro's default resolution, for easy chaining.

The scheme parsed from a specifier is lowercased before lookup, so keys must be lowercase — both `Foo:` and `foo:` match the `'foo'` key. When multiple configs are combined with `mergeConfig`, `schemeResolvers` are merged per scheme, so a later config replaces an earlier resolver only when it reuses the same (lowercase) key.

:::note Backwards compatibility

`schemeResolvers` itself is not deprecated. However, when a specifier's scheme has *no* registered resolver, Metro currently falls back to its other resolution methods (Haste, `node_modules`, [`extraNodeModules`](#extranodemodules)) before failing, in case a project already uses scheme-like specifiers with those. This fallback is deprecated and will be removed in a later release, after which an unregistered scheme will fail immediately.

:::

Metro registers its own built-in scheme resolvers (currently `metro:`) when it builds a resolution context. Those are applied *beneath* this option, so an entry here overrides a built-in that uses the same scheme key.

Defaults to `{}`.

#### `useWatchman`

Type: `boolean`

If set to `false`, prevents Metro from using Watchman (even if it's installed).

#### `blockList`

Type: `RegExp` or `Array<RegExp>`

A regular expression (or list of regular expressions) defining which paths to exclude from Metro's file map. Files whose absolute paths match these patterns are effectively hidden from Metro and cannot be resolved or imported in the current project. Additionally, blocked files cannot be served via the `/assets/` endpoint.

Defaults to a pattern that hides `__tests__` directories. Setting `blockList` replaces this default.

#### `hasteImplModulePath`

Type: `?string`

The path to the Haste implementation for the current project. Haste is an opt-in mechanism for importing modules by their globally-unique name anywhere in the project, e.g. `import Foo from 'Foo'`.

Metro expects this module to have the following signature:

```flow
module.exports = {
  getHasteName(filePath: string): ?string {
    // ...
  },
  getCacheKey(): string {
    // ...
  },
};
```

`getHasteName` should return a short, globally unique name for the module whose path is `filePath`, or `null` if the module should not be accessible via Haste.

`getCacheKey` should return a string that changes whenever the output of `getHasteName` may change. It is used to invalidate the file map cache.

#### `dependencyExtractor`

Type: `?string`

The path to a module that extracts the dependencies of each file for the file map. These are stored as file map metadata and are not used for bundling.

Metro expects this module to have the following signature:

```flow
module.exports = {
  extract(
    content: string,
    absoluteFilePath: string,
    defaultExtractor: (content: string) => Set<string>,
  ): Set<string> {
    // ...
  },
  getCacheKey(): string {
    // ...
  },
};
```

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

Conditions may be any string value and are resolved in the order specified by each package. Node.js documents a number of [community conditions](https://nodejs.org/docs/latest-v18.x/api/packages.html#community-conditions-definitions) which are commonly used by package authors.

Metro always asserts `default`, plus `import` or `require` according to the syntax of each import - an `import` statement asserts `import`, a `require()` call asserts `require`. Neither needs to be listed here, and listing one would assert it for every import regardless of syntax.

Defaults to `[]`.

:::note

When using React Native, `unstable_conditionNames` defaults to `['react-native']`.

:::

#### `unstable_conditionsByPlatform` <div class="label experimental">Experimental</div>

Type: `{[platform: string]: Array<string>}`

:::note

This setting will take effect when [`unstable_enablePackageExports`](#unstable_enablepackageexports-experimental)  is `true` (the default). It may not behave as described while this feature is experimental.

:::

The set of additional [condition names](https://nodejs.org/docs/latest-v18.x/api/packages.html#conditional-exports) to dynamically assert by platform (see [`platforms`](#platforms)) when interpreting the [`"exports"` field](https://nodejs.org/docs/latest-v18.x/api/packages.html#exports) in package.json.

Matched conditions are merged with [`unstable_conditionNames`](#unstable_conditionnames-experimental) before resolution. Under React Native's defaults for both options, a `require()` call site asserts `new Set(['default', 'require', 'react-native', 'browser'])` when requesting a `web` bundle, and `new Set(['default', 'require', 'react-native'])` otherwise. Again, these are resolved in the order specified by each package.

Defaults to `{ web: ['browser'] }`.

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

#### `unstable_forceFullRefreshPatterns` <div class="label experimental">Experimental</div>

Type: `Array<RegExp>`

Modules that should trigger a full reload instead of a Fast Refresh update when they change, e.g. modules with side effects (such as style registration) that don't re-run correctly when hot reloaded. Patterns are tested against module paths relative to [`projectRoot`](#projectroot). Only applies to development bundles. Defaults to `[]`.

---

### Transformer Options

<!-- Keep old links to `asyncRequireModulePath` working -->
<a name="asyncrequiremodulepath"></a>

#### `asyncRequireModulePath` <div class="label deprecated">Deprecated</div>

Type: `string`

The name of a module that provides the `asyncRequire` function, which is used to implement [dynamic `import()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import) at runtime. Defaults to [`metro-runtime/src/modules/asyncRequire`](https://github.com/react/metro/blob/main/packages/metro-runtime/src/modules/asyncRequire.js).

:::note
The module named by `asyncRequireModulePath` is [resolved](./Resolution.md) relative to each module containing an `import()` call, including modules in `node_modules`, so it must be resolvable from all of them. In particular, assuming the default value of `asyncRequireModulePath` is in use, the project must have a compatible version of `metro-runtime` installed in `node_modules`. Use `metro:runtime/modules/asyncRequire` to resolve the same module from any importer, through Metro's built-in [`metro:` scheme resolver](#schemeresolvers), in the `metro-runtime` that Metro itself depends on.
:::

:::info
In older versions of Metro, a custom `asyncRequireModulePath` could be used as part of a bundle splitting solution. This usage is now deprecated in favor of the [`__loadBundleAsync`](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0605-lazy-bundling.md#__loadbundleasync-in-metro) API.
:::

#### `dynamicDepsInPackages`

Type: `'throwAtRuntime' | 'reject'`

Controls how Metro handles dependencies inside `node_modules` that cannot be statically analyzed at build time. For example, `require('./' + someFunction() + '.js')` cannot be resolved without knowing what `someFunction()` will return. Such dependencies outside `node_modules` are always rejected.

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
    hot: true,
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
    experimentalImportSupport?: boolean,
    inlineRequires?: {blockList: {[string]: true}} | boolean,
    nonInlinedRequires?: $ReadOnlyArray<string>,
  },
};
```

* **`preloadedModules`**: A plain object whose keys represent a set of absolute paths. When serializing an [indexed RAM bundle](https://reactnative.dev/docs/ram-bundles-inline-requires#enable-the-ram-format), the modules in this set will be marked for eager evaluation at runtime.
* **`ramGroups`**: An array of absolute paths. When serializing an [indexed RAM bundle](https://reactnative.dev/docs/ram-bundles-inline-requires#enable-the-ram-format), each of the listed modules will be serialized along with its transitive dependencies. At runtime, the modules will all be parsed together as soon as any one of them is evaluated.
* **`transform`**: Advanced options for the transformer.
  * **`experimentalImportSupport`**: Whether to transform ES module `import`/`export` statements with Metro's own import/export plugin.
  * **`inlineRequires`**:
    * If `inlineRequires` is a boolean, it controls whether [inline requires](https://reactnative.dev/docs/optimizing-javascript-loading#advanced-automatically-inline-require-calls) are enabled in this bundle.
    * If `inlineRequires` is an object, inline requires are enabled in all modules, except ones whose absolute paths appear as keys of `inlineRequires.blockList`.
  * **`nonInlinedRequires`**: An array of unresolved module specifiers (e.g. `react`, `react-native`) to never inline, even when inline requires are enabled. Defaults to `['React', 'react', 'react/jsx-dev-runtime', 'react/jsx-runtime', 'react-compiler-runtime', 'react-native']`.

#### `minifierPath`

Type: `string` (default: `'metro-minify-terser'`)

Path, or package name resolvable from `metro-transform-worker`, to the minifier that minifies the code after transformation.

#### `minifierConfig`

Type: `{[key: string]: mixed}`

Configuration object that will be passed to the minifier (it should be serializable).

#### `optimizationSizeLimit`

Type: `number`

Define a threshold (in bytes) to disable some expensive optimizations for big files.

#### `globalPrefix`

Type: `string`

A prefix for the global names used by Metro's module system, e.g. `${globalPrefix}__d`. Defaults to `''`.

#### `allowOptionalDependencies`

Type: `boolean | {exclude: Array<string>}`

Whether to treat dependencies that are required inside a `try` block (or dynamic `import()` calls with a rejection handler) as optional, so that failing to resolve them does not fail the build. If an object, specifiers listed in `exclude` are never treated as optional. Defaults to `true`.

#### `publicPath`

Type: `string`

The URL path prefix written into each asset's `httpServerLocation`, which the app uses to request the asset. Metro's own server only serves assets under `/assets`, so with a different value you need to route those requests yourself, e.g. with [`rewriteRequestUrl`](#rewriterequesturl). Defaults to `'/assets'`.

#### `unstable_allowRequireContext` <div class="label experimental">Experimental</div>

Type: `boolean`

Enables `require.context()`, which imports all the files in a directory that match a pattern. Defaults to `false`.

#### `unstable_workerThreads` <div class="label experimental">Experimental</div>

Type: `boolean`

Whether to run transformer workers as worker threads instead of child processes. Defaults to `false`.

#### React Native Only

#### `assetPlugins`

Type: `Array<string>`

List of modules to call to modify Asset data

#### `assetRegistryPath`

Type: `string`

The module (path or package name) that generated asset modules `require()` and call `registerAsset(descriptor)` on. React Native sets this to its `AssetRegistry`.

### Babel-specific transformer options

#### `babelTransformerPath`

Type: `string`

The name of a module that compiles code with Babel, returning an AST and optional metadata. Defaults to `metro-babel-transformer`.

Refer to the source code of [`metro-babel-transformer`](https://github.com/react/metro/blob/main/packages/metro-babel-transformer/src/index.js) and [`@react-native/metro-babel-transformer`](https://github.com/facebook/react-native/blob/main/packages/react-native-babel-transformer/src/index.js) for details on implementing a custom Babel transformer.

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

Whether the transformer should use the `@babel/plugin-transform-runtime` plugin. Defaults to `true`.

When `true`, Metro tells Babel presets that support it, through [caller data](https://babeljs.io/docs/options#caller), to import helpers from Metro's own `@babel/runtime` (`babelRuntimeModuleName: 'metro:babel-runtime'`) at its installed version (`enableBabelRuntime`). Helpers then come from a `@babel/runtime` that always exists at a known version, whether or not your project installs one.

<div class="label deprecated">Deprecated</div> If the value is a string, it is treated as a version of your project's own `@babel/runtime`, passed as `version` to `@babel/plugin-transform-runtime`, and helpers are imported from that copy. Use `true` instead.

:::note
This option only works under the default settings for React Native. It may have no effect in a project that uses custom [`transformerPath`](#transformerpath), a custom [`babelTransformerPath`](#babeltransformerpath) or a custom [Babel config file](https://babeljs.io/docs/en/config-files).
:::

#### `hermesParser`

Type: `boolean`

Whether to use the [`flow-parser`](https://www.npmjs.com/package/flow-parser) package to parse JavaScript source files, instead of Babel. Defaults to `false`.

:::note
This option only has an effect under the default [`transformerPath`](#transformerpath) and the [Babel transformers](#babeltransformerpath) built into Metro. Custom transformers and custom [Babel transformers](#babeltransformerpath) may ignore it.
:::

---
### Serializer Options

#### `getRunModuleStatement`

Type: `(moduleId: number | string, globalPrefix: string) => string`

Specify the format of the initial require statements that are appended at the end of the bundle. By default is `` `__r(${JSON.stringify(moduleId)});` ``.

#### `createModuleIdFactory`

Type: `() => (path: string) => number`

Used to generate the module id for `require` statements.

#### `getPolyfills`

Type: `({platform: ?string}) => $ReadOnlyArray<string>`

An optional list of polyfills to include in the bundle. Defaults to `[]`.

#### `getModulesRunBeforeMainModule`

Type: `(entryFilePath: string) => Array<string>`

An array of modules to be required before the entry point. It should contain the absolute path of each module. Note that this will add the additional require statements only if the passed modules are already included as part of the bundle.

#### `processModuleFilter`

Type: `(module: Module) => boolean`

A filter function to discard specific modules from the output.

#### `isThirdPartyModule`

Type: `(module: {path: string, ...}) => boolean`

A function that determines which modules are added to the [`x_google_ignoreList`](https://developer.chrome.com/articles/x-google-ignore-list/) field of the source map. This supports ["Just My Code"](https://developer.chrome.com/blog/devtools-modern-web-debugging/#just-my-code) debugging in Chrome DevTools and other compatible debuggers.

Defaults to returning `true` for modules with a path component named `node_modules`.

:::note
In addition to modules marked as ignored by `isThirdPartyModule`, Metro will also automatically add modules generated by the bundler itself to the ignore list.
:::

#### `polyfillModuleNames`

Type: `Array<string>`

Absolute paths of additional polyfills to include in the bundle, after those returned by [`getPolyfills`](#getpolyfills). Defaults to `[]`.

#### `customSerializer`

Type: `?(entryPoint: string, preModules: $ReadOnlyArray<Module>, graph: ReadOnlyGraph, options: SerializerOptions) => Promise<string | {code: string, map: string}>`

A function that replaces Metro's default bundle serializer. Defaults to `null`.

#### `experimentalSerializerHook`

Type: `(graph: ReadOnlyGraph, delta: DeltaResult) => mixed`

A function called with the dependency graph and the changes since the previous build, each time a graph is built or updated.

#### `unstable_lazilyDefineModules` <div class="label experimental">Experimental</div>

Type: `boolean`

Whether the default serializer defines each module lazily, on its first `require`, instead of running every `__d(...)` call at startup. This reduces startup cost and peak memory use for large bundles. Does not affect Fast Refresh updates. Defaults to `false`.

---
### Server Options

These options are used when Metro serves the content.

#### `port`

Type: `number`

Which port to listen on. Defaults to `8081`.

#### `unstable_serverRoot` <div class="label experimental">Experimental</div>

Type: `?string`

The directory that bundle URLs and entry files are resolved against, instead of [`projectRoot`](#projectroot). Defaults to `null` (use `projectRoot`).

#### `useGlobalHotkey`

Type: `boolean`

Has no effect.

#### `enhanceMiddleware` <div class="label deprecated">Deprecated</div>

Type: `(Middleware, MetroServer) => Middleware | connect.Server`

A function that allows attaching custom [`connect`](https://www.npmjs.com/package/connect) middleware to Metro. Use [`unstable_middleware`](#unstable_middleware-experimental) or [`unstable_priorityMiddleware`](#unstable_prioritymiddleware-experimental) instead, and [`unstable_onServerCreated`](#unstable_onservercreated-experimental) to access the Metro server instance.

For example:

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

#### `unstable_middleware` <div class="label experimental">Experimental</div>

Type: `Array<Middleware | [path: string, handler: Middleware]>`

Custom [`connect`](https://www.npmjs.com/package/connect) middleware list allowing integrators to extend Metro's dev server endpoints, mounted in array order. A `[path, handler]` entry mounts the handler with `connect` semantics: it matches the path as a prefix and strips it from `req.url`, keeping the full URL in `req.originalUrl`.

[`runServer`](./API.md#async-runserverconfig-options) also takes an `unstable_middleware` option, which runs after these handlers.

```js
server: {
  unstable_middleware: [
    ['/custom-endpoint', customEndpointMiddleware()],
    notFoundPage,
  ],
  unstable_priorityMiddleware: [corsMiddleware],
},
```

#### `unstable_priorityMiddleware` <div class="label experimental">Experimental</div>

Type: `Array<Middleware | [path: string, handler: Middleware]>`

Like [`unstable_middleware`](#unstable_middleware-experimental), but runs before Metro. These handlers see the URL before [`rewriteRequestUrl`](#rewriterequesturl) is applied.

Each priority middleware handler must call `next()` for every request it doesn't fully handle itself. Otherwise the request never reaches Metro, which builds and serves bundles, source maps and assets, symbolicates stack traces, and serves its other dev server endpoints.

[`runServer`](./API.md#async-runserverconfig-options) also takes an `unstable_priorityMiddleware` option, which runs before these handlers.

#### `unstable_onServerCreated` <div class="label experimental">Experimental</div>

Type: `(MetroServer) => void`

Called with Metro's server instance when [`runServer`](./API.md#async-runserverconfig-options) or [`createConnectMiddleware`](./API.md#createconnectmiddlewareconfig-options) creates it, after the bundler is ready when `waitForBundler` is set, and before `runServer` starts the HTTP server.

`runServer` also takes an `unstable_onServerCreated` option, which is called after this one.

#### `rewriteRequestUrl`

Type: `string => string`

A function that will be called every time Metro processes a "URL" (see note), after normalization of non-standard query-string delimiters using [`jsc-safe-url`](https://www.npmjs.com/package/jsc-safe-url). Metro will use the return value of this function as if it were the original URL provided by the client. This applies to all incoming HTTP requests that reach Metro (after [`unstable_priorityMiddleware`](#unstable_prioritymiddleware-experimental); [`unstable_middleware`](#unstable_middleware-experimental) handlers see the rewritten URL), as well as bundle URLs in `/symbolicate` request payloads and within the hot reloading protocol.

:::note

The input may be either an absolute URL (e.g. `https://example.com/foo/bar?baz=qux`) or a path (e.g. `/foo/bar?baz=qux`). The output should use the same form as the input - i.e. the returned value should be an absolute URL if and only if the input is an absolute URL.

:::

#### `forwardClientLogs`

Type: `boolean`

Enable forwarding of `client_log` events (when client logs are [configured](https://github.com/react/metro/blob/614ad14a85b22958129ee94e04376b096f03ccb1/packages/metro/src/lib/createWebsocketServer.js#L20)) to the reporter. Defaults to `true`.

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

Notice that when overriding the base config, object `tls` configs extend the base `tls` config, `false` overrides the base `tls` configs, and `null` and `undefined` are ignored.

When running Metro with `Metro.runServer` with the `secureServerOptions` property, Metro will likewise start an HTTPS server. `secureServerOptions` is merged over the `config.server.tls` object, so its values take precedence.

---

### Symbolicator Options

These options customize stack traces symbolicated through the `/symbolicate` endpoint.

#### `customizeFrame`

Type: `(frame: {file: ?string, lineNumber: ?number, column: ?number, methodName: ?string, ...}) => ?{collapse?: boolean} | Promise<?{collapse?: boolean}>`

Called for each symbolicated stack frame. The returned properties are merged into the frame; e.g. returning `{collapse: true}` collapses frames that are not relevant to users. Defaults to a no-op.

#### `customizeStack`

Type: `(stack: Array<StackFrame>, extraData: mixed) => Array<StackFrame> | Promise<Array<StackFrame>>`

Called with the whole symbolicated stack (after `customizeFrame`), and the `extraData` sent in the `/symbolicate` request. Returns the stack to respond with. Defaults to returning `stack` unchanged.

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

The first argument must be a configuration object, or a function returning one. Subsequent arguments may be any combination of (promises resolving to) configuration objects or functions. Functions are called with the merged config of all configs to the left, which may be useful for complex merges with the previous config.

If any arguments are promises or async functions, `mergeConfig` will return a `Promise`, otherwise it will return the merged config synchronously.

:::note

Merging is one level deep: within `resolver`, `transformer`, `serializer`, `server`, `symbolicator` and `watcher`, each option you set replaces the earlier value. Arrays, functions and nested objects (e.g. `resolver.extraNodeModules`) are not merged, except `resolver.schemeResolvers`, `server.tls`, `watcher.watchman` and `watcher.healthCheck`, which are merged key by key, and the middleware options described below.
This allows overriding and removing default config parameters such as `platforms` or `getModulesRunBeforeMainModule` that may not be required in your environment.

:::

`server.unstable_middleware` and `server.unstable_priorityMiddleware` are combined instead: later configs wrap earlier ones, so their `unstable_middleware` runs last and their `unstable_priorityMiddleware` runs first. An entry already in an earlier config, e.g. copied with a spread, is kept once.

#### Merging Example

```typescript
// metro.config.ts
import type {ConfigT} from 'metro-config';
import {mergeConfig} from 'metro-config';

export default (defaults: ConfigT) =>
  mergeConfig(
    defaults,
    // Function form: extends the default additionalExts
    config => ({
      watcher: {additionalExts: [...config.watcher.additionalExts, 'mts', 'cts']},
    }),
    // Plain object form
    {transformer: {minifierPath: 'metro-minify-terser'}},
    // Function form: additionalExts already includes 'mts' and 'cts' from above
    config => ({
      watcher: {additionalExts: [...config.watcher.additionalExts, 'css']},
    }),
  );
```
