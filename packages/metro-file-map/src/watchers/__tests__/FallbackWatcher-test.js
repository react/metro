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

import type {WatcherBackendChangeEvent} from '../../flow-types';

import FallbackWatcher from '../FallbackWatcher';
import {createTempWatchRoot} from './helpers';
import EventEmitter from 'node:events';
import fs from 'node:fs';
import {join} from 'node:path';

jest.useRealTimers();
jest.setTimeout(10 * 1000);

const {mkdir, rm, writeFile} = fs.promises;

// An `FSWatcher` after it has reported an error: Node closes the handle before
// emitting 'error', so a subsequent `close()` returns early and emits nothing.
class ErroredFSWatcher extends EventEmitter {
  close() {}
}

describe('FallbackWatcher', () => {
  let watchRoot: string;
  let watcher: ?FallbackWatcher;
  let calls: Array<string>;
  let watchFailure: ?{code: string, path: string};
  let watchOverride: ?{path: string, watcher: ErroredFSWatcher};
  // The listener passed to `fs.watch` for each directory, and the directories
  // whose events are withheld from it.
  let listeners: Map<string, (event: string, filename: ?string) => void>;
  let mutedDirs: Set<string>;

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
    watchOverride = null;
    listeners = new Map();
    mutedDirs = new Set();

    const {watch} = fs;
    jest.spyOn(fs, 'watch').mockImplementation((dir, options, listener) => {
      calls.push(`watch:${String(dir)}`);
      const override = watchOverride;
      if (override != null && dir === override.path) {
        watchOverride = null;
        // $FlowFixMe[incompatible-type] - models an errored FSWatcher
        return override.watcher;
      }
      const failure = watchFailure;
      if (failure != null && dir === failure.path) {
        const error = new Error(`Cannot watch path '${String(dir)}'.`);
        // $FlowFixMe[prop-missing] code
        error.code = failure.code;
        throw error;
      }
      listeners.set(String(dir), listener);
      return watch(dir, options, (event, filename) => {
        if (!mutedDirs.has(String(dir))) {
          listener(event, filename);
        }
      });
    });
    const {readdir} = fs.promises;
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

  describe('after a directory watcher errors', () => {
    let erroredWatcher: ErroredFSWatcher;

    beforeEach(async () => {
      await mkdir(join(watchRoot, 'a'));
      erroredWatcher = new ErroredFSWatcher();
      watchOverride = {path: join(watchRoot, 'a'), watcher: erroredWatcher};
      await watcher?.startWatching();
      erroredWatcher.emit('error', fsError('ENOENT', join(watchRoot, 'a')));
    });

    test('stopWatching resolves', async () => {
      await expect(
        Promise.race([
          watcher?.stopWatching().then(() => 'stopped'),
          new Promise(resolve => setTimeout(resolve, 1000, 'timed out')),
        ]),
      ).resolves.toBe('stopped');
    });

    // The directory is replaced before we process the change, so we never see
    // it missing and there is no deletion to clear the old watch.
    test('watches a directory replaced at the same path', async () => {
      calls = [];
      fs.rmSync(join(watchRoot, 'a'), {recursive: true});
      fs.mkdirSync(join(watchRoot, 'a'));
      fs.writeFileSync(join(watchRoot, 'a', 'file.js'), '');

      await waitFor(() => indexOfCall('readdir', join(watchRoot, 'a')) >= 0);
      expectWatchedBeforeListed(join(watchRoot, 'a'));
    });

    // Entries registered under the old directory may be gone or changed.
    test('requests a recrawl of a directory replaced at the same path', async () => {
      const events: Array<WatcherBackendChangeEvent> = [];
      watcher?.onFileEvent(event => {
        events.push(event);
      });
      fs.rmSync(join(watchRoot, 'a'), {recursive: true});
      fs.mkdirSync(join(watchRoot, 'a'));

      await waitFor(() => events.some(event => event.event === 'recrawl'));
      expect(events).toContainEqual({
        event: 'recrawl',
        relativePath: 'a',
        root: watchRoot,
      });
    });
  });

  // Windows reports a change with no filename when changes to a directory
  // overflow its buffer, so any number of entries under it may have changed.
  describe('when an event does not name the changed entry', () => {
    const emitUnnamedChange = (dir: string) => {
      const listener = listeners.get(dir);
      if (listener == null) {
        throw new Error(`Not watching ${dir}`);
      }
      listener('change', null);
    };

    beforeEach(async () => {
      await mkdir(join(watchRoot, 'a'));
      await writeFile(join(watchRoot, 'a', 'existing.js'), '');
      await watcher?.startWatching();
      // Only the unnamed change reports anything, and on macOS the root's
      // watcher also sees changes in subdirectories.
      mutedDirs.add(watchRoot);
      mutedDirs.add(join(watchRoot, 'a'));
      calls = [];
    });

    test('requests a recrawl of the directory', async () => {
      const events: Array<WatcherBackendChangeEvent> = [];
      watcher?.onFileEvent(event => {
        events.push(event);
      });
      await writeFile(join(watchRoot, 'a', 'new.js'), '');
      await rm(join(watchRoot, 'a', 'existing.js'));

      emitUnnamedChange(join(watchRoot, 'a'));

      await waitFor(() => events.some(event => event.event === 'recrawl'));
      expect(events).toEqual([
        {event: 'recrawl', relativePath: 'a', root: watchRoot},
      ]);
    });

    test('watches a new directory under it', async () => {
      await mkdir(join(watchRoot, 'a', 'b'));

      emitUnnamedChange(join(watchRoot, 'a'));

      await waitFor(
        () => indexOfCall('readdir', join(watchRoot, 'a', 'b')) >= 0,
      );
      expectWatchedBeforeListed(join(watchRoot, 'a', 'b'));
    });
  });
});

function fsError(code: string, path: string): Error {
  const error = new Error(`${code}: ${path}`);
  // $FlowFixMe[prop-missing] code
  error.code = code;
  return error;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
