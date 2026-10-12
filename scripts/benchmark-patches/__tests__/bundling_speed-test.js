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

import {formatTable, parseTargets} from '../benchmarks/bundling_speed';

test('parses <entry>:<platform> into a prod and a dev bundle', () => {
  expect(parseTargets(['src/App.js:ios'], {}).map(b => b.name)).toEqual([
    'App-ios-prod',
    'App-ios-dev',
  ]);
  expect(() => parseTargets(['Entry.js'], {})).toThrow(
    'Missing platform in "Entry.js"',
  );
});

test('formats means, deltas with t, and byte identity of every run', () => {
  const samples = (walls, cpus, hashes) =>
    walls.map((wall, i) => ({cpu: cpus[i], hash: hashes[i], size: 1000, wall}));
  const results = new Map([
    [
      'App-ios-prod',
      new Map([
        ['unpatched', samples([10, 12], [100, 120], ['a', 'b'])],
        ['faster', samples([8, 10], [80, 100], ['a', 'b'])],
        ['broken', samples([10, 12], [100, 120], ['a', 'x'])],
      ]),
    ],
  ]);
  const table = formatTable(
    [{name: 'App-ios-prod'}],
    [{name: 'unpatched'}, {name: 'faster'}, {name: 'broken'}],
    results,
  );
  expect(table.split('\n').slice(2, 5)).toEqual([
    '| App-ios-prod | unpatched | 11.0 ± 1.4 |  | 110.0 ± 14.1 |  | 1,000 | yes |',
    '| App-ios-prod | faster | 9.0 ± 1.4 | -18.18% (t -1.4) | 90.0 ± 14.1 | -18.18% (t -1.4) | 1,000 | yes |',
    '| App-ios-prod | broken | 11.0 ± 1.4 | +0.00% (t 0.0) | 110.0 ± 14.1 | +0.00% (t 0.0) | 1,000 | NO |',
  ]);
});
