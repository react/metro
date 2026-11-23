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

import canonicalize from 'metro-core/private/canonicalize';
import crypto from 'node:crypto';

export default function stableHash(value: unknown): Buffer {
  return crypto
    .createHash('md5')
    .update(JSON.stringify(value, canonicalize))
    .digest('buffer');
}
