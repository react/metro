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

import parsePlatformFilePath from '../parsePlatformFilePath';

const TEST_PLATFORMS = new Set(['ios', 'android']);

describe('parsePlatformFilePath', function () {
  test('should get platform ext', function () {
    const get = (name: string) =>
      parsePlatformFilePath(name, TEST_PLATFORMS).platform;
    expect(get('a.js')).toBe(null);
    expect(get('a.ios.js')).toBe('ios');
    expect(get('a.android.js')).toBe('android');
    expect(get('/b/c/a.ios.js')).toBe('ios');
    expect(get('/b/c.android/a.ios.js')).toBe('ios');
    expect(get('/b/c/a@1.5x.ios.png')).toBe('ios');
    expect(get('/b/c/a@1.5x.lol.png')).toBe(null);
    expect(get('/b/c/a.lol.png')).toBe(null);
    expect(parsePlatformFilePath('a.ios.js', new Set(['ios'])).platform).toBe(
      'ios',
    );
    expect(
      parsePlatformFilePath('a.android.js', new Set(['android'])).platform,
    ).toBe('android');
    expect(
      parsePlatformFilePath('a.ios.js', new Set(['ubuntu'])).platform,
    ).toBe(null);
    expect(
      parsePlatformFilePath('a.ubuntu.js', new Set(['ubuntu'])).platform,
    ).toBe('ubuntu');
  });
});
