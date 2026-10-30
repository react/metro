---
id: package-exports
title: Package Exports Support
---

Many npm packages use the `"exports"` field in `package.json` to declare which files can be imported, and which file to use in which environment. Metro supports it, enabled by default. Because `"exports"` takes priority over fields like `"main"` and `"react-native"`, it affects which file Metro [resolves](./Resolution.md) a package import to.

- **App developers**: see [Summary of breaking changes](#summary-of-breaking-changes), [Troubleshooting](#troubleshooting), and, for warnings that a module `is not listed in the "exports"`, [Package encapsulation is lenient](#package-encapsulation-is-lenient).
- **Package maintainers**: see the [Migration guide for package maintainers](#migration-guide-for-package-maintainers).

## Background

Package Exports, introduced in Node.js 12.7.0, let a package declare its **entry points** in `"exports"`: which subpaths can be imported from outside the package, and which file each resolves to. A subpath can have different targets depending on [*conditions*](https://nodejs.org/api/packages.html#conditional-exports), such as browser vs. Node.js, or `import` vs. `require`.

Package Exports support has been enabled by default in Metro since [0.82](https://github.com/react/metro/releases/tag/v0.82.0) (React Native 0.79).

- [Node.js spec](https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points)
- [RFC for Package Exports in Metro](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0534-metro-package-exports-support.md)
- [React Native 0.79 release blog](https://reactnative.dev/blog/2025/04/08/react-native-0.79#metro-faster-startup-and-package-exports-support)

## Configuration options

| Option | Description |
| --- | --- |
| [`resolver.unstable_enablePackageExports`](./Configuration.md#unstable_enablepackageexports-experimental) | Enable/disable Package Exports support. |
| [`resolver.unstable_conditionNames`](./Configuration.md#unstable_conditionnames-experimental) | Condition names to assert when resolving conditional exports. |
| [`resolver.unstable_conditionsByPlatform`](./Configuration.md#unstable_conditionsbyplatform-experimental) | Additional condition names to assert for a given [platform](./Concepts.md#platform). |

## How Metro applies `import`/`require` exports conditions

Like Node.js, Metro asserts either `'import'` or `'require'`, never both, depending on whether your source file loads the dependency with `import` (or `await import()`) or `require()`. Unlike Node.js, Metro allows `import ... from` and `require()` in the same file, so you can change an `import` to `require()` to get a dependency's CommonJS version.

:::info
Metro records the source locations of your `import`s before transforming them to `require`s for bundling, then checks whether each `require` is source mapped to a former `import`. If Metro resolves an `import` as if it were a `require`, a custom Babel transform in your configuration may be dropping its source mapping.
:::

## Summary of breaking changes

:::info
**Package Exports resolution was introduced as an opt-in in Metro 0.76.1 and opt-out from Metro 0.82.0**. We will provide the option to disable it for several further releases, and have no plans to remove existing non-`"exports"` resolution behaviour.
:::

Package Exports was already live in the npm ecosystem and overlaps with React Native concepts such as [platform-specific extensions](https://reactnative.dev/docs/platform-specific-code), so we designed Metro's implementation with the community ([PR](https://github.com/react-native-community/discussions-and-proposals/pull/534), [final RFC](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0534-metro-package-exports-support.md)). It is spec-compliant (necessitating some breaking changes) but otherwise backwards compatible, so apps can migrate gradually.

### Breaking: If an `"exports"` match is found, it is preferred

As in other resolvers, `exports` takes precedence over `main` and similar fields, so existing dependencies may resolve to different files. Commonly, a package's CommonJS version (via `main`) is replaced by its ESM version (via `exports`), which may fail at runtime if not designed for Metro or React Native.

#### Example

```json
{
  "name": "some-pkg",
  "main": "./dist/cjs/index.js",
  "exports": {
    ".": {
      "import": "./dist/esm/index.mjs",
      "require": "./dist/cjs/index.js"
    }
  }
}
```

Without `exports` support, Metro bundles `./dist/cjs/index.js` via `main`. With it, `import Foo from 'some-pkg'` bundles `./dist/esm/index.mjs` (the `import` condition), while `const Foo = require('some-pkg')` applies the `require` condition, which here (as is common) resolves the same file as `main`.

### Breaking: Match `"exports"` first, then fall back to legacy resolution

If a package's `package.json` has an `"exports"` field, Metro consults it first.

- `"exports"` is used instead of any `"react-native"`, `"browser"`, or `"main"` field, and instead of a file on disk at the same subpath (e.g. with `"./utils": "./dist/utils.js"`, `'some-pkg/utils'` resolves to `dist/utils.js` even if the package has a root `utils.js`).
- **Fallback**: If the requested subpath isn't matched in `"exports"`, Metro tries again using the fields above.
- An object-valued `"browser"` field (or other object-valued [main field](./Configuration.md#resolvermainfields)) can still redirect the requested subpath before `"exports"` is matched. Enable [`resolver.unstable_applyBrowserSpecAfterExports`](./Configuration.md#unstable_applybrowserspecafterexports-experimental) to apply those redirections to the file that `"exports"` resolves to instead, as webpack and Vite do.

Subpaths matched in `"exports"` (including via [subpath patterns](https://nodejs.org/docs/latest-v19.x/api/packages.html#subpath-patterns)) resolve to the exact target file the package specifies:

- Metro does not expand [`sourceExts`](./Configuration.md#sourceexts) against the import specifier.
- Metro does not resolve [platform-specific extensions](https://reactnative.dev/docs/platform-specific-code) against the target file.
- **Unchanged**: Metro expands [asset densities](./Configuration.md#assetresolutions) (e.g. `icon.png` → `icon@2x.png`) if the target file [is an asset](./Configuration.md#assetexts).

#### Example

For a package without `"exports"`, `import FooComponent from 'some-pkg/FooComponent'` tries `.[platform].js`, `.native.js`, `.js` (+ TypeScript variants). If `"exports"` lists `"./FooComponent": "./src/FooComponent.js"`, the same import always resolves to `src/FooComponent.js`, even if `src/FooComponent.ios.js` exists.

:::note
We have no plans to drop platform-specific extensions for packages not using `"exports"`, or in app code.
:::

### Breaking: Import specifiers are matched exactly

Without `"exports"`, an import specifier (the string given to `import` or `require()`) can include or omit the file extension. Subpath keys in `"exports"` are matched exactly, so the extension must match too.

#### Example

With `"exports": {"./FooComponent": "./src/FooComponent.js"}`, `'some-pkg/FooComponent.js'` is inaccessible unless the package also lists `"./FooComponent.js"` as a key.

This also applies to subpath patterns: `"./*": "./src/*.js"` is distinct from `"./*.js": "./src/*.js"`. With the first, `'some-pkg/foo'` maps to `./src/foo.js` but `'some-pkg/foo.js'` maps to `./src/foo.js.js`. With the second, `'some-pkg/foo.js'` maps to `./src/foo.js` and `'some-pkg/foo'` is not matched.

### Package encapsulation is lenient

Importing a subpath not listed in a package's `"exports"` is an error in Node.js. Metro instead warns and falls back to file-based resolution, so imports that worked without `"exports"` support keep working.

```sh
warn: Attempted to import the module "/path/to/node_modules/foo/private/fn.js" which
is not listed in the "exports" of "/path/to/node_modules/foo" under the requested
subpath "./private/fn.js". Falling back to file-based resolution. Consider updating
the call site or asking the package maintainer(s) to expose this API.
```

To fix the warning, import a subpath the package lists in `"exports"`, or ask its maintainers to export the one you need.

:::note
We plan to implement a strict mode for package encapsulation in the future, to align with Node's default behavior. **We recommend that all developers fix encapsulation warnings in their code**.
:::

## Migration guide for package maintainers

**Adding an `"exports"` field to your package is entirely optional**. Packages without `"exports"` resolve exactly as before, and we have no plans to remove this behaviour.

### Recommended: Introducing `"exports"` is a breaking change

The Node.js spec explains how to add `"exports"` without breaking changes, but this is hard in practice. For instance, if your React Native package uses [platform-specific extensions](https://reactnative.dev/docs/platform-specific-code) on its public exports, adding `"exports"` is breaking by default.

> To make the introduction of `"exports"` non-breaking, ensure that every previously supported entry point is exported. It is best to explicitly specify entry points so that the package's public API is well-defined.
>
> — https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points

### Package subpaths

:::caution
**Please do not rely on [lenient package encapsulation](#package-encapsulation-is-lenient) under Metro.** Metro is lenient for backwards compatibility, but packages should follow `"exports"` as documented in the spec and strictly implemented by other tools.
:::

#### File extensions are important!

Each subpath is an exact specifier ([see section in RFC](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0534-metro-package-exports-support.md#exact-path-specifiers)). For packages targeting React Native, we recommend continuing to use **extensionless specifiers** for subpaths, or **defining both extensioned and extensionless specifiers**, as users expect.

```json
  "exports": {
    ".": "./src/index.js",
    "./FooComponent": "./src/FooComponent.js",
    "./FooComponent.js": "./src/FooComponent.js"
  }
```

#### Subpath patterns do not permit expansion

Subpath patterns are a shorthand for mapping multiple subpaths. They do not permit path expansion (`*` is strictly a substring replacement), but they do match nested directories ([see section in RFC](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0534-metro-package-exports-support.md#subpath-patterns)). Only one `*` is permitted per side of a subpath pattern. For example, with `"./utils/*": "./utils/*.js"`:

- `'pkg/utils/foo'` matches `'pkg/utils/foo.js'`.
- `'pkg/utils/foo/bar'` matches `'pkg/utils/foo/bar.js'`.
- `'pkg/utils/foo'` **does not match** `'pkg/utils/foo.bar.js'`.

### Replacing `"browser"` and `"react-native"` fields

We've introduced the `"react-native"` community condition, representing React Native, the framework, alongside runtimes such as `"node"` and `"deno"` ([RFC](https://github.com/nodejs/node/pull/45367)).

> [Community Conditions Definitions — **`"react-native"`**](https://nodejs.org/docs/latest-v19.x/api/packages.html#community-conditions-definitions)
>
> _Will be matched by the React Native framework (all platforms). To target React Native for Web, "browser" should be specified before this condition._

For packages using `"exports"`, this condition replaces the `"react-native"` root field. Root field priority is set per project (via [`resolver.resolverMainFields`](./Configuration.md#resolvermainfields)), [which creates ambiguity with React Native for Web](https://github.com/expo/router/issues/37#issuecomment-1275925758). Under `"exports"`, _packages define the resolution order for conditional entry points themselves_, removing this ambiguity.

#### Example: Use conditional exports to target web and React Native

```json
  "exports": {
    "browser": "./dist/index-browser.js",
    "react-native": "./dist/index-react-native.js",
    "default": "./dist/index.js"
  }
```

Metro picks the first condition it asserts: `"react-native"` on Android and iOS (React Native's default config), but `"browser"` for `web` (asserted via the default [`resolver.unstable_conditionsByPlatform`](./Configuration.md#unstable_conditionsbyplatform-experimental)), since it comes first.

:::note
We chose not to introduce `"android"` and `"ios"` conditions, due to the prevalence of other existing platform selection methods, and the complexity of how this behavior might work across frameworks. We recommend the [`Platform.select()`](https://reactnative.dev/docs/platform#select) API instead.
:::

### Replacing platform-specific extensions

Subpaths matched in `"exports"` resolve to the exact target file, without expanding `sourceExts` or platform-specific extensions (see [above](#breaking-match-exports-first-then-fall-back-to-legacy-resolution)). To ship platform-specific code, select the implementation at runtime from a single target file.

#### Use [`Platform.select()`](https://reactnative.dev/docs/platform#select) (React Native)

With `"exports": {"./FooComponent": "./src/FooComponent.js"}`:

```js
// src/FooComponent.js
import {Platform} from 'react-native';

const FooComponent = Platform.select({
  android: require('./FooComponentAndroid.js'),
  ios: require('./FooComponentIOS.js'),
});

export default FooComponent;
```

### Asset files

As with source files, assets must be listed in `"exports"` to be imported without warnings. Asset files with [multiple densities](./Configuration.md#assetresolutions), e.g. `icon.png` and `icon@2x.png`, work without being listed individually.

Subpath patterns conveniently export many assets; we recommend specifying asset subpaths **with their file extension**. For example, with `"exports": {"./assets/*.png": "./dist/assets/*.png"}`, `'some-pkg/assets/icon.png'` resolves to `dist/assets/icon.png` along with any existing density variants, such as `dist/assets/icon@2x.png`.

## Troubleshooting

### Package/ESM incompatibilities

Since `"exports"` takes priority, Metro may resolve a package to a file not designed for React Native. Symptoms include:

- *"`import.meta` can not be used outside a module"*. `import.meta` support is coming.
- Errors relating to `document` or other web globals in your mobile app.

In these cases, **React Native developers** can:

- `require()` that dependency to try to get its CommonJS version (see [above](#how-metro-applies-importrequire-exports-conditions)).
- Disable `exports` support by setting [`resolver.unstable_enablePackageExports`](./Configuration.md#unstable_enablepackageexports-experimental) to `false`.
- (Advanced) Use a [custom resolver](./Resolution.md#resolverequest-customresolver) for specific packages, as below.

#### Example: Custom resolver

:::note
Expo users should follow Expo-specific guidance in [this GitHub discussion](https://github.com/expo/expo/discussions/36551#discussion-8271245)
:::

To use the `browser` condition for `some-pkg` and its subpaths:

```js
// metro.config.js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const config = {
  resolver: {
    resolveRequest: (context, moduleImport, platform) => {
      if (moduleImport === 'some-pkg' || moduleImport.startsWith('some-pkg/')) {
        return context.resolveRequest(
          {
            ...context,
            unstable_conditionNames: ['browser'],
            // Alternatively, disable exports for this package
            // unstable_enablePackageExports: false
          },
          moduleImport,
          platform,
        );
      }

      // Fall back to normal resolution for everything else.
      return context.resolveRequest(context, moduleImport, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
```

**Package maintainers** should use the [`react-native` condition](#replacing-browser-and-react-native-fields) to specify the best version of their package for React Native users, listed before `import`, `require`, and `default`.

#### Previous Metro bugs

Bugs in earlier versions of Metro's implementation may cause:

- *"`_interopRequireDefault` is not a function"*.
- Non-deterministic builds that sometimes result in ESM-related errors.

These should be fixed in Metro 0.82.3 (for React Native 0.79) or Metro 0.81.5 (if you opted in to `exports` support in older React Native versions).
