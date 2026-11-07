/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import stableHash from '../stableHash';

describe('stableHash', () => {
  test('ensures that the hash implementation supports switched order properties', () => {
    const sortedHash = stableHash({
      a: 3,
      b: 4,
      c: {
        d: 'd',
        e: 'e',
      },
    });

    const unsortedHash = stableHash({
      b: 4,
      c: {
        e: 'e',
        d: 'd',
      },
      a: 3,
    });

    expect(unsortedHash).toEqual(sortedHash);
  });
});
