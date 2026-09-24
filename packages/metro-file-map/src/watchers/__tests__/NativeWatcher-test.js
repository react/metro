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

import NativeWatcher from '../NativeWatcher';
import fs from 'node:fs';
import os from 'node:os';
import {join} from 'node:path';

jest.useRealTimers();

const ROOT = join('/', 'project');

type Deferred<T> = {
  promise: Promise<T>,
  resolve: T => void,
  reject: Error => void,
};

function deferred<T>(): Deferred<T> {
  let resolve: T => void = () => {};
  let reject: Error => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

function fileStat(mtimeMs: number): fs.Stats {
  // $FlowFixMe[incompatible-type] - only the fields NativeWatcher reads
  return {
    isSymbolicLink: () => false,
    isDirectory: () => false,
    isFile: () => true,
    mtime: new Date(mtimeMs),
    size: 42,
  };
}

function enoent(): Error {
  const error = new Error('ENOENT: no such file or directory');
  // $FlowFixMe[prop-missing] - Node system errors carry a code
  error.code = 'ENOENT';
  return error;
}

// Run every pending promise continuation, including those queued by others.
const flush = () => new Promise(resolve => setImmediate(resolve));

describe('NativeWatcher', () => {
  let watcher: NativeWatcher;
  let emitFsEvent: (event: string, relativePath: string) => void;
  let pendingStats: Map<string, Deferred<fs.Stats>>;
  let events: Array<WatcherBackendChangeEvent>;

  beforeEach(async () => {
    jest.spyOn(os, 'platform').mockReturnValue('darwin');
    jest.spyOn(fs, 'watch').mockImplementation((_root, _opts, listener) => {
      emitFsEvent = listener;
      return {close: () => {}};
    });
    pendingStats = new Map();
    jest.spyOn(fs.promises, 'lstat').mockImplementation(absolutePath => {
      const stat = deferred<fs.Stats>();
      pendingStats.set(String(absolutePath), stat);
      return stat.promise;
    });

    watcher = new NativeWatcher(ROOT, {dot: true, globs: [], ignored: null});
    events = [];
    watcher.onFileEvent(event => {
      events.push(event);
    });
    await watcher.startWatching();
  });

  afterEach(async () => {
    await watcher.stopWatching();
    jest.restoreAllMocks();
  });

  function settleStat(relativePath: string, result: fs.Stats | Error): void {
    const stat = pendingStats.get(join(ROOT, relativePath));
    if (stat == null) {
      throw new Error(`No lstat pending for ${relativePath}`);
    }
    if (result instanceof Error) {
      stat.reject(result);
    } else {
      stat.resolve(result);
    }
  }

  test('emits events in the order fs.watch reported them, however their stats settle', async () => {
    emitFsEvent('rename', join('app', 'moved-in', 'file.js'));
    emitFsEvent('rename', join('app', 'moved-in'));
    emitFsEvent('change', join('app', 'other.js'));

    // All stats start immediately, before any has settled.
    expect([...pendingStats.keys()]).toEqual([
      join(ROOT, 'app', 'moved-in', 'file.js'),
      join(ROOT, 'app', 'moved-in'),
      join(ROOT, 'app', 'other.js'),
    ]);

    // Settle in reverse order. Nothing can be emitted until the first settles.
    settleStat(join('app', 'other.js'), fileStat(1000));
    settleStat(join('app', 'moved-in'), enoent());
    await flush();
    expect(events).toEqual([]);

    settleStat(join('app', 'moved-in', 'file.js'), enoent());
    await flush();
    expect(events).toEqual([
      {
        event: 'delete',
        relativePath: join('app', 'moved-in', 'file.js'),
        root: ROOT,
      },
      {event: 'delete', relativePath: join('app', 'moved-in'), root: ROOT},
      {
        event: 'touch',
        relativePath: join('app', 'other.js'),
        root: ROOT,
        metadata: {type: 'f', modifiedTime: 1000, size: 42},
      },
    ]);
  });

  test('an lstat failure is reported in order and does not block later events', async () => {
    const order: Array<string> = [];
    watcher.onFileEvent(event => {
      order.push(`${event.event}:${event.relativePath}`);
    });
    watcher.onError(error => {
      order.push(`error:${error.message}`);
    });

    emitFsEvent('change', 'first.js');
    emitFsEvent('change', 'second.js');
    emitFsEvent('change', 'third.js');

    settleStat('third.js', fileStat(3000));
    settleStat('second.js', new Error('EACCES'));
    await flush();
    expect(order).toEqual([]);

    settleStat('first.js', fileStat(1000));
    await flush();
    expect(order).toEqual(['touch:first.js', 'error:EACCES', 'touch:third.js']);
  });
});
