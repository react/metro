---
id: bundling
title: Bundling
---

*Bundling* turns your app's source files into a *bundle*: the JavaScript your app loads at runtime. A bundle contains every [module](./Concepts.md#module) reachable from the [entry point](./Concepts.md#entry-point), [transformed](./Concepts.md#transformation) into code the app's JavaScript engine can run, and combined by Metro's [serializer](./Concepts.md#serialization).

## Building a bundle

You can get a bundle from Metro:

- **From the development server**, by requesting the entry point's path with `.bundle` instead of `.js`, e.g. `http://localhost:8081/index.bundle?platform=ios`. This is how React Native apps load their code in development. See [URL and bundle request](./GettingStarted.md#url-and-bundle-request).
- **As build output**, with `npx react-native bundle` for React Native release builds, [`metro build`](./CLI.md#build-entry), or [`runBuild`](./API.md#async-runbuildconfig-options).

To build a bundle, Metro:

1. [Resolves](./Concepts.md#resolution) and [transforms](./Concepts.md#transformation) the entry point and, recursively, every module it depends on, building the [dependency graph](./Concepts.md#dependency-graph).
2. Assigns each module a numeric ID, using [`serializer.createModuleIdFactory`](./Configuration.md#createmoduleidfactory).
3. [Serializes](./Concepts.md#serialization) the graph into a bundle, in this order:
   - Variable declarations Metro's runtime relies on, such as `__DEV__`.
   - [Scripts](#scripts): Metro's module system and polyfills.
   - Each [module](#modules), wrapped in a `__d` call.
   - Calls that run the modules from [`serializer.getModulesRunBeforeMainModule`](./Configuration.md#getmodulesrunbeforemainmodule), then the entry point.

## Modules

Each module's code is wrapped in a function and registered under its numeric ID. For example, an `index.js` that requires `./Button` becomes (simplified, non-dev build):

```js
// index.js: module ID 0, depends on module 1
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  var Button = require(_dependencyMap[0]);
  Button.render();
}, 0, [1]);
// Button.js: module ID 1, no dependencies
__d(function (/* same parameters */) {
  module.exports = {render: function () {}};
}, 1);
__r(0);
```

`__d` registers a module under its ID, and `__r` runs a module by ID. Both are defined by Metro's runtime, included at the start of the bundle. In development builds, each `__d` call also gets the module's path as a last argument, e.g. `"index.js"`.

Modules refer to each other by numeric IDs assigned at build time, not by path. That's why `require()` needs a path known at build time, and dynamic requires such as `require('./images/' + name)` aren't supported (see [`require()`](./ModuleAPI.md#require)).

### Scripts

Metro's runtime and the polyfills from [`serializer.getPolyfills`](./Configuration.md#getpolyfills) and [`serializer.polyfillModuleNames`](./Configuration.md#polyfillmodulenames) are transformed as *scripts* instead of modules, and placed at the start of the bundle, before the modules. A script:

- Is wrapped in a function that runs as soon as the bundle loads, with the global object as its `global` argument, instead of in a `__d` call.
- Is not registered as a module, so it has no module ID and can't be required.
- Has no dependencies: its `require()` calls are left as they are, and nothing they refer to is added to the bundle.

For example, React Native's [`console.js`](https://github.com/facebook/react-native/blob/main/packages/polyfills/console.js) polyfill sends `console.log`, `console.warn` and `console.error` to the native log through `global.nativeLoggingHook`, so they work in every module, including the first one to run. In the bundle, it becomes (simplified):

```js
(function (global) {
  if (global.nativeLoggingHook) {
    global.console = {
      ...global.console,
      log: (...args) => global.nativeLoggingHook(args, /* level */ 1),
      warn: (...args) => global.nativeLoggingHook(args, /* level */ 2),
      error: (...args) => global.nativeLoggingHook(args, /* level */ 3),
    };
  }
})(globalThis);
```

## Bundle formats

You only need the formats below if you work with Metro's output directly, e.g. in a tool or native loader that reads bundles. Metro can write two kinds of bundles:

- [Plain bundle](#plain-bundle): All modules in one JS file, as in the examples above.
- [RAM bundle](#ram-bundles): RAM (Random Access Modules) bundles store each module separately, so the app can load a module's code only when it's first required.

:::note

React Native doesn't use RAM bundles with Hermes, its default engine. See [RAM bundles](#ram-bundles).

:::

### Plain bundle

The standard format, for environments that expect a single JS file, such as React Native or a browser: the [scripts](#scripts) and [modules](#modules) described above, concatenated into one file. The development server serves it, and `npx react-native bundle` writes it for release builds.

For example, the `index.js` and `Button.js` [above](#modules) become this bundle (simplified, non-dev build):

```js
var __DEV__ = false, process = globalThis.process || {};
(function (global) {
  // Metro's module system, which defines __d and __r
})(globalThis);
(function (global) {
  // a polyfill
})(globalThis);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  var Button = require(_dependencyMap[0]);
  Button.render();
}, 0, [1]);
__d(function (/* same parameters */) {
  module.exports = {render: function () {}};
}, 1);
__r(0);
```

### RAM bundles

A RAM bundle stores each module's code separately, either in its own file or at its own offset in a single file. A runtime that parses JavaScript source can then parse only the startup code at launch, and each module when it's first required, instead of the whole bundle. With [inline requires](./Configuration.md#gettransformoptions), a module is required, and so parsed, only when code first uses it, not when a file that imports it loads. This helps when parsing a large bundle slows startup. Metro only writes RAM bundles as build output; the development server doesn't serve them.

:::note

In React Native, RAM bundles were designed for JavaScriptCore, and aren't used with Hermes, React Native's default engine.

:::

Hermes runs bytecode compiled at build time, so there's no source to parse at startup, and it memory-maps the bytecode, loading only the parts that run. A plain bundle compiled to Hermes bytecode already gets the benefit a RAM bundle would give. React Native's legacy architecture is also the only one that can load RAM bundles, and React Native doesn't write them by default: its release builds run its `bundle` command, which writes a [plain bundle](#plain-bundle), unless configured to run a different command (`bundleCommand` in the Android Gradle plugin, `BUNDLE_COMMAND` for iOS's `react-native-xcode.sh`).

For example, as a [file RAM bundle](#file-ram-bundle), the `index.js` and `Button.js` [above](#modules) become these files (simplified, non-dev build):

```js
// index.android.bundle: the startup code, run when the bundle loads
var __DEV__ = false, process = globalThis.process || {};
(function (global) {
  // Metro's module system, which defines __d and __r
})(globalThis);
__r(0);

// js-modules/0.js: loaded when module 0 is first required
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  var Button = require(_dependencyMap[0]);
  Button.render();
}, 0, [1]);

// js-modules/1.js: loaded when module 1 is first required
__d(function (/* same parameters */) {
  module.exports = {render: function () {}};
}, 1);

// js-modules/UNBUNDLE: marks the bundle as a file RAM bundle.
// Contains only the magic number 0xFB0BD1E5, as 4 binary bytes.
```

When `__r` or `require` is called with a module that isn't registered yet, Metro's module system calls `global.nativeRequire` with its ID, and the app loads and runs that module's code, which registers it.

#### Writing a RAM bundle

Pass `require('metro/private/shared/output/RamBundle')` as the `output` option of [`runBuild`](./API.md#async-runbuildconfig-options). Metro picks the format based on the platform:

- [Indexed](#indexed-ram-bundle) for every platform except Android. On iOS, reading hundreds of separate files is slow, so all modules go in one file and are read by offset.
- [File](#file-ram-bundle) for Android. APKs are zip archives, where reading one small file is fast, but reading one module from a large file would require unzipping all of it.

To write the indexed format for Android, call the output's `save` with `indexedRamBundle: true` in its output options. `runBuild` doesn't set this option.

#### Indexed RAM bundle

A single binary file. All numbers are little-endian `uint32`s:

```text
magic number          0xFB0BD1E5
number of entries     highest module ID + 1
startup code length
offset, length        one pair per module ID
startup code          followed by \0
module code           followed by \0, one per module
```

Offsets are relative to the start of the startup code, and lengths include the null byte, so a module's code can also be read as a null-terminated string. The entry for module `x` is at byte `(3 + 2 * x) * 4`, and the startup code starts right after the table, at byte `(3 + 2 * numEntries) * 4`. The entries of modules grouped with [`ramGroups`](./Configuration.md#gettransformoptions) all point to the same code, which contains the whole group.

The startup code runs when the bundle loads: polyfills, Metro's module system, [`preloadedModules`](./Configuration.md#gettransformoptions), and the call that runs the entry point.

#### File RAM bundle

The startup code is written to the bundle output file, and each module to `js-modules/${id}.js` next to it. `js-modules/UNBUNDLE`, which contains only the magic number `0xFB0BD1E5`, marks the bundle as a file RAM bundle.
