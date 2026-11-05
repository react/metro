/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

import os from 'node:os';

/**
 * Returns the number of transform workers to use.
 *
 * An integer `workers` is clamped to [1, available cores]. Otherwise, the
 * default is about `cores - 1` on small machines, approaching half the cores
 * on large ones (e.g. 2 -> 1, 8 -> 6, 64 -> 32), and at least 1.
 */
export default function getMaxWorkers(workers: ?number): number {
  const cores = os.availableParallelism();
  return typeof workers === 'number' && Number.isInteger(workers)
    ? Math.min(cores, workers > 0 ? workers : 1)
    : Math.max(1, Math.ceil(cores * (0.5 + 0.5 * Math.exp(-cores * 0.07)) - 1));
}
