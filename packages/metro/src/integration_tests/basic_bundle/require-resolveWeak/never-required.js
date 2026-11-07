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
  return {
    moduleId: require.resolveWeak('./subdir/throwing-module'),
  };
}

module.exports = main() as unknown;
