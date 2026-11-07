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

async function main() {
  const moduleId = require.resolveWeak('./subdir/counter-module');

  // Require the module statically via its path, spelled slightly differently
  (await import('./subdir/counter-module.js')).increment();

  const dynamicRequire = require;

  // Require the module dynamically via its ID
  const timesIncremented = dynamicRequire(moduleId).increment();

  return {
    moduleId,
    // Should be 2, proving there's just one module instance
    timesIncremented,
  };
}

module.exports = main() as unknown;
