/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

'use strict';

var AssetPaths = require('../AssetPaths');

const TEST_PLATFORMS = new Set(['ios', 'android']);

// Relative file paths written as posix, in the platform's native format.
const p: (posixPath: string) => string =
  process.platform === 'win32'
    ? posixPath => posixPath.replaceAll('/', '\\')
    : posixPath => posixPath;

describe('AssetPaths', () => {
  test('should get data from name', () => {
    expect(AssetPaths.parse(p('a/b/c.png'), TEST_PLATFORMS)).toEqual({
      resolution: 1,
      assetName: p('a/b/c.png'),
      type: 'png',
      name: 'c',
      platform: null,
    });

    expect(AssetPaths.parse(p('a/b/c@1x.png'), TEST_PLATFORMS)).toEqual({
      resolution: 1,
      assetName: p('a/b/c.png'),
      type: 'png',
      name: 'c',
      platform: null,
    });

    expect(AssetPaths.parse(p('a/b/c@2.5x.png'), TEST_PLATFORMS)).toEqual({
      resolution: 2.5,
      assetName: p('a/b/c.png'),
      type: 'png',
      name: 'c',
      platform: null,
    });

    expect(AssetPaths.parse(p('a/b/c.ios.png'), TEST_PLATFORMS)).toEqual({
      resolution: 1,
      assetName: p('a/b/c.png'),
      type: 'png',
      name: 'c',
      platform: 'ios',
    });

    expect(AssetPaths.parse(p('a/b/c@1x.ios.png'), TEST_PLATFORMS)).toEqual({
      resolution: 1,
      assetName: p('a/b/c.png'),
      type: 'png',
      name: 'c',
      platform: 'ios',
    });

    expect(AssetPaths.parse(p('a/b/c@2.5x.ios.png'), TEST_PLATFORMS)).toEqual({
      resolution: 2.5,
      assetName: p('a/b/c.png'),
      type: 'png',
      name: 'c',
      platform: 'ios',
    });

    expect(AssetPaths.parse(p('a/b /c.png'), TEST_PLATFORMS)).toEqual({
      resolution: 1,
      assetName: p('a/b /c.png'),
      type: 'png',
      name: 'c',
      platform: null,
    });
  });

  describe('resolution extraction', () => {
    test('should extract resolution simple case', () => {
      var data = AssetPaths.parse('test@2x.png', TEST_PLATFORMS);
      expect(data).toEqual({
        assetName: 'test.png',
        resolution: 2,
        type: 'png',
        name: 'test',
        platform: null,
      });
    });

    test('should default resolution to 1', () => {
      var data = AssetPaths.parse('test.png', TEST_PLATFORMS);
      expect(data).toEqual({
        assetName: 'test.png',
        resolution: 1,
        type: 'png',
        name: 'test',
        platform: null,
      });
    });

    test('should support float', () => {
      var data = AssetPaths.parse('test@1.1x.png', TEST_PLATFORMS);
      expect(data).toEqual({
        assetName: 'test.png',
        resolution: 1.1,
        type: 'png',
        name: 'test',
        platform: null,
      });

      data = AssetPaths.parse('test@.1x.png', TEST_PLATFORMS);
      expect(data).toEqual({
        assetName: 'test.png',
        resolution: 0.1,
        type: 'png',
        name: 'test',
        platform: null,
      });

      data = AssetPaths.parse('test@0.2x.png', TEST_PLATFORMS);
      expect(data).toEqual({
        assetName: 'test.png',
        resolution: 0.2,
        type: 'png',
        name: 'test',
        platform: null,
      });
    });
  });
});
