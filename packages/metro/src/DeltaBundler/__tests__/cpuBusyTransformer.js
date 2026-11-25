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

// A transformer that keeps the CPU busy for a while before returning an empty
// module.
const BUSY_MS = 200;

module.exports = {
  transform: async () => {
    const until = Date.now() + BUSY_MS;
    let x = 0;
    while (Date.now() < until) {
      x += Math.sqrt(x + 1);
    }
    return {
      dependencies: [],
      output: [
        {
          type: 'js/module',
          data: {
            code: String(x > 0),
            lineCount: 1,
            map: [],
            functionMap: null,
          },
        },
      ],
    };
  },
};
