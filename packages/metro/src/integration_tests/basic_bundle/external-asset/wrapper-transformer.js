/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

'use strict';

import type {
  JsTransformerConfig,
  JsTransformOptions,
} from 'metro-transform-worker';

// Wraps Metro's transformer, forwarding only the arguments it declares.
const worker = require('metro-transform-worker');

module.exports = {
  getCacheKey: worker.getCacheKey,
  transform: (
    config: JsTransformerConfig,
    projectRoot: string,
    filename: string,
    data: Buffer,
    options: JsTransformOptions,
  ): ReturnType<typeof worker.transform> =>
    worker.transform(config, projectRoot, filename, data, options),
};
