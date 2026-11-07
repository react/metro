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

import type {CustomResolver} from 'metro-resolver';

import metroSchemeResolver from './metroSchemeResolver';

/**
 * The scheme resolvers Metro registers on every resolution context. Consumers
 * building their own `ResolutionContext` should spread these in to match
 * Metro's own resolution behaviour.
 *
 * These are applied beneath `config.resolver.schemeResolvers`, so a user config
 * may override any of them by reusing the same (lowercase) scheme key.
 */
export default function getSchemeResolvers(): Readonly<{
  [scheme: string]: CustomResolver,
}> {
  return {
    metro: metroSchemeResolver,
  };
}
