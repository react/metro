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

import WatchmanWatcher from '../WatchmanWatcher';
// $FlowFixMe[untyped-import] Use the real client's wire format for responses.
import {dumpToBuffer} from 'bser'; // eslint-disable-line import/no-extraneous-dependencies -- fb-watchman's wire encoder
import * as childProcess from 'child_process'; // eslint-disable-line import/enforce-node-protocol-usage -- match fb-watchman's module identifier
import * as net from 'net'; // eslint-disable-line import/enforce-node-protocol-usage -- match fb-watchman's module identifier
import EventEmitter from 'node:events';

// Exercise the installed client, including its asynchronous socket discovery.
jest.unmock('fb-watchman');
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: jest.fn(),
}));
jest.mock('net', () => ({
  ...jest.requireActual('net'),
  createConnection: jest.fn(),
}));

class MockProcess extends EventEmitter {
  stdout: EventEmitter = new EventEmitter();
  stderr: EventEmitter = new EventEmitter();
}
class MockSocket extends EventEmitter {
  end: JestMockFn<[], void> = jest.fn();
  write: JestMockFn<[Buffer], void> = jest.fn();
}

function createWatcher(): WatchmanWatcher {
  return new WatchmanWatcher('/project', {
    ignored: null,
    included: {
      extensions: new Set(['js']),
      basenames: new Set(),
      basenamePrefixes: [],
    },
    watchmanDeferStates: [],
  });
}

describe('Watchman client shutdown', () => {
  let proc: MockProcess;
  let socket: MockSocket;
  let originalSock: ?string;

  beforeEach(() => {
    jest.clearAllMocks();
    originalSock = process.env.WATCHMAN_SOCK;
    delete process.env.WATCHMAN_SOCK;
    proc = new MockProcess();
    socket = new MockSocket();
    // $FlowFixMe[incompatible-type] Only the client-used process API is needed.
    jest.spyOn(childProcess, 'spawn').mockReturnValue(proc);
    // $FlowFixMe[incompatible-type] Only the client-used socket API is needed.
    jest.spyOn(net, 'createConnection').mockReturnValue(socket);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalSock == null) {
      delete process.env.WATCHMAN_SOCK;
    } else {
      process.env.WATCHMAN_SOCK = originalSock;
    }
  });

  test.each(['connect', 'error'])('closes a late socket on %s', async event => {
    const watcher = createWatcher();
    const starting = expect(watcher.startWatching()).rejects.toThrow(
      'The client was ended',
    );
    await watcher.stopWatching();
    await starting;

    proc.stdout.emit('data', JSON.stringify({sockname: '/mock-watchman.sock'}));
    proc.emit('close', 0, null);
    expect(net.createConnection).toHaveBeenCalledTimes(1);
    expect(() =>
      socket.emit(event, new Error('late connection error')),
    ).not.toThrow();
    expect(socket.end).toHaveBeenCalledTimes(1);
    expect(socket.write).not.toHaveBeenCalled();
    socket.emit('end');
    expect(childProcess.spawn).toHaveBeenCalledTimes(1);
  });

  test('ignores discovery errors delivered after shutdown', async () => {
    const watcher = createWatcher();
    const starting = expect(watcher.startWatching()).rejects.toThrow(
      'The client was ended',
    );
    await watcher.stopWatching();
    await starting;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      proc.emit('error', new Error('late spawn failure')),
    ).not.toThrow();
    expect(net.createConnection).not.toHaveBeenCalled();
  });

  test('stops while a replacement connection is being discovered', async () => {
    const watcher = createWatcher();
    const onError = jest.fn();
    watcher.onError(onError);
    const starting = watcher.startWatching();
    proc.stdout.emit('data', JSON.stringify({sockname: '/mock-watchman.sock'}));
    proc.emit('close', 0, null);
    socket.emit('connect');
    socket.emit('data', dumpToBuffer({watch: '/project'}));
    jest.runAllTicks();
    socket.emit('data', dumpToBuffer({clock: 'c:1'}));
    jest.runAllTicks();
    socket.emit('data', dumpToBuffer({subscribe: watcher.subscriptionName}));
    jest.runAllTicks();
    await starting;

    const replacement = new MockProcess();
    // $FlowFixMe[incompatible-type] Only the client-used process API is needed.
    jest.spyOn(childProcess, 'spawn').mockReturnValue(replacement);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    socket.emit('end');
    expect(childProcess.spawn).toHaveBeenCalledTimes(2);
    await expect(watcher.stopWatching()).resolves.toBeUndefined();
    expect(onError).not.toHaveBeenCalled();
    replacement.stdout.emit(
      'data',
      JSON.stringify({sockname: '/replacement.sock'}),
    );
    replacement.emit('close', 0, null);
    expect(() => socket.emit('connect')).not.toThrow();
    expect(socket.end).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  test('rejects startup when socket discovery fails', async () => {
    const watcher = createWatcher();
    const error = new Error('spawn failed');
    const starting = expect(watcher.startWatching()).rejects.toBe(error);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => proc.emit('error', error)).not.toThrow();
    await starting;
    await watcher.stopWatching();
  });
});
