/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type {ConfigT, InputConfigT} from 'metro-config';

import {mergeConfig} from '../loadConfig';

declare var config: ConfigT;
declare var inputConfig: InputConfigT;

declare function isMutableArray<T extends ReadonlyArray<unknown>>(
  arr: T,
): T extends Array<unknown> ? true : false;

// Ensure ConfigT satisfies InputConfigT
config as InputConfigT;

// Ensure empty config satisfies InputConfigT
({}) as InputConfigT;
// And it may be partial
({
  resolver: {},
  transformer: {},
  serializer: {},
  server: {},
  symbolicator: {},
}) as InputConfigT;

// Both are deep read-only
isMutableArray(config.cacheStores) as false;
if (
  inputConfig.cacheStores != null &&
  typeof inputConfig.cacheStores !== 'function'
) {
  isMutableArray(inputConfig.cacheStores) as false;
}

// ConfigT is completely hydrated (no errors accessing deep props)
config.resolver.unstable_conditionsByPlatform['foo'];
config.transformer.assetPlugins[0];

// A mergeConfig returns a full config only if the base is a full config
mergeConfig(config, {}) as ConfigT;
// $FlowExpectedError[incompatible-type]
mergeConfig(inputConfig, {}) as ConfigT;

// And is synchronous with any number of sync arguments
mergeConfig(
  config,
  () => ({}),
  {},
  () => ({}),
) as ConfigT;

// But async if any function returns a promise
mergeConfig(
  config,
  () => ({}),
  {},
  async () => ({}),
).catch(() => {});
