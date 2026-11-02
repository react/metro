/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

/* eslint-disable import/no-commonjs */

'use strict';

/*::
export type * from './Worker.flow';
*/

try {
  require('metro-babel-register').unstable_registerForMetroMonorepo();
} catch {}

module.exports = require('./Worker.flow');
