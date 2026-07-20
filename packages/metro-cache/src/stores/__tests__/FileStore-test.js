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

import {memfs} from 'memfs';

describe('FileStore', () => {
  let FileStore;
  let fs;

  beforeEach(() => {
    jest
      .resetModules()
      .resetAllMocks()
      .mock('node:fs', () => memfs().fs);

    FileStore = require('../FileStore').default;
    fs = jest.requireMock('node:fs');
    jest.spyOn(fs, 'unlinkSync');
  });

  test('sets and writes into the cache', async () => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);

    await fileStore.set(cache, {foo: 42});
    expect(await fileStore.get(cache)).toEqual({foo: 42});
  });

  test('returns null when reading a non-existing file', async () => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);

    expect(await fileStore.get(cache)).toEqual(null);
  });

  test('returns null when reading a empty file', async () => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
    jest.spyOn(fs.promises, 'readFile').mockImplementation(async () => '');
    expect(await fileStore.get(cache)).toEqual(null);
    expect(fs.promises.readFile).toHaveBeenCalledWith(expect.any(String));
  });

  test('writes into cache if folder is missing', async () => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
    const data = Buffer.from([0xca, 0xc4, 0xe5]);

    jest.requireMock('node:fs').rmSync('/root', {recursive: true, force: true});
    await fileStore.set(cache, data);
    expect(await fileStore.get(cache)).toEqual(data);
  });

  test('reads and writes binary data', async () => {
    const fileStore = new FileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);
    const data = Buffer.from([0xca, 0xc4, 0xe5]);

    await fileStore.set(cache, data);
    expect(await fileStore.get(cache)).toEqual(data);
  });
});
