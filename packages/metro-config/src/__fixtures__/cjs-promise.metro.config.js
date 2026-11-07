/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

/*::
import type {InputConfigT} from '../types';
*/

const config /*: Promise<InputConfigT> */ = Promise.resolve({
  cacheVersion: 'cjs-promise-config',
});

module.exports = config;
