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
import EventEmitter from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nullthrows from 'nullthrows';

jest.useRealTimers();

class MockFSWatcher extends EventEmitter {
  close() {
    this.emit('close');
  }
}

class FilesystemError extends Error {
  code: string;

  constructor(code: string) {
    super('Watch handle failed');
    this.code = code;
  }
}

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

  test('rejects with the native filesystem error when the watched root is missing', async () => {
    jest.spyOn(NativeWatcher, 'isSupported').mockReturnValue(true);
    await fs.promises.rmdir(root);
    jest.useFakeTimers();
    try {
      const failure = watcher.watch(() => {}).catch(error => error);

      // $FlowFixMe[prop-missing] Available in Jest 29, missing from its libdef.
      await jest.advanceTimersByTimeAsync(240000);

      expect(await failure).toMatchObject({code: 'ENOENT'});
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
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

  test.each(['EIO', 'ENOSPC', 'EMFILE'])(
    'reports a lost directory watch with its path and recovery guidance (%s)',
    async code => {
      const directory = path.join(root, 'feature');
      await fs.promises.mkdir(directory);
      const handles = new Map<string, MockFSWatcher>();
      jest.spyOn(fs, 'watch').mockImplementation(dir => {
        const handle = new MockFSWatcher();
        handles.set(String(dir), handle);
        return handle;
      });
      const reportError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      await watcher.watch(() => {});
      const error = new FilesystemError(code);
      const handle = nullthrows(handles.get(directory));

      expect(() => handle.emit('error', error)).not.toThrow();

      expect(reportError).toHaveBeenCalledTimes(1);
      const reported = reportError.mock.calls[0][1];
      expect(reported.message).toContain(directory);
      expect(reported.message).toContain(
        'Changes in this directory will not be detected',
      );
      expect(reported.message).toContain('Restart Metro');
      expect(reported.cause).toBe(error);
      expect(reported.code).toBe(code);

      if (code !== 'EIO') {
        nullthrows(handles.get(root)).emit('error', new FilesystemError(code));
        expect(reportError).toHaveBeenCalledTimes(1);
      }

      await watcher.close();
      expect(() => handle.emit('error', error)).not.toThrow();
      expect(reportError).toHaveBeenCalledTimes(1);
    },
  );

  test('ignores a lost watch for a directory that no longer exists', async () => {
    const handle = new MockFSWatcher();
    jest.spyOn(fs, 'watch').mockReturnValue(handle);
    const reportError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    await watcher.watch(() => {});

    handle.emit('error', new FilesystemError('ENOENT'));

    expect(reportError).not.toHaveBeenCalled();
  });

  test.each(['EIO', 'ENOSPC', 'EMFILE'])(
    'reports a lost native root watch through the console (%s)',
    async code => {
      jest.spyOn(NativeWatcher, 'isSupported').mockReturnValue(true);
      jest.spyOn(NativeWatcher, 'isLiveOnStart').mockReturnValue(true);
      const handle = new MockFSWatcher();
      jest.spyOn(fs, 'watch').mockReturnValue(handle);
      const reportError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      await watcher.watch(() => {});
      const error = new FilesystemError(code);

      expect(() => handle.emit('error', error)).not.toThrow();

      expect(reportError).toHaveBeenCalledTimes(1);
      const [message, reported] = reportError.mock.calls[0];
      expect(message).toContain(`native watcher error in ${root}`);
      expect(reported.message).toContain(root);
      expect(reported.message).toContain(
        'Changes in this directory and its subdirectories will not be detected',
      );
      expect(reported.message).toContain('Restart Metro');
      expect(reported.cause).toBe(error);
      expect(reported.code).toBe(code);

      await watcher.close();
      expect(() => handle.emit('error', error)).not.toThrow();
      expect(reportError).toHaveBeenCalledTimes(1);
    },
  );
});
