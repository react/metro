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

import type {WatcherFileFilter} from '../../flow-types';

import {includedByFilter} from '../common';
import {join} from 'node:path';

describe('includedByFilter', () => {
  const fileFilter: WatcherFileFilter = {
    extensions: new Set(['js', 'json']),
    fileNames: new Set(['package.json', 'BUCK']),
    fileNamePrefixes: ['.metro-health-check'],
  };

  test.each([
    [join('src', 'index.js'), true],
    [join('src', 'index.test.js'), true],
    [join('src', 'data.json'), true],
    ['BUCK', true],
    [join('node_modules', 'foo', 'BUCK'), true],
    [join('src', '.metro-health-check-abc123'), true],
    [join('src', 'index.ts'), false],
    [join('src', 'js'), false],
    [join('src', 'BUCK.v2'), false],
    [join('src', 'x-.metro-health-check'), false],
    [join('.hidden', 'index.js'), true],
  ])('regular file %s -> %s', (relativePath, expected) => {
    expect(includedByFilter('f', fileFilter, relativePath)).toBe(expected);
  });

  test.each([['d'], ['l'], [null]])(
    'type %s is not checked against the filter',
    type => {
      expect(includedByFilter(type, fileFilter, 'foo.ts')).toBe(true);
    },
  );

  test('a null filter includes every regular file', () => {
    expect(includedByFilter('f', null, join('src', 'foo.ts'))).toBe(true);
  });
});
