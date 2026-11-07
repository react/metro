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

'use strict';

import generate from '@babel/generator';
import * as babylon from '@babel/parser';
import {toSegmentTuple, tuplesFromBabelDecodedMap} from 'metro-source-map';

// The transform worker derives source-map tuples from Babel's eagerly-computed
// `result.decodedMap` instead of triggering the more expensive `rawMappings`
// (`allMappings`) decode. This must be byte-identical to the previous
// `result.rawMappings.map(toSegmentTuple)`.
const SAMPLES = [
  `function foo(aaa, bbb) {
  const ccc = aaa + bbb;
  return ccc * 2;
}
class Bar extends Foo {
  method(xxx) {
    return this.value + xxx;
  }
}
export default function entry(items) {
  const obj = {a: 1, b: 2, c: [1, 2, 3]};
  return items.map(x => x.value).filter(Boolean);
}
`,
  `const x = require('foo');\nmodule.exports = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { s += a[i] * b; } return s; };\n`,
  `// header\nconst y = 1;\n\n\nfunction z() { return y; }\n`,
  `const w = 42; const v = w + 1; export {w, v};`,
  `1 + 1;\n`,
];

describe('tuplesFromBabelDecodedMap', () => {
  test.each(SAMPLES.map((code, i) => [i, code]))(
    'is byte-identical to rawMappings.map(toSegmentTuple) [sample %i]',
    (_i, code) => {
      const ast = babylon.parse(code, {sourceType: 'unambiguous'});
      const result = generate(
        ast,
        {sourceMaps: true, sourceFileName: 'file.js'},
        code,
      );
      const fromRaw = (result.rawMappings ?? []).map(toSegmentTuple);
      const fromDecoded = tuplesFromBabelDecodedMap(
        nullthrowsLocal(result.decodedMap),
      );
      expect(fromDecoded).toEqual(fromRaw);
      expect(fromDecoded.length).toBeGreaterThan(0);
    },
  );
});

function nullthrowsLocal<T>(x: ?T): T {
  if (x == null) {
    throw new Error('Expected decodedMap to be present');
  }
  return x;
}
