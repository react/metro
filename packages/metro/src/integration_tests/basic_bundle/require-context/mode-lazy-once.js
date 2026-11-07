/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

import type {RequireWithContext} from './utils';

import {awaitProperties, copyContextToObject} from './utils';

declare var require: RequireWithContext;

function main() {
  return awaitProperties<$FlowFixMe>(
    copyContextToObject<$FlowFixMe>(
      require.context('./subdir', undefined, undefined, 'lazy-once'),
    ),
  );
}

module.exports = main() as unknown;
