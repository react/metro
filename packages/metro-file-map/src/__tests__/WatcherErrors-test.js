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

import TreeFS from '../lib/TreeFS';
import {Watcher} from '../Watcher';
import FallbackWatcher from '../watchers/FallbackWatcher';
import NativeWatcher from '../watchers/NativeWatcher';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

jest.useRealTimers();

describe('Watcher resource-limit reporting', () => {
  let root: string;
  let watcher: Watcher;

  beforeEach(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'metro-errors-'));
    jest.spyOn(NativeWatcher, 'isSupported').mockReturnValue(false);
    jest.spyOn(FallbackWatcher, 'isLiveOnStart').mockReturnValue(true);
    watcher = new Watcher({
      abortSignal: new AbortController().signal,
      computeSha1: false,
      console,
      enableSymlinks: false,
      extensions: ['js'],
      healthCheckFilePrefix: '.health',
      ignoreForCrawl: () => false,
      ignorePatternForWatch: /^$/,
      perfLogger: null,
      previousState: {
        clocks: new Map(),
        fileSystem: new TreeFS({
          processFile: () => {
            throw new Error('not implemented');
          },
          rootDir: root,
        }),
      },
      rootDir: root,
      roots: [root],
      useWatchman: false,
      watch: true,
      watchmanDeferStates: [],
    });
  });

  afterEach(async () => {
    await watcher.close();
    jest.restoreAllMocks();
    await fs.promises.rm(root, {recursive: true, force: true});
  });

  test.each(['ENOSPC', 'EMFILE'])(
    'reports %s once while still crawling every unwatched directory',
    async code => {
      const directories = Array.from({length: 128}, (_, i) =>
        path.join(root, `dir-${i}`),
      );
      await Promise.all(directories.map(dir => fs.promises.mkdir(dir)));
      const watchSpy = jest.spyOn(fs, 'watch').mockImplementation(dir => {
        const error = new Error(`Cannot watch ${String(dir)}`);
        // $FlowFixMe[prop-missing] Node filesystem errors include a code.
        error.code = code;
        throw error;
      });
      const readdir = jest.spyOn(fs.promises, 'readdir');
      const reportError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await watcher.watch(() => {});

      expect(watchSpy.mock.calls.length).toBeGreaterThanOrEqual(129);
      for (const dir of directories) {
        expect(readdir).toHaveBeenCalledWith(dir);
      }
      expect(reportError.mock.calls).toEqual([
        [expect.any(String), expect.objectContaining({code})],
      ]);
      expect(reportError.mock.calls[0][0]).toContain('unwatched directories');
      expect(reportError.mock.calls[0][0]).toContain(
        code === 'ENOSPC' ? 'fs.inotify.max_user_watches' : 'ulimit -n',
      );
      expect(reportError.mock.calls[0][1]).toMatchObject({code});

      const otherRoot = path.join(root, 'another-root');
      await fs.promises.mkdir(otherRoot);
      await watcher.watchRoot(otherRoot);
      expect(reportError).toHaveBeenCalledTimes(2);
    },
  );
});
