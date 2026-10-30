---
id: resolution
title: Module Resolution
---

[Module resolution](./Concepts.md#resolution) is how Metro turns the module name in an `import` or `require()` into a file on disk, at build time. For example, in an iOS bundle:

```js
// src/App.js
import {View} from 'react-native'; // → typically node_modules/react-native/index.js
import Button from './Button';     // → e.g. src/Button.ios.js
```

In short:

* **Relative paths** (`'./Button'`, `'../utils'`) are resolved against the importing file's directory. If no file exists at that exact path, Metro tries [platform](./Concepts.md#platform)-specific and extension variants in order: `Button.ios.js`, `Button.native.js`, `Button.js`, then `.jsx` variants, and so on through [`sourceExts`](#sourceexts-readonlyarraystring). Extensions take priority over platforms: with the default `sourceExts`, `Button.js` wins over `Button.ios.ts`.
* **Package names** (`'react-native'`, `'lodash/merge'`) are looked up in `node_modules` directories, from the importing file's directory up to the root. Metro uses the package's [`"exports"`](./PackageExports.md) field if present; otherwise it resolves the subpath as a file, finding the entry point via [main fields](#mainfields-readonlyarraystring) (in React Native: `"react-native"`, `"browser"`, then `"main"`).
* **Other specifiers**, such as [subpath imports](https://nodejs.org/api/packages.html#subpath-imports) (`'#foo'`), [Haste](./Concepts.md#haste) names and URL schemes, are covered in the [algorithm](#resolve).

This is a version of [Node's module resolution algorithm](https://nodejs.org/api/modules.html#loading-from-node_modules-folders). Metro adds [Haste](./Concepts.md#haste) (importing modules by a globally unique name, e.g. `import Foo from 'Foo'`), [platform-specific extensions](https://reactnative.dev/docs/platform-specific-code#platform-specific-extensions), asset extensions and image resolutions (so React Native can [pick the best image](https://reactnative.dev/docs/images#static-image-resources) for the device's screen density at runtime), and custom resolvers that can override almost everything ([`resolver.resolveRequest`](./Configuration.md#resolverequest)).

Read on if you're writing a [custom resolver](#resolverequest-customresolver), debugging an "Unable to resolve module" error, or working out why Metro picked a particular file.

## Resolution algorithm

Given a [resolution context](#resolution-context) _context_ (whose fields mostly come from your [`resolver` config](./Configuration.md#resolver-options)), a module name _moduleName_, and an optional [platform](./Concepts.md#platform) identifier _platform_, Metro's resolver performs [**RESOLVE**](#resolve)(_context_, _moduleName_, _platform_), which either returns one of the [resolution types](#resolution-types) or throws an error.

### Resolution types

A successful resolution, including from a [custom resolver](#resolverequest-customresolver), is one of:

#### Source file

An absolute path to a file on disk, e.g. a JavaScript or TypeScript file.

#### Asset files

One or more absolute paths to files on disk, e.g. `icon.png` and `icon@2x.png` for an image at different screen densities.

#### Empty module

The built-in empty module specified in [`resolver.emptyModulePath`](./Configuration.md#emptymodulepath), e.g. when a package's `"browser"` field maps a module to `false`.

### Algorithm

:::note

These are the rules Metro's default resolver follows. See [`metro-resolver`'s source code](https://github.com/react/metro/blob/main/packages/metro-resolver/src/resolve.js) for more details.

:::

#### RESOLVE

Parameters: (*context*, *moduleName*, *platform*)

1. If a [custom resolver](#resolverequest-customresolver) is defined, then
    1. Return the result of the custom resolver.
2. If *moduleName* is an absolute path, or equal to `'.'` or `'..'`, or begins with `'./'` or `'../'`, then
    1. Let *absoluteModuleName* be *moduleName* if it is an absolute path, otherwise *moduleName* joined to the current directory (the parent of [`context.originModulePath`](#originmodulepath-string)).
    2. Return [**RESOLVE_MODULE**](#resolve_module)(*context*, *absoluteModuleName*, *platform*), or throw a resolution failure error.
3. If *moduleName* begins with `'#'` (a [subpath import](https://nodejs.org/api/packages.html#subpath-imports)), then
    1. Find the closest `package.json` to [`context.originModulePath`](#originmodulepath-string). If there is none, or it has no `"imports"` field, throw an error.
    2. Resolve *moduleName* against the `"imports"` field, asserting the same condition names as [**RESOLVE_PACKAGE_EXPORTS**](#resolve_package_exports). If resolved, return the result. E.g. `"imports": {"#utils/*": "./src/utils/*.js"}` maps `'#utils/format'` to `<package root>/src/utils/format.js`.
    3. Otherwise, log a warning and continue from step 5.
4. If *moduleName* parses as a URL, let *scheme* be its lowercased scheme (the prefix before `':'`), e.g. `node` for `'node:fs'` and `foo` for `'Foo:bar'`, then
    1. If [`context.schemeResolvers`](#schemeresolvers-readonlyscheme-string-customresolver) has a resolver for *scheme*, return its result for (*context*, *moduleName*, *platform*), with *context.resolveRequest* set to the default resolver for chaining.
    2. Otherwise, continue, but if no later step resolves *moduleName*, throw a scheme-specific error at step 11 instead of a generic resolution failure. (This deprecated fallback provides backwards compatibility for scheme-like specifiers via Haste or [`extraNodeModules`](#extranodemodules-string-string).) E.g. with no resolver for `node`, `'node:fs'` fails with `No resolver is registered for the 'node:' URI scheme.`
5. Apply [**BROWSER_SPEC_REDIRECTION**](#browser_spec_redirection) to *moduleName*.
    1. If this is `false`, return the empty module.
    2. If the result is a relative path, return [**RESOLVE_MODULE**](#resolve_module) for it relative to the redirecting `package.json`'s directory, or throw a resolution failure error. E.g. `"browser": {"crypto": "./shims/crypto.js"}` in `/app/package.json` maps `'crypto'` from `/app/src/App.js` to `/app/shims/crypto.js`.
    3. If the result is an absolute path, throw an `InvalidPackageConfigurationError`.
6. If [Haste resolutions are allowed](#allowhaste-boolean), then
    1. Get the result of [**RESOLVE_HASTE**](#resolve_haste)(*context*, *moduleName*, *platform*).
    2. If resolved as a Haste package path, then
        1. Return [**RESOLVE_PACKAGE**](#resolve_package)(*context*, *packageDir* + *relativePath*, *platform*), where *packageDir* is the Haste package's directory and *relativePath* the rest of *moduleName* after the package name. Throw an error if this fails.
            E.g. if the Haste package path for `'@a/b'` is `foo/package.json`, resolve `'@a/b/c'` as `foo/c`.
7. If [`context.unstable_enablePackageExports`](./Configuration.md#unstable_enablepackageexports-experimental) is enabled, then
    1. Get the result of [**PACKAGE_SELF_RESOLVE**](#package_self_resolve)(*context*, *moduleName*, *platform*).
    2. If resolved, return result.
8. If [`context.disableHierarchicalLookup`](#disablehierarchicallookup-boolean) is not `true`, then
    1. Try resolving _moduleName_ under `node_modules` from the current directory (the parent of [`context.originModulePath`](#originmodulepath-string)) up to the root directory. E.g. `'lodash/merge'` from `/app/src/screens/Home.js` tries `/app/src/screens/node_modules/lodash/merge`, then `/app/src/node_modules/…`, `/app/node_modules/…` and `/node_modules/…`.
    2. Perform [**RESOLVE_PACKAGE**](#resolve_package)(*context*, *modulePath*, *platform*) for each candidate path, where *modulePath* is the result of applying [**BROWSER_SPEC_REDIRECTION**](#browser_spec_redirection) to the candidate path (returning the empty module if this is `false`). If [`context.unstable_applyBrowserSpecAfterExports`](#unstable_applybrowserspecafterexports-boolean) is enabled and the candidate path's closest `package.json` has an `"exports"` field, *modulePath* is the candidate path itself.
9. For each element _nodeModulesPath_ of [`context.nodeModulesPaths`](#nodemodulespaths-readonlyarraystring):
    1. Try resolving _moduleName_ under _nodeModulesPath_ as if it were another `node_modules` directory (similar to step 8). E.g. `nodeModulesPaths: ['/monorepo/node_modules']` tries `/monorepo/node_modules/lodash/merge`.
    2. Perform [**RESOLVE_PACKAGE**](#resolve_package)(*context*, *modulePath*, *platform*) for each candidate path, with *modulePath* as in step 8.2.
10. If [`context.extraNodeModules`](#extranodemodules-string-string) is set:
    1. Split _moduleName_ into a package name (including an optional [scope](https://docs.npmjs.com/cli/v8/using-npm/scope)) and relative path.
    2. Look up the package name in [`context.extraNodeModules`](#extranodemodules-string-string). If found, then
        1. Let _modulePath_ be _moduleName_ with its package name replaced by the value found. E.g. `extraNodeModules: {'shared': '/monorepo/shared'}` maps `'shared/utils'` to `/monorepo/shared/utils`.
        2. Return [**RESOLVE_PACKAGE**](#resolve_package)(*context*, *modulePath*, *platform*), with *modulePath* redirected as in step 8.2.
11. If no valid resolution has been found, throw a resolution failure error — a scheme-specific error if step 4.2 applied, otherwise a generic one.

#### RESOLVE_MODULE

Parameters: (*context*, *moduleName*, *platform*)

Resolves an absolute path to a file or a directory's entry point. For example, on iOS, `/app/src/Header` resolves to the first that exists of (relative to `/app/src`):

* `Header.ios.js`, `Header.native.js`, `Header.js`, … (step 2)
* `Header/index.ios.js`, `Header/index.native.js`, … if `Header/` has no `package.json` (step 4)
* `Header/lib/main.ios.js`, … if `Header/package.json` has `"main": "./lib/main"` (step 5)

1. Let *filePath* be the result of applying [**BROWSER_SPEC_REDIRECTION**](#browser_spec_redirection) to *moduleName* (possibly a replacement subpath from a containing `package.json`).
    1. If this is `false`, return the empty module.
2. Unless *filePath* ends with a path separator, return [**RESOLVE_FILE**](#resolve_file)(*context*, *filePath*, *platform*), or continue.
3. Otherwise, let *dirPath* be *filePath*. If *dirPath* is not an existing directory, throw an error.
4. If a file *dirPath* + `'/package.json'` does not exist, return [**RESOLVE_FILE**](#resolve_file)(*context*, *dirPath* + `'/index'`, *platform*), or throw an error.
5. Otherwise, resolve based on the [`browser` field spec](https://github.com/defunctzombie/package-browser-field-spec):
    1. Let *mainModulePath* be the package's entry path, read using [`context.mainFields`](#mainfields-readonlyarraystring).
    2. Return [**RESOLVE_FILE**](#resolve_file)(*context*, *mainModulePath*, *platform*), or continue.
    3. Return [**RESOLVE_FILE**](#resolve_file)(*context*, *mainModulePath* + `'/index'`, *platform*).
    4. Throw an error if no resolution could be found.

#### RESOLVE_PACKAGE

Parameters: (*context*, *moduleName*, *platform*)

Resolves an absolute path that may be inside an npm package, e.g. a candidate path under `node_modules`. Let *filePath* be *moduleName*, *packagePath* the directory of the closest containing `package.json`, and *exportsField* its `"exports"` field. E.g. for `'some-pkg/utils'` from `/app/src/App.js`, [**RESOLVE**](#resolve) step 8 passes *filePath* `/app/node_modules/some-pkg/utils`, so *packagePath* is `/app/node_modules/some-pkg` and the `"exports"` subpath is `'./utils'`.

1. If [`context.unstable_enablePackageExports`](#unstable_enablepackageexports-boolean) is enabled and a containing `package.json` has an `"exports"` field, get the result of [**RESOLVE_PACKAGE_EXPORTS**](#resolve_package_exports)(*context*, *packagePath*, *filePath*, *exportsField*, *platform*).
    1. If resolved path exists, then
        1. If [`context.unstable_applyBrowserSpecAfterExports`](#unstable_applybrowserspecafterexports-boolean) is enabled, apply [**BROWSER_SPEC_REDIRECTION**](#browser_spec_redirection) to the resolved path. If this is `false`, return the empty module. If it is a different path, return [**RESOLVE_MODULE**](#resolve_module)(*context*, *redirectedPath*, *platform*). E.g. `"browser": {"./lib/index.node.js": "./lib/index.browser.js"}` redirects `"exports": {".": "./lib/index.node.js"}`.
        2. Return result.
    2. Else, log either a package configuration or package encapsulation warning.
2. Return [**RESOLVE_MODULE**](#resolve_module)(*context*, *filePath*, *platform*).

#### PACKAGE_SELF_RESOLVE

Parameters: (*context*, *moduleName*, *platform*)

Lets code inside a package import that package by its own name via its `"exports"` field, matching [Node's self-referencing behavior](https://nodejs.org/api/packages.html#self-referencing-a-package-using-its-name). E.g. if `my-lib/package.json` has `"name": "my-lib"` and `"exports": {"./utils": "./src/utils.js"}`, then `'my-lib/utils'` from `my-lib/src/index.js` resolves to `my-lib/src/utils.js`, even if `my-lib` is not in any `node_modules` directory.

1. Find the closest package to [`context.originModulePath`](#originmodulepath-string). If no package is found, return no resolution.
2. If the package does not declare both a `"name"` field and an `"exports"` field, return no resolution.
3. Split _moduleName_ into a package name (including an optional [scope](https://docs.npmjs.com/cli/v8/using-npm/scope)) and relative path.
4. If the package name does not match the current package's `"name"` field, return no resolution.
5. Get the result of [**RESOLVE_PACKAGE_EXPORTS**](#resolve_package_exports)(*context*, *packagePath*, *filePath*, *exportsField*, *platform*) against the current package's `"exports"` field.
    1. If resolved path exists, return result.
    2. Else, log either a package configuration or package encapsulation warning, then continue with normal resolution.

#### RESOLVE_PACKAGE_EXPORTS

Parameters: (*context*, *packagePath*, *filePath*, *exportsField*, *platform*)

> Resolves a package subpath based on the [Package Entry Points spec](https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points) (the `"exports"` field), when [`resolver.unstable_enablePackageExports`](./Configuration.md#unstable_enablepackageexports-experimental) is enabled.

1. Let *subpath* be the relative path from *packagePath* to *filePath*, or `'.'`.
2. If *exportsField* contains an invalid configuration or values, raise an `InvalidPackageConfigurationError`.
3. If *subpath* is not defined by *exportsField*, raise a `PackagePathNotExportedError`.
4. Let *target* be the result of matching *subpath* in *exportsField* after applying any [conditional exports](https://nodejs.org/docs/latest-v19.x/api/packages.html#conditional-exports) and/or substituting a [subpath pattern match](https://nodejs.org/docs/latest-v19.x/api/packages.html#subpath-patterns).
    1. Condition names will be asserted from the union of `'default'`, `'import'` OR `'require'` according to `context.isESMImport`, [`context.unstable_conditionNames`](#unstable_conditionnames-readonlyarraystring) and [`context.unstable_conditionsByPlatform`](#unstable_conditionsbyplatform-platform-string-readonlyarraystring) for *platform*, in the order defined by *exportsField*. E.g. for an iOS `import` with React Native's default `unstable_conditionNames: ['react-native']`, the asserted conditions are `'default'`, `'import'` and `'react-native'`, so `{"require": "./a.js", "react-native": "./b.js", "import": "./c.js"}` resolves to `./b.js`, the first matching key.
5. If *target* refers to an [asset](#assetexts-readonlysetstring), then
    1. Return [**RESOLVE_ASSET**](#resolve_asset)(*context*, *target*, *platform*).
6. Return *target* as a [source file resolution](#source-file) **without** applying redirections or trying any platform or extension variants.

#### RESOLVE_FILE

Parameters: (*context*, *filePath*, *platform*)

Applies [platform-specific extensions](https://reactnative.dev/docs/platform-specific-code#platform-specific-extensions) and [`sourceExts`](#sourceexts-readonlyarraystring) to resolve a path to a file.

1. If the path refers to an [asset](#assetexts-readonlysetstring), then
    1. Return [**RESOLVE_ASSET**](#resolve_asset)(*context*, *filePath*, *platform*).
2. Otherwise, if the path [exists](#doesfileexist-string--boolean-deprecated) as a file, return a [source file resolution](#source-file) for it.
3. Otherwise:
    1. Try all platform and extension variants in sequence. Return a [source file resolution](#source-file) for the first that [exists](#doesfileexist-string--boolean-deprecated) after applying [**BROWSER_SPEC_REDIRECTION**](#browser_spec_redirection). For example, if _platform_ is `android` and [`context.sourceExts`](#sourceexts-readonlyarraystring) is `['js', 'jsx']`, try:
        1. _moduleName_ + `'.android.js'`
        2. _moduleName_ + `'.native.js'` (if [`context.preferNativePlatform`](#prefernativeplatform-boolean) is `true`)
        3. _moduleName_ + `'.js'`
        4. _moduleName_ + `'.android.jsx'`
        5. _moduleName_ + `'.native.jsx'` (if [`context.preferNativePlatform`](#prefernativeplatform-boolean) is `true`)
        6. _moduleName_ + `'.jsx'`

#### RESOLVE_ASSET

Parameters: (*context*, *filePath*, *platform*)

1. Use [`context.resolveAsset`](#resolveasset-dirpath-string-assetname-string-extension-string--readonlyarraystring) to collect all asset variants (e.g. for different screen densities).
2. Return an [asset resolution](#asset-files) containing the collected asset paths.

#### RESOLVE_HASTE

Parameters: (*context*, *moduleName*, *platform*)

Looks up *moduleName* as a [Haste](./Concepts.md#haste) module or package.

1. If _moduleName_ contains no `'/'`, try resolving it as a [Haste module](#resolvehastemodule-string--string).
   If found, then
   1. Return result as a [source file resolution](#source-file) **without** applying redirections or trying any platform or extension variants.
2. Split _moduleName_ into a package name (including an optional [scope](https://docs.npmjs.com/cli/v8/using-npm/scope)) and relative path, and try resolving the package name as a [Haste (global) package](#resolvehastepackage-string--string).
   For example, `'a/b/c'` tries package `'a'` with relative path `'./b/c'`, and `'@a/b/c'` tries package `'@a/b'` with relative path `'./c'`.

#### BROWSER_SPEC_REDIRECTION

Parameters: (*context*, *moduleName*)

Applies [`browser` field spec](https://github.com/defunctzombie/package-browser-field-spec) redirections (file to file, or module to empty module via `false`) from the closest `package.json` to the origin or target module. Metro reads them from every field in [`context.mainFields`](#mainfields-readonlyarraystring), not just `"browser"`.

1. Find the closest `package.json` to *moduleName*, if *moduleName* is absolute, or to [`context.originModulePath`](#originmodulepath-string) otherwise, stopping at any `node_modules`. Let *packageScope* be its containing directory.
2. If none is found, return *moduleName*.
3. Define *subpath*:
    1. If *moduleName* begins with `'.'`, consider it relative to [`context.originModulePath`](#originmodulepath-string) and let *subpath* be the same path relative to *packageScope*, prefixed `'./'`.
    2. Else if *moduleName* is absolute, let *subpath* be *moduleName* relative to *packageScope*, prefixed `'./'`.
    3. Else let *subpath* be *moduleName*.
4. Merge the object values of each of [`context.mainFields`](#mainfields-readonlyarraystring) in the `package.json` at *packageScope* into a single map *mainFieldsMap*, with earlier fields taking precedence. Let *expandedSubpath* range over *subpath*, *subpath* + `'.js'` and *subpath* + `'.json'`.
    1. For each *expandedSubpath*:
        1. If *mainFieldsMap* has the key *expandedSubpath*, let *redirectedPath* be its value, else continue.
        2. If *moduleName* is absolute or begins with `'.'`, and *redirectedPath* is a string:
            1. If *redirectedPath* is an absolute path, return *redirectedPath*.
            2. Return *packageScope* joined with *redirectedPath*.
        3. Return *redirectedPath*.
5. Return *moduleName*.

For example, if `/app/node_modules/foo/package.json` has `"browser": {"./lib/server.js": "./lib/client.js", "fs": false}`, then for imports from `/app/node_modules/foo/lib/index.js`:

* `'./server'` has *subpath* `'./lib/server'`, which matches the key `'./lib/server.js'`, so it is redirected to `/app/node_modules/foo/lib/client.js`.
* `'fs'` has *subpath* `'fs'`, which is mapped to `false` (the empty module).

### Resolution context

The object passed to the resolver for each request, e.g. as the first argument to a [custom resolver](#resolverequest-customresolver). Most fields come from your [`resolver` config](./Configuration.md#resolver-options). Custom resolvers most often read [`originModulePath`](#originmodulepath-string) and [`customResolverOptions`](#customresolveroptions-string-mixed), and call [`resolveRequest`](#resolverequest-customresolver) to fall back to the default resolver.

#### `assetExts: $ReadOnlySet<string>`

The set of file extensions used to identify asset files. Defaults to [`resolver.assetExts`](./Configuration.md#assetexts).

#### `dev: boolean`

`true` for a development bundle, `false` otherwise.

#### `doesFileExist: string => boolean` <div class="label deprecated">Deprecated</div>

Returns whether the file at the given path exists. The default implementation wraps [`fileSystemLookup`](#filesystemlookup-string--exists-true-type-fd-realpath-string--exists-false); prefer using that directly.

#### `fileSystemLookup: string => {exists: true, type: 'f'|'d', realPath: string} | {exists: false}`

*Added in v0.81.0*

Returns information about the given absolute or project-relative path, following symlinks. A file "exists" only if Metro knows about it (see [project root and watch folders](./Concepts.md#project-root-and-watch-folders)), and a directory must be non-empty. The returned `realPath` is real and absolute; e.g. for a directory symlinked by pnpm, `fileSystemLookup('/app/node_modules/foo')` returns `{exists: true, type: 'd', realPath: '/app/node_modules/.pnpm/foo@1.0.0/node_modules/foo'}`. Missing paths return `{exists: false}`.

By default, Metro uses an in-memory file map prepared in advance, so resolution needs no disk I/O and real paths are almost free.

#### `nodeModulesPaths: $ReadOnlyArray<string>`

Paths to check for modules after looking through all `node_modules` directories. Defaults to [`resolver.nodeModulesPaths`](./Configuration.md#nodemodulespaths).

#### `preferNativePlatform: boolean`

If `true`, try `.native.${ext}` after `.${platform}.${ext}` and before `.${ext}`. Metro sets this to `true`, which is why it picks `Foo.native.js` when there is no `Foo.ios.js` (or other `Foo.${platform}.js`).

#### `redirectModulePath: string => string | false` <div class="label deprecated">Deprecated</div>

Defaults to [**BROWSER_SPEC_REDIRECTION**](#browser_spec_redirection), which Metro's default resolver uses directly instead of calling this function. It is exposed for backwards-compatible use by custom resolvers, and will be removed in a future release.

#### `resolveAsset: (dirPath: string, assetName: string, extension: string) => ?$ReadOnlyArray<string>`

Returns all asset files in `dirPath` matching `assetName` and `extension`, or `null` if there are none. The default implementation considers `${assetName}${extension}` and, for each of [`resolver.assetResolutions`](./Configuration.md#assetresolutions), `${assetName}@${resolution}x${extension}`. For example, `resolveAsset('/app/img', 'logo', '.png')` may return `['/app/img/logo.png', '/app/img/logo@2x.png', '/app/img/logo@3x.png']`. See also [Static Image Resources](https://reactnative.dev/docs/images#static-image-resources).

#### `sourceExts: $ReadOnlyArray<string>`

File extensions to try, in order, when resolving a module path that does not exist on disk. Defaults to [`resolver.sourceExts`](./Configuration.md#sourceexts).

#### `mainFields: $ReadOnlyArray<string>`

The ordered list of `package.json` fields read to resolve a package's main entry point (and any subpath file replacements) per the ["browser" field spec](https://github.com/defunctzombie/package-browser-field-spec). Defaults to [`resolver.resolverMainFields`](./Configuration.md#resolvermainfields).

#### `getPackage: string => ?PackageJson`

Given the path to a `package.json` file, returns the parsed contents, or `null` if the file does not exist or is malformed.

#### `getPackageForModule: (absoluteModulePath: string) => ?PackageForModule` <div class="label deprecated">Deprecated</div>

Given a candidate absolute module path, which need not exist, returns the closest package root (searching upwards, stopping at the nearest `node_modules`), its parsed `package.json`, and the package-relative path, or `null` if there's no `package.json` before the nearest `node_modules`. A path through a symlinked directory checks the link's target, then continues up from the link's parent; a symlinked file is scoped by where the link is. A missing path takes the scope of its deepest existing ancestor, or `null` if the first missing segment is `node_modules`. E.g. `getPackageForModule('/app/node_modules/foo/lib/index.js')` returns `{rootPath: '/app/node_modules/foo', packageJson: {...}, packageRelativePath: 'lib/index.js'}`.

#### `isESMImport?: boolean`

Whether the dependency was declared with an ESM import (`import x from 'y'` or `await import('z')`) rather than `require()`, the criteria Node.js uses to assert the `"import"` rather than the `"require"` [condition](./PackageExports.md#how-metro-applies-importrequire-exports-conditions).

When [`dependency`](#dependency-dependency) is provided, this always equals `dependency.data.isESMImport`. Unlike `dependency`, it may be used to decide the resolution.

#### `resolveHasteModule: string => ?string`

Resolves a Haste module name to an absolute path, or `null` if no such module exists. The default implementation uses [metro-file-map](https://www.npmjs.com/package/metro-file-map)'s `getModule` method.

#### `resolveHastePackage: string => ?string`

Resolves a Haste (global) package name to an absolute `package.json` path, or `null` if no such package exists. The default implementation uses [metro-file-map](https://www.npmjs.com/package/metro-file-map)'s `getPackage` method and can be turned on or off using [`resolver.enableGlobalPackages`](./Configuration.md#enableglobalpackages).

#### `allowHaste: boolean`

`true` if Haste resolutions are allowed in the current context, `false` otherwise.

#### `disableHierarchicalLookup: boolean`

If `true`, the resolver does not look up modules in `node_modules` directories per the Node resolution algorithm. Defaults to [`resolver.disableHierarchicalLookup`](./Configuration.md#disablehierarchicallookup).

#### `extraNodeModules: ?{[string]: string}`

A mapping of package names to directories, consulted after the standard `node_modules` lookup and any [`nodeModulesPaths`](#nodemodulespaths-readonlyarraystring).

#### `originModulePath: string`

The path of the module containing the `import` or `require()` being resolved.

#### `customResolverOptions: {[string]: mixed}`

Any custom options passed to the resolver. By default, Metro populates this from URL parameters in the bundle request, e.g. `http://localhost:8081/index.bundle?resolver.key=value` becomes `{key: 'value'}`.

#### `resolveRequest: CustomResolver`

An alternative resolver function to which the current request may be delegated. Defaults to [`resolver.resolveRequest`](./Configuration.md#resolverequest). Its signature is:

```flow
function resolveRequest(
  context: ResolutionContext,
  moduleName: string,
  platform: string | null,
): Resolution {
  // ...
}

type Resolution =
  | {type: 'empty'}
  | {type: 'sourceFile', filePath: string}
  | {type: 'assetFiles', filePaths: $ReadOnlyArray<string>};
```

Returned paths (`filePath` and `filePaths`) must be *absolute* and *real*, such as the `realPath` returned by [`fileSystemLookup`](#filesystemlookup-string--exists-true-type-fd-realpath-string--exists-false).

If `resolveRequest` is non-null when the default resolver is called, it is treated as a custom resolver that is always called and fully replaces the default logic (see [**RESOLVE**](#resolve) step 1). Inside a custom resolver, `resolveRequest` is the default resolver, for easy chaining. For example, to resolve `lodash` as `lodash-es` and leave everything else to the default resolver:

```js
// metro.config.js, in `resolver`
resolveRequest: (context, moduleName, platform) => {
  if (moduleName === 'lodash') {
    return context.resolveRequest(context, 'lodash-es', platform);
  }
  return context.resolveRequest(context, moduleName, platform);
},
```

Custom resolvers must follow the [caching](#caching) rules.

#### `schemeResolvers: Readonly<{[scheme: string]: CustomResolver}>`

[Custom resolvers](#resolverequest-customresolver) for specifiers prefixed with a URI scheme, keyed by scheme name (the part before the first `':'`, without the colon). Schemes are lowercased before lookup, so keys must be lowercase (both `Foo:` and `foo:` match `'foo'`). Defaults to Metro's built-in scheme resolvers (currently `metro:`) merged with [`resolver.schemeResolvers`](./Configuration.md#schemeresolvers), which take precedence.

A matching resolver is called with the full specifier (e.g. `my-scheme:foo` for key `'my-scheme'`) and can chain back into default resolution via [`context.resolveRequest`](#resolverequest-customresolver), e.g. to resolve a relative path.

Relative (`./`, `../`) and subpath (`#…`) imports are handled first and never treated as schemes. See [**RESOLVE**](#resolve) step 4, and [`resolver.schemeResolvers`](./Configuration.md#schemeresolvers) for precedence relative to [`resolveRequest`](#resolverequest-customresolver).

#### `unstable_applyBrowserSpecAfterExports: boolean`

Whether [**BROWSER_SPEC_REDIRECTION**](#browser_spec_redirection) is applied to the file resolved from a package's `"exports"` field, instead of to the requested subpath before `"exports"` is considered. Defaults to [`resolver.unstable_applyBrowserSpecAfterExports`](./Configuration.md#unstable_applybrowserspecafterexports-experimental).

#### `unstable_conditionNames: $ReadOnlyArray<string>`

Additional condition names asserted when resolving the `"exports"` and `"imports"` fields. Defaults to [`resolver.unstable_conditionNames`](./Configuration.md#unstable_conditionnames-experimental).

#### `unstable_conditionsByPlatform: {[platform: string]: $ReadOnlyArray<string>}`

Additional condition names asserted for a given platform when resolving the `"exports"` and `"imports"` fields. Defaults to [`resolver.unstable_conditionsByPlatform`](./Configuration.md#unstable_conditionsbyplatform-experimental). For example, Metro's default `{web: ['browser']}` asserts `'browser'` only when bundling for `web`.

#### `unstable_enablePackageExports: boolean`

Whether the `"exports"` field is used for resolution. Defaults to [`resolver.unstable_enablePackageExports`](./Configuration.md#unstable_enablepackageexports-experimental).

#### `dependency: ?Dependency`

A descriptor of the dependency being resolved. It is for diagnostic purposes *only* and may not be used for semantic purposes (see [Caching](#caching)).

```flow
type Dependency = {
  // The literal specifier, e.g. 'foo' for `require('foo')`.
  name: string,

  data: {
    // A locally unique key for this dependency within the origin module.
    key: string,

    // Babel AST source locations of this dependency in the origin module. May be empty.
    locs: $ReadOnlyArray<BabelSourceLocation>,

    // E.g. 'async' for `import('foo')`, 'weak' for `require.resolveWeak('foo')`,
    // and null for `import` and `require()`.
    asyncType: 'async' | 'maybeSync' | 'prefetch' | 'weak' | null,

    // Other properties are internal and may change.
    ...
  },
};
```

## Caching

Metro caches and reuses resolver results, which matters mainly for [custom resolvers](#resolverequest-customresolver). Results may be cached under these conditions:

1. For given origin module paths _A_ and _B_ and target module name _M_, the resolution for _M_ may be reused if **all** of the following conditions hold:
    1. _A_ and _B_ are in the same directory.
    2. The contents of [`dev`](#dev-boolean) and [`customResolverOptions`](#customresolveroptions-string-mixed) are equivalent ( = serialize to JSON the same) in both calls to the resolver.
    3. The `platform` is the same in both calls.
    4. [`isESMImport`](#isesmimport-boolean) is the same in both calls.
2. Any cache of resolutions must be invalidated if any file in the project has changed.

Custom resolvers must adhere to these assumptions, e.g. they must not resolve `'./config'` differently for `src/App.js` and `src/App.test.js` under the same `customResolverOptions`, because Metro may reuse either result for the other.
