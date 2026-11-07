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
import type {ConfigT, InputConfigT} from '../types';

type ConfigFn = (previous: ConfigT) => InputConfigT
*/

const {mergeConfig} = require('../loadConfig');

const secondConfig /*:ConfigFn */ = previous => ({
  resolver: {
    sourceExts: ['before', ...previous.resolver.sourceExts],
  },
});

const thirdConfig /*:ConfigFn */ = previous => ({
  resolver: {
    sourceExts: [...previous.resolver.sourceExts, 'after'],
  },
});

module.exports = (metroDefaults /*:ConfigT*/): ConfigT =>
  mergeConfig(metroDefaults, secondConfig, thirdConfig);
