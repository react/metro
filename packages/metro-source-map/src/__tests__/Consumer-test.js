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

import type {MixedSourceMap} from '../source-map';

import Consumer from '../Consumer';
import {add0, add1} from 'ob1';

const {objectContaining} = expect;

describe('basic maps', () => {
  describe('originalPositionFor', () => {
    test('empty map', () => {
      const consumer = new Consumer({
        version: 3,
        mappings: '',
        names: [],
        sources: [],
      });
      expect(consumer.originalPositionFor({line: add1(0), column: add0(0)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": null,
          "line": null,
          "name": null,
          "source": null,
        }
      `);
    });

    test('empty position is a mutable object', () => {
      const consumer = new Consumer({
        version: 3,
        mappings: '',
        names: [],
        sources: [],
      });
      const empty1 = consumer.originalPositionFor({
        line: add1(0),
        column: add0(0),
      });
      const empty2 = consumer.originalPositionFor({
        line: add1(0),
        column: add0(0),
      });
      expect(empty1).not.toBe(empty2);
      expect(() => {
        empty1.name = 'foo';
        // $FlowFixMe[prop-missing]
        empty1.someProp = 'bar';
      }).not.toThrow();
    });

    test('single full mapping', () => {
      const consumer = new Consumer({
        version: 3,
        mappings: 'AAAAA',
        names: ['name0'],
        sources: ['source0'],
      });
      expect(consumer.originalPositionFor({line: add1(0), column: add0(0)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 0,
          "line": 1,
          "name": "name0",
          "source": "source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(10)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 0,
          "line": 1,
          "name": "name0",
          "source": "source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(1), column: add0(0)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": null,
          "line": null,
          "name": null,
          "source": null,
        }
      `);
    });

    test('multiple lines', () => {
      const consumer = new Consumer({
        version: 3,
        mappings: 'AAAAA;CAAC;EAAEC',
        names: ['name0', 'name1'],
        sources: ['source0'],
      });

      expect(consumer.originalPositionFor({line: add1(0), column: add0(0)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 0,
          "line": 1,
          "name": "name0",
          "source": "source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(1), column: add0(1)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 1,
          "line": 1,
          "name": null,
          "source": "source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(2), column: add0(2)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 3,
          "line": 1,
          "name": "name1",
          "source": "source0",
        }
      `);
    });
  });

  describe('generatedMappings()', () => {
    test('single full mapping', () => {
      expect([
        ...new Consumer({
          version: 3,
          mappings: 'AAAAA',
          names: ['name0'],
          sources: ['source0'],
        }).generatedMappings(),
      ]).toMatchInlineSnapshot(`
        Array [
          Object {
            "generatedColumn": 0,
            "generatedLine": 1,
            "name": "name0",
            "originalColumn": 0,
            "originalLine": 1,
            "source": "source0",
          },
        ]
      `);
    });

    test('mapping with only generatedColumn', () => {
      expect([
        ...new Consumer({
          version: 3,
          mappings: 'A',
          names: ['name0'],
          sources: ['source0'],
        }).generatedMappings(),
      ]).toMatchInlineSnapshot(`
        Array [
          Object {
            "generatedColumn": 0,
            "generatedLine": 1,
            "name": null,
            "originalColumn": null,
            "originalLine": null,
            "source": null,
          },
        ]
      `);
    });

    test('multiple lines', () => {
      expect([
        ...new Consumer({
          version: 3,
          mappings: 'AAAAA;CAAC;EAAEC',
          names: ['name0', 'name1'],
          sources: ['source0'],
        }).generatedMappings(),
      ]).toMatchInlineSnapshot(`
        Array [
          Object {
            "generatedColumn": 0,
            "generatedLine": 1,
            "name": "name0",
            "originalColumn": 0,
            "originalLine": 1,
            "source": "source0",
          },
          Object {
            "generatedColumn": 1,
            "generatedLine": 2,
            "name": null,
            "originalColumn": 1,
            "originalLine": 1,
            "source": "source0",
          },
          Object {
            "generatedColumn": 2,
            "generatedLine": 3,
            "name": "name1",
            "originalColumn": 3,
            "originalLine": 1,
            "source": "source0",
          },
        ]
      `);
    });

    test('multi-digit and negative deltas, empty segments and lines', () => {
      expect([
        ...new Consumer({
          version: 3,
          mappings: 'AAAU,gBCoBHC,,w+B;;KDjBg9D',
          names: ['name0', 'name1'],
          sources: ['source0', 'source1'],
        }).generatedMappings(),
      ]).toEqual([
        {
          generatedLine: 1,
          generatedColumn: 0,
          source: 'source0',
          name: null,
          originalLine: 1,
          originalColumn: 10,
        },
        {
          generatedLine: 1,
          generatedColumn: 16,
          source: 'source1',
          name: 'name1',
          originalLine: 21,
          originalColumn: 7,
        },
        {
          generatedLine: 1,
          generatedColumn: 1016,
          source: null,
          name: null,
          originalLine: null,
          originalColumn: null,
        },
        {
          generatedLine: 3,
          generatedColumn: 5,
          source: 'source0',
          name: null,
          originalLine: 4,
          originalColumn: 2007,
        },
      ]);
    });

    test.each([
      ['AA', 'Invalid original line delta'],
      ['AAAA,AAA', 'Invalid original column delta'],
      ['AAAA,A!AA', undefined],
    ])('throws on malformed mappings %s', (mappings, message) => {
      const consumer = new Consumer({
        version: 3,
        mappings,
        names: [],
        sources: ['source0'],
      });
      expect(() => [...consumer.generatedMappings()]).toThrow(message);
    });
  });

  describe('sourceContentFor', () => {
    test('missing sourcesContent', () => {
      const consumer = new Consumer({
        version: 3,
        mappings: '',
        names: [],
        sources: [],
      });
      expect(consumer.sourceContentFor('a.js', true)).toBeNull();
    });

    test('null in sourcesContent', () => {
      const consumer = new Consumer({
        version: 3,
        mappings: '',
        names: [],
        sources: ['a.js'],
        sourcesContent: [null],
      });
      expect(consumer.sourceContentFor('a.js', true)).toBeNull();
    });

    test('sourcesContent too short', () => {
      const consumer = new Consumer({
        version: 3,
        mappings: '',
        names: [],
        sources: ['a.js'],
        sourcesContent: [],
      });
      expect(consumer.sourceContentFor('a.js', true)).toBeNull();
    });

    test('string in sourcesContent', () => {
      const consumer = new Consumer({
        version: 3,
        mappings: '',
        names: [],
        sources: ['a.js'],
        sourcesContent: ['content of a.js'],
      });
      expect(consumer.sourceContentFor('a.js', true)).toBe('content of a.js');
    });
  });
});

describe('indexed (sectioned) maps', () => {
  describe('originalPositionFor', () => {
    test('empty map', () => {
      const consumer = new Consumer({
        version: 3,
        sections: [],
      });
      expect(consumer.originalPositionFor({line: add1(0), column: add0(0)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": null,
          "line": null,
          "name": null,
          "source": null,
        }
      `);
    });

    test('empty position is a mutable object', () => {
      const consumer = new Consumer({
        version: 3,
        sections: [],
      });
      const empty1 = consumer.originalPositionFor({
        line: add1(0),
        column: add0(0),
      });
      const empty2 = consumer.originalPositionFor({
        line: add1(0),
        column: add0(0),
      });
      expect(empty1).not.toBe(empty2);
      expect(() => {
        empty1.name = 'foo';
        // $FlowFixMe[prop-missing]
        empty1.someProp = 'bar';
      }).not.toThrow();
    });

    test('section per column', () => {
      const consumer = new Consumer({
        version: 3,
        sections: [
          {
            offset: {line: 0, column: 0},
            map: {
              version: 3,
              names: ['section0_name0'],
              sources: ['section0_source0'],
              mappings: 'AAEEA',
            },
          },
          {
            offset: {line: 0, column: 1},
            map: {
              version: 3,
              names: ['section1_name0'],
              sources: ['section1_source0'],
              mappings: 'AAEEA',
            },
          },
          {
            offset: {line: 0, column: 2},
            map: {
              version: 3,
              names: ['section2_name0'],
              sources: ['section2_source0'],
              mappings: 'AAEEA',
            },
          },
        ],
      });
      expect(consumer.originalPositionFor({line: add1(0), column: add0(0)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section0_name0",
          "source": "section0_source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(1)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section1_name0",
          "source": "section1_source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(2)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section2_name0",
          "source": "section2_source0",
        }
      `);
    });

    test('column offset only applies to first line of section', () => {
      const consumer = new Consumer({
        version: 3,
        sections: [
          {
            offset: {line: 5, column: 1000},
            map: {
              version: 3,
              names: ['section0_name0', 'section0_name1'],
              sources: ['section0_source0', 'section0_source1'],
              mappings: 'AAEEA,G;ECAAC,C;C',
            },
          },
        ],
      });
      expect(consumer.originalPositionFor({line: add1(5), column: add0(1002)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section0_name0",
          "source": "section0_source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(5), column: add0(1003)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": null,
          "line": null,
          "name": null,
          "source": null,
        }
      `);
      expect(consumer.originalPositionFor({line: add1(6), column: add0(2)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section0_name1",
          "source": "section0_source1",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(6), column: add0(3)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": null,
          "line": null,
          "name": null,
          "source": null,
        }
      `);
      expect(consumer.originalPositionFor({line: add1(6), column: add0(1002)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": null,
          "line": null,
          "name": null,
          "source": null,
        }
      `);
    });

    test('unmapped regions', () => {
      const consumer = new Consumer({
        version: 3,
        sections: [
          {
            offset: {line: 0, column: 0},
            map: {
              version: 3,
              names: ['section0_name0'],
              sources: ['section0_source0'],
              mappings: 'CAEEA',
            },
          },
          {
            offset: {line: 0, column: 2},
            map: {
              version: 3,
              names: ['section1_name0'],
              sources: ['section1_source0'],
              mappings: 'CAEEA,C',
            },
          },
          {
            offset: {line: 0, column: 4},
            map: {
              version: 3,
              names: ['section2_name0'],
              sources: ['section2_source0'],
              mappings: 'CAEEA',
            },
          },
        ],
      });
      expect(consumer.originalPositionFor({line: add1(0), column: add0(0)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": null,
          "line": null,
          "name": null,
          "source": null,
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(1)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section0_name0",
          "source": "section0_source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(3)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section1_name0",
          "source": "section1_source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(4)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": null,
          "line": null,
          "name": null,
          "source": null,
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(5)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section2_name0",
          "source": "section2_source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(6)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section2_name0",
          "source": "section2_source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(7)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section2_name0",
          "source": "section2_source0",
        }
      `);
    });
  });

  describe('generatedMappings()', () => {
    test('applies the section offset to generated positions', () => {
      const consumer = new Consumer({
        version: 3,
        sections: [
          {
            offset: {line: 0, column: 0},
            map: {
              version: 3,
              names: [],
              sources: ['section0_source0'],
              mappings: 'AAAA',
            },
          },
          {
            offset: {line: 0, column: 4},
            map: {
              version: 3,
              names: [],
              sources: ['section1_source0'],
              mappings: 'CAAA;AACA',
            },
          },
        ],
      });
      expect(
        [...consumer.generatedMappings()].map(mapping => [
          mapping.generatedLine,
          mapping.generatedColumn,
          mapping.source,
        ]),
      ).toEqual([
        [1, 0, 'section0_source0'],
        // Unmapped from the start of section 1 until its first mapping
        [1, 4, null],
        [1, 5, 'section1_source0'],
        // The column offset only applies to the first line of a section
        [2, 0, 'section1_source0'],
      ]);
    });
  });

  describe('sourceContentFor', () => {
    test('empty map', () => {
      const consumer = new Consumer({
        version: 3,
        sections: [],
      });
      expect(consumer.sourceContentFor('a.js', true)).toBeNull();
    });

    test('found in section', () => {
      const consumer = new Consumer({
        version: 3,
        sections: [
          {
            offset: {line: 0, column: 0},
            map: {
              version: 3,
              mappings: '',
              names: [],
              sources: ['a.js'],
              sourcesContent: ['content of a.js'],
            },
          },
        ],
      });
      expect(consumer.sourceContentFor('a.js', true)).toBe('content of a.js');
    });

    test('found in multiple sections', () => {
      const consumer = new Consumer({
        version: 3,
        sections: [
          {
            offset: {line: 0, column: 0},
            map: {
              version: 3,
              mappings: '',
              names: [],
              sources: ['a.js'],
              sourcesContent: [null],
            },
          },
          {
            offset: {line: 1, column: 0},
            map: {
              version: 3,
              mappings: '',
              names: [],
              sources: ['a.js'],
              sourcesContent: ['content of a.js'],
            },
          },
        ],
      });
      expect(consumer.sourceContentFor('a.js', true)).toBe('content of a.js');
    });
  });
});

describe('.file', () => {
  test('is passed through from map', () => {
    const consumer = new Consumer({
      version: 3,
      mappings: '',
      names: [],
      sources: [],
      file: 'foo',
    });
    expect(consumer.file).toBe('foo');
  });

  test('is not required', () => {
    const consumer = new Consumer({
      version: 3,
      mappings: '',
      names: [],
      sources: [],
    });
    expect(consumer.file).toBe(undefined);
  });

  test('works with indexed map', () => {
    const consumer = new Consumer({
      version: 3,
      sections: [],
      file: 'foo',
    });
    expect(consumer.file).toBe('foo');
  });
});

describe('source path normalization', () => {
  test('./foo.js -> foo.js', () => {
    const consumer = new Consumer({
      version: 3,
      mappings: 'AAAA',
      names: [],
      sources: ['./foo.js'],
    });
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(0)}).source,
    ).toBe('foo.js');
  });

  test('if sourceRoot is absolute, relativize absolute sources', () => {
    const consumer = new Consumer({
      version: 3,
      mappings: 'AAAA',
      names: [],
      sources: ['/some/other/absolute/path/foo.js'],
      sourceRoot: '/some/absolute/path',
    });
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(0)}).source,
    ).toBe('../../other/absolute/path/foo.js');
  });

  test('if sourceRoot is absolute, keep relative sources relative', () => {
    const consumer = new Consumer({
      version: 3,
      mappings: 'AAAA',
      names: [],
      sources: ['more/directories/foo.js'],
      sourceRoot: '/some/absolute/path',
    });
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(0)}).source,
    ).toBe('more/directories/foo.js');
  });
});

describe('known bugs in source-map', () => {
  test('accepts mappings without sources in an indexed map', () => {
    const map: MixedSourceMap = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            names: [] as Array<string>,
            sources: [] as Array<string>,
            mappings: 'A',
          },
        },
      ],
    };
    const consumer = new Consumer(map);
    const mappings = [];
    consumer.eachMapping(mapping => {
      mappings.push(mapping);
    });
    expect(mappings).toEqual([
      objectContaining({
        source: null,
        generatedLine: 1,
        generatedColumn: 0,
        originalLine: null,
        originalColumn: null,
        name: null,
      }),
    ]);
  });

  test('accepts mappings without names in an indexed map', () => {
    const map: MixedSourceMap = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            names: [] as Array<string>,
            sources: ['foo.js'],
            mappings: 'AAAA',
          },
        },
      ],
    };
    const consumer = new Consumer(map);
    const mappings = [];
    consumer.eachMapping(mapping => {
      mappings.push(mapping);
    });
    expect(mappings).toEqual([
      objectContaining({
        generatedLine: 1,
        generatedColumn: 0,
        originalLine: 1,
        originalColumn: 0,
        name: null,
      }),
    ]);
  });

  test('accepts mappings to the first name entry in an indexed map', () => {
    const map: MixedSourceMap = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            names: ['first'],
            sources: ['foo.js'],
            mappings: 'AAAAA',
          },
        },
      ],
    };
    const consumer = new Consumer(map);
    const mappings = [];
    consumer.eachMapping(mapping => {
      mappings.push(mapping);
    });
    expect(mappings).toEqual([
      objectContaining({
        generatedLine: 1,
        generatedColumn: 0,
        originalLine: 1,
        originalColumn: 0,
        name: 'first',
      }),
    ]);
  });

  test('processes sources correctly in an indexed map', () => {
    const map: MixedSourceMap = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            names: ['first', 'second'],
            sources: ['foo.js', 'bar.js'],
            mappings: 'AAAAA,CCCCC',
          },
        },
      ],
    };
    const consumer = new Consumer(map);
    const mappings = [];
    consumer.eachMapping(mapping => {
      mappings.push(mapping);
    });
    expect(mappings).toEqual([
      objectContaining({
        source: 'foo.js',
        generatedLine: 1,
        generatedColumn: 0,
        originalLine: 1,
        originalColumn: 0,
      }),
      objectContaining({
        source: 'bar.js',
        generatedLine: 1,
        generatedColumn: 1,
        originalLine: 2,
        originalColumn: 1,
      }),
    ]);
  });

  test('supports unmapped sections in an indexed map', () => {
    const map: MixedSourceMap = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            names: ['first', 'second'],
            sources: ['foo.js', 'bar.js'],
            mappings: 'AAAAA,CCCCC',
          },
        },
        {
          offset: {line: 0, column: 2},
          map: {
            version: 3,
            names: [] as Array<string>,
            sources: [] as Array<string>,
            mappings: '',
          },
        },
      ],
    };
    const consumer = new Consumer(map);
    expect(
      consumer.originalPositionFor({line: add1(1), column: add0(0)}),
    ).toEqual(
      expect.objectContaining({
        source: null,
        line: null,
        column: null,
        name: null,
      }),
    );
  });

  test('performs lookup correctly in an indexed map', () => {
    const map: MixedSourceMap = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            names: ['first', 'second'],
            sources: ['foo.js', 'bar.js'],
            mappings: 'AAAAA,CCCCC',
          },
        },
        {
          offset: {line: 0, column: 2},
          map: {
            version: 3,
            names: ['third', 'fourth'],
            sources: ['baz.js', 'quux.js'],
            mappings: 'AAAAA,CCCCC',
          },
        },
      ],
    };
    const consumer = new Consumer(map);
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(0)}),
    ).toEqual(objectContaining({source: 'foo.js', line: 1, column: 0}));
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(1)}),
    ).toEqual(objectContaining({source: 'bar.js', line: 2, column: 1}));
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(2)}),
    ).toEqual(objectContaining({source: 'baz.js', line: 1, column: 0}));
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(3)}),
    ).toEqual(objectContaining({source: 'quux.js', line: 2, column: 1}));
  });

  test('performs lookup correctly in a non-indexed map', () => {
    const map: MixedSourceMap = {
      version: 3,
      names: ['first', 'second'],
      sources: ['foo.js', 'bar.js'],
      mappings: 'AAAAA,CCCCC',
    };
    const consumer = new Consumer(map);
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(0)}),
    ).toEqual(
      objectContaining({source: 'foo.js', line: 1, column: 0, name: 'first'}),
    );
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(1)}),
    ).toEqual(
      objectContaining({source: 'bar.js', line: 2, column: 1, name: 'second'}),
    );
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(2)}),
    ).toEqual(
      objectContaining({source: 'bar.js', line: 2, column: 1, name: 'second'}),
    );
  });
});
