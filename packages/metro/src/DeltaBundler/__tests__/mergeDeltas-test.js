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

import mergeDeltas from '../mergeDeltas';

function sortById<T>([id1]: [number, T], [id2]: [number, T]): number {
  return id1 - id2;
}

describe('mergeDeltas', () => {
  test('should apply a delta to another delta', async () => {
    const delta1 = {
      added: [
        [1, '1'],
        [2, '2'],
        [3, '3'],
      ],
      modified: [
        [4, '4'],
        [5, '5'],
        [6, '6'],
      ],
      deleted: [7, 8],
    };
    const delta2 = {
      added: [
        [7, '7'],
        [9, '9'],
      ],
      modified: [
        [5, '5.1'],
        [2, '2.1'],
        [10, '10'],
      ],
      deleted: [1, 4, 11],
    };
    const delta3 = mergeDeltas(delta1, delta2);

    const added = delta3.added.slice().sort(sortById);
    const modified = delta3.modified.slice().sort(sortById);
    const deleted = delta3.deleted.slice().sort((a, b) => a - b);

    expect(added).toEqual([
      [2, '2.1'],
      [3, '3'],
      [9, '9'],
    ]);
    expect(modified).toEqual([
      [5, '5.1'],
      [6, '6'],
      [7, '7'],
      [10, '10'],
    ]);
    expect(deleted).toEqual([4, 8, 11]);
  });
});
