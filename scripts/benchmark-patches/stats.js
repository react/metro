/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

function stats(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return {mean, n: values.length, sd: Math.sqrt(variance), variance};
}

// Percent change vs base, with Welch's t statistic.
function change(sample, base) {
  return {
    pct: (sample.mean / base.mean - 1) * 100,
    t:
      (sample.mean - base.mean) /
      Math.sqrt(sample.variance / sample.n + base.variance / base.n),
  };
}

function formatPct(pct) {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

function delta(sample, base) {
  const {pct, t} = change(sample, base);
  return `${formatPct(pct)} (t ${t.toFixed(1)})`;
}

module.exports = {change, delta, formatPct, stats};
