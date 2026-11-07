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

const empty = require.context<$FlowFixMe>('./no-such-dir');

function main() {
  try {
    empty('./no-such-file.js');
  } catch (e) {
    return {error: {message: e.message, code: e.code}};
  }
  return null;
}

module.exports = main() as unknown;
