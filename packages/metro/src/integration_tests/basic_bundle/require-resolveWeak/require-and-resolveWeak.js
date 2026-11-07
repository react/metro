/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

import type {RequireWithResolveWeak} from './utils';

declare var require: RequireWithResolveWeak;

function main() {
  const moduleId = require.resolveWeak('./subdir/counter-module');

  const dynamicRequire = require;

  // Require the module dynamically via its ID
  dynamicRequire(moduleId).increment();

  // Require the module statically via its path, spelled slightly differently
  const timesIncremented = require('./subdir/counter-module.js').increment();

  return {
    moduleId,
    // Should be 2, proving there's just one module instance
    timesIncremented,
  };
}

module.exports = main() as unknown;
