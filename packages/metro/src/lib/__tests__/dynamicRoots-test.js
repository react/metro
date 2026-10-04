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

import {
  DYNAMIC_ROOT_ID_LENGTH,
  getDynamicRootId,
  getDynamicRoots,
} from '../dynamicRoots';

describe('getDynamicRootId', () => {
  afterEach(() => {
    jest.dontMock('node:path');
    jest.resetModules();
  });

  test('is DYNAMIC_ROOT_ID_LENGTH hex digits', () => {
    expect(getDynamicRootId('../store/lib')).toMatch(
      new RegExp(`^[0-9a-f]{${DYNAMIC_ROOT_ID_LENGTH}}$`),
    );
  });

  test('differs between roots', () => {
    expect(getDynamicRootId('../store/lib')).not.toBe(
      getDynamicRootId('../store/other'),
    );
  });

  // Fixed ids, so that a change to them, which invalidates URLs and caches
  // across machines, is deliberate.
  test.each([
    ['posix', '../node_modules/@babel/runtime', '94885242'],
    ['win32', '..\\node_modules\\@babel\\runtime', '94885242'],
    ['posix', '../../../D:/store/lib', '470342d5'],
    ['win32', '..\\..\\..\\D:\\store\\lib', '470342d5'],
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

describe('getDynamicRoots', () => {
  const root = (
    absolutePath: string,
    rootRelativePath: string,
    dynamic: boolean,
  ) => ({absolutePath, rootRelativePath, dynamic});

  test('returns only dynamic roots, with ids of their relative paths', () => {
    expect(
      getDynamicRoots([
        root('/repo/app', '', false),
        root('/repo/packages', '../packages', false),
        root('/store/lib', '../../store/lib', true),
      ]),
    ).toEqual([
      {id: getDynamicRootId('../../store/lib'), rootDir: '/store/lib'},
    ]);
  });

  test('orders a root before any nested within it, whatever the input order', () => {
    const dynamic = [
      root('/store/lib/inner', '../../store/lib/inner', true),
      root('/zzz', '../../zzz', true),
      root('/store/lib', '../../store/lib', true),
    ];
    const expected = ['/zzz', '/store/lib', '/store/lib/inner'];
    expect(getDynamicRoots(dynamic).map(({rootDir}) => rootDir)).toEqual(
      expected,
    );
    expect(
      getDynamicRoots([...dynamic].reverse()).map(({rootDir}) => rootDir),
    ).toEqual(expected);
  });

  test('throws if two roots have the same id', () => {
    // Paths whose ids collide, found by search.
    expect(getDynamicRootId('../store/87657')).toBe(
      getDynamicRootId('../store/102961'),
    );
    expect(() =>
      getDynamicRoots([
        root('/store/87657', '../store/87657', true),
        root('/store/102961', '../store/102961', true),
      ]),
    ).toThrow(
      "Roots '/store/87657' and '/store/102961' have the same id '50663933'",
    );
  });
});
