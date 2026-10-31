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

import {getDirectoryIdentity, isSameDirectory} from '../directoryIdentity';
import {promises as fsPromises} from 'node:fs';
import os from 'node:os';
import * as path from 'node:path';

describe('getDirectoryIdentity', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'metro-directory-identity-'),
    );
  });

  afterEach(async () => {
    await fsPromises.rm(tmpDir, {force: true, recursive: true});
  });

  test('is the same for the same directory', async () => {
    expect(
      isSameDirectory(
        await getDirectoryIdentity(tmpDir),
        await getDirectoryIdentity(tmpDir),
      ),
    ).toBe(true);
  });

  test('changes when a directory is moved into its place', async () => {
    const dir = path.join(tmpDir, 'dir');
    await fsPromises.mkdir(dir);
    const before = await getDirectoryIdentity(dir);
    await fsPromises.mkdir(path.join(tmpDir, 'staged'));
    await fsPromises.rename(dir, path.join(tmpDir, 'old'));
    await fsPromises.rename(path.join(tmpDir, 'staged'), dir);
    expect(isSameDirectory(before, await getDirectoryIdentity(dir))).toBe(
      false,
    );
  });

  test.each([
    ['a missing path', 'missing'],
    ['a path beneath a file', path.join('file', 'child')],
    ['a file', 'file'],
  ])('is null for %s', async (_, relativePath) => {
    await fsPromises.writeFile(path.join(tmpDir, 'file'), '');
    expect(
      await getDirectoryIdentity(path.join(tmpDir, relativePath)),
    ).toBeNull();
  });
});

test('isSameDirectory is false when either identity is null', () => {
  const identity = {dev: BigInt(1), ino: BigInt(1)};
  expect(isSameDirectory(identity, null)).toBe(false);
  expect(isSameDirectory(null, identity)).toBe(false);
  expect(isSameDirectory(null, null)).toBe(false);
});
