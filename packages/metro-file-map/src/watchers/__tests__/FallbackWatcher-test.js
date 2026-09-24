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

import FallbackWatcher from '../FallbackWatcher';
import {createTempWatchRoot} from './helpers';
import fs from 'node:fs';
import {join} from 'node:path';

jest.useRealTimers();
jest.setTimeout(10 * 1000);

const {mkdir, rm, writeFile} = fs.promises;

describe('FallbackWatcher', () => {
  let watchRoot: string;
  let watcher: ?FallbackWatcher;
  let calls: Array<string>;
  let watchFailure: ?{code: string, path: string};

  const indexOfCall = (op: 'watch' | 'readdir', dir: string) =>
    calls.indexOf(`${op}:${dir}`);

  const expectWatchedBeforeListed = (dir: string) => {
    expect(indexOfCall('watch', dir)).toBeGreaterThanOrEqual(0);
    expect(indexOfCall('watch', dir)).toBeLessThan(indexOfCall('readdir', dir));
  };

  beforeEach(async () => {
    watchRoot = await createTempWatchRoot('Fallback', false);
    calls = [];
    watchFailure = null;

    const {watch} = fs;
    jest.spyOn(fs, 'watch').mockImplementation((dir, ...args) => {
      calls.push(`watch:${String(dir)}`);
      const failure = watchFailure;
      if (failure != null && dir === failure.path) {
        const error = new Error(`Cannot watch path '${String(dir)}'.`);
        // $FlowFixMe[prop-missing] code
        error.code = failure.code;
        throw error;
      }
      return watch(dir, ...args);
    });
    const {readdir} = fs.promises;
    // $FlowFixMe[incompatible-call] - variadic passthrough
    jest.spyOn(fs.promises, 'readdir').mockImplementation((dir, ...args) => {
      calls.push(`readdir:${String(dir)}`);
      return readdir(dir, ...args);
    });

    watcher = new FallbackWatcher(watchRoot, {
      dot: true,
      globs: [],
      ignored: null,
      watchmanDeferStates: [],
    });
  });

  afterEach(async () => {
    await watcher?.stopWatching();
    jest.restoreAllMocks();
    await rm(watchRoot, {recursive: true});
  });

  // A file written into a directory after it has been listed but before it is
  // watched is reported by neither the listing nor any subsequent event, and is
  // missed until the next full crawl. This is how installing a package against
  // a running server loses files: https://github.com/expo/expo/issues/48950
  describe('watches each directory before listing it', () => {
    test('during the initial crawl', async () => {
      await mkdir(join(watchRoot, 'a', 'b'), {recursive: true});

      await watcher?.startWatching();

      for (const dir of ['', 'a', join('a', 'b')]) {
        expectWatchedBeforeListed(join(watchRoot, dir));
      }
    });

    test('for a directory created while watching', async () => {
      await watcher?.startWatching();
      calls = [];

      const nested = join(watchRoot, 'new', 'nested');
      await mkdir(nested, {recursive: true});
      await writeFile(join(nested, 'file.js'), '');
      await waitFor(() => indexOfCall('readdir', nested) >= 0);

      for (const dir of [join(watchRoot, 'new'), nested]) {
        expectWatchedBeforeListed(dir);
      }
    });
  });

  // A watch we cannot establish - one directory over the inotify limit, say -
  // must not cost us the files under it, which would silently truncate the
  // file map.
  test.each([
    ['ENOSPC', 1],
    ['ENOENT', 0],
  ])(
    'crawls past a directory it cannot watch (%s)',
    async (code, expectedErrors) => {
      await mkdir(join(watchRoot, 'a', 'b'), {recursive: true});
      watchFailure = {code, path: join(watchRoot, 'a')};
      const errors: Array<Error> = [];
      watcher?.onError(error => {
        errors.push(error);
      });

      await expect(watcher?.startWatching()).resolves.toBeUndefined();

      expect(errors).toHaveLength(expectedErrors);
      for (const dir of ['a', join('a', 'b')]) {
        expect(
          indexOfCall('readdir', join(watchRoot, dir)),
        ).toBeGreaterThanOrEqual(0);
      }
    },
  );
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
