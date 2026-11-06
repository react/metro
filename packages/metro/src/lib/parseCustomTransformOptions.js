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

import type {CustomTransformOptions} from 'metro-transform-worker';

const PREFIX = 'transform.';

export default function parseCustomTransformOptions(
  searchParams: URLSearchParams,
): CustomTransformOptions {
  const customTransformOptions: {
    __proto__: null,
    [key: string]: unknown,
    ...
  } = Object.create(null);

  searchParams.forEach((value: string, key: string) => {
    if (key.startsWith(PREFIX)) {
      customTransformOptions[key.substring(PREFIX.length)] = value;
    }
  });

  return customTransformOptions;
}
