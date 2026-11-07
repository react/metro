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

declare var require: RequireWithContext;

const ab = require.context<$FlowFixMe>('./subdir', false, /\/(a|b)\.js$/);
const abc = require.context<$FlowFixMe>('./subdir', false);
const abcd = require.context<$FlowFixMe>('./subdir', true);

function main() {
  return {
    ab: ab.keys(),
    abc: abc.keys(),
    abcd: abcd.keys(),
  };
}

module.exports = main() as unknown;
