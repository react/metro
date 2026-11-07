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

describe('AutoCleanFileStore', () => {
  let AutoCleanFileStore;
  let fs;

  beforeEach(() => {
    jest
      .resetModules()
      .resetAllMocks()
      .mock('node:fs', () => memfs().fs);
    AutoCleanFileStore = require('../AutoCleanFileStore').default;
    fs = jest.requireMock('node:fs');
    jest.spyOn(fs, 'statSync');
    jest.spyOn(fs, 'unlinkSync');
  });

  test('sets and writes into the cache', async () => {
    const fileStore = new AutoCleanFileStore<unknown>({
      root: '/root',
      intervalMs: 49,
      cleanupThresholdMs: 90,
    });
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);

    expect(fs.statSync).toHaveBeenCalledTimes(0);

    await fileStore.set(cache, {foo: 42});
    expect(await fileStore.get(cache)).toEqual({foo: 42});

    // At 30ms the file should still be cached
    jest.advanceTimersByTime(30);

    expect(await fileStore.get(cache)).toEqual({foo: 42});

    // And there should have been no cleanup
    expect(fs.statSync).not.toHaveBeenCalled();

    // Run to 50ms so that we've exceeded the 49ms cleanup interval
    jest.advanceTimersByTime(20);

    expect(fs.statSync).toHaveBeenCalledTimes(1);

    // At 50ms we should have checked the file, but it's still fresh enough
    expect(await fileStore.get(cache)).toEqual({foo: 42});
    expect(fs.unlinkSync).not.toHaveBeenCalled();

    jest.advanceTimersByTime(50);

    // After another 50ms, we should have checked the file again and deleted it
    expect(fs.statSync).toHaveBeenCalledTimes(2);
    expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
    expect(await fileStore.get(cache)).toEqual(null);
  });

  test('returns null when reading a non-existing file', async () => {
    const fileStore = new AutoCleanFileStore<unknown>({root: '/root'});
    const cache = Buffer.from([0xfa, 0xce, 0xb0, 0x0c]);

    expect(await fileStore.get(cache)).toEqual(null);
  });
});
