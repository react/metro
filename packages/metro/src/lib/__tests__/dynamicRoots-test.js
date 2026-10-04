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

import {getDynamicRootId, getDynamicRoots} from '../dynamicRoots';
import * as path from 'node:path';

const abs = (posixPath: string) =>
  path.resolve(path.sep, ...posixPath.split('/'));

describe('getDynamicRootId', () => {
  test('is never numeric, so cannot be read as a watchFolders index', () => {
    expect(getDynamicRootId(abs('repo/app'), abs('store/lib'))).toMatch(
      /^h[0-9a-f]{16}$/,
    );
  });

  test('depends only on the location of the root relative to the project', () => {
    expect(getDynamicRootId(abs('repo/app'), abs('store/lib'))).toBe(
      getDynamicRootId(abs('home/me/repo/app'), abs('home/me/store/lib')),
    );
    expect(getDynamicRootId(abs('repo/app'), abs('store/lib'))).not.toBe(
      getDynamicRootId(abs('repo/app'), abs('store/other')),
    );
  });
});

describe('getDynamicRoots', () => {
  const projectRoot = abs('repo/app');
  const watchFolders = [projectRoot, abs('repo/packages')];

  test('excludes projectRoot and watchFolders', () => {
    expect(getDynamicRoots(projectRoot, watchFolders, watchFolders)).toEqual(
      [],
    );
  });

  test('returns other roots with their ids', () => {
    expect(
      getDynamicRoots(projectRoot, watchFolders, [
        ...watchFolders,
        abs('store/lib'),
      ]),
    ).toEqual([
      {
        id: getDynamicRootId(projectRoot, abs('store/lib')),
        rootDir: abs('store/lib'),
      },
    ]);
  });

  test('orders a root before any nested within it, whatever the input order', () => {
    const dynamic = [abs('store/lib/inner'), abs('zzz'), abs('store/lib')];
    const expected = [abs('zzz'), abs('store/lib'), abs('store/lib/inner')];
    expect(
      getDynamicRoots(projectRoot, watchFolders, [
        ...watchFolders,
        ...dynamic,
      ]).map(root => root.rootDir),
    ).toEqual(expected);
    expect(
      getDynamicRoots(projectRoot, watchFolders, [
        ...dynamic.reverse(),
        ...watchFolders,
      ]).map(root => root.rootDir),
    ).toEqual(expected);
  });
});
