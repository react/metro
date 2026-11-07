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

import type {ExplodedSourceMap} from '../../DeltaBundler/Serializers/getExplodedSourceMap';
import type {InputConfigT} from 'metro-config';
import type {MetroSourceMapSegmentTuple, VlqMap} from 'metro-source-map';

import symbolicate from '../symbolicate';
import {getDefaultConfig, mergeConfig} from 'metro-config';
import {vlqMapFromTuples} from 'metro-source-map';

// symbolicate() only reads `config.symbolicator`. Stub metro-config so the test
// stays independent of the full config pipeline (and the Node version it needs).
jest.mock('metro-config', () => ({
  getDefaultConfig: {getDefaultValues: () => ({})},
  mergeConfig: (base, override) => ({...base, ...override}),
}));

const config = mergeConfig(getDefaultConfig.getDefaultValues('/'), {
  symbolicator: {
    customizeFrame: () => null,
    customizeStack: stack => stack,
  },
} as InputConfigT);

// genLine1Based, genCol0Based, srcLine1Based, srcCol0Based[, name]
const TUPLES: Array<MetroSourceMapSegmentTuple> = [
  [1, 0, 10, 4],
  [1, 8, 10, 12, 'greet'],
  [2, 0, 11, 0],
];

function makeMap(
  map: Array<MetroSourceMapSegmentTuple> | VlqMap,
): ExplodedSourceMap {
  return [
    {
      firstLine1Based: 1,
      functionMap: null,
      map,
      path: 'foo.js',
    },
  ];
}

test('symbolicates a frame against a decoded tuple map', async () => {
  const [frame] = await symbolicate(
    [{file: 'bundle.js', lineNumber: 1, column: 8, methodName: null}],
    [['bundle.js', makeMap(TUPLES)]],
    config,
    null,
  );
  expect(frame).toMatchObject({file: 'foo.js', lineNumber: 10, column: 12});
});

test('VLQ map symbolicates identically to its decoded tuples', async () => {
  const frame = [
    {file: 'bundle.js', lineNumber: 1, column: 8, methodName: null},
  ];

  const [fromTuples] = await symbolicate(
    frame,
    [['bundle.js', makeMap(TUPLES)]],
    config,
    null,
  );
  const [fromVlq] = await symbolicate(
    frame,
    [['bundle.js', makeMap(vlqMapFromTuples(TUPLES))]],
    config,
    null,
  );

  expect(fromVlq).toEqual(fromTuples);
  expect(fromVlq).toMatchObject({file: 'foo.js', lineNumber: 10, column: 12});
});

test('reuses a single VLQ map across multiple frames in the same module', async () => {
  const explodedMap = makeMap(vlqMapFromTuples(TUPLES));

  const out = await symbolicate(
    [
      {file: 'bundle.js', lineNumber: 1, column: 0, methodName: null},
      {file: 'bundle.js', lineNumber: 1, column: 8, methodName: null},
      {file: 'bundle.js', lineNumber: 2, column: 0, methodName: null},
    ],
    [['bundle.js', explodedMap]],
    config,
    null,
  );

  expect(out.map(f => f.lineNumber)).toEqual([10, 10, 11]);
});
