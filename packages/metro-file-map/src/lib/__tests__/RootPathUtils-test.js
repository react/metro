/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 * @oncall react_native
 */

import type {RootPathUtils as RootPathUtilsT} from '../RootPathUtils';

let mockPathModule;
jest.mock('node:path', () => mockPathModule);

describe.each([['win32'], ['posix']])('RootPathUtils on %s', platform => {
  // Convenience function to write paths with posix separators but convert them
  // to system separators
  const p: string => string = filePath =>
    platform === 'win32'
      ? filePath.replace(/\//g, '\\').replace(/^\\/, 'C:\\')
      : filePath;

  let RootPathUtils: Class<RootPathUtilsT>;
  let pathUtils: RootPathUtilsT;
  let pathRelative: JestMockFn<[string, string], string>;
  let sep: string;

  beforeEach(() => {
    jest.resetModules();
    mockPathModule = jest.requireActual<{}>('path')[platform];
    sep = mockPathModule.sep;
    pathRelative = jest.spyOn(mockPathModule, 'relative');
    RootPathUtils = require('../RootPathUtils').RootPathUtils;
  });

  test.each([
    p('/project/root/baz/foobar'),
    p('/project/root/../root2/foobar'),
    p('/project/root/../../project2/foo'),
    p('/project/root/../../project/foo'),
    p('/project/root/../../project/foo/'),
    p('/project/root/../../project/root'),
    p('/project/root/../../project/root/'),
    p('/project/root/../../project/root/foo.js'),
    p('/project/bar'),
    p('/project/bar/'),
    p('/project/../outside/bar'),
    p('/project/baz/foobar'),
    p('/project/rootfoo/baz'),
    p('/project'),
    p('/project/'),
    p('/'),
    p('/outside'),
    p('/outside/'),
  ])(`absoluteToNormal('%s') is correct and optimised`, absolutePath => {
    const rootDir = p('/project/root');
    pathUtils = new RootPathUtils(rootDir);
    let expected = mockPathModule.relative(rootDir, absolutePath);
    // Unlike path.relative, we expect to preserve trailing separators.
    if (absolutePath.endsWith(sep) && expected !== '') {
      expected += sep;
    }
    pathRelative.mockClear();
    expect(pathUtils.absoluteToNormal(absolutePath)).toEqual(expected);
    expect(pathRelative).not.toHaveBeenCalled();
  });

  describe.each([p('/project/root'), p('/')])('root: %s', rootDir => {
    beforeEach(() => {
      pathRelative.mockClear();
      pathUtils = new RootPathUtils(rootDir);
    });

    test.each([
      p('/project/root/../root2/../root3/foo'),
      p('/project/root/./baz/foo/bar'),
      p('/project/root/a./../foo'),
      p('/project/root/../a./foo'),
      p('/project/root/.././foo'),
      p('/project/root/.././foo/'),
    ])(`absoluteToNormal('%s') falls back to path.relative`, absolutePath => {
      let expected = mockPathModule.relative(rootDir, absolutePath);
      // Unlike path.relative, we expect to preserve trailing separators.
      if (absolutePath.endsWith(sep) && !expected.endsWith(sep)) {
        expected += sep;
      }
      pathRelative.mockClear();
      expect(pathUtils.absoluteToNormal(absolutePath)).toEqual(expected);
      expect(pathRelative).toHaveBeenCalled();
    });

    const normalToAbsoluteInputs =
      rootDir === p('/project/root')
        ? [
            p('..'),
            p('../..'),
            p('../../'),
            p('normal/path'),
            p('normal/path/'),
            p('../normal/path'),
            p('../normal/path/'),
            p('../../normal/path'),
            // On POSIX, `..` at the root re-enters the root
            ...(platform === 'posix' ? [p('../../../normal/path')] : []),
          ]
        : [
            p('..'),
            p('../..'),
            p('../../'),
            p('normal/path'),
            p('normal/path/'),
          ];

    test.each(normalToAbsoluteInputs)(
      `normalToAbsolute('%s') matches path.resolve`,
      normalPath => {
        let expected = mockPathModule.resolve(rootDir, normalPath);
        // Unlike path.resolve, we expect to preserve trailing separators.
        if (normalPath.endsWith(sep) && !expected.endsWith(sep)) {
          expected += sep;
        }
        expect(pathUtils.normalToAbsolute(normalPath)).toEqual(expected);
      },
    );

    const relativeToNormalInputs =
      rootDir === p('/project/root')
        ? [
            p('..'),
            p('../root'),
            p('../root/path'),
            p('../project'),
            p('../project/'),
            p('../../project/root'),
            p('../../project/root/'),
            p('../../..'),
            // On POSIX, `..` at the root re-enters the root
            ...(platform === 'posix'
              ? [p('../../../normal/path'), p('../../../normal/path/')]
              : []),
          ]
        : [p('..')];

    test.each(relativeToNormalInputs)(
      `relativeToNormal('%s') matches path.resolve + path.relative`,
      relativePath => {
        let expected = mockPathModule.relative(
          rootDir,
          mockPathModule.resolve(rootDir, relativePath),
        );
        // Unlike native path.resolve + path.relative, we expect to preserve
        // trailing separators. (Consistent with path.normalize.)
        if (
          relativePath.endsWith(sep) &&
          !expected.endsWith(sep) &&
          expected !== ''
        ) {
          expected += sep;
        }
        expect(pathUtils.relativeToNormal(relativePath)).toEqual(expected);
      },
    );
  });

  test.each([
    ['foo', null],
    ['', 0],
    ['..', 1],
    [p('../..'), 2],
    [p('../../..'), 3],
    [p('../../../foo'), null],
    [p('../../../..foo'), null],
  ])('getAncestorOfRootIdx (%s => %s)', (input, expected) => {
    expect(pathUtils.getAncestorOfRootIdx(input)).toEqual(expected);
  });

  if (platform === 'win32') {
    describe('cross-drive absolute paths (Windows)', () => {
      test.each([['C:\\project\\root'], ['C:\\']])(
        'path.relative returns cross-drive target as-is from rootDir=%s',
        rootDir => {
          expect(mockPathModule.relative(rootDir, 'D:\\some\\file.js')).toEqual(
            'D:\\some\\file.js',
          );
        },
      );

      test.each([
        [
          'C:\\project\\root',
          'D:\\some\\file.js',
          '..\\..\\..\\D:\\some\\file.js',
        ],
        ['C:\\project\\root', 'D:\\some\\', '..\\..\\..\\D:\\some\\'],
        ['C:\\project\\root', 'D:\\', '..\\..\\..\\D:\\'],
        ['C:\\', 'D:\\some\\file.js', '..\\D:\\some\\file.js'],
        ['C:\\', 'D:\\', '..\\D:\\'],
        ['D:\\project\\root', 'C:\\file.js', '..\\..\\..\\C:\\file.js'],
      ])(
        'absoluteToNormal emits a ..-chain (rootDir=%s, X=%s -> %s)',
        (rootDir, absolutePath, expectedNormal) => {
          pathUtils = new RootPathUtils(rootDir);
          expect(pathUtils.absoluteToNormal(absolutePath)).toEqual(
            expectedNormal,
          );
        },
      );

      test.each([
        ['C:\\project\\root', 'D:\\some\\file.js'],
        ['C:\\project\\root', 'D:\\some\\'],
        ['C:\\project\\root', 'D:\\'],
        ['C:\\', 'D:\\some\\file.js'],
        ['C:\\', 'D:\\some\\'],
        ['C:\\', 'D:\\'],
        ['D:\\project\\root', 'C:\\file.js'],
        ['D:\\project\\root', 'C:\\'],
      ])(
        'normalToAbsolute(absoluteToNormal(X)) === X for rootDir=%s, X=%s',
        (rootDir, absolutePath) => {
          pathUtils = new RootPathUtils(rootDir);
          const normal = pathUtils.absoluteToNormal(absolutePath);
          expect(pathUtils.normalToAbsolute(normal)).toEqual(absolutePath);
        },
      );

      test.each([
        ['C:\\project\\root', 'D:\\dir\\sub', 'extra\\file.js'],
        ['C:\\project\\root', 'D:\\', 'foo.js'],
        ['C:\\', 'D:\\dir', 'sub\\file.js'],
      ])(
        'joinNormalToRelative round-trips cross-drive (rootDir=%s, base=%s, rel=%s)',
        (rootDir, baseAbsolute, relativePath) => {
          pathUtils = new RootPathUtils(rootDir);
          const baseNormal = pathUtils.absoluteToNormal(baseAbsolute);
          const {normalPath} = pathUtils.joinNormalToRelative(
            baseNormal,
            relativePath,
          );
          expect(pathUtils.normalToAbsolute(normalPath)).toEqual(
            mockPathModule.join(baseAbsolute, relativePath),
          );
        },
      );
    });
  }
});
