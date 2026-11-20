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

// A transformer reporting the environment it observes as its output, both when
// it is loaded and when it is called.
const envAtLoad = {...process.env};

module.exports = {
  transform: async () => ({
    dependencies: [],
    output: [
      {
        type: 'js/module',
        data: {
          code: JSON.stringify({envAtLoad, envAtCall: {...process.env}}),
          lineCount: 1,
          map: [],
          functionMap: null,
        },
      },
    ],
  }),
};
