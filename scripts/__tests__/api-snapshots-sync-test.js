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

import {generateApiSnapshots} from '../generateApiSnapshots';

test('Public API snapshots are in sync (yarn run build-api-snapshots produces no changes)', async () => {
  let error;
  try {
    await generateApiSnapshots({verifyOnly: true});
  } catch (e) {
    error = e;
  }
  // If this is the usual type of error (a stale snapshot), have Jest print the
  // errors array so logs are a bit more helpful.
  // **If this fails, run `js1 build metro-ts-defs` (FB) / `yarn run build-api-snapshots` (OSS)**
  if (error instanceof AggregateError) {
    expect(error.errors).toEqual([]);
  }
  expect(error).toBeUndefined();
}, 180000);
