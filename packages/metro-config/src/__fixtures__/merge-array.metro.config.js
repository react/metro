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
import type {MetroConfig} from '../types';
*/

module.exports = [
  // defaults are implicit
  previous => ({
    resolver: {
      sourceExts: ['before', ...previous.resolver.sourceExts],
    },
  }),
  previous => ({
    resolver: {
      sourceExts: [...previous.resolver.sourceExts, 'after'],
    },
  }),
] /*:: as MetroConfig */;
