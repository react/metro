---
id: cli
title: Metro CLI Options
---

The `metro` CLI has three commands:

- [`build`](#build-entry): Builds a bundle.
- [`serve`](#serve): Runs a development server.
- [`get-dependencies`](#get-dependencies-entryfile): Lists the files in a bundle.

Run `npx metro <command>`; `metro --help` shows all options.

React Native apps typically use `npx react-native start` and `npx react-native bundle` instead, which call the same APIs, [`runServer`](./API.md#async-runserverconfig-options) and [`runBuild`](./API.md#async-runbuildconfig-options), with React Native's configuration.

## `build <entry>`

Builds a bundle from the given [entry point](./Concepts.md#entry-point) and its dependencies, and writes it to `--out`. Equivalent to [`runBuild`](./API.md#async-runbuildconfig-options).

```bash
npx metro build index.js --out bundle.js --platform ios
```

### Options

| Option   | Alias    | Description    | Value |
|----------|----------|----------|----------|
| `out`    | `O` | Output file name (required) | String |
| `platform` | `p` | [Platform](./Concepts.md#platform) to bundle for (e.g. `web`, `android`, `ios`) | String |
| `minify` | `z` | Minify the bundle | Boolean |
| `dev` | `g` | Create a development build, in which `__DEV__` is `true` | Boolean |
| `config` | `c` | Path to the `metro.config.js` to use | String |
| `max-workers` | `j` | Number of transformer workers. Overrides [`maxWorkers`](./Configuration.md#maxworkers) which defaults to a number based on `os.availableParallelism()` | Number |
| `source-map` |  | Generate a source map | Boolean |
| `source-map-url` |  | Source map URL (e.g. `--source-map --source-map-url bundle.map` adds `//# sourceMappingURL=bundle.map` to the bundle) | String |
| `resolver-option` |  | [Custom resolver options](./Resolution.md#customresolveroptions-string-mixed) as URL-encoded `key=value`. Repeatable (e.g. `--resolver-option foo=bar --resolver-option baz=1` passes `{foo: 'bar', baz: '1'}`) | Array |
| `transform-option` | `transformer-option` | Custom transform options as URL-encoded `key=value`. Repeatable (e.g. `--transform-option foo=a%20b` passes `{foo: 'a b'}`) | Array |
| `reset-cache` |  | **Deprecated.** Clear Metro's caches before building, like [`resetCache`](./Configuration.md#resetcache) | Boolean |
| `project-roots` | `P` | Accepted but ignored | Array |
| `legacy-bundler` |  | Accepted but ignored | Boolean |
| `output-type` | `t` | Accepted but ignored | String |

## `serve`

Alias: `start`

Starts a Metro development server that builds bundles on request, and restarts it when the config file changes. Equivalent to [`runServer`](./API.md#async-runserverconfig-options).

```bash
npx metro serve --port 8082
```

### Options

| Option   | Alias    | Description    | Value |
|----------|----------|----------|----------|
| `host` | `h` | Host to listen on. Defaults to `localhost` | String |
| `port` | `p` | Port to listen on. Defaults to `8081`, overriding [`server.port`](./Configuration.md#port) | Number |
| `config` | `c` | Path to the `metro.config.js` to use | String |
| `max-workers` | `j` | Number of transformer workers. Overrides [`maxWorkers`](./Configuration.md#maxworkers) which defaults to a number based on `os.availableParallelism()` | Number |
| `secure-server-options` | `s` | HTTPS server options, in dot notation (e.g. `-s.cert="$(cat path/to/cert)" -s.key="$(cat path/to/key)"`) | Object |
| `secure` |  | **Deprecated.** Serve over HTTPS. Use `secure-server-options` instead | Boolean |
| `secure-key` |  | **Deprecated.** Path to the key file for HTTPS when `secure` is set | String |
| `secure-cert` |  | **Deprecated.** Path to the cert file for HTTPS when `secure` is set | String |
| `reset-cache` |  | **Deprecated.** Clear Metro's caches on startup, like [`resetCache`](./Configuration.md#resetcache) | Boolean |
| `project-roots` | `P` | Accepted but ignored | Array |
| `hmr-enabled` | `hmr` | Accepted but ignored | Boolean |

## `get-dependencies [entryFile]`

Lists all files bundled for a given [entry point](./Concepts.md#entry-point) as absolute paths, one per line, including every resolution of an asset. For example, `npx metro get-dependencies "$PWD/index.js" --platform ios` prints:

```text
/path/to/app/index.js
/path/to/app/App.js
/path/to/app/logo.png
/path/to/app/logo@2x.png
```

### Options

| Option | Description | Value |
|---|---|---|
| `entry-file` | Absolute path to the root JS file. Or pass it as the first positional argument | String |
| `output` | Output file name, e.g. `/tmp/dependencies.txt` | String |
| `platform` | [Platform](./Concepts.md#platform) extension used for selecting modules | String |
| `transformer` | Custom transformer to use | String |
| `max-workers` | Maximum number of transformer workers. Overrides [`maxWorkers`](./Configuration.md#maxworkers) which defaults to a number based on `os.availableParallelism()` | Number |
| `dev` | If `false`, skip dev-only code paths. Defaults to `true` | Boolean |
| `verbose` | Enables logging. Defaults to `false` | Boolean |
