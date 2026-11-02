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

// jest-worker assigns the ID of the worker to JEST_WORKER_ID in a worker thread,
// regardless of the `env` it is given. Transform output must not depend on the
// worker that produced it, and a Babel plugin may inline any environment
// variable.
delete process.env.JEST_WORKER_ID;

try {
  require('metro-babel-register').unstable_registerForMetroMonorepo();
} catch {}

module.exports = require('./Worker.flow');
