---
id: module-api
title: Module API
---

This page describes the module APIs available to your app's code when Metro bundles it. Metro is designed to allow code written for Node (or for bundlers targeting the Web) to run mostly unmodified.

## `require()`

Similar to Node's [`require()`](https://nodejs.org/api/modules.html#requireid) function, it takes a module name (or path) and returns the result of evaluating that module's code. Metro adds every module referenced by `require()` to the bundle.

```js
const localModule = require('./path/module');
const asset = require('./path/asset.png');
const jsonData = require('./path/data.json');
const {View} = require('react-native');
```

The argument to `require()` must be a compile-time constant, such as a string literal, so that Metro knows at build time which modules to include. A non-constant argument, e.g. `require('./images/' + name + '.png')`, fails at build time, except in files inside `node_modules`, where the [`dynamicDepsInPackages`](./Configuration.md#dynamicdepsinpackages) config option controls whether it fails at build time or at runtime.

### Advanced usage: `require` at runtime

At build time, Metro [resolves](./Concepts.md#resolution) module names to absolute paths and [assigns an opaque module ID](./Configuration.md#createmoduleidfactory) to each one.

At runtime, `require` refers to a function that takes an opaque module ID (*not* a name or path) and returns a module. This is useful if you already have a module ID from another module API, such as [`require.resolveWeak`](#requireresolveweak).

```js
const localModule = require('./path/module');
const id = require.resolveWeak('./path/module');
// Bypass the restriction on non-constant require() arguments
const dynamicRequire = require;
dynamicRequire(id) === localModule; // true
```

## `module.exports`

Similar to [`module.exports`](https://nodejs.org/api/modules.html#moduleexports) in Node: holds the value `require()` returns for the current module after it finishes evaluating.

## ES Modules syntax (`import` and `export`)

To support `import` and `export` in Metro projects, we recommend using [`@babel/plugin-transform-modules-commonjs`](https://babeljs.io/docs/babel-plugin-transform-modules-commonjs).

:::note
In React Native projects that use `@react-native/babel-preset`, `import` and `export` are supported out of the box.
:::

## `import()` (dynamic import)

[`import()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import) calls are supported out of the box. In React Native, using `import()` automatically splits your application code so that it loads faster during development, without affecting release builds.

:::info
**For framework implementers**:
1. Enable [lazy bundling](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0605-lazy-bundling.md) by adding `&lazy=true` to the initial HTTP bundle URL your framework requests from Metro.
2. At runtime, `import()` calls a framework-defined function to [fetch and evaluate](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0605-lazy-bundling.md#__loadbundleasync-in-metro) the split bundle. Your framework **must** implement this function if it uses the `lazy=true` parameter, or runtime errors will occur.

   For example, if the initial bundle URL is `/index.bundle?platform=ios&dev=true&lazy=true`, then `import('./src/Settings')` calls `global.__loadBundleAsync('/src/Settings.bundle?platform=ios&dev=true&lazy=true&modulesOnly=true&runModule=false')` before evaluating the module.
:::

## `require.resolveWeak()`

Takes a module name (or path) and returns that module's opaque ID, without including it in the bundle. A specialised API for frameworks; application code rarely needs it. See [using `require` at runtime](#advanced-usage-require-at-runtime).
