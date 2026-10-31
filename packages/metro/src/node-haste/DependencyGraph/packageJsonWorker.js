/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

/* eslint-disable import/no-commonjs */

'use strict';

// A file map plugin worker whose data for a `package.json` is its parsed
// contents, or the `SyntaxError` from parsing it if it isn't valid JSON, so
// that the reader can throw it without reading the file again.
module.exports = class PackageJsonWorker {
  processFile(
    _data /*: Readonly<{filePath: string, ...}> */,
    utils /*: Readonly<{getContent: () => Buffer}> */,
  ) /*: unknown */ {
    try {
      return JSON.parse(utils.getContent().toString('utf8'));
    } catch (error) {
      return error;
    }
  }
};
