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
const {BundleBuilder} = require('../BundleBuilder');
const {Consumer} = require('../source-map');
const {add0, add1} = require('ob1');

const {objectContaining} = expect;

let builder;
beforeEach(() => {
  builder = new BundleBuilder('bundle.js');
});

describe('BundleBuilder', () => {
  test('empty', () => {
    expect(builder.getCode()).toBe('');
    expect(builder.getMap()).toMatchInlineSnapshot(`
      Object {
        "file": "bundle.js",
        "sections": Array [],
        "version": 3,
      }
    `);
  });

  test('single empty region', () => {
    builder.append('');
    expect(builder.getCode()).toBe('');
    expect(builder.getMap()).toMatchInlineSnapshot(`
      Object {
        "file": "bundle.js",
        "sections": Array [],
        "version": 3,
      }
    `);
  });

  test('single unmapped region', () => {
    builder.append('abcdef');
    expect(builder.getCode()).toBe('abcdef');
    expect(builder.getMap()).toMatchInlineSnapshot(`
      Object {
        "file": "bundle.js",
        "sections": Array [],
        "version": 3,
      }
    `);
  });

  test('single unmapped region ending in newline', () => {
    builder.append('abcdef\n');
    expect(builder.getCode()).toBe('abcdef\n');
    expect(builder.getMap()).toMatchInlineSnapshot(`
      Object {
        "file": "bundle.js",
        "sections": Array [],
        "version": 3,
      }
    `);
  });

  test('two unmapped regions in one line', () => {
    builder.append('abc').append('def');
    expect(builder.getCode()).toBe('abcdef');
    expect(builder.getMap()).toMatchInlineSnapshot(`
      Object {
        "file": "bundle.js",
        "sections": Array [],
        "version": 3,
      }
    `);
  });

  test('two mapped regions in one line', () => {
    builder
      .append('abc', {version: 3, mappings: 'A', names: [], sources: []})
      .append('def', {version: 3, mappings: 'A,C', names: [], sources: []});
    expect(builder.getCode()).toBe('abcdef');
    expect(builder.getMap()).toMatchInlineSnapshot(`
      Object {
        "file": "bundle.js",
        "sections": Array [
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 0,
            },
          },
          Object {
            "map": Object {
              "mappings": "A,C",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 3,
              "line": 0,
            },
          },
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 6,
              "line": 0,
            },
          },
        ],
        "version": 3,
      }
    `);
  });

  test('two mapped regions with newlines', () => {
    builder
      .append('abc\n', {
        version: 3,
        mappings: 'A',
        names: [],
        sources: [],
      })
      .append('def\n', {
        version: 3,
        mappings: 'A,C',
        names: [],
        sources: [],
      });
    expect(builder.getCode()).toBe('abc\ndef\n');
    expect(builder.getMap()).toMatchInlineSnapshot(`
      Object {
        "file": "bundle.js",
        "sections": Array [
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 0,
            },
          },
          Object {
            "map": Object {
              "mappings": "A,C",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 1,
            },
          },
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 2,
            },
          },
        ],
        "version": 3,
      }
    `);
  });

  test('unmapped columns before a mapped region', () => {
    builder.append('abc').append('def\n', {
      version: 3,
      mappings: 'A',
      names: [],
      sources: [],
    });
    expect(builder.getCode()).toBe('abcdef\n');
    expect(builder.getMap()).toMatchInlineSnapshot(`
      Object {
        "file": "bundle.js",
        "sections": Array [
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 3,
              "line": 0,
            },
          },
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 1,
            },
          },
        ],
        "version": 3,
      }
    `);
  });

  test('CR newlines', () => {
    builder.append('\r\r').append('abc', {
      version: 3,
      mappings: 'A',
      names: [],
      sources: [],
    });
    expect(builder.getCode()).toBe('\r\rabc');
    expect(builder.getMap()).toMatchInlineSnapshot(`
      Object {
        "file": "bundle.js",
        "sections": Array [
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 2,
            },
          },
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 3,
              "line": 2,
            },
          },
        ],
        "version": 3,
      }
    `);
  });

  test('LF newlines', () => {
    builder.append('\n\n').append('abc', {
      version: 3,
      mappings: 'A',
      names: [],
      sources: [],
    });
    expect(builder.getCode()).toBe('\n\nabc');
    expect(builder.getMap()).toMatchInlineSnapshot(`
      Object {
        "file": "bundle.js",
        "sections": Array [
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 2,
            },
          },
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 3,
              "line": 2,
            },
          },
        ],
        "version": 3,
      }
    `);
  });

  test('CRLF newlines', () => {
    builder.append('\r\n\r\n').append('abc', {
      version: 3,
      mappings: 'A',
      names: [],
      sources: [],
    });
    expect(builder.getCode()).toBe('\r\n\r\nabc');
    expect(builder.getMap()).toMatchInlineSnapshot(`
      Object {
        "file": "bundle.js",
        "sections": Array [
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 2,
            },
          },
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 3,
              "line": 2,
            },
          },
        ],
        "version": 3,
      }
    `);
  });

  test('mapped, unmapped, mapped', () => {
    builder
      .append('abc\n', {
        version: 3,
        mappings: 'A',
        names: [],
        sources: [],
      })
      .append('def\n')
      .append('ghi\n', {
        version: 3,
        mappings: 'A,C',
        names: [],
        sources: [],
      });
    expect(builder.getCode()).toBe('abc\ndef\nghi\n');
    expect(builder.getMap()).toMatchInlineSnapshot(`
      Object {
        "file": "bundle.js",
        "sections": Array [
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 0,
            },
          },
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 1,
            },
          },
          Object {
            "map": Object {
              "mappings": "A,C",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 2,
            },
          },
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 3,
            },
          },
        ],
        "version": 3,
      }
    `);
  });

  test('mapped, unmapped', () => {
    builder
      .append('abc\n', {
        version: 3,
        mappings: 'A',
        names: [],
        sources: [],
      })
      .append('def\n');
    expect(builder.getCode()).toBe('abc\ndef\n');
    expect(builder.getMap()).toMatchInlineSnapshot(`
      Object {
        "file": "bundle.js",
        "sections": Array [
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 0,
            },
          },
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 1,
            },
          },
        ],
        "version": 3,
      }
    `);
  });

  test('getMap is idempotent', () => {
    const abcMap = {
      version: 3,
      mappings: 'A',
      names: [] as Array<string>,
      sources: [] as Array<string>,
    };

    const builderBase = new BundleBuilder('bundle.js');

    builderBase.append('abc\n', abcMap);
    builder.append('abc\n', abcMap);

    // Call getMap an extra time on one of the builders
    builder.getMap();

    expect(builder.getMap()).toEqual(builderBase.getMap());
  });

  test('mapped, unmapped, partially mapped', () => {
    builder
      .append('abc\n', {
        version: 3,
        mappings: 'A',
        names: [],
        sources: [],
      })
      .append('def\n')
      .append('ghi\n', {
        version: 3,
        mappings: 'C', // The first character of this region is unmapped!
        names: [],
        sources: [],
      });
    expect(builder.getCode()).toBe('abc\ndef\nghi\n');
    expect(builder.getMap()).toMatchInlineSnapshot(`
      Object {
        "file": "bundle.js",
        "sections": Array [
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 0,
            },
          },
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 1,
            },
          },
          Object {
            "map": Object {
              "mappings": "C",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 2,
            },
          },
          Object {
            "map": Object {
              "mappings": "A",
              "names": Array [],
              "sources": Array [],
              "version": 3,
            },
            "offset": Object {
              "column": 0,
              "line": 3,
            },
          },
        ],
        "version": 3,
      }
    `);
  });

  test('encodes unmapped regions correctly', () => {
    const builder = new BundleBuilder('bundle.js');
    builder
      .append('abc\n', {
        version: 3,
        mappings: 'AAAAA',
        names: ['ABC'],
        sources: ['abc.js'],
      })
      .append('def\n')
      .append('ghi\n', {
        version: 3,
        mappings: 'CAACA', // The first character of this region is unmapped!
        names: ['GHI'],
        sources: ['ghi.js'],
      });
    const map = builder.getMap();
    const code = builder.getCode();
    expect(code).toMatchInlineSnapshot(`
      "abc
      def
      ghi
      "
    `);
    const consumer = new Consumer(map);
    expect(consumer.originalPositionFor(find(code, 'abc'))).toEqual(
      objectContaining({line: 1, column: 0, source: 'abc.js'}),
    );
    expect(consumer.originalPositionFor(find(code, 'def'))).toEqual(
      objectContaining({line: null, column: null, source: null}),
    );
    expect(consumer.originalPositionFor(find(code, 'g'))).toEqual(
      objectContaining({line: null, column: null, source: null}),
    );
    expect(consumer.originalPositionFor(find(code, 'hi'))).toEqual(
      objectContaining({line: 1, column: 1, source: 'ghi.js'}),
    );
  });
});

function find(text: string, string: string) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const column = lines[i].indexOf(string);
    if (column !== -1) {
      return {line: add1(i), column: add0(column)};
    }
  }
  throw new Error(`${string} not found in code, this test is broken`);
}
