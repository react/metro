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

'use strict';

const path = require('node:path');

export default (file: string, roots: ReadonlyArray<string>): string =>
  path.resolve(roots[0], file);
