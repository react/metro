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

import {
  formatTable,
  getAsyncBundlePaths,
  parseTargets,
} from '../benchmarks/lazy_bundling';

test('parses <entry>:<platform> into a lazy dev bundle URL', () => {
  const [target] = parseTargets(['src/App.js:ios'], {
    chunks: '5',
    query: 'app=com.example&dev=false',
  });
  expect(target.name).toBe('App-ios');
  expect(target.chunks).toBe(5);
  expect(target.bundlePath).toBe(
    '/src/App.bundle?platform=ios&dev=false&minify=false&lazy=true&app=com.example',
  );
  expect(parseTargets(['App.js:ios'], {})[0].chunks).toBe(20);
  expect(() => parseTargets(['Entry.js'], {})).toThrow(
    'Missing platform in "Entry.js"',
  );
  expect(() => parseTargets(['App.js:ios'], {chunks: '0'})).toThrow(
    '--chunks must be an integer >= 1, got "0"',
  );
});

test('extracts async bundle paths from dependency maps', () => {
  const code = [
    '__d(function () {}, 1, {"0":2,"1":3,"paths":{"3":"/src/A.js.bundle?platform=ios&modulesOnly=true"}}, "src/B.js");',
    '__d(function () {}, 2, [4], "src/C.js");',
    '__d(function () {}, 4, {"0":5,"paths":{"5":"/src/D.js.bundle?x=1","6":null}}, "src/E.js");',
  ].join('\n');
  expect(getAsyncBundlePaths(code)).toEqual([
    '/src/A.js.bundle?platform=ios&modulesOnly=true',
    '/src/D.js.bundle?x=1',
  ]);
});

test('formats memory and time changes with both means, and byte identity', () => {
  const samples = (heapChunksMB, chunkTotalMs, hashes) =>
    heapChunksMB.map((heap, i) => ({
      chunkCount: 2,
      chunkTotalMs: chunkTotalMs[i],
      hash: hashes[i],
      heapAfterMainMB: 500,
      heapChunksMB: heap,
      mainMs: 4000,
    }));
  const results = new Map([
    [
      'App-ios',
      new Map([
        ['unpatched', samples([200, 220], [3000, 3200], ['a', 'b'])],
        ['shared', samples([20, 24], [1000, 1200], ['a', 'b'])],
        ['broken', samples([200, 220], [3000, 3200], ['a', 'x'])],
      ]),
    ],
  ]);
  const lines = formatTable(
    [{name: 'App-ios'}],
    [{name: 'unpatched'}, {name: 'shared'}, {name: 'broken'}],
    results,
  ).split('\n');
  expect(lines.slice(0, 5)).toEqual([
    '| Bundle | Variant | Δ memory | Δ time |',
    '|---|---|--:|--:|',
    '| App-ios (2 chunks) | unpatched | 210.0 ± 14.1 MB | 3.10 ± 0.14 s |',
    '| App-ios (2 chunks) | shared | -89.52% (210.0 → 22.0 MB, t -18.4) | -64.52% (3.10 → 1.10 s, t -14.1) |',
    '| App-ios (2 chunks) | broken | +0.00% (210.0 → 210.0 MB, t 0.0) | +0.00% (3.10 → 3.10 s, t 0.0) |',
  ]);
  expect(lines).toContain('Bundles differ from unpatched: App-ios broken.');
});
