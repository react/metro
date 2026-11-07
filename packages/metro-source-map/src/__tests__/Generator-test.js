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

import Generator from '../Generator';

const {objectContaining} = expect;

let generator;
beforeEach(() => {
  generator = new Generator();
});

test('adds file name and source code when starting a file', () => {
  const file1 = 'just/a/file';
  const file2 = 'another/file';
  const source1 = 'var a = 1;';
  const source2 = 'var a = 2;';

  generator.startFile(file1, source1);
  generator.startFile(file2, source2);

  expect(generator.toMap()).toEqual(
    objectContaining({
      sources: [file1, file2],
      sourcesContent: [source1, source2],
    }),
  );
});

test('adds function map when starting a file', () => {
  const file1 = 'just/a/file';
  const file2 = 'another/file';
  const source1 = 'var a = 1;';
  const source2 = 'var a = 2;';

  generator.startFile(file1, source1);
  generator.startFile(file2, source2, {names: ['<global>'], mappings: 'AAA'});

  expect(generator.toMap()).toEqual(
    objectContaining({
      x_facebook_sources: [null, [{names: ['<global>'], mappings: 'AAA'}]],
    }),
  );
});

test('throws when adding a mapping without starting a file', () => {
  expect(() => generator.addSimpleMapping(1, 2)).toThrow();
});

test('throws when adding a mapping after ending a file', () => {
  generator.startFile('apples', 'pears');
  generator.endFile();
  expect(() => generator.addSimpleMapping(1, 2)).toThrow();
});

test('can add a mapping for generated code without corresponding original source', () => {
  generator.startFile('apples', 'pears');
  generator.addSimpleMapping(12, 87);
  expect(generator.toMap()).toEqual(
    objectContaining({
      mappings: ';;;;;;;;;;;uF',
    }),
  );
});

test('can add a mapping with corresponding location in the original source', () => {
  generator.startFile('apples', 'pears');
  generator.addSourceMapping(2, 3, 456, 7);
  expect(generator.toMap()).toEqual(
    objectContaining({
      mappings: ';GAucO',
    }),
  );
});

test('can add a mapping with source location and symbol name', () => {
  generator.startFile('apples', 'pears');
  generator.addNamedSourceMapping(9, 876, 54, 3, 'arbitrary');
  expect(generator.toMap()).toEqual(
    objectContaining({
      mappings: ';;;;;;;;42BAqDGA',
      names: ['arbitrary'],
    }),
  );
});

describe('full map generation', () => {
  beforeEach(() => {
    generator.startFile('apples', 'pears');
    generator.addSimpleMapping(1, 2);
    generator.addNamedSourceMapping(3, 4, 5, 6, 'plums');
    generator.endFile();
    generator.startFile('lemons', 'oranges', undefined, {
      addToIgnoreList: true,
    });
    generator.addNamedSourceMapping(7, 8, 9, 10, 'tangerines');
    generator.addNamedSourceMapping(11, 12, 13, 14, 'tangerines');
    generator.addSimpleMapping(15, 16);
  });

  test('can add multiple mappings for each file', () => {
    expect(generator.toMap()).toEqual({
      version: 3,
      mappings: 'E;;IAIMA;;;;QCIIC;;;;YAIIA;;;;gB',
      sources: ['apples', 'lemons'],
      sourcesContent: ['pears', 'oranges'],
      names: ['plums', 'tangerines'],
      x_google_ignoreList: [1],
    });
  });

  test('can add a `file` property to the map', () => {
    expect(generator.toMap('arbitrary')).toEqual(
      objectContaining({
        file: 'arbitrary',
      }),
    );
  });

  test('supports direct JSON serialization', () => {
    expect(JSON.parse(generator.toString())).toEqual(generator.toMap());
  });

  test('supports direct JSON serialization with a file name', () => {
    const file = 'arbitrary/file';
    expect(JSON.parse(generator.toString(file))).toEqual(generator.toMap(file));
  });
});

describe('x_google_ignoreList', () => {
  test('add files to ignore list', () => {
    const file1 = 'just/a/file';
    const file2 = 'another/file';
    const file3 = 'file3';
    const source1 = 'var a = 1;';
    const source2 = 'var a = 2;';

    generator.startFile(file1, source1, undefined, {addToIgnoreList: true});
    generator.startFile(file2, source2, undefined, {addToIgnoreList: false});
    generator.startFile(file3, source2, undefined, {addToIgnoreList: true});

    expect(generator.toMap()).toEqual(
      objectContaining({
        sources: [file1, file2, file3],
        x_google_ignoreList: [0, 2],
      }),
    );
  });

  test('not emitted if no files are ignored', () => {
    const file1 = 'just/a/file';
    const file2 = 'another/file';
    const file3 = 'file3';
    const source1 = 'var a = 1;';
    const source2 = 'var a = 2;';

    generator.startFile(file1, source1);
    generator.startFile(file2, source2, undefined, {addToIgnoreList: false});
    generator.startFile(file3, source2, undefined, {addToIgnoreList: false});

    expect(generator.toMap()).not.toHaveProperty('x_google_ignoreList');
  });
});
