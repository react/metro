/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

import type {BasicSourceMap, IndexMap, MixedSourceMap} from '../source-map';

import composeSourceMaps from '../composeSourceMaps';
import Consumer from '../Consumer';
import {add0, add1} from 'ob1';

const invariant = require('invariant');
const fs = require('node:fs');
const path = require('node:path');
const terser = require('terser');

const {objectContaining} = expect;

/* eslint-disable no-multi-str */

const TestScript1 =
  '/* Half of a program that throws */\
  topLevel();\
  topLevel();\
  ';

const TestScript2 =
  '/* The other half of a program that throws. */\
function topLevel() {\
   function reallyThrowSomething() {\
      throw new Error("Ack!");\
      console.log("Make inlining unprofitable");\
   };\
   function throwSomething() {\
       reallyThrowSomething();\
       reallyThrowSomething();\
   }\
   throwSomething();\
   throwSomething();\
}';

function symbolicate(
  backtrace: empty,
  sourceMap: any | string | BasicSourceMap | IndexMap | MixedSourceMap,
) {
  const consumer = new Consumer(
    typeof sourceMap === 'string' ? JSON.parse(sourceMap) : sourceMap,
  );
  /* $FlowFixMe[missing-local-annot] The type annotation(s) required by Flow's
   * LTI update could not be added via codemod */
  function replaceSymbol(match: any, source: any, line, col: number) {
    var original = consumer.originalPositionFor({
      line: add1(line - 1),
      column: add0(col),
    });
    return [original.source, original.line, original.column].join(':');
  }
  return backtrace.replace(/([-./\w]+):(\d+):(\d+)/g, replaceSymbol);
}

describe('composeSourceMaps', () => {
  const fixtures: {[string]: any} = {};

  beforeAll(() => {
    for (const fixtureName of [
      '1.json',
      '2.json',
      'ignore_1.json',
      'ignore_2.json',
      'merged_1_2.json',
      'merged_ignore.json',
    ]) {
      fixtures[fixtureName] = JSON.parse(
        fs.readFileSync(
          path.resolve(__dirname, '__fixtures__', fixtureName),
          'utf8',
        ),
      );
    }
  });

  test('verifies merged source maps work the same as applying them separately', async () => {
    // Apply two tranformations: compression, then mangling.
    const stage1 = await terser.minify(
      {'test1.js': TestScript1, 'test2.js': TestScript2},
      {
        compress: true,
        mangle: false,
        sourceMap: true,
      },
    );
    invariant(
      typeof stage1.code === 'string' && typeof stage1.map === 'string',
      'Minification error in stage1',
    );
    const {code: code1, map: map1} = stage1;
    const stage2 = await terser.minify(
      {'intermediate.js': code1},
      {compress: true, mangle: true, sourceMap: true},
    );
    invariant(
      typeof stage2.code === 'string' && typeof stage2.map === 'string',
      'Minification error in stage2',
    );

    const {code: code2, map: map2} = stage2;

    // Generate a merged source map.
    const mergedMap = composeSourceMaps([map1, map2].map(m => JSON.parse(m)));

    // Run the error-producing code and verify it symbolicates identically
    // whether we apply the source maps serially, or the merged map.
    // We can't use require() because node produces actively wrong backtraces:
    // https://github.com/nodejs/node/issues/2860
    // Use sourceURL to pretend this came from a file.
    let backtrace = null;
    try {
      // eslint-disable-next-line no-eval
      eval(code2 + '\n//@ sourceURL=intermediate.js');
    } catch (err) {
      backtrace = err.stack;
    }
    invariant(
      backtrace,
      'Test cannot run in an environment where error.stack is falsy',
    );

    const serialSymbolicated = symbolicate(symbolicate(backtrace, map2), map1);
    const mergedSymbolicated = symbolicate(backtrace, mergedMap);
    expect(mergedSymbolicated).toEqual(serialSymbolicated);
  });

  test('preserves x_facebook_sources', () => {
    const map1: MixedSourceMap = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            sources: ['src.js'],
            x_facebook_sources: [[{names: ['<global>'], mappings: 'AAA'}]],
            names: ['global'],
            mappings: ';CACCA',
          },
        },
      ],
    };

    const map2: MixedSourceMap = {
      version: 3,
      sources: ['src-transformed.js'],
      names: ['gLoBAl'],
      mappings: ';CACCA',
    };

    const mergedMap = composeSourceMaps([map1, map2]);

    expect(mergedMap.x_facebook_sources).toEqual([
      [{mappings: 'AAA', names: ['<global>']}],
    ]);
  });

  test('preserves and reindexes x_google_ignoreList', () => {
    const map1: MixedSourceMap = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            sources: ['unused.js', 'src.js'],
            x_google_ignoreList: [1],
            names: ['global'],
            mappings: ';CCCCA',
          },
        },
      ],
    };

    const map2: MixedSourceMap = {
      version: 3,
      sources: ['src-transformed.js'],
      names: ['gLoBAl'],
      mappings: ';CACCA',
    };

    const mergedMap = composeSourceMaps([map1, map2]);

    expect(mergedMap).toEqual(
      objectContaining({
        sources: ['src.js'],
        x_google_ignoreList: [0],
      }),
    );
  });

  test('x_google_ignoreList: a source with inconsistent ignore status is considered to be ignored', () => {
    const map1: MixedSourceMap = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            sources: ['unused.js', 'src.js'],
            x_google_ignoreList: [1],
            names: ['global'],
            // First line of src-transformed.js maps to src.js (source #1 here)
            mappings: 'ACAAA',
          },
        },
        {
          offset: {line: 1, column: 0},
          map: {
            version: 3,
            sources: ['src.js', 'other.js'],
            x_google_ignoreList: [] as Array<number>,
            names: ['global'],

            mappings:
              // Second line of src-transformed.js maps to src.js (source #0 here)
              'AAAAA' +
              // Third line of src-transformed.js maps to other.js (source #1 here)
              ';ACAAA',
          },
        },
      ],
    };

    const map2: MixedSourceMap = {
      version: 3,
      sources: ['src-transformed.js'],
      names: ['gLoBAl'],
      // Map each line to itself
      mappings: 'AAAAA;AACAA;AACAA',
    };

    /* $FlowFixMe[incompatible-call] Natural Inference rollout. See
     * https://fburl.com/gdoc/y8dn025u */
    const mergedMap = composeSourceMaps([map1, map2]);

    expect(mergedMap).toEqual(
      objectContaining({
        sources: ['src.js', 'other.js'],
        x_google_ignoreList: [0],
      }),
    );
  });

  test('preserves sourcesContent', () => {
    const map1: MixedSourceMap = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            sources: ['1.js', '2.js'],
            sourcesContent: ['content of 1.js', 'content of 2.js'],
            names: [] as Array<string>,
            // One column from 2.js, one column from 1.js
            mappings: 'ACAA,CDAA',
          },
        },
      ],
    };

    const map2: MixedSourceMap = {
      version: 3,
      sources: ['transformed.js'],
      names: [] as Array<string>,
      // Two consecutive columns from transformed.js
      mappings: 'AAAA,CAAC',
    };

    const mergedMap = composeSourceMaps([map1, map2]);

    expect(mergedMap.sourcesContent).toEqual([
      'content of 2.js',
      'content of 1.js',
    ]);
  });

  test('merges two maps', () => {
    const mergedMap = composeSourceMaps([
      fixtures['1.json'],
      fixtures['2.json'],
    ]);
    expect(mergedMap).toEqual(fixtures['merged_1_2.json']);
  });

  test('merges two maps preserving unmapped regions in the first one', () => {
    const mergedMap = composeSourceMaps([
      fixtures['ignore_1.json'],
      fixtures['ignore_2.json'],
    ]);
    expect(mergedMap).toEqual(fixtures['merged_ignore.json']);
  });

  test('merges two maps preserving unmapped regions in the second one', () => {
    const mergedMap = composeSourceMaps([
      {version: 3, names: ['a'], sources: ['a.js'], mappings: 'AAACA,CAACA'},
      {
        version: 3,
        names: ['b'],
        sources: ['b.js'],
        mappings: 'AAAAA,C,CAAAA,CAACA',
      },
    ]);
    expect(mergedMap).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAACA,C,CAAAA,CAACA",
        "names": Array [
          "a",
        ],
        "sources": Array [
          "a.js",
        ],
        "version": 3,
        "x_facebook_sources": Array [
          null,
        ],
      }
    `);
  });

  test('Propagate x_hermes_function_offsets', () => {
    const map1 = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            sources: ['src.js'],
            x_facebook_sources: [[{names: ['<global>'], mappings: 'AAA'}]],
            names: ['global'],
            mappings: ';CACCA',
          },
        },
      ],
    };
    /* eslint-disable no-useless-computed-key*/
    const map2 = {
      version: 3,
      sources: ['src-transformed.js'],
      names: ['gLoBAl'],
      mappings: ';CACCA',
      x_hermes_function_offsets: {[0]: [20, 25, 36], [1]: [47, 220, 300]},
    };

    /* $FlowFixMe[incompatible-type] Natural Inference rollout. See
     * https://fburl.com/gdoc/y8dn025u */
    const mergedMap = composeSourceMaps([map1, map2]);
    expect(mergedMap.x_hermes_function_offsets).toEqual({
      [0]: [20, 25, 36],
      [1]: [47, 220, 300],
    });
    /* eslint-enable no-useless-computed-key*/
  });
});
