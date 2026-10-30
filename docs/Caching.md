---
id: caching
title: Caching
---

Metro speeds up builds by caching the result of [transforming](./Concepts.md#transformation) each module, and doesn't retransform a module unless its source code (or the current configuration) has changed since.

Cache entries are keyed by the module's path and contents, the transform options and the transformer configuration, e.g. `Button.js` gets separate entries for `platform=ios` and `platform=android`, or for `dev=true` and `dev=false`.

Out of the box, Metro uses a **local cache** on disk, by default in a `metro-cache` directory under your OS's temp directory. It can also use a **remote cache** shared by your team, so developers don't each transform the same changes locally. This can dramatically speed up builds for larger teams and codebases. It's how we build React Native apps at Meta (a codebase with many thousands of files and hundreds of daily active engineers).

## Setting up a remote cache

A typical setup involves:

1. A storage backend specific to your team (e.g. an S3 bucket).
2. Running [`metro build`](./CLI.md#build-entry) periodically (e.g. in a CI job) to populate the cache, using `HttpStore` (or a custom read/write cache store) in your Metro config.
3. Configuring Metro on development machines to read from the cache, using `HttpGetStore` (or a custom read-only cache store).

Caches are configured with [`cacheStores`](./Configuration.md#cachestores). Metro reads the stores in order and uses the first hit, then writes the result to every store listed before the one that hit (or to all of them, on a miss). So the local cache (e.g. `FileStore`) should usually come first, followed by the remote cache (e.g. `HttpStore` or `HttpGetStore`): a result found only remotely is then copied into the local cache for the next build. For example, on development machines:

```js
// metro.config.js
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const os = require('node:os');
const path = require('node:path');

module.exports = mergeConfig(getDefaultConfig(__dirname), {
  cacheStores: ({FileStore, HttpGetStore}) => [
    new FileStore({root: path.join(os.tmpdir(), 'metro-cache')}),
    new HttpGetStore({endpoint: 'https://metro-cache.example.com'}),
  ],
});
```

## Built-in cache stores

Metro provides these stores for use with [`cacheStores`](./Configuration.md#cachestores):

- **`FileStore({root: string})`** stores cache entries as files under `root`, named after the hex-encoded key: a key starting with `c083bf...` is stored in `<root>/c0/83bf...`.
- **`AutoCleanFileStore(options)`** <div class="label deprecated">Deprecated</div> is a `FileStore` that periodically cleans up old entries. It accepts `FileStore`'s options plus:
  - **`options.intervalMs: number`**: Milliseconds between cleanup attempts. Defaults to 10 minutes.
  - **`options.cleanupThresholdMs: number`**: Minimum milliseconds since an entry's last modification before it can be deleted. Defaults to 3 days.
- **`HttpStore(options)`** is a bare-bones remote cache client that reads (`GET`) and writes (`PUT`) compressed cache artifacts over HTTP or HTTPS.
  - **`options.endpoint: string`**: Base URL of the cache server. For example, with `'http://www.example.com/endpoint'`, requests go to URLs such as `http://www.example.com/endpoint/c083bff944879d9f528cf185eba0f4962fd4e5b1a6a7d2a1c0bd42c3c0d5f0e1b6a9e7c8` (the hex-encoded cache key).
  - **`options.timeout: number`**: Request timeout in milliseconds. Defaults to 5000.
  - **`options.family: 4 | 6`**: Same as the `family` parameter to Node's [`http.request`](https://nodejs.org/api/http.html#httprequesturl-options-callback).
  - **`options.cert`, `options.ca`, `options.key`**: HTTPS options passed directly to [Node's built-in HTTPS client](https://nodejs.org/api/https.html).
  - **`options.headers: {[string]: string}`**: HTTP headers sent with every request.
  - **`options.params: URLSearchParams`**: Query parameters appended to every request URL.
  - **`options.additionalSuccessStatuses: Array<number>`**: Additional HTTP status codes treated as success.
  - **`options.maxAttempts: number`**: Maximum attempts per request, with exponential backoff. Defaults to 1 (no retries).
  - **`options.retryStatuses: Set<number>`**: HTTP status codes that trigger a retry.
  - **`options.retryNetworkErrors: boolean`**: Whether to retry on network errors. Defaults to `false`.
  - **`options.debug: boolean`**: Whether to include the response body in HTTP error messages. Defaults to `false`.
  - **`options.socketPath: string`**: A Unix domain socket to connect through.
  - **`options.proxy: string`**: A proxy URL to connect through.
  - Alternatively, `options` may be `{getOptions, setOptions}`, each an object with the options above, to use different settings for reads and writes.
- **`HttpGetStore(options)`** is a read-only `HttpStore` with the same options. It treats HTTP and network errors as cache misses (with a one-time warning) instead of failing the build.

Import these classes from the `metro-cache` package, or get them through the function form of `cacheStores` ([example](#setting-up-a-remote-cache)).

## Custom cache stores

For other storage backends, pass an instance of a class with this interface into [`cacheStores`](./Configuration.md#cachestores):

```flow
interface CacheStore<T: Buffer | JsonSerializable> {
  // Optional name used in Metro's cache logs. Defaults to the class name.
  name?: string;

  // Read an entry from the cache. Returns `null` if not found.
  get(key: Buffer): ?T | Promise<?T>;

  // Write an entry to the cache (if writable) or do nothing (if read-only)
  set(key: Buffer, value: T): void | Promise<void>;

  // Clear the cache (if possible) or do nothing
  clear(): void | Promise<void>;
}

type JsonSerializable = /* Any JSON-serializable value */;
```

The value of a cache entry is either an instance of [`Buffer`](https://nodejs.org/api/buffer.html#buffer) or a JSON-serializable value (with unspecified internal structure in both cases). For a given cache key, `get()` _must_ return the same type of value that was passed to `set()`.

For example, a minimal in-memory store, keyed by the hex-encoded key, used as `cacheStores: [new MemoryStore()]`:

```js
class MemoryStore {
  #entries = new Map();

  get(key) {
    return this.#entries.get(key.toString('hex')) ?? null;
  }

  set(key, value) {
    this.#entries.set(key.toString('hex'), value);
  }

  clear() {
    this.#entries.clear();
  }
}
```
