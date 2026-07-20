/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

import type {TransformerConfig} from './Worker';
import type {JsTransformerConfig} from 'metro-transform-worker';

import {getCacheKey} from 'metro-cache-key';
import crypto from 'node:crypto';

// eslint-disable-next-line import/no-commonjs
const VERSION = require('../../package.json').version;

type CacheKeyProvider = {
  getCacheKey?: (
    config: JsTransformerConfig,
    opts?: Readonly<{projectRoot: string}>,
  ) => string,
};

export default function getTransformCacheKey(opts: {
  readonly cacheVersion: string,
  readonly projectRoot: string,
  readonly transformerConfig: TransformerConfig,
}): string {
  const {transformerPath, transformerConfig} = opts.transformerConfig;

  // eslint-disable-next-line no-useless-call
  const Transformer: CacheKeyProvider = require.call(null, transformerPath);
  const transformerKey = Transformer.getCacheKey
    ? Transformer.getCacheKey(transformerConfig, {
        projectRoot: opts.projectRoot,
      })
    : '';

  return crypto
    .createHash('sha1')
    .update(
      [
        'metro-cache',
        VERSION,
        opts.cacheVersion,
        getCacheKey([require.resolve(transformerPath)]),
        transformerKey,
        transformerConfig.globalPrefix,
      ].join('$'),
    )
    .digest('hex');
}
