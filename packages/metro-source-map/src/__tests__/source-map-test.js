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

import type {MetroSourceMapSegmentTuple} from '../source-map';

import Generator from '../Generator';
import {
  fromRawMappings,
  isVlqMap,
  toBabelSegments,
  toSegmentTuple,
  vlqMapFromTuples,
} from '../source-map';

describe('flattening mappings / compacting', () => {
  test('flattens simple mappings', () => {
    expect(toSegmentTuple({generated: {line: 12, column: 34}})).toEqual([
      12, 34,
    ]);
  });

  test('flattens mappings with a source location', () => {
    expect(
      toSegmentTuple({
        generated: {column: 34, line: 12},
        original: {column: 78, line: 56},
      }),
    ).toEqual([12, 34, 56, 78]);
  });

  test('flattens mappings with a source location and a symbol name', () => {
    expect(
      toSegmentTuple({
        generated: {column: 34, line: 12},
        name: 'arbitrary',
        original: {column: 78, line: 56},
      }),
    ).toEqual([12, 34, 56, 78, 'arbitrary']);
  });
});

describe('build map from raw mappings', () => {
  test('returns a `Generator` instance', () => {
    expect(fromRawMappings([])).toBeInstanceOf(Generator);
  });

  test('returns a working source map containing all mappings', () => {
    const input = [
      {
        code: lines(11),
        functionMap: {names: ['<global>'], mappings: 'AAA'},
        map: [
          [1, 2],
          [3, 4, 5, 6, 'apples'],
          [7, 8, 9, 10],
          [11, 12, 13, 14, 'pears'],
        ],
        source: 'code1',
        path: 'path1',
        isIgnored: false,
      },
      {
        code: lines(3),
        functionMap: {names: ['<global>'], mappings: 'AAA'},
        map: [
          [1, 2],
          [3, 4, 15, 16, 'bananas'],
        ],
        source: 'code2',
        path: 'path2',
        isIgnored: true,
      },
      {
        code: lines(23),
        functionMap: null,
        map: [
          [11, 12],
          [13, 14, 15, 16, 'bananas'],
          [17, 18, 19, 110],
          [21, 112, 113, 114, 'pears'],
        ],
        source: 'code3',
        path: 'path3',
        isIgnored: false,
      },
    ];

    expect(fromRawMappings(input).toMap()).toEqual({
      mappings:
        'E;;IAIMA;;;;QAII;;;;YAIIC;E;;ICEEC;;;;;;;;;;;Y;;cCAAA;;;;kBAI8F;;;;gHA8FID',
      names: ['apples', 'pears', 'bananas'],
      sources: ['path1', 'path2', 'path3'],
      sourcesContent: ['code1', 'code2', 'code3'],
      x_facebook_sources: [
        [{names: ['<global>'], mappings: 'AAA'}],
        [{names: ['<global>'], mappings: 'AAA'}],
        null,
      ],
      x_google_ignoreList: [1],
      version: 3,
    });
  });

  describe('convert a sourcemap into raw mappings', () => {
    expect(
      toBabelSegments({
        mappings:
          'E;;IAIMA;;;;QAII;;;;YAIIC;E;;ICEEC;;;;;;;;;;;Y;;cCAAA;;;;kBAI8F;;;;gHA8FID',
        names: ['apples', 'pears', 'bananas'],
        sources: ['path1', 'path2', 'path3'],
        sourcesContent: ['code1', 'code2', 'code3'],
        version: 3,
      }),
    ).toMatchSnapshot();
  });

  test('offsets the resulting source map by the provided offset argument', () => {
    const input = [
      {
        code: lines(11),
        functionMap: null,
        map: [
          [1, 2],
          [3, 4, 5, 6, 'apples'],
          [7, 8, 9, 10],
          [11, 12, 13, 14, 'pears'],
        ],
        source: 'code1',
        path: 'path1',
        isIgnored: false,
      },
      {
        code: lines(3),
        functionMap: null,
        map: [
          [1, 2],
          [3, 4, 15, 16, 'bananas'],
        ],
        source: 'code2',
        path: 'path2',
        isIgnored: false,
      },
      {
        code: lines(23),
        functionMap: null,
        map: [
          [11, 12],
          [13, 14, 15, 16, 'bananas'],
          [17, 18, 19, 110],
          [21, 112, 113, 114, 'pears'],
        ],
        source: 'code3',
        path: 'path3',
        isIgnored: false,
      },
    ];

    expect(fromRawMappings(input, 8).toMap()).toEqual({
      mappings:
        ';;;;;;;;E;;IAIMA;;;;QAII;;;;YAIIC;E;;ICEEC;;;;;;;;;;;Y;;cCAAA;;;;kBAI8F;;;;gHA8FID',
      names: ['apples', 'pears', 'bananas'],
      sources: ['path1', 'path2', 'path3'],
      sourcesContent: ['code1', 'code2', 'code3'],
      version: 3,
    });
  });
});

const lines = (n: number) => Array(n).join('\n');

function makeVlqMap(
  mappings: string,
  names: ReadonlyArray<string>,
): {readonly mappings: string, readonly names: ReadonlyArray<string>} {
  return {
    mappings,
    names,
  };
}

describe('isVlqMap', () => {
  test('returns false for null', () => {
    expect(isVlqMap(null)).toBe(false);
  });

  test('returns false for tuple array', () => {
    expect(isVlqMap([[1, 2, 3, 4]])).toBe(false);
  });

  test('returns true for VlqMap', () => {
    expect(isVlqMap(makeVlqMap('AAAA', []))).toBe(true);
  });

  test('returns false for plain object without string mappings', () => {
    // $FlowFixMe[incompatible-type] Testing runtime behavior with invalid type
    expect(isVlqMap({mappings: 123, names: []})).toBe(false);
  });
});

describe('fromRawMappings with VlqMap', () => {
  // Shared tuple definitions. We build two parallel module lists from these —
  // one storing decoded tuples, one storing the equivalent VLQ — and assert the
  // serialized flat map is byte-identical, i.e. VLQ storage is transparent.
  const tuples0: Array<MetroSourceMapSegmentTuple> = [
    [1, 2],
    [3, 4, 5, 6, 'apples'],
    [7, 8, 9, 10],
    [11, 12, 13, 14, 'pears'],
  ];
  const tuples1: Array<MetroSourceMapSegmentTuple> = [
    [1, 2],
    [3, 4, 15, 16, 'bananas'],
  ];

  const tupleModules = [
    {
      code: lines(11),
      functionMap: {names: ['<global>'], mappings: 'AAA'},
      map: tuples0,
      source: 'code1',
      path: 'path1',
      isIgnored: false,
    },
    {
      code: lines(3),
      functionMap: null,
      map: tuples1,
      source: 'code2',
      path: 'path2',
      isIgnored: true,
    },
  ];

  const vlqModules = [
    {...tupleModules[0], map: vlqMapFromTuples(tuples0)},
    {...tupleModules[1], map: vlqMapFromTuples(tuples1)},
  ];

  test('produces a flat (non-indexed) map for VlqMap inputs', () => {
    const map = fromRawMappings(vlqModules).toMap();
    expect(typeof map.mappings).toBe('string');
    expect(map.sources).toEqual(['path1', 'path2']);
    expect(map.version).toBe(3);
  });

  test('VlqMap input serializes byte-identically to tuple input', () => {
    expect(fromRawMappings(vlqModules).toString()).toBe(
      fromRawMappings(tupleModules).toString(),
    );
    expect(fromRawMappings(vlqModules).toMap()).toEqual(
      fromRawMappings(tupleModules).toMap(),
    );
  });

  test('preserves functionMap and ignoreList from VlqMap modules', () => {
    const map = fromRawMappings(vlqModules).toMap();
    expect(map.x_facebook_sources).toEqual([
      [{names: ['<global>'], mappings: 'AAA'}],
      null,
    ]);
    expect(map.x_google_ignoreList).toEqual([1]);
  });

  test('handles mixed tuple and VlqMap modules identically to all-tuple', () => {
    const mixed = [tupleModules[0], vlqModules[1]];
    expect(fromRawMappings(mixed).toString()).toBe(
      fromRawMappings(tupleModules).toString(),
    );
  });

  test('applies offsetLines identically for VlqMap and tuple inputs', () => {
    expect(fromRawMappings(vlqModules, 8).toString()).toBe(
      fromRawMappings(tupleModules, 8).toString(),
    );
  });

  test('excludeSource option omits sourcesContent', () => {
    const map = fromRawMappings(vlqModules).toMap(undefined, {
      excludeSource: true,
    });
    expect(map.sourcesContent).toBeUndefined();
  });
});

describe('vlqMapFromTuples', () => {
  // Decode via Metro's existing string->tuples path, the inverse of
  // vlqMapFromTuples.
  const decode = (vlqMap: {
    readonly mappings: string,
    readonly names: ReadonlyArray<string>,
  }) =>
    toBabelSegments({
      version: 3,
      sources: [''],
      names: [...vlqMap.names],
      mappings: vlqMap.mappings,
    }).map(toSegmentTuple);

  test('encodes tuples into a VlqMap', () => {
    const vlqMap = vlqMapFromTuples([
      [1, 2],
      [3, 4, 5, 6, 'apples'],
      [7, 8, 9, 10],
      [11, 12, 13, 14, 'pears'],
    ]);
    expect(isVlqMap(vlqMap)).toBe(true);
    expect(typeof vlqMap.mappings).toBe('string');
    expect(vlqMap.names).toEqual(['apples', 'pears']);
  });

  test('round-trips via toBabelSegments + toSegmentTuple', () => {
    const tuples = [
      [1, 2],
      [3, 4, 5, 6, 'apples'],
      [7, 8, 9, 10],
      [11, 12, 13, 14, 'pears'],
      [11, 20, 30, 40],
    ];
    expect(decode(vlqMapFromTuples(tuples))).toEqual(tuples);
  });

  test('round-trips multi-line, multi-segment maps', () => {
    const tuples = [
      [1, 0, 1, 0],
      [1, 8, 1, 4, 'foo'],
      [2, 0, 2, 0],
      [3, 4, 3, 2, 'bar'],
      [5, 0],
    ];
    expect(decode(vlqMapFromTuples(tuples))).toEqual(tuples);
  });

  test('encodes an empty map', () => {
    const vlqMap = vlqMapFromTuples([]);
    expect(vlqMap.mappings).toBe('');
    expect(decode(vlqMap)).toEqual([]);
  });
});
