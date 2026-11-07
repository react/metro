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

/**
 * Calculates a conservative progress ratio for bundle building.
 *
 * Because we know the `totalFileCount` is going to progressively increase
 * starting with 1:
 * - We use Math.max(totalFileCount, 10) to prevent the ratio from raising too
 *   quickly when the total file count is low. (e.g 1/2 5/6)
 * - We use Math.pow(ratio, 2) as a conservative measure of progress.
 * - The ratio is capped at 0.999 to ensure we don't display 100% until done.
 * - If previousRatio is provided, the ratio will not go backwards.
 */
export function calculateBundleProgressRatio(
  transformedFileCount: number,
  totalFileCount: number,
  previousRatio?: number,
): number {
  const baseRatio = Math.pow(
    transformedFileCount / Math.max(totalFileCount, 10),
    2,
  );
  const ratio =
    previousRatio != null ? Math.max(baseRatio, previousRatio) : baseRatio;
  return Math.min(ratio, 0.999);
}
