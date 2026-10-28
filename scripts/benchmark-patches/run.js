/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

const {spawnSync} = require('node:child_process');

function run(command, args, options) {
  const result = spawnSync(command, args, options);
  if (result.error != null) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.signal ?? result.status})`,
    );
  }
}

module.exports = run;
