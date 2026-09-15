---
id: package-exports
title: Package Exports Support (New)
---

## Background

Introduced in Node.js 12.7.0, Package Exports is a modern approach for npm packages to specify **entry points** — the mapping of package subpaths which can be externally imported and which file(s) they should resolve to, via the `exports` field in `package.json` files. 

`exports` also supports different targets for a given subpath dependent on [*conditions*](https://nodejs.org/api/packages.html#conditional-exports), such as whether building for a browser or Node.js, and whether `import` or `require` is used by the consumer.

Package Exports support has been enabled by default in Metro since [0.82](https://github.com/react/metro/releases/tag/v0.82.0) (or React Native 0.79).

- [Node.js spec](https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points)
- [RFC for Package Exports in Metro](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0534-metro-package-exports-support.md)
- [React Native 0.79 release blog](https://reactnative.dev/blog/2025/04/08/react-native-0.79#metro-faster-startup-and-package-exports-support)

## Configuration options

| Option | Description |
| --- | --- |
| [`resolver.unstable_enablePackageExports`](/docs/configuration/#unstable_enablepackageexports-experimental) | Enable/disable Package Exports support. |
| [`resolver.unstable_conditionNames`](/docs/configuration/#unstable_conditionnames-experimental) | The set of condition names to assert when resolving conditional exports. |
| [`resolver.unstable_conditionsByPlatform`](/docs/configuration/#unstable_conditionsbyplatform-experimental) | The additional condition names to assert when resolving for a given platform target. |

## How Metro applies `import`/`require` exports conditions

Like Node.js, Metro will always assert `'import'` or `'require'` condition, but never both. It does that based on whether the dependency being resolved uses `import` (or `await import()`), vs `require()` in your source file. 

Unlike Node.js, Metro allows `import .. from` and `require()` to appear in the same file. So if you need the CommonJS version of a dependency, you may simply change the `import` to a `require()`.

:::info
Metro does this by collecting the source locations of your `import`s before any transforms, applying transforms that convert `import`s to `require`s for bundling, and then checking whether a `require` is source mapped to what used to be an `import`. If you're using `import` and Metro resolves as if you used `require`, it's possible you have a custom Babel transform that's dropping the source mapping of your dependency - check your Babel configuration to see which transforms you're using.
:::

## Summary of breaking changes

:::info
**Package Exports resolution was introduced as an opt-in in Metro 0.76.1 and opt-out from Metro 0.82.0**. We will provide the option to disable it for several further releases, and have no plans to remove existing non-`"exports"` resolution behaviour.
:::

Since Package Exports features overlap with existing React Native concepts (such as [platform-specific extensions](https://reactnative.dev/docs/platform-specific-code)), and since `"exports"` had been live in the npm ecosystem for some time, we reached out to the React Native community to make sure our implementation would meet developers' needs ([PR](https://github.com/react-native-community/discussions-and-proposals/pull/534), [final RFC](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0534-metro-package-exports-support.md)).

This led us to create an implementation of Package Exports in Metro that is spec-compliant (necessitating some breaking changes), but backwards compatible otherwise (helping apps with existing imports to migrate gradually).

### Breaking: If an `"exports"` match is found, it is preferred

In common with other resolvers, the `exports` field takes precedence over `main`, etc. In some cases this will mean existing dependencies resolve differently (commonly, a package that previously resolved to a CommonJS version via `main` could now resolve to an ESM version via `exports`), which changes the content of your bundle.

If the package author has not designed the newly-preferred implementation to work with Metro or React Native, this may appear as an issue at runtime.

#### Example

If your dependency `some-pkg` has the following `package.json`

```json
{
  "name": "some-pkg",
  "version": "1.0.0",
  "main": "./dist/cjs/index.js",
  "exports": {
    ".": {
      "import": "./dist/esm/index.mjs",
      "require": "./dist/cjs/index.js"
    }
  }
}
```

Metro would previously have bundled `./dist/cjs/index.js` via `main`. But now, if your code uses:
```js
import Foo from 'some-pkg';
```
Metro will bundle `'./dist/esm/index.mjs'` via `exports`, applying the `import` condition.

If you write:
```js
const Foo = require('some-pkg');
```
It would (in this case, and commonly) apply the `'require'` condition instead and resolve the same file as before `exports` support.

### Breaking: Match `"exports"` first, then fall back to legacy resolution

If present in a `package.json` file, `"exports"` will be the first field consulted when resolving a package.

- `"exports"` will be used instead of any existing `"react-native"`, `"browser"`, or `"main"` field — or a file on disk at the same subpath (edge case).
- **Fallback**: If the requested subpath is not matched in `"exports"`, Metro will try to resolve it again, considering the above fields.

Subpaths matched in `"exports"` (including via [subpath patterns](https://nodejs.org/docs/latest-v19.x/api/packages.html#subpath-patterns)) will use the exact target file path specified by a package.
  - Metro will not expand [`sourceExts`](/docs/configuration/#sourceexts) against the import specifier.
  - Metro will not resolve [platform-specific extensions](https://reactnative.dev/docs/platform-specific-code) against the target file.
  - **Unchanged**: Metro will expand [asset densities](/docs/configuration#assetresolutions) (e.g. `icon.png` → `icon@2x.png`) if the target file [is an asset](/docs/configuration/#assetexts).

#### Example

For a package without an `"exports"` field, Metro tries multiple potential file locations based on the import specifier:

```js
import FooComponent from 'some-pkg/FooComponent';
// Tries .[platform].js, .native.js, .js (+ TypeScript variants)
```

However, if `"./FooComponent"` is listed in `"exports"`, Metro matches the import specifier to this subpath, and uses the target file specified by the package with no further rules:

```js
import FooComponent from 'some-pkg/FooComponent';
// Resolves exact target from "exports" only
```

:::note
We have no plans to drop platform-specific extensions for packages not using `"exports"`, or in app code.
:::

### Breaking: Import specifiers are matched exactly

Previously, import specifiers (the string given to `import` or `require()`) could be defined using both extensioned or extensionless paths. This is no longer the case for subpath keys in the `"exports"` field.

#### Example

```json
{
  "name": "some-pkg",
  "exports": {
    "./FooComponent": "./src/FooComponent.js"
  }
}
```

```js
import FooComponent from 'some-pkg/FooComponent.js';
// Inaccessible unless the package had also listed "./FooComponent.js"
// as an "exports" key
```

Note that this behaviour also applies for subpath patterns: `"./*": "./src/*.js"` is distinct from `"./*.js": "./src/*.js"`.

### Package encapsulation is lenient

In Node.js, it is an error to import package subpaths that aren't explicitly listed in `"exports"`. In Metro, we've decided to handle these errors leniently and resolve modules following the old behavior as necessary. This is intended to reduce user friction for previously allowed imports in existing Metro projects.

Instead of throwing an error, Metro will log a warning and fall back to file-based resolution.

```sh
warn: You have imported the module "foo/private/fn.js" which is not listed in
the "exports" of "foo". Consider updating your call site or asking the package
maintainer(s) to expose this API.
```

:::note
We plan to implement a strict mode for package encapsulation in future, to align with Node's default behavior. **We recommend that all developers fix encapsulation warnings in their code**.
:::

## Migration guide for package maintainers

**Adding an `"exports"` field to your package is entirely optional**. Existing package resolution features will behave identically for packages which don't use `"exports"` — and we have no plans to remove this behaviour.

### Recommended: Introducing `"exports"` is a breaking change

The Node.js spec gives guidance on migrating to `"exports"` in a non-breaking manner, however this is challenging in practice. For instance, if your React Native package uses [platform-specific extensions](https://reactnative.dev/docs/platform-specific-code) on its public exports, this is a breaking change by default.

> To make the introduction of `"exports"` non-breaking, ensure that every previously supported entry point is exported. It is best to explicitly specify entry points so that the package's public API is well-defined.
>
> — https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points

### Package subpaths

:::caution
**Please do not rely on [lenient package encapsulation](#package-encapsulation-is-lenient) under Metro.** While Metro does this for backwards compatibility, packages should follow how `"exports"` is documented in the spec and strictly implemented by other tools.
:::

#### File extensions are important!

Each subpath is an exact specifier ([see section in RFC](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0534-metro-package-exports-support.md#exact-path-specifiers)).

We recommend continuing to use **extensionless specifiers** for subpaths in packages targeting React Native — or **defining both extensioned and extensionless specifiers**. This will match matching existing user expectations.

```json
  "exports": {
    ".": "./src/index.js",
    "./FooComponent": "./src/FooComponent.js",
    "./FooComponent.js": "./src/FooComponent.js"
  }
```

#### Subpath patterns do not permit expansion

Subpath patterns are a shorthand for mapping multiple subpaths — they do not permit path expansion (strictly a substring replacement), however will match nested directories ([see section in RFC](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0534-metro-package-exports-support.md#subpath-patterns)).

Only one `*` is permitted per side of a subpath pattern.

```json
  "exports": {
    ".": "./index.js",
    "./utils/*": "./utils/*.js"
  }
```

- `'pkg/utils/foo'` matches `'pkg/utils/foo.js'`.
- `'pkg/utils/foo/bar'` matches `'pkg/utils/foo/bar.js'`.
- `'pkg/utils/foo'` **does not match** `'pkg/utils/foo.bar.js'`.

### Replacing `"browser"` and `"react-native"` fields

We've introduced `"react-native"` as a community condition (for use with conditional exports). This represents React Native, the framework, sitting alongside other recognised runtimes such as `"node"` and `"deno"` ([RFC](https://github.com/nodejs/node/pull/45367)).

> [Community Conditions Definitions — **`"react-native"`**](https://nodejs.org/docs/latest-v19.x/api/packages.html#community-conditions-definitions)
>
> _Will be matched by the React Native framework (all platforms). To target React Native for Web, "browser" should be specified before this condition._

This replaces the previous `"react-native"` root field. The priority order for how this was previously resolved was determined by projects, [which created ambiguity when using React Native for Web](https://github.com/expo/router/issues/37#issuecomment-1275925758). Under `"exports"`, _packages concretely define the resolution order for conditional entry points_ — removing this ambiguity.

#### Example: Use conditional exports to target web and React Native

```json
  "exports": {
    "browser": "./dist/index-browser.js",
    "react-native": "./dist/index-react-native.js",
    "default": "./dist/index.js"
  }
```

:::note
We chose not to introduce `"android"` and `"ios"` conditions, due to the prevalence of other existing platform selection methods, and the complexity of how this behavior might work across frameworks. We recommend the [`Platform.select()`](https://reactnative.dev/docs/platform#select) API instead.
:::

### Replacing platform-specific extensions

> **Breaking change**: Subpaths matched in `"exports"` (including via [subpath patterns](https://nodejs.org/docs/latest-v19.x/api/packages.html#subpath-patterns)) will use the exact file path specified by a package, and will not attempt to expand `sourceExts` or platform-specific extensions.

#### Use [`Platform.select()`](https://reactnative.dev/docs/platform#select) (React Native)

```json
  "exports": {
    "./FooComponent": "./src/FooComponent.js"
  }
```

```js
// src/FooComponent.js

const FooComponent = Platform.select({
  android: require('./FooComponentAndroid.js'),
  ios: require('FooComponentIOS.js'),
});

export default FooComponent;
```

### Asset files

As with source files, assets must be listed in `"exports"` to be imported without warnings. Asset files with [multiple densities](/docs/configuration#assetresolutions), e.g. `icon.png` and `icon@2x.png`, will continue to work without being listed individually.

Using subpath patterns can be a convenient method to export many assets. We recommend specifying asset subpaths **with their file extension**.

```json
{
  "exports": {
    "./assets/*.png": "./dist/assets/*.png"
  }
}
```

## Troubleshooting

### Package/ESM incompatibilites
Some issues that can come from Metro resolving to a file not designed for React Native include:
 - *"`import.meta` can not be used outside a module"*. `import.meta` support is coming.
 - Errors relating to `document` or other web globals in your mobile app.

In these cases, **React Native developers** can:
 - Use `require()` for that dependency to try to get the CommonJS version.
 - Disable `exports` support entirely by setting [`resolver.unstable_enablePackageExports`](/docs/configuration/#unstable_enablepackageexports-experimental) to `false` in your Metro config.
 - (Advanced) use a custom resolver to tweak the behaviour for specific packages, see below.

#### Example: Custom resolver
:::note
Expo users should follow Expo-specific guidance in [this GitHub discussion](https://github.com/expo/expo/discussions/36551#discussion-8271245)
:::

For example, to follow the `browser` condition for a particular dependency `some-pkg` and its subpaths:

```js
// metro.config.js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    resolveRequest: () => {
      (context, moduleImport, platform) {
        // Use the browser version of the package for React Native 
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
    }
  }
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
```

 **Package maintainers** are recommended to use the `react-native` condition to specify the best version of their package for React Native users. Note that this should appear above `import`, `require` or `default`.

#### Previous Metro bugs
Additionally, Metro bugs in earlier implementations may result in:
 - *"`_interopRequireDefault` is not a function"*.
 - Non-deterministic builds that may sometimes result in ESM-related errors.

These should be fixed in Metro 0.82.3 (for React Native 0.79) or Metro 0.81.5 (if opting in `exports` support in older React Native versions). 

