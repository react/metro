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

jest.mock('node:fs', () => new (require('metro-memory-fs'))());

const {getCacheKey} = require('../index');

const fs = jest.requireMock('node:fs');

beforeAll(() => {
  fs.writeFileSync('/a.txt', 'fake content for a.txt');
  fs.writeFileSync('/copy_of_a.txt', 'fake content for a.txt');
  fs.writeFileSync('/b.txt', 'fake content for b.txt');
});

test('calculates a cache key for a list of files', () => {
  expect(getCacheKey(['/a.txt'])).toMatchInlineSnapshot(
    `"651e28171df9ff5d72a4115295dfce6b"`,
  );

  expect(getCacheKey(['/a.txt', '/b.txt'])).toMatchInlineSnapshot(
    `"40457a98d325b546bed62a34c7d7cf96"`,
  );
});

test('generates different keys for different files', () => {
  expect(getCacheKey(['/a.txt'])).not.toEqual(getCacheKey(['/b.txt']));
});

test('generates identical keys for identical files', () => {
  expect(getCacheKey(['/a.txt'])).toEqual(getCacheKey(['/copy_of_a.txt']));
});
