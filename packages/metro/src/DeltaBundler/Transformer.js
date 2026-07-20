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

import type {TransformResult, TransformResultWithSource} from '../DeltaBundler';
import type {TransformerConfig, TransformOptions} from './Worker';
import type {ConfigT} from 'metro-config';

import {normalizePathSeparatorsToPosix} from '../lib/pathUtils';
import getTransformCacheKey from './getTransformCacheKey';
import WorkerFarm from './WorkerFarm';
import debugModule from 'debug';
import {Cache, stableHash} from 'metro-cache';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const debug = debugModule('Metro:Transformer');

type GetOrComputeSha1Fn = string => Promise<
  Readonly<{content?: Buffer, sha1: string}>,
>;

export default class Transformer {
  _config: ConfigT;
  _cache: Cache<TransformResult<>>;
  _baseHash: string;
  _getSha1: GetOrComputeSha1Fn;
  _workerFarm: WorkerFarm;

  constructor(
    config: ConfigT,
    opts: Readonly<{getOrComputeSha1: GetOrComputeSha1Fn}>,
  ) {
    this._config = config;

    this._config.watchFolders.forEach(verifyRootExists);
    this._cache = new Cache(config.cacheStores);
    this._getSha1 = opts.getOrComputeSha1;

    // Remove the transformer config params that we don't want to pass to the
    // transformer. We should change the config object and move them away so we
    // can treat the transformer config params as opaque.
    const {
      getTransformOptions: _getTransformOptions,
      transformVariants: _transformVariants,
      unstable_workerThreads: _workerThreads,
      ...transformerConfig
    } = this._config.transformer;

    const transformerOptions: TransformerConfig = {
      transformerPath: this._config.transformerPath,
      transformerConfig,
    };

    this._workerFarm = new WorkerFarm(config, transformerOptions);

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

    const localPath = path.relative(this._config.projectRoot, filePath);

    const partialKey = stableHash([
      // This is the hash related to the global Bundler config.
      this._baseHash,

      // Project-relative, posix-separated path for portability. Necessary in
      // addition to content hash because transformers receive path as an
      // input, and may apply e.g. extension-based logic.
      normalizePathSeparatorsToPosix(localPath),
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
    let content: ?Buffer;
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

    let fullKey = Buffer.concat([partialKey, Buffer.from(sha1, 'hex')]);
    let result;
    try {
      result = await cache.get(fullKey);
    } catch (error) {
      this._config.reporter.update({
        type: 'cache_read_error',
        error,
      });
      throw error;
    }

    // A valid result from the cache is used directly; otherwise we call into
    // the transformer to computed the corresponding result.
    const data: Readonly<{
      result: TransformResult<>,
      sha1: string,
    }> = result
      ? {result, sha1}
      : await this._workerFarm.transform(
          localPath,
          transformerOptions,
          content,
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

    return {
      ...data.result,
      unstable_transformResultKey: fullKey.toString(),
      getSource(): Buffer {
        if (fileBuffer) {
          return fileBuffer;
        }
        return fs.readFileSync(filePath);
      },
    };
  }

  async end(): Promise<void> {
    await this._workerFarm.kill();
  }
}

function verifyRootExists(root: string): void {
  // Verify that the root exists.
  assert(fs.statSync(root).isDirectory(), 'Root has to be a valid directory');
}
