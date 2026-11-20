/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type {
  MixedOutput,
  TransformResult,
  TransformResultWithSource,
} from '../DeltaBundler';
import type {DynamicRoot} from '../lib/dynamicRoots';
import type {Computed} from './SharedTransformResults';
import type {ReleasedModules} from './types';
import type {TransformerConfig, TransformOptions} from './Worker';
import type {ConfigT} from 'metro-config';

import {getAssetUrlPath} from '../Assets';
import {normalizePathSeparatorsToPosix} from '../lib/pathUtils';
import getTransformCacheKey from './getTransformCacheKey';
import SharedTransformResults from './SharedTransformResults';
import WorkerFarm from './WorkerFarm';
import debugModule from 'debug';
import {Cache, stableHash} from 'metro-cache';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import nullthrows from 'nullthrows';

const debug = debugModule('Metro:Transformer');

type GetOrComputeSha1Fn = (
  filePath: string,
) => Promise<Readonly<{content?: Buffer, sha1: string}>>;

type TransformedData = Readonly<{
  result: TransformResult<>,
  sha1: string,
}>;

type SlotRequest = {
  start: () => void,
  state: 'queued' | 'started' | 'withdrawn',
};

// Limits how many local transforms run at once. Required transforms run first,
// oldest first. Speculative ones (racing a slow cache read) run newest first,
// because the cache answers the oldest reads first, and can be withdrawn or
// promoted to required until they start.
class TransformSlots {
  #free: number;
  #required: Array<SlotRequest> = [];
  #speculative: Array<SlotRequest> = [];

  constructor(size: number) {
    this.#free = Math.max(1, size);
  }

  run<T>(
    task: () => Promise<T>,
    speculative: boolean,
  ): {
    promise: Promise<T>,
    promote: () => void,
    withdraw: () => void,
  } {
    let request: ?SlotRequest;
    const promise = new Promise<void>(resolve => {
      request = {start: resolve, state: 'queued'};
    }).then(async () => {
      try {
        return await task();
      } finally {
        this.#free++;
        this.#drain();
      }
    });
    const queued = nullthrows(request);
    (speculative ? this.#speculative : this.#required).push(queued);
    this.#drain();
    return {
      promise,
      promote: () => {
        if (queued.state === 'queued') {
          this.#required.push(queued);
          this.#drain();
        }
      },
      withdraw: () => {
        if (queued.state === 'queued') {
          queued.state = 'withdrawn';
        }
      },
    };
  }

  #drain() {
    while (this.#free > 0) {
      const next = this.#required.shift() ?? this.#speculative.pop();
      if (next == null) {
        return;
      }
      if (next.state === 'queued') {
        next.state = 'started';
        this.#free--;
        next.start();
      }
    }
  }
}

export default class Transformer {
  _config: ConfigT;
  _cache: Cache<TransformResult<>>;
  _baseHash: string;
  _getDynamicRoots: () => ReadonlyArray<DynamicRoot>;
  _getSha1: GetOrComputeSha1Fn;
  _sharedResults: ?SharedTransformResults<MixedOutput>;
  _workerFarm: WorkerFarm;
  _transformSlots: TransformSlots;

  constructor(
    config: ConfigT,
    opts: Readonly<{
      getDynamicRoots?: () => ReadonlyArray<DynamicRoot>,
      getOrComputeSha1: GetOrComputeSha1Fn,
    }>,
  ) {
    this._config = config;

    this._config.watchFolders.forEach(verifyRootExists);
    this._cache = new Cache(config.cacheStores);
    this._getDynamicRoots = opts.getDynamicRoots ?? (() => []);
    this._getSha1 = opts.getOrComputeSha1;
    this._sharedResults = sharesTransformResults(config)
      ? new SharedTransformResults()
      : null;

    // Remove the transformer config params that we don't want to pass to the
    // transformer. We should change the config object and move them away so we
    // can treat the transformer config params as opaque.
    const {
      getTransformOptions: _getTransformOptions,
      transformVariants: _transformVariants,
      unstable_shareTransformResults: _shareTransformResults,
      unstable_supportsInlineModules: _supportsInlineModules,
      unstable_workerThreads: _workerThreads,
      ...transformerConfig
    } = this._config.transformer;

    const transformerOptions: TransformerConfig = {
      transformerPath: this._config.transformerPath,
      // Babel plugins can emit different code for this, so it must be part of
      // the transform cache key.
      transformerConfig: this._config.resolver.unstable_allowVirtualModules
        ? {...transformerConfig, unstable_supportsInlineModules: true}
        : transformerConfig,
    };

    const globalCacheKey = this._cache.isDisabled
      ? ''
      : getTransformCacheKey({
          cacheVersion: this._config.cacheVersion,
          projectRoot: this._config.projectRoot,
          transformerConfig: transformerOptions,
        });

    const baseHashBuffer = stableHash([globalCacheKey]);
    this._baseHash = baseHashBuffer.toString('binary');
    debug('Base hash: %s', baseHashBuffer.toString('hex'));

    // One queued transform per worker keeps workers busy while the main thread
    // hands out the next one.
    this._transformSlots = new TransformSlots(config.maxWorkers * 2);

    // Start workers last - nothing can end them if the constructor throws.
    this._workerFarm = new WorkerFarm(config, transformerOptions);
  }

  async transformFile(
    filePath: string,
    transformerOptions: TransformOptions,
    fileBuffer?: Buffer,
  ): Promise<TransformResultWithSource<>> {
    const cache = this._cache;

    const {
      customTransformOptions,
      dev,
      experimentalImportSupport,
      inlinePlatform,
      inlineRequires,
      minify,
      nonInlinedRequires,
      platform,
      type,
      unstable_transformProfile,
      unstable_memoizeInlineRequires,
      unstable_nonMemoizedInlineRequires,
      ...extra
    } = transformerOptions;

    for (const key in extra) {
      // $FlowFixMe[cannot-resolve-name]
      if (hasOwnProperty.call(extra, key)) {
        throw new Error(
          'Extra keys detected: ' + Object.keys(extra).join(', '),
        );
      }
    }

    const projectRelativePath = path.relative(
      this._config.projectRoot,
      filePath,
    );
    // Assets are the only modules whose output depends on watchFolders and
    // dynamic roots, via the URL path baked into them, so that dependency
    // enters the cache key per asset here and not in the base hash.
    const assetUrlPath =
      type === 'asset'
        ? getAssetUrlPath(
            filePath,
            this._config.projectRoot,
            this._config.watchFolders,
            this._getDynamicRoots(),
          )
        : null;

    const partialKey = stableHash([
      // This is the hash related to the global Bundler config.
      this._baseHash,

      // Project-relative, posix-separated path for portability. Necessary in
      // addition to content hash because transformers receive path as an
      // input, and may apply e.g. extension-based logic.
      normalizePathSeparatorsToPosix(projectRelativePath),
      assetUrlPath,
      customTransformOptions,
      dev,
      experimentalImportSupport,
      inlinePlatform,
      inlineRequires,
      minify,
      nonInlinedRequires,
      platform,
      type,
      unstable_memoizeInlineRequires,
      unstable_nonMemoizedInlineRequires,
      unstable_transformProfile,
    ]);

    let sha1: string;
    let content: Buffer | void;
    if (fileBuffer) {
      // Shortcut for virtual modules which provide the contents with the filename.
      sha1 = crypto.createHash('sha1').update(fileBuffer).digest('hex');
      content = fileBuffer;
    } else {
      const result = await this._getSha1(filePath);
      sha1 = result.sha1;
      if (result.content) {
        content = result.content;
      }
    }

    const requestedKey = Buffer.concat([partialKey, Buffer.from(sha1, 'hex')]);
    const transformLocally = () =>
      this._workerFarm.transform(
        projectRelativePath,
        transformerOptions,
        content,
        assetUrlPath ?? undefined,
      );
    const hedgeMs = this._config.unstable_hedgeCacheReadsAfterMs;

    const getOrTransform = async (): Promise<Computed<MixedOutput>> => {
      let fullKey = requestedKey;
      // A valid result from the cache is used directly; otherwise we call into
      // the transformer to compute the corresponding result.
      const data: TransformedData =
        hedgeMs == null
          ? await this._getCachedOrTransform(fullKey, sha1, transformLocally)
          : await this._getCachedOrTransformHedged(
              fullKey,
              sha1,
              transformLocally,
              hedgeMs,
            );

      // Only re-compute the full key if the SHA-1 changed. This is because
      // references are used by the cache implementation in a weak map to keep
      // track of the cache that returned the result.
      if (sha1 !== data.sha1) {
        fullKey = Buffer.concat([partialKey, Buffer.from(data.sha1, 'hex')]);
      }

      // Fire-and-forget cache set promise.
      cache.set(fullKey, data.result).catch(error => {
        this._config.reporter.update({
          type: 'cache_write_error',
          error,
        });
      });

      return {key: fullKey, result: data.result};
    };

    const {key, result} =
      this._sharedResults != null
        ? await this._sharedResults.getOrCompute(
            {key: requestedKey, moduleKey: partialKey, path: filePath},
            getOrTransform,
          )
        : await getOrTransform();

    return {
      ...result,
      unstable_transformResultKey: key.toString(),
      getSource: createGetSource(filePath, fileBuffer),
    };
  }

  /**
   * Drops the shared transform results of released modules that no graph
   * holds any more.
   */
  releaseSharedResults(released: ReleasedModules<MixedOutput>): void {
    const shared = this._sharedResults;
    if (shared == null) {
      return;
    }
    const before = shared.countEntries();
    shared.release(released);
    debug(
      'Released %d of %d shared transform results',
      before - shared.countEntries(),
      before,
    );
  }

  async _readCache(fullKey: Buffer): Promise<?TransformResult<>> {
    try {
      return await this._cache.get(fullKey);
    } catch (error) {
      this._config.reporter.update({
        type: 'cache_read_error',
        error,
      });
      throw error;
    }
  }

  async _getCachedOrTransform(
    fullKey: Buffer,
    sha1: string,
    transformLocally: () => Promise<TransformedData>,
  ): Promise<TransformedData> {
    const result = await this._readCache(fullKey);
    return result ? {result, sha1} : await transformLocally();
  }

  // Waits up to `hedgeMs` for the cache; after that, also queues a speculative
  // local transform and uses whichever result comes first. A cache miss turns
  // the speculative transform into a required one.
  async _getCachedOrTransformHedged(
    fullKey: Buffer,
    sha1: string,
    transformLocally: () => Promise<TransformedData>,
    hedgeMs: number,
  ): Promise<TransformedData> {
    const cached = this._readCache(fullKey);
    let timer;
    const early = await Promise.race([
      cached.then(result => ({result})),
      new Promise<void>(resolve => {
        timer = setTimeout(resolve, hedgeMs);
      }),
    ]);
    clearTimeout(timer);
    if (early != null) {
      return early.result
        ? {result: early.result, sha1}
        : await this._transformSlots.run(transformLocally, false).promise;
    }

    const local = this._transformSlots.run(transformLocally, true);
    return await new Promise((resolve, reject) => {
      let cacheMissed = false;
      let localFailure: ?{error: unknown} = null;
      cached.then(
        result => {
          if (result) {
            local.withdraw();
            resolve({result, sha1});
          } else if (localFailure != null) {
            reject(localFailure.error);
          } else {
            cacheMissed = true;
            local.promote();
          }
        },
        error => {
          // A failed read fails the transform, as it does without hedging, so
          // nothing would use the speculative transform's result.
          local.withdraw();
          reject(error);
        },
      );
      local.promise.then(resolve, error => {
        // A local failure decides only once the cache has missed: without
        // hedging, a hit would have served this file.
        if (cacheMissed) {
          reject(error);
        } else {
          localFailure = {error};
        }
      });
    });
  }

  async end(): Promise<void> {
    await this._workerFarm.kill();
  }
}

/**
 * Whether `Transformer` shares results between graphs.
 */
export function sharesTransformResults(config: ConfigT): boolean {
  return config.transformer.unstable_shareTransformResults;
}

// Defined outside `transformFile` because closures created in one scope share
// a context. There, `getSource`, which a graph holds for the module's lifetime,
// would retain what `getOrTransform` captures, including the file's contents.
function createGetSource(filePath: string, fileBuffer: ?Buffer): () => Buffer {
  return () => fileBuffer ?? fs.readFileSync(filePath);
}

function verifyRootExists(root: string): void {
  // Verify that the root exists.
  assert(fs.statSync(root).isDirectory(), 'Root has to be a valid directory');
}
