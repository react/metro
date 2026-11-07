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

import {copyContextToObject} from './utils';

const normalModule = require('./subdir-conflict');

declare var require: RequireWithContext;
const contextModule = require.context<$FlowFixMe>('./subdir-conflict');

function main() {
  return {
    normalModule,
    contextModule: copyContextToObject(contextModule),
  };
}

module.exports = main() as unknown;
