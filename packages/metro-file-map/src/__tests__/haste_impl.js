/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

/* eslint-disable import/no-commonjs */

'use strict';

const path = require('node:path');

let cacheKey;

module.exports = {
  getCacheKey() {
    return cacheKey;
  },

  getHasteName(filename) {
    if (
      filename.includes('__mocks__') ||
      filename.includes('NoHaste') ||
      filename.includes(path.sep + 'module_dir' + path.sep) ||
      filename.includes(path.sep + 'sourcemaps' + path.sep)
    ) {
      return undefined;
    }

    return filename
      .substr(filename.lastIndexOf(path.sep) + 1)
      .replace(/(\.(android|ios|native))?\.js$/, '');
  },

  setCacheKey(key) {
    cacheKey = key;
  },
};
