---
id: module-api
title: Module API
---

Metro is designed to allow code written for Node (or for bundlers targeting the Web) to run mostly unmodified. The main APIs available to application code are listed below.

## `require()`

Similar to Node's [`require()`](https://nodejs.org/api/modules.html#requireid) function. `require()` takes a module name (or path) and returns the result of evaluating that module's code. Modules referenced by `require()` will be added to the bundle.

```js
const localModule = require('./path/module');
const asset = require('./path/asset.png');
const jsonData = require('./path/data.json');
const {View} = require('react-native');
```

The argument to `require()` must be a compile-time constant. The [`dynamicDepsInPackages`](./Configuration.md#dynamicdepsinpackages) config option controls whether calling `require()` with a non-constant argument will fail at build time or at runtime.

### Advanced usage: `require` at runtime

At build time, Metro [resolves](./Resolution.md) module names to absolute paths and [assigns an opaque module ID](./Configuration.md#createmoduleidfactory) to each one.

At runtime, `require` refers to a function that takes an opaque module ID (*not* a name or path) and returns a module. This can be useful if you already have a module ID returned by another module API, such as [`require.resolveWeak`](#requireresolveweak).

```js
const localModule = require('./path/module');
const id = require.resolveWeak('./path/module');
// Bypass the restriction on non-constant require() arguments
const dynamicRequire = require;
dynamicRequire(id) === localModule; // true
```

## `module.exports`

Similar to [`module.exports`](https://nodejs.org/api/modules.html#moduleexports) in Node. The `module.exports` property holds the value `require()` will return for the current module after it finishes evaluating.

## ES Modules syntax (`import` and `export`)

We currently recommend the use of [`@babel/plugin-transform-modules-commonjs`](https://babeljs.io/docs/babel-plugin-transform-modules-commonjs) in Metro projects to support `import` and `export`.

:::note
In React Native projects that use `@react-native/babel-preset`, `import` and `export` are supported out of the box.
:::

## `import()` (dynamic import)

[`import()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import) calls are supported out of the box. In React Native, using `import()` automatically splits your application code so that it loads faster during development, without affecting release builds.

:::info
**For framework implementers**:
1. Enable [lazy bundling](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0605-lazy-bundling.md) by adding `&lazy=true` to the initial HTTP bundle URL your framework requests from Metro.
2. At runtime, `import()` calls a framework-defined function to [fetch and evaluate](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0605-lazy-bundling.md#__loadbundleasync-in-metro) the split bundle. Your framework **must** implement this function if it uses the `lazy=true` parameter, or runtime errors will occur.
:::

## `require.resolveWeak()`

Takes a module name (or path) and returns that module's opaque ID, without including it in the bundle. This is a specialised API intended to be used by frameworks; application code will rarely need to use it directly. See the section about [using `require` at runtime](#advanced-usage-require-at-runtime).
