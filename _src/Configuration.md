---
id: configuration
title: Configuring Metro
---

A Metro config controls how Metro finds, compiles and bundles your code, and how its development server behaves. Every option has a default, so you only set what you want to change.

In a React Native app, the config is `metro.config.js` in your project root, which merges your changes on top of React Native's defaults:

```js
// metro.config.js
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const config = {
  // Your options, e.g. resolver: {sourceExts: [...]}
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
```

Metro looks for a config in these files, in priority order:

1.  `metro.config.js` / `metro.config.cjs` / `metro.config.mjs` (CommonJS or ESM)
2.  `metro.config.json`
3.  `metro.config.ts` / `metro.config.cts` / `metro.config.mts` (TypeScript)
4.  `.config/metro.{js,cjs,mjs,json,ts,cts,mts}`
5.  The `metro` field in `package.json`

To use a different file, pass `--config <path/to/config>` to the CLI.

A config file exports a config object, or a function that receives Metro's default config and returns a config to merge with those defaults.

:::info TypeScript Config Support

Metro loads `.*ts` config files with Node.js native TypeScript support: _erasable_ TypeScript works out of the box on Node.js 22.18.0+ or 24.0.0+, and with the `--experimental-strip-types` flag on 22.6.0 to 22.17.x. See https://nodejs.org/learn/typescript/run-natively.

:::

:::note

`getDefaultConfig` from [`@react-native/metro-config`](https://github.com/facebook/react-native/blob/main/packages/metro-config/src/index.flow.js) changes some defaults on this page, as noted under the affected options. The React Native CLI (e.g. `npx react-native start`) makes further changes; see [`loadMetroConfig.js`](https://github.com/facebook/react-native/blob/main/packages/community-cli-plugin/src/utils/loadMetroConfig.js).

:::

## Configuration Structure

Most options are grouped by the part of Metro they configure:

- `resolver`: [Resolution](./Concepts.md#resolution).
- `transformer`: [Transformation](./Concepts.md#transformation).
- `serializer`: [Serialization](./Concepts.md#serialization).
- `server`, `symbolicator` and `watcher`: The development server and [file watching](./Concepts.md#file-watching).

General options sit at the top level:

```typescript
// metro.config.mts
import type {MetroConfig} from 'metro-config';

const config: MetroConfig = {
  /* general options */
  resolver: {/* resolver options */},
  transformer: {/* transformer options */},
  serializer: {/* serializer options */},
  server: {/* server options */},
  symbolicator: {/* symbolicator options */},
  watcher: {
    /* watcher options */
    watchman: {/* Watchman-specific options */},
  },
};

export default config;
```

To combine your config with defaults or other configs, see [Merging Configurations](#merging-configurations).

### General Options

Top-level options for caching, which files Metro can see, and parallelism.

#### `cacheStores`

Type: `CacheStores` (see details below)

Storage adapters for Metro's [transformer cache](./Caching.md): any mix of [built-in](./Caching.md#built-in-cache-stores) and [custom](./Caching.md#custom-cache-stores) stores. Defaults to a single on-disk store in a temporary directory.

Metro reads each store in order using a machine-independent cache key for the file, then writes the transform result to *all* stores that returned `null` (a cache miss) for that key.

```flow
type CacheStores =
  | Array<CacheStore<Buffer | JsonSerializable>>
  | ((MetroCache) => Array<CacheStore<Buffer | JsonSerializable>>);

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

An arbitrary string appended to all cache keys before hashing; changing it invalidates the whole [transformer cache](./Caching.md). Rarely needed, as Metro derives cache keys from your config and source file contents. Defaults to `'1.0'`.

#### `projectRoot`

Type: `string`

Your project's root folder. Directories of any files it depends on outside this root must be listed in [`watchFolders`](#watchfolders). See [Project root and watch folders](./Concepts.md#project-root-and-watch-folders).

In React Native, this is the directory passed to `getDefaultConfig` (usually `__dirname`, the directory containing `metro.config.js`).

:::note
In a monorepo with files from multiple packages, you'll generally want `projectRoot` at the repository root, or high enough that all relevant files are reachable without `watchFolders`.
:::

#### `watchFolders`

Type: `Array<string>`

Directories outside [`projectRoot`](#projectroot) that can contain source files for the project, e.g. other packages in a monorepo. Defaults to `[]`.

:::info

Despite its name, this isn't only about [file watching](./Concepts.md#file-watching): even in an offline build (e.g. CI), all files must be visible through `watchFolders` and `projectRoot`. Symlink targets *must also be within `watchFolders`* and not otherwise excluded.

In a workspace, such as a [Yarn workspace](https://classic.yarnpkg.com/lang/en/docs/workspaces/), you'll likely want to include the workspace *root* so Metro can resolve other workspaces and hoisted `node_modules`. For [linked packages](https://classic.yarnpkg.com/lang/en/docs/cli/link/), list their source locations (or a containing directory).

```js
// <workspace root>/apps/my-app/metro.config.js
const config = {
  watchFolders: [path.resolve(__dirname, '../..')],
};
```

:::

#### `transformerPath`

Type: `string`

Absolute path of a transformer module (or a package name resolvable from `metro`). Defaults to `'metro-transform-worker'`.

To customize compilation, you usually want [`babelTransformerPath`](#babeltransformerpath) instead. For the transformer interface, see [`metro-transform-worker`](https://github.com/react/metro/blob/main/packages/metro-transform-worker/src/index.js).

#### `reporter`

Type: `{update: (event: ReportableEvent) => void}`

Receives status events (e.g. bundling progress) while Metro runs. The default prints most events to the terminal. See the [definition of `ReportableEvent`](https://github.com/react/metro/blob/main/packages/metro/src/lib/reporting.js).

#### `resetCache`

Type: `boolean`

If `true`, Metro resets the transformer cache (see [`cacheStores`](#cachestores)) and the file map cache (see [`fileMapCacheDirectory`](#filemapcachedirectory)) on startup. Defaults to `false`.

Usually passed for a single run instead, e.g. `npx react-native start --reset-cache`.

#### `stickyWorkers`

Type: `boolean`

If `true`, Metro always transforms a given file in the same worker. This can speed up initial builds if the transformer is expensive to initialize, but can slow down concurrent builds with different configurations (e.g. multiple React Native apps connected to one Metro server). Defaults to `true`.

#### `maxWorkers`

Type: `number`

The number of parallel workers. Also settable with `--max-workers`. Defaults to roughly 75% of [`os.availableParallelism()`](https://nodejs.org/api/os.html#osavailableparallelism) for up to 8 cores, falling to 50% for 48 or more, e.g. 6 workers on 8 cores, 10 on 16 and 32 on 64.

:::note
1. If 1 or lower, worker code runs in the main Metro process instead of concurrently.
2. Metro's two worker pools (transformation and file map building) are each sized to `maxWorkers`.
:::

#### `fileMapCacheDirectory`

Type: `string`

Where Metro caches its file map (its index of the files in [`projectRoot`](#projectroot) and [`watchFolders`](#watchfolders)), which speeds up startup. Defaults to `os.tmpdir()`. Metro creates the directory on first write if it doesn't exist.

#### `hasteMapCacheDirectory` <div class="label deprecated">Deprecated</div>

Type: `string`

Alias of [`fileMapCacheDirectory`](#filemapcachedirectory).

#### `unstable_perfLoggerFactory`

Type: `PerfLoggerFactory`

A logger factory that reports Metro's performance timings and metadata for events including startup, bundling and HMR:

```flow
function unstable_perfLoggerFactory(
  type: 'START_UP' | 'BUNDLING_REQUEST' | 'HMR',
  opts?: $ReadOnly<{key?: number}>,
): RootPerfLogger {
  // ...
};
```

* **`type`**: The event type. See [PerfLoggerFactory](https://github.com/react/metro/blob/main/packages/metro-config/src/types.js) for the full list.
* **`opts.key`**: An opaque identifier distinguishing instances of an event type (e.g. multiple, possibly concurrent, HMR requests).

It returns a [RootPerfLogger](https://github.com/react/metro/blob/main/packages/metro-config/src/types.js). A no-op example:

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

Resolver options control [resolution](./Concepts.md#resolution): how Metro finds the file that an import such as `'./Button'` or `'react-native'` refers to. See [Module Resolution](./Resolution.md) for the full algorithm.

#### `assetExts`

Type: `Array<string>`

Asset file extensions to include in the bundle, e.g. `'ttf'` lets bundles reference `.ttf` files. Used primarily for React Native's [image asset support](https://reactnative.dev/docs/images). Defaults to many common image, video and audio extensions ([full list](https://github.com/react/metro/blob/main/packages/metro-config/src/defaults/defaults.js#L16)).

Setting this replaces the default list. To add an extension, spread the defaults:

```js
const defaultConfig = getDefaultConfig(__dirname);

const config = {
  resolver: {assetExts: [...defaultConfig.resolver.assetExts, 'lottie']},
};
```

#### `assetResolutions`

Type: `Array<string>`

Asset density suffixes. For each entry, the default `resolveAsset` tries `${assetName}@${resolution}x${extension}` alongside the unsuffixed file, so `icon.png` also matches `icon@2x.png` and `icon@3x.png`. Defaults to `['1', '1.5', '2', '3', '4']`.

#### `sourceExts`

Type: `Array<string>`

Source file extensions to include in the bundle, e.g. `'ts'` for `.ts` files, in the order files are matched on disk (see [Module Resolution](./Resolution.md)). Setting this replaces the default list (see [`assetExts`](#assetexts) to extend it). Defaults to `['js', 'jsx', 'json', 'ts', 'tsx']`.

#### `resolverMainFields`

Type: `Array<string>`

The `package.json` fields describing a package's entry points. The default `['browser', 'main']` uses `browser` if it exists and `main` otherwise. For example, if a package without an `"exports"` field has `"main": "lib/index.js"` and `"react-native": "src/index.js"`, it resolves to `lib/index.js` under Metro's default and `src/index.js` under React Native's (see below).

Metro's default resolver processes each field per the [`browser` field spec](https://github.com/defunctzombie/package-browser-field-spec), including [replacing](https://github.com/defunctzombie/package-browser-field-spec#replace-specific-files---advanced) and [ignoring](https://github.com/defunctzombie/package-browser-field-spec#ignore-a-module) specific files. See [Module Resolution](./Resolution.md).

:::note

When using React Native, `resolverMainFields` defaults to `['react-native', 'browser', 'main']`.

:::

#### `disableHierarchicalLookup`

Type: `boolean`

Whether to disable [looking up modules in `node_modules` folders](https://nodejs.org/api/modules.html#modules_loading_from_node_modules_folders) up the directory tree. Defaults to `false`.

For example, for `import 'lodash'` in `/app/src/App.js`, Metro tries `/app/src/node_modules/lodash`, `/app/node_modules/lodash` and `/node_modules/lodash`. With `true`, it skips these and only checks [`nodeModulesPaths`](#nodemodulespaths) and [`extraNodeModules`](#extranodemodules), which this option doesn't affect.

#### `emptyModulePath`

Type: `string`

The module used when Metro needs an empty module, e.g. when a package's `browser` field maps a file to `false`. Defaults to the empty module in `metro-runtime`. Only needs changing if Metro is installed outside your project.

#### `enableGlobalPackages`

Type: `boolean`

Whether to automatically resolve first-party packages (e.g. workspaces): any `package.json` with a valid `name` within `projectRoot` or `watchFolders`, outside `node_modules`. Defaults to `false`. For example, if `packages/ui/package.json` has `"name": "@acme/ui"`, `import Button from '@acme/ui/Button'` resolves into `packages/ui` without `@acme/ui` in `node_modules`.

#### `extraNodeModules`

Type: `{[string]: string}`

A mapping of package names to directories, consulted after the standard `node_modules` lookup and any [`nodeModulesPaths`](#nodemodulespaths). For example, with `{'shared-utils': path.resolve(__dirname, '../shared-utils')}`, if no `shared-utils` package is found in `node_modules`, `import 'shared-utils/format'` resolves to `../shared-utils/format`.

#### `nodeModulesPaths`

Type: `Array<string>`

Directories containing packages (like `node_modules`) to check after all `node_modules` directories, useful if third-party dependencies are installed outside the direct path of source files. For example, with `nodeModulesPaths: [path.resolve(__dirname, '../shared/node_modules')]`, `import 'lodash'` also checks `../shared/node_modules/lodash`.

#### `resolveRequest`

Type: [`?CustomResolver`](./Resolution.md#resolverequest-customresolver)

An optional function that overrides the default resolution algorithm, e.g. for aliases or custom protocols. See [Module Resolution](./Resolution.md).

```javascript
resolveRequest: (context, moduleName, platform) => {
  if (moduleName.startsWith('my-custom-resolver:')) {
    // Resolve to a file path, or throw if there is no resolution.
    return {filePath: 'path/to/file', type: 'sourceFile'};
  }
  // Optionally, chain to the standard Metro resolver.
  return context.resolveRequest(context, moduleName, platform);
}
```

#### `schemeResolvers`

Type: `{[scheme: string]: `[`CustomResolver`](./Resolution.md#resolverequest-customresolver)`}`

Custom resolvers for import specifiers that start with a URI scheme, such as `my-scheme:foo`. Keys are lowercase scheme names (the prefix before the first `:`, without the colon). Metro's default resolution calls the matching resolver with the full specifier. Defaults to `{}`.

```javascript
schemeResolvers: {
  'my-scheme': (context, specifier, platform) => {
    // `specifier` is the full 'my-scheme:...' string.
    return {type: 'sourceFile', filePath: '/absolute/path/to/file.js'};
  },
},
```

Differences from [`resolveRequest`](#resolverequest):

- They run *within* Metro's default resolution instead of replacing it. A user `resolveRequest` takes precedence; scheme resolvers apply once it delegates back via `context.resolveRequest`.
- Only specifiers with a registered scheme are dispatched. Relative (`./`, `../`) and subpath (`#…`) imports are resolved first and never treated as schemes.
- The resolver's [`context.resolveRequest`](./Resolution.md#resolverequest-customresolver) delegates to Metro's default resolution, for easy chaining.

Schemes are lowercased before lookup, so keys must be lowercase; `Foo:` and `foo:` both match `'foo'`. `mergeConfig` merges `schemeResolvers` per scheme: a later config replaces an earlier resolver only for the same key. Metro's built-in scheme resolvers (currently `metro:`), registered when it builds a resolution context, apply *beneath* this option, so an entry here overrides a built-in with the same key.

:::note Backwards compatibility

`schemeResolvers` itself is not deprecated. But when a specifier's scheme has *no* registered resolver, Metro currently falls back to its other resolution methods (Haste, `node_modules`, [`extraNodeModules`](#extranodemodules)) before failing, in case a project already uses scheme-like specifiers with those. This fallback is deprecated; once removed, unregistered schemes will fail immediately.

:::

#### `useWatchman`

Type: `boolean`

If `false`, Metro doesn't use [Watchman](https://facebook.github.io/watchman/) (even if installed) to crawl and [watch](./Concepts.md#file-watching) files. Defaults to `true`.

#### `blockList`

Type: `RegExp` or `Array<RegExp>`

Paths to exclude from Metro's file map. Files whose absolute paths match are hidden from Metro: they can't be resolved, imported, or served via the `/assets/` endpoint. Defaults to a pattern that hides `__tests__` directories; setting `blockList` replaces it.

Use this to hide directories Metro would otherwise crawl and [watch](./Concepts.md#file-watching) that aren't part of your app, e.g. native build output:

```js
resolver: {
  // Hides e.g. <projectRoot>/android/app/build/... and <projectRoot>/ios/Pods/...
  // Keep the default by also listing /\/__tests__\/.*/ if needed.
  blockList: [/\/android\/app\/build\//, /\/ios\/Pods\//],
},
```

#### `hasteImplModulePath`

Type: `?string`

Path to the project's [Haste](./Concepts.md#haste) implementation. Most React Native apps don't need this. Expected signature:

```flow
module.exports = {
  getHasteName(filePath: string): ?string { /* ... */ },
  getCacheKey(): string { /* ... */ },
};
```

`getHasteName` returns a short, globally unique name for the module at `filePath`, or `null` if it shouldn't be accessible via Haste. `getCacheKey` returns a string that changes whenever `getHasteName`'s output may change, to invalidate the file map cache.

#### `dependencyExtractor`

Type: `?string`

Path to a module that extracts each file's dependencies for the file map. They're stored as file map metadata, not used for bundling. Expected signature:

```flow
module.exports = {
  extract(
    content: string,
    absoluteFilePath: string,
    defaultExtractor: (content: string) => Set<string>,
  ): Set<string> { /* ... */ },
  getCacheKey(): string { /* ... */ },
};
```

#### `platforms`

Type: `Array<string>`

The [platforms](./Concepts.md#platform) Metro recognizes, e.g. the `ios` in `Button.ios.js`. Defaults to `['ios', 'android', 'windows', 'web']`. See also [React Native's platform-specific extensions](https://reactnative.dev/docs/platform-specific-code#platform-specific-extensions).

:::note

When using React Native, `getDefaultConfig` sets `platforms` to `['android', 'ios']`. The React Native CLI then replaces this with the platforms it knows about (including any out-of-tree platforms) plus `native`.

:::

#### `requireCycleIgnorePatterns`

Type: `Array<RegExp>`

In development, suppresses require cycle warnings for cycles involving a module matching any of these patterns, e.g. third-party code or expected first-party cycles. Patterns are tested against module paths relative to [`projectRoot`](#projectroot), e.g. `src/models/User.js`.

Defaults to `[/(^|\/|\\)node_modules($|\/|\\)/]`. Setting this replaces (rather than adds to) the default. To also silence cycles within `src/models`:

```js
resolver: {
  requireCycleIgnorePatterns: [
    ...defaultConfig.resolver.requireCycleIgnorePatterns,
    /^src\/models\//,
  ],
},
```

#### `unstable_conditionNames` <div class="label experimental">Experimental</div>

Type: `Array<string>`

The [condition names](https://nodejs.org/docs/latest-v18.x/api/packages.html#conditional-exports) to assert globally when interpreting the [`"exports"` field](https://nodejs.org/docs/latest-v18.x/api/packages.html#exports) in package.json. Takes effect when [`unstable_enablePackageExports`](#unstable_enablepackageexports-experimental) is `true` (the default); may not behave as described while experimental. Defaults to `[]`.

Conditions may be any string and are resolved in the order specified by each package. See Node.js's [community conditions](https://nodejs.org/docs/latest-v18.x/api/packages.html#community-conditions-definitions).

Metro always asserts `default`, plus `import` or `require` according to each import's syntax (`import` statement or `require()` call). Don't list these: listing one asserts it for every import regardless of syntax.

:::note

When using React Native, `unstable_conditionNames` defaults to `['react-native']`.

:::

#### `unstable_conditionsByPlatform` <div class="label experimental">Experimental</div>

Type: `{[platform: string]: Array<string>}`

Additional [condition names](https://nodejs.org/docs/latest-v18.x/api/packages.html#conditional-exports) to assert per [platform](#platforms) when interpreting the [`"exports"` field](https://nodejs.org/docs/latest-v18.x/api/packages.html#exports) in package.json. Takes effect when [`unstable_enablePackageExports`](#unstable_enablepackageexports-experimental) is `true` (the default); may not behave as described while experimental. Defaults to `{ web: ['browser'] }`.

Matched conditions are merged with [`unstable_conditionNames`](#unstable_conditionnames-experimental) and resolved in the order specified by each package. Under React Native's defaults for both options, a `require()` call asserts `new Set(['default', 'require', 'react-native', 'browser'])` for a `web` bundle, and `new Set(['default', 'require', 'react-native'])` otherwise.

#### `unstable_enablePackageExports` <div class="label experimental">Experimental</div>

Type: `boolean`

Enables [Package Exports](https://nodejs.org/docs/latest-v18.x/api/packages.html#package-entry-points) support: Metro resolves package entry points using the [`"exports"` field](https://nodejs.org/docs/latest-v18.x/api/packages.html#exports) in `package.json` when present. See [Package Exports Support](./PackageExports.md). Defaults to `true` since Metro 0.82.0. This option will be removed in a future release.

When `"exports"` has no match, Metro logs a warning and resolves without it. This is largely backwards-compatible, except:

- If a module is matched in `"exports"`, [`sourceExts`](#sourceexts) and [`platforms`](#platforms) are not considered (no platform-specific extensions), for compatibility with Node.
- If a module exists at a file path that `"exports"` maps to a different file, the `"exports"` entry is preferred.

#### `unstable_forceFullRefreshPatterns` <div class="label experimental">Experimental</div>

Type: `Array<RegExp>`

Modules that trigger a full reload instead of a Fast Refresh update when changed, e.g. modules with side effects (such as style registration) that don't re-run correctly when hot reloaded. Patterns are tested against paths relative to [`projectRoot`](#projectroot), e.g. `[/\.css$/]`. Development bundles only. Defaults to `[]`.

---

### Transformer Options

Transformer options control [transformation](./Concepts.md#transformation): how each module is compiled (by default, with Babel) and minified, and how assets are handled.

<!-- Keep old links to `asyncRequireModulePath` working -->
<a name="asyncrequiremodulepath"></a>

#### `asyncRequireModulePath` <div class="label deprecated">Deprecated</div>

Type: `string`

The module providing the `asyncRequire` function, which implements [dynamic `import()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import) at runtime. Defaults to [`metro-runtime/src/modules/asyncRequire`](https://github.com/react/metro/blob/main/packages/metro-runtime/src/modules/asyncRequire.js).

Using a custom value for bundle splitting, as in older Metro versions, is deprecated in favor of the [`__loadBundleAsync`](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0605-lazy-bundling.md#__loadbundleasync-in-metro) API.

:::note
The module is [resolved](./Resolution.md) relative to each module containing an `import()` call, including modules in `node_modules`, so it must be resolvable from all of them. With the default value, a compatible `metro-runtime` must be installed in the project's `node_modules`. Use `metro:runtime/modules/asyncRequire` to resolve, from any importer, the `metro-runtime` Metro itself depends on, through Metro's built-in [`metro:` scheme resolver](#schemeresolvers).
:::

#### `dynamicDepsInPackages`

Type: `'throwAtRuntime' | 'reject'`

How Metro handles dependencies inside `node_modules` that can't be statically analyzed, e.g. `require('./' + someFunction() + '.js')`. Such dependencies outside `node_modules` are always rejected.

* **`'throwAtRuntime'`** (the default): Metro keeps bundling, but the `require` call throws at runtime.
* **`'reject'`**: Metro stops bundling and reports an error.

#### `getTransformOptions`

Type: Function (see details below)

Calculates additional transformer and serializer options for each bundle being built, most commonly to turn [inline requires](https://reactnative.dev/docs/optimizing-javascript-loading#advanced-automatically-inline-require-calls) on or off.

:::note

When using React Native, `getTransformOptions` enables `inlineRequires` by default.

:::

```flow
function getTransformOptions(
  entryPoints: $ReadOnlyArray<string>,
  options: {dev: boolean, hot: true, platform: ?string},
  getDependenciesOf: (path: string) => Promise<Array<string>>,
): Promise<ExtraTransformOptions> {
  // ...
}
```

* **`entryPoints`**: Absolute paths to the bundle's [entry points](./Concepts.md#entry-point) (typically just one).
* **`options`**:
  * **`dev`**: Whether the bundle is built in development mode.
  * **`hot`**: <div class="label deprecated">Deprecated</div> Always true.
  * **`platform`**: The target platform (e.g. `ios`, `android`).
* **`getDependenciesOf`**: Given a module's absolute path, resolves to the absolute paths of its transitive dependencies.

It returns a promise resolving to:

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

* **`preloadedModules`**: A plain object whose keys are absolute paths of modules to mark for eager evaluation at runtime when serializing an [indexed RAM bundle](https://reactnative.dev/docs/ram-bundles-inline-requires#enable-the-ram-format).
* **`ramGroups`**: Absolute paths. In an indexed RAM bundle, each listed module is serialized with its transitive dependencies, which are all parsed together at runtime as soon as any one of them is evaluated.
* **`transform`**: Advanced transformer options.
  * **`experimentalImportSupport`**: Whether to transform ES module `import`/`export` statements with Metro's own import/export plugin.
  * **`inlineRequires`**: A boolean enables or disables inline requires in this bundle. An object enables them in all modules except those whose absolute paths are keys of `inlineRequires.blockList`. Inline requires replace a top-level `require` assigned to a variable with the `require` call at each use, e.g. `const Foo = require('foo'); f(Foo);` becomes `f(require('foo'));`. This also applies to a property access (`const Bar = require('foo').bar`) and to destructuring (`const {Baz, qux: Qux} = require('foo')`), but not to destructuring with defaults, rest elements, nesting or computed keys.
  * **`nonInlinedRequires`**: Unresolved module specifiers (e.g. `react`, `react-native`) to never inline, even when inline requires are enabled. Defaults to `['React', 'react', 'react/jsx-dev-runtime', 'react/jsx-runtime', 'react-compiler-runtime', 'react-native']`.

#### `minifierPath`

Type: `string`

Path, or package name resolvable from `metro-transform-worker`, of the minifier applied after transformation. Defaults to `'metro-minify-terser'`.

#### `minifierConfig`

Type: `{[key: string]: mixed}`

Configuration passed to the minifier. Must be serializable.

#### `optimizationSizeLimit`

Type: `number`

A file size threshold (in bytes) above which some expensive optimizations are skipped. Defaults to `153600` (150 KiB).

#### `globalPrefix`

Type: `string`

A prefix for the global names used by Metro's module system, e.g. with `'app1'`, each module is wrapped in `app1__d(...)` instead of `__d(...)`. Defaults to `''`.

#### `allowOptionalDependencies`

Type: `boolean | {exclude: Array<string>}`

Whether dependencies required inside a `try` block (or dynamic `import()` calls with a rejection handler) are optional, so failing to resolve them doesn't fail the build. If an object, specifiers in `exclude` are never optional. Defaults to `true`.

For example, `try { Haptics = require('react-native-haptic-feedback'); } catch {}` builds even if the package isn't installed; the `require` throws at runtime and the `catch` handles it.

#### `publicPath`

Type: `string`

The URL path prefix written into each asset's `httpServerLocation`, which the app requests the asset from, e.g. `/assets/src/images` for `src/images/logo.png`. Metro's server only serves assets under `/assets`, so other values need their own routing, e.g. with [`rewriteRequestUrl`](#rewriterequesturl). Defaults to `'/assets'`.

#### `unstable_allowRequireContext` <div class="label experimental">Experimental</div>

Type: `boolean`

Enables `require.context()`, which imports all the files in a directory that match a pattern. Defaults to `false`.

#### `unstable_workerThreads` <div class="label experimental">Experimental</div>

Type: `boolean`

Whether to run transformer workers as worker threads instead of child processes. Defaults to `false`.

#### React Native Only

#### `assetPlugins`

Type: `Array<string>`

Modules (paths or package names) that modify asset data. Each exports a function that takes the asset data and returns the modified data (or a promise of it). Plugins run in array order. Defaults to `[]`.

#### `assetRegistryPath`

Type: `string`

The module (path or package name) that generated asset modules `require()` and call `registerAsset(descriptor)` on. React Native sets this to its `AssetRegistry`.

### Babel-specific transformer options

These options configure the Babel-based compilation done by Metro's default transformer. They only have an effect under the default [`transformerPath`](#transformerpath); custom transformers may ignore them.

#### `babelTransformerPath`

Type: `string`

A module that compiles code with Babel, returning an AST and optional metadata. Defaults to `metro-babel-transformer`. To implement a custom one, see the source of [`metro-babel-transformer`](https://github.com/react/metro/blob/main/packages/metro-babel-transformer/src/index.js) and [`@react-native/metro-babel-transformer`](https://github.com/facebook/react-native/blob/main/packages/react-native-babel-transformer/src/index.js).

:::note
When using React Native, `babelTransformerPath` defaults to `@react-native/metro-babel-transformer`.
:::

#### `enableBabelRCLookup`

Type: `boolean`

Whether to search for Babel config files; passed to Babel as [`babelrc`](https://babeljs.io/docs/en/options#babelrc). Custom [Babel transformers](#babeltransformerpath) should respect it. Defaults to `true`.

#### `enableBabelRuntime`

Type: `boolean | string`

Whether the transformer uses `@babel/plugin-transform-runtime`. Defaults to `true`.

When `true`, Metro tells Babel presets that support it, through [caller data](https://babeljs.io/docs/options#caller), to import helpers from Metro's own `@babel/runtime` (`babelRuntimeModuleName: 'metro:babel-runtime'`) at its installed version (`enableBabelRuntime`). Helpers then come from a `@babel/runtime` that always exists at a known version, whether or not your project installs one.

<div class="label deprecated">Deprecated</div> A string is treated as a version of your project's own `@babel/runtime`, passed to the plugin as its `version`, and helpers are imported from that copy. Use `true` instead.

:::note
Only works under React Native's default settings. May have no effect with a custom [`transformerPath`](#transformerpath), [`babelTransformerPath`](#babeltransformerpath) or [Babel config file](https://babeljs.io/docs/en/config-files).
:::

#### `hermesParser`

Type: `boolean`

Whether to parse JavaScript with [`flow-parser`](https://www.npmjs.com/package/flow-parser) instead of Babel. Only has an effect with the [Babel transformers](#babeltransformerpath) built into Metro; custom ones may ignore it. Defaults to `false`.

---
### Serializer Options

Serializer options control [serialization](./Concepts.md#serialization): how transformed modules are combined into the final bundle, and what runs before your app code.

#### `getRunModuleStatement`

Type: `(moduleId: number | string, globalPrefix: string) => string`

Formats the require statements appended to the end of the bundle: one for each module from [`getModulesRunBeforeMainModule`](#getmodulesrunbeforemainmodule) that is in the bundle, then one for the [entry point](./Concepts.md#entry-point). Defaults to `` `__r(${JSON.stringify(moduleId)});` ``, e.g. `__r(42);` for module ID `42`.

#### `createModuleIdFactory`

Type: `() => (path: string) => number`

Returns a function mapping a [module](./Concepts.md#module)'s absolute path to the ID used in `require` statements. By default, IDs are sequential numbers in the order modules are first seen.

#### `getPolyfills`

Type: `({platform: ?string}) => $ReadOnlyArray<string>`

An optional list of polyfills to include in the bundle. Defaults to `[]`.

:::note
When using React Native, `getPolyfills` returns the polyfills from `@react-native/js-polyfills`.
:::

#### `getModulesRunBeforeMainModule`

Type: `(entryFilePath: string) => Array<string>`

Absolute paths of modules to require before the [entry point](./Concepts.md#entry-point), if they're already in the bundle. Receives the entry point's path relative to [`projectRoot`](#projectroot), e.g. `index.js`. React Native's default returns `[require.resolve('react-native/setup-env')]`, so its environment setup runs before your entry point.

#### `processModuleFilter`

Type: `(module: Module) => boolean`

Discards modules for which it returns `false` from the output. Defaults to keeping all modules. For example, `module => !module.path.includes('/fixtures/')` leaves modules under any `fixtures` directory out of the bundle. Requiring a discarded module at runtime throws.

#### `isThirdPartyModule`

Type: `(module: {path: string, ...}) => boolean`

Determines which modules go in the source map's [`x_google_ignoreList`](https://developer.chrome.com/articles/x-google-ignore-list/), for ["Just My Code"](https://developer.chrome.com/blog/devtools-modern-web-debugging/#just-my-code) debugging in Chrome DevTools and compatible debuggers. Metro also adds bundler-generated modules to the list.

Defaults to `true` for modules with a `node_modules` path component. React Native's default also returns `true` for its own internal modules.

#### `polyfillModuleNames`

Type: `Array<string>`

Absolute paths of additional polyfills to include in the bundle, after those returned by [`getPolyfills`](#getpolyfills). Defaults to `[]`.

#### `customSerializer`

Type: `?(entryPoint: string, preModules: $ReadOnlyArray<Module>, graph: ReadOnlyGraph, options: SerializerOptions) => Promise<string | {code: string, map: string}>`

Replaces Metro's default bundle serializer. Defaults to `null`.

#### `experimentalSerializerHook`

Type: `(graph: ReadOnlyGraph, delta: DeltaResult) => mixed`

Called with the [dependency graph](./Concepts.md#dependency-graph) and the changes since the previous build, each time a graph is built or updated.

#### `unstable_lazilyDefineModules` <div class="label experimental">Experimental</div>

Type: `boolean`

Whether the default serializer defines each module lazily, on its first `require`, instead of running every `__d(...)` call at startup, reducing startup cost and peak memory for large bundles. Does not affect Fast Refresh updates. Defaults to `false`.

---
### Server Options

Options for Metro's development server, which your app downloads its bundle from during development.

#### `port`

Type: `number`

The port to listen on. Defaults to `8081`.

:::note
When using React Native, you can also set the `RCT_METRO_PORT` environment variable, or pass `--port` to `npx react-native start`.
:::

#### `unstable_serverRoot` <div class="label experimental">Experimental</div>

Type: `?string`

The directory that bundle URLs and entry files are resolved against, instead of [`projectRoot`](#projectroot). For example, with `unstable_serverRoot: '/monorepo'`, the URL `/apps/mobile/index.bundle` builds `/monorepo/apps/mobile/index.js`. Defaults to `null` (use `projectRoot`).

#### `useGlobalHotkey`

Type: `boolean`

Has no effect.

#### `enhanceMiddleware` <div class="label deprecated">Deprecated</div>

Type: `(Middleware, MetroServer) => Middleware | connect.Server`

Attaches custom [`connect`](https://www.npmjs.com/package/connect) middleware to Metro. Use [`unstable_middleware`](#unstable_middleware-experimental) or [`unstable_priorityMiddleware`](#unstable_prioritymiddleware-experimental) instead, and [`unstable_onServerCreated`](#unstable_onservercreated-experimental) to access the Metro server instance. For example, using [`connect()`](https://www.npmjs.com/package/connect#mount-middleware) to extend `metroMiddleware` and mount additional handlers:

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

Custom [`connect`](https://www.npmjs.com/package/connect) middleware for adding endpoints to Metro's dev server, mounted in array order. A `[path, handler]` entry uses `connect` semantics: it matches the path as a prefix and strips it from `req.url`, keeping the full URL in `req.originalUrl`.

[`runServer`](./API.md#async-runserverconfig-options) also takes an `unstable_middleware` option, which runs after these handlers.

```js
server: {
  unstable_middleware: [['/custom-endpoint', customEndpointMiddleware()], notFoundPage],
  unstable_priorityMiddleware: [corsMiddleware],
},
```

#### `unstable_priorityMiddleware` <div class="label experimental">Experimental</div>

Type: `Array<Middleware | [path: string, handler: Middleware]>`

Like [`unstable_middleware`](#unstable_middleware-experimental), but runs before Metro, seeing the URL before [`rewriteRequestUrl`](#rewriterequesturl). Each handler must call `next()` for every request it doesn't fully handle, or the request never reaches Metro, which builds and serves bundles, source maps and assets, symbolicates stack traces, and serves its other dev server endpoints.

[`runServer`](./API.md#async-runserverconfig-options) also takes an `unstable_priorityMiddleware` option, which runs before these handlers.

#### `unstable_onServerCreated` <div class="label experimental">Experimental</div>

Type: `(MetroServer) => void`

Called with Metro's server instance when [`runServer`](./API.md#async-runserverconfig-options) or [`createConnectMiddleware`](./API.md#createconnectmiddlewareconfig-options) creates it, after the bundler is ready when `waitForBundler` is set, and before `runServer` starts the HTTP server. `runServer`'s own `unstable_onServerCreated` option is called after this one.

#### `rewriteRequestUrl`

Type: `string => string`

Called every time Metro processes a "URL" (see note), after normalizing non-standard query-string delimiters with [`jsc-safe-url`](https://www.npmjs.com/package/jsc-safe-url). Metro treats the return value as the client's original URL.

For example, `url => url.replace('/index.bundle', '/src/main.bundle')` makes a request for `/index.bundle?platform=ios` build the bundle for `src/main.js` instead of `index.js`.

This applies to:

- All incoming HTTP requests that reach Metro (after [`unstable_priorityMiddleware`](#unstable_prioritymiddleware-experimental); [`unstable_middleware`](#unstable_middleware-experimental) handlers see the rewritten URL).
- Bundle URLs in `/symbolicate` request payloads.
- Bundle URLs within the hot reloading protocol.

:::note

The input may be an absolute URL (e.g. `https://example.com/foo/bar?baz=qux`) or a path (e.g. `/foo/bar?baz=qux`). Return the same form: an absolute URL if and only if the input is one.

:::

#### `forwardClientLogs`

Type: `boolean`

Forwards `client_log` events (when client logs are [configured](https://github.com/react/metro/blob/614ad14a85b22958129ee94e04376b096f03ccb1/packages/metro/src/lib/createWebsocketServer.js#L20)) to the [reporter](#reporter). Defaults to `true`.

#### `tls`

Type: `false | object`

If `false` or not provided, Metro starts an HTTP server with WS WebSocket endpoints. If an object, it starts an HTTPS server with WSS endpoints using these TLS options:

```ts
ca?: string | Buffer,      // Certificate authority (contents, not path)
cert?: string | Buffer,    // Server certificate (contents, not path)
key?: string | Buffer,     // Private key (contents, not path)
requestCert?: boolean,     // Whether to authenticate the remote peer by requesting a certificate
```

When merging configs, an object `tls` extends the base `tls` config, `false` overrides it, and `null` and `undefined` are ignored.

`Metro.runServer`'s `secureServerOptions` also starts an HTTPS server; it is merged with `config.server.tls` and takes precedence.

---

### Symbolicator Options

Symbolication maps bundle stack frames back to original source files and lines. These options customize stack traces symbolicated by Metro's `/symbolicate` endpoint, which React Native uses to display JavaScript errors in development.

#### `customizeFrame`

Type: `(frame: {file: ?string, lineNumber: ?number, column: ?number, methodName: ?string, ...}) => ?{collapse?: boolean} | Promise<?{collapse?: boolean}>`

Called for each symbolicated stack frame. The returned properties are merged into the frame, e.g. `{collapse: true}` collapses frames irrelevant to users. Defaults to a no-op.

:::note
When using React Native, `customizeFrame` collapses frames from React Native's own internal modules.
:::

#### `customizeStack`

Type: `(stack: Array<StackFrame>, extraData: mixed) => Array<StackFrame> | Promise<Array<StackFrame>>`

Called with the whole symbolicated stack (after `customizeFrame`) and the `extraData` sent in the `/symbolicate` request. Returns the stack to respond with. Defaults to returning `stack` unchanged.

---

### Watcher Options

Options for the [filesystem watcher](./Concepts.md#file-watching), which tracks changes to files in [`projectRoot`](#projectroot) and [`watchFolders`](#watchfolders).

:::note

Dot notation in this section indicates a nested configuration object, e.g. `watchman.deferStates` → `watchman: { deferStates: ... }`.

:::

#### `additionalExts`

Type: `Array<string>`

Extensions to [watch](./Concepts.md#file-watching) in addition to [`sourceExts`](#sourceexts), but which the resolver doesn't try automatically. Unlike `sourceExts`, modules with these extensions:

- Can only be imported when the extension is specified (e.g. `import moduleA from 'moduleA.mjs'`).
- Do not get platform-specific resolution.

Defaults to `['cjs', 'mjs']`.

#### `healthCheck.enabled`

Type: `boolean`

Whether to periodically check the [filesystem watcher](./Concepts.md#file-watching)'s health by writing a temporary file to the project and waiting for it to be observed. Defaults to `false`.

#### `healthCheck.filePrefix`

Type: `string`

The name of the temporary file that health checks write into the project. Defaults to `'.metro-health-check'`.

:::note
If you enable health checks, add `.metro-health-check*` to your `.gitignore`.
:::

#### `healthCheck.interval`

Type: `number`

How often health checks run, in milliseconds. Defaults to `30000`.

#### `healthCheck.timeout`

Type: `number`

How long (in milliseconds) Metro waits for the change to be observed before failing a health check. Defaults to `5000`.

#### `watchman.deferStates`

Type: `Array<string>`

With Watchman, Metro [defers processing filesystem updates](https://facebook.github.io/watchman/docs/cmd/subscribe.html#defer) while these [states](https://facebook.github.io/watchman/docs/cmd/state-enter.html) are asserted in the watch, to debounce builds while the filesystem hasn't settled, e.g. during large source control operations. Defaults to `['hg.update']`.

## Merging Configurations

`mergeConfig(...configs): MergedConfig` merges two or more config objects or functions, e.g. your own options and a set of defaults. It is exported by `metro-config` and re-exported by `@react-native/metro-config`.

The first argument must be a config object, or a function returning one. Later arguments may be any combination of (promises resolving to) config objects or functions. Functions are called with the merged config of all configs to their left, useful when a value depends on the previous config. If any argument is a promise or async function, `mergeConfig` returns a `Promise`; otherwise it returns the merged config synchronously.

:::note

Merging is one level deep: within `resolver`, `transformer`, `serializer`, `server`, `symbolicator` and `watcher`, each option you set replaces the earlier value. Arrays, functions and nested objects (e.g. `resolver.extraNodeModules`) are not merged, except:

- `resolver.schemeResolvers`, `server.tls`, `watcher.watchman` and `watcher.healthCheck`: Merged key by key.
- `server.unstable_middleware` and `server.unstable_priorityMiddleware`: Combined as described below.

This lets you override and remove defaults such as `platforms` or `getModulesRunBeforeMainModule` that your environment may not need. For example, merging `{resolver: {platforms: ['ios']}}` onto React Native's defaults sets `platforms` to `['ios']`, while other `resolver` options such as `sourceExts` keep their defaults.

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
