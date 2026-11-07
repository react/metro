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
  return {
    counterModuleId1: require.resolveWeak('./subdir/counter-module'),
    counterModuleId2: require.resolveWeak('./subdir/counter-module.js'),
    throwingModuleId: require.resolveWeak('./subdir/throwing-module.js'),
  };
}

module.exports = main() as unknown;
