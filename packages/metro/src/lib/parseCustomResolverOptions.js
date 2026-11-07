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

import type {CustomResolverOptions} from 'metro-resolver';

const PREFIX = 'resolver.';

export default function parseCustomResolverOptions(
  searchParams: URLSearchParams,
): CustomResolverOptions {
  const customResolverOptions: {
    __proto__: null,
    [key: string]: unknown,
    ...
  } = Object.create(null);

  searchParams.forEach((value: string, key: string) => {
    if (key.startsWith(PREFIX)) {
      customResolverOptions[key.substring(PREFIX.length)] = value;
    }
  });

  return customResolverOptions;
}
