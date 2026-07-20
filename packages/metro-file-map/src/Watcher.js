/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {
  Console,
  CrawlerOptions,
  CrawlResult,
  Path,
  PerfLogger,
  WatcherBackend,
  WatcherBackendChangeEvent,
} from './flow-types';
import type {WatcherOptions as WatcherBackendOptions} from './watchers/common';

import nodeCrawl from './crawlers/node';
import watchmanCrawl from './crawlers/watchman';
import {TOUCH_EVENT} from './watchers/common';
import FallbackWatcher from './watchers/FallbackWatcher';
import NativeWatcher from './watchers/NativeWatcher';
import WatchmanWatcher from './watchers/WatchmanWatcher';
import debugModule from 'debug';
import EventEmitter from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {performance} from 'node:perf_hooks';
import nullthrows from 'nullthrows';

const debug = debugModule('Metro:Watcher');

const MAX_WAIT_TIME = 240000;

type InternalCrawlOptions = Readonly<{
  previousState: CrawlerOptions['previousState'],
  roots: ReadonlyArray<string>,
  subpath?: string,
  useWatchman: boolean,
}>;

type WatcherOptions = {
  abortSignal: AbortSignal,
  computeSha1: boolean,
  console: Console,
  enableSymlinks: boolean,
  extensions: ReadonlyArray<string>,
  healthCheckFilePrefix: string,
  ignoreForCrawl: (filePath: string) => boolean,
  ignorePatternForWatch: RegExp,
  previousState: CrawlerOptions['previousState'],
  perfLogger: ?PerfLogger,
  roots: ReadonlyArray<string>,
  rootDir: string,
  useWatchman: boolean,
  watch: boolean,
  watchmanDeferStates: ReadonlyArray<string>,
};

let nextInstanceId = 0;

export type HealthCheckResult =
  | {type: 'error', timeout: number, error: Error, watcher: ?string}
  | {type: 'success', timeout: number, timeElapsed: number, watcher: ?string}
  | {type: 'timeout', timeout: number, watcher: ?string, pauseReason: ?string};

export class Watcher extends EventEmitter {
  #activeWatcher: ?string;
  #backends: ReadonlyArray<WatcherBackend> = [];
  readonly #instanceId: number;
  #nextHealthCheckId: number = 0;
  readonly #options: WatcherOptions;
  readonly #pendingHealthChecks: Map<
    /* basename */ string,
    /* resolve */ () => void,
  > = new Map();

  constructor(options: WatcherOptions) {
    super();
    this.#options = options;
    this.#instanceId = nextInstanceId++;
  }

  async crawl(): Promise<CrawlResult> {
    this.#options.perfLogger?.point('crawl_start');
    const options = this.#options;

    const result = await this.#crawl({
      previousState: options.previousState,
      roots: options.roots,
      useWatchman: options.useWatchman,
    });

    this.#options.perfLogger?.point('crawl_end');
    return result;
  }

  async recrawl(
    subpath: string,
    currentFileSystem: CrawlerOptions['previousState']['fileSystem'],
  ): Promise<CrawlResult> {
    return this.#crawl({
      previousState: {
        clocks: new Map(),
        fileSystem: currentFileSystem,
      },
      roots: [path.join(this.#options.rootDir, subpath)],
      subpath,
      useWatchman: false,
    });
  }

  async #crawl(crawlOptions: InternalCrawlOptions): Promise<CrawlResult> {
    const options = this.#options;
    const {useWatchman, subpath} = crawlOptions;

    const ignoreForCrawl = (filePath: string) =>
      options.ignoreForCrawl(filePath) ||
      path.basename(filePath).startsWith(this.#options.healthCheckFilePrefix);
    const crawl = useWatchman ? watchmanCrawl : nodeCrawl;
    let crawler = crawl === watchmanCrawl ? 'watchman' : 'node';

    options.abortSignal.throwIfAborted();

    const crawlerOptions: CrawlerOptions = {
      abortSignal: options.abortSignal,
      computeSha1: options.computeSha1,
      console: options.console,
      includeSymlinks: options.enableSymlinks,
      extensions: options.extensions,
      ignore: ignoreForCrawl,
      onStatus: status => {
        this.emit('status', status);
      },
      perfLogger: options.perfLogger,
      previousState: crawlOptions.previousState,
      rootDir: options.rootDir,
      roots: crawlOptions.roots,
      subpath,
    };

    debug('Crawling roots: %s with %s crawler.', crawlOptions.roots, crawler);

    let delta: CrawlResult;
    try {
      delta = await crawl(crawlerOptions);
    } catch (firstError) {
      if (crawl !== watchmanCrawl) {
        throw firstError;
      }
      crawler = 'node';
      options.console.warn(
        'metro-file-map: Watchman crawl failed. Retrying once with node ' +
          'crawler.\n' +
          "  Usually this happens when watchman isn't running. Create an " +
          "empty `.watchmanconfig` file in your project's root folder or " +
          'initialize a git or hg repository in your project.\n' +
          '  ' +
          firstError.toString(),
      );
      try {
        delta = await nodeCrawl(crawlerOptions);
      } catch (retryError) {
        throw new Error(
          'Crawler retry failed:\n' +
            `  Original error: ${firstError.message}\n` +
            `  Retry error: ${retryError.message}\n`,
        );
      }
    }

    debug(
      'Crawler "%s" returned %d added/modified, %d removed, %d clock(s).',
      crawler,
      delta.changedFiles.size,
      delta.removedFiles.size,
      delta.clocks?.size ?? 0,
    );
    return delta;
  }

  async watch(onChange: (change: WatcherBackendChangeEvent) => void) {
    const {extensions, ignorePatternForWatch, useWatchman} = this.#options;

    // WatchmanWatcher > NativeWatcher > FallbackWatcher
    const WatcherImpl = useWatchman
      ? WatchmanWatcher
      : NativeWatcher.isSupported()
        ? NativeWatcher
        : FallbackWatcher;

    let watcher = 'fallback';
    if (WatcherImpl === WatchmanWatcher) {
      watcher = 'watchman';
    } else if (WatcherImpl === NativeWatcher) {
      watcher = 'native';
    }
    debug(`Using watcher: ${watcher}`);
    this.#options.perfLogger?.annotate({string: {watcher}});
    this.#activeWatcher = watcher;

    const createWatcherBackend = (root: Path): Promise<WatcherBackend> => {
      const watcherOptions: WatcherBackendOptions = {
        dot: true,
        globs: [
          // Ensure we always include package.json files, which are crucial for
          /// module resolution.
          '**/package.json',
          // Ensure we always watch any health check files
          '**/' + this.#options.healthCheckFilePrefix + '*',
          ...extensions.map(extension => '**/*.' + extension),
        ],
        ignored: ignorePatternForWatch,
        watchmanDeferStates: this.#options.watchmanDeferStates,
      };
      const watcher: WatcherBackend = new WatcherImpl(root, watcherOptions);

      return new Promise(async (resolve, reject) => {
        const rejectTimeout = setTimeout(
          () => reject(new Error('Failed to start watch mode.')),
          MAX_WAIT_TIME,
        );

        watcher.onFileEvent(change => {
          const basename = path.basename(change.relativePath);
          if (basename.startsWith(this.#options.healthCheckFilePrefix)) {
            if (change.event === TOUCH_EVENT) {
              debug(
                'Observed possible health check cookie: %s in %s',
                change.relativePath,
                root,
              );
              this.#handleHealthCheckObservation(basename);
            }
            return;
          }
          // Watchman handles recrawls internally - receiving a recrawl event
          // when using Watchman would indicate a bug. Log an error and ignore.
          if (change.event === 'recrawl' && useWatchman) {
            this.#options.console.error(
              'metro-file-map: Received unexpected recrawl event while using ' +
                'Watchman. Watchman recrawls are not implemented.',
            );
            return;
          }
          onChange(change);
        });
        await watcher.startWatching();
        clearTimeout(rejectTimeout);
        resolve(watcher);
      });
    };

    this.#backends = await Promise.all(
      this.#options.roots.map(createWatcherBackend),
    );
  }

  #handleHealthCheckObservation(basename: string) {
    const resolveHealthCheck = this.#pendingHealthChecks.get(basename);
    if (!resolveHealthCheck) {
      return;
    }
    resolveHealthCheck();
  }

  async close() {
    await Promise.all(this.#backends.map(watcher => watcher.stopWatching()));
    this.#activeWatcher = null;
  }

  async checkHealth(timeout: number): Promise<HealthCheckResult> {
    const healthCheckId = this.#nextHealthCheckId++;
    if (healthCheckId === Number.MAX_SAFE_INTEGER) {
      this.#nextHealthCheckId = 0;
    }
    const watcher = this.#activeWatcher;
    const basename =
      this.#options.healthCheckFilePrefix +
      '-' +
      process.pid +
      '-' +
      this.#instanceId +
      '-' +
      healthCheckId;
    const healthCheckPath = path.join(this.#options.rootDir, basename);
    let result: ?HealthCheckResult;
    const timeoutPromise = new Promise(resolve =>
      setTimeout(resolve, timeout),
    ).then(() => {
      if (!result) {
        result = {
          type: 'timeout',
          pauseReason: this.#backends[0]?.getPauseReason(),
          timeout,
          watcher,
        };
      }
    });
    const startTime = performance.now();
    debug('Creating health check cookie: %s', healthCheckPath);
    const creationPromise = fs.promises
      .writeFile(healthCheckPath, String(startTime))
      .catch(error => {
        if (!result) {
          result = {
            type: 'error',
            error,
            timeout,
            watcher,
          };
        }
      });
    const observationPromise = new Promise(resolve => {
      this.#pendingHealthChecks.set(basename, resolve);
    }).then(() => {
      if (!result) {
        result = {
          type: 'success',
          timeElapsed: performance.now() - startTime,
          timeout,
          watcher,
        };
      }
    });
    await Promise.race([
      timeoutPromise,
      creationPromise.then(() => observationPromise),
    ]);
    this.#pendingHealthChecks.delete(basename);
    // Chain a deletion to the creation promise (which may not have even settled yet!),
    // don't await it, and swallow errors. This is just best-effort cleanup.
    // $FlowFixMe[unused-promise]
    creationPromise.then(() =>
      fs.promises.unlink(healthCheckPath).catch(() => {}),
    );
    debug('Health check result: %o', result);
    return nullthrows(result);
  }
}
