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

import {getDynamicRootId} from '../dynamicRoots';

describe('getDynamicRootId', () => {
  afterEach(() => {
    jest.dontMock('node:path');
    jest.resetModules();
  });

  test('is never numeric, so cannot be read as a watchFolders index', () => {
    expect(getDynamicRootId('../store/lib')).toMatch(/^h[0-9a-f]{16}$/);
  });

  test('differs between roots', () => {
    expect(getDynamicRootId('../store/lib')).not.toBe(
      getDynamicRootId('../store/other'),
    );
  });

  // Fixed ids, so that a change to them, which invalidates URLs and caches
  // across machines, is deliberate.
  test.each([
    ['posix', '../node_modules/@babel/runtime', 'h94885242380f5c5f'],
    ['win32', '..\\node_modules\\@babel\\runtime', 'h94885242380f5c5f'],
    ['posix', '../../../D:/store/lib', 'h470342d5d739c7d8'],
    ['win32', '..\\..\\..\\D:\\store\\lib', 'h470342d5d739c7d8'],
  ])('is the same on any OS: %s %s', (platform, rootRelativePath, id) => {
    jest.resetModules();
    jest.doMock('node:path', () => {
      const actualPath = jest.requireActual<{
        posix: unknown,
        win32: unknown,
      }>('node:path');
      return platform === 'win32' ? actualPath.win32 : actualPath.posix;
    });
    const {
      getDynamicRootId: getDynamicRootIdOnPlatform,
    } = require('../dynamicRoots');
    expect(getDynamicRootIdOnPlatform(rootRelativePath)).toBe(id);
  });
});
