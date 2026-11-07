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

const fs = require('node:fs');

/**
 * Simple hasteImpl that parses @providesModule annotation from JS modules.
 */
module.exports = {
  getHasteName(filename: string) {
    const matches = fs
      .readFileSync(filename, 'utf8')
      .match(/@providesModule ([^\n]+)/);

    if (!matches) {
      return undefined;
    }

    return matches[1];
  },
  getCacheKey() {
    return 'hasteImplFixture';
  },
};
