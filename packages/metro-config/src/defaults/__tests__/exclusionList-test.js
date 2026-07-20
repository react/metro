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

import exclusionList from '../exclusionList';

const path = require('node:path');

describe('exclusionList', () => {
  let originalSeparator;

  function setPathSeperator(sep: string) {
    // $FlowFixMe[cannot-write]: property sep is not writable.
    path.sep = sep;
  }

  beforeEach(() => {
    originalSeparator = path.sep;
  });

  afterEach(() => {
    // $FlowFixMe[cannot-write]: property sep is not writable.
    path.sep = originalSeparator;
  });

  test('proves we can write to path.sep for setting up the tests', () => {
    setPathSeperator('/');
    expect(require('node:path').sep).toBe('/');
    setPathSeperator('\\');
    expect(require('node:path').sep).toBe('\\');
  });

  describe('simulate macOS/linux enviornment', () => {
    beforeEach(() => setPathSeperator('/'));

    test('converts forward slashes in the RegExp to the OS specific path separator', () => {
      // Simple case
      expect('a/b/c').toMatch(exclusionList([new RegExp('a/b/c')]));
      expect('a/b/c').toMatch(exclusionList([/a\/b\/c/]));
      // Regular expression that already considered OS specific path separator.
      expect('/foo/bar').toMatch(
        exclusionList([new RegExp('.*[/\\\\]foo[/\\\\]bar')]),
      );
      expect('/foo/bar').toMatch(exclusionList([/.*[/\\]foo[/\\]bar/]));
    });

    test('converts forward slashes in the string to the OS specific path separator', () => {
      // Simple case
      expect('a/b/c').toMatch(exclusionList(['a/b/c']));
      // Make sure the special characters are escaped properly
      expect('^.*[/\\1-9]{3}(foo)s+[/\\]bars?$').toMatch(
        exclusionList(['^.*[/\\1-9]{3}(foo)s+[/\\]bars?$']),
      );
    });

    test('converts forward slashes in the RegExp to the OS specific path separator in nodejs 10 or below', () => {
      // In node version 10 or below, the forward slash in brackets are escaped automatically.
      // eg. /[/\\]/ => /[\/\\]/
      // Ideally this test case should be removed and instead the whole test should run in
      // multiple node versions.
      // Regular expression that already considered OS specific path separator.
      expect('/foo/bar').toMatch(
        exclusionList([new RegExp('.*[\\/\\\\]foo[\\/\\\\]bar')]),
      );
      expect('/foo/bar').toMatch(exclusionList([/.*[\/\\]foo[\/\\]bar/]));
    });
  });

  describe('simulate windows enviornment', () => {
    beforeEach(() => setPathSeperator('\\'));

    test('converts forward slashes in the RegExp to the OS specific path separator', () => {
      // Simple case
      expect('a\\b\\c').toMatch(exclusionList([new RegExp('a/b/c')]));
      expect('a\\b\\c').toMatch(exclusionList([/a\/b\/c/]));
      // Regular expression that already considered OS specific path separator.
      expect('\\foo\\bar').toMatch(
        exclusionList([new RegExp('.*[/\\\\]foo[/\\\\]bar')]),
      );
      expect('\\foo\\bar').toMatch(exclusionList([/.*[/\\]foo[/\\]bar/]));
    });

    test('converts forward slashes in the string to the OS specific path separator', () => {
      // Simple case
      expect('a\\b\\c').toMatch(exclusionList(['a/b/c']));
      // Make sure the special characters are escaped properly
      expect('^.*[\\\\1-9]{3}(foo)s+[\\\\]bars?$').toMatch(
        exclusionList(['^.*[/\\1-9]{3}(foo)s+[/\\]bars?$']),
      );
    });

    test('converts forward slashes in the RegExp to the OS specific path separator in nodejs 10 or below', () => {
      // In node version 10 or below, the forward slash in brackets are escaped automatically.
      // eg. /[/\\]/ => /[\/\\]/
      // Ideally this test case should be removed and instead the whole test should run in
      // multiple node versions.
      // Regular expression that already considered OS specific path separator.
      expect('\\foo\\bar').toMatch(
        exclusionList([new RegExp('.*[\\/\\\\]foo[\\/\\\\]bar')]),
      );
      expect('\\foo\\bar').toMatch(exclusionList([/.*[\/\\]foo[\/\\]bar/]));
    });
  });
});
