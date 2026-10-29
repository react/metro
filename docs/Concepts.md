---
id: concepts
title: Concepts
---

Metro is React Native's default JavaScript bundler. It takes an entry file and various options, and returns a single JavaScript file containing all your code and its dependencies: a _bundle_.

Starting a React Native app in development (e.g. `npx react-native start`) starts a Metro server. Your app downloads its bundle from it, and Metro keeps the bundle updated as you edit files, powering [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

This page defines the terms used throughout the Metro docs.

## Bundling stages

Metro's bundling process has three separate stages: resolution, transformation and serialization.

### Resolution

A _resolver_ finds which file each `import` or `require` refers to, so that Metro can build the [dependency graph](#dependency-graph). For example, the resolver decides that `import Button from './Button'` refers to `./Button.ios.js` in an iOS bundle.

This actually runs in parallel with transformation, as Metro discovers each module's dependencies while transforming it. See [Module Resolution](./Resolution.md) for the full algorithm. To customize resolution, set [`resolver.resolveRequest`](./Configuration.md#resolverequest) to your own resolver.

### Transformation

A _transformer_ converts (transpiles) every module to a format the target platform (e.g. React Native) understands. For example, the default transformer uses [Babel](https://babeljs.io/) to compile JSX, TypeScript and Flow syntax. Modules are transformed in parallel, based on your number of cores, and the results are [cached](./Caching.md). To customize how each file's code is compiled, set [`transformer.babelTransformerPath`](./Configuration.md#babeltransformerpath); to replace the whole transformer, set [`transformerPath`](./Configuration.md#transformerpath).

### Serialization

Once all modules are transformed, a _serializer_ combines them, along with Metro's module runtime, into one or more bundles: JavaScript files your app can load and run. See [Bundling](./Bundling.md). To customize serialization, set [`serializer.customSerializer`](./Configuration.md#customserializer).

## Terminology

### Module

A single file in a bundle: a JavaScript (or TypeScript, JSON, etc.) source file, or an asset such as an image. Each module is assigned a numeric ID in the bundle ([example](./Bundling.md#modules)).

### Entry point

The module a bundle is built from. Metro follows its dependencies recursively to find every module the bundle needs. In a React Native app, this is typically `index.js` in the project root.

### Dependency graph

All modules reachable from an entry point, and the dependencies between them. During development, Metro keeps this graph in memory and updates it incrementally when [files change](#file-watching), instead of rebuilding the whole bundle.

### Platform

The platform a bundle is built for, e.g. `ios` or `android`. Metro uses it to pick [platform-specific files](https://reactnative.dev/docs/platform-specific-code) such as `Button.ios.js` or `Button.android.js`. See [`resolver.platforms`](./Configuration.md#platforms).

### Project root and watch folders

Metro only knows about files inside the [`projectRoot`](./Configuration.md#projectroot) and [`watchFolders`](./Configuration.md#watchfolders) directories: it crawls them on startup, keeps an in-memory map of their files, and [watches them for changes](#file-watching). A file outside them can't be part of a bundle, even if it exists on disk, a common monorepo issue. For example, if the project root is `apps/mobile` and it imports `packages/ui` (symlinked into `node_modules`), `packages/ui` must be in `watchFolders`.

### File watching

With file watching enabled, Metro listens for files being added, changed or deleted in the [project root and watch folders](#project-root-and-watch-folders), and updates its file map and [dependency graph](#dependency-graph); this is how the development server picks up edits for Fast Refresh. Otherwise, Metro only sees files as they were at startup.

The [JavaScript API](./API.md)'s `watch` option controls watching. If unset, Metro watches unless the `CI` environment variable is set (to a value other than `0` or `false`). [`runBuild`](./API.md#async-runbuildconfig-options) never watches.

Metro uses [Watchman](https://facebook.github.io/watchman/) if installed (unless [`resolver.useWatchman`](./Configuration.md#usewatchman) is `false`), otherwise native file system events on macOS, or a Node.js-based watcher elsewhere. See [Watcher Options](./Configuration.md#watcher-options) to configure it.

### Haste

An opt-in module system in which modules are imported by a globally unique name instead of a path, e.g. `import Foo from 'Foo'` instead of `import Foo from '../components/Foo'`, wherever `Foo.js` lives in the project. Most React Native apps don't use Haste. See [`resolver.hasteImplModulePath`](./Configuration.md#hasteimplmodulepath).
