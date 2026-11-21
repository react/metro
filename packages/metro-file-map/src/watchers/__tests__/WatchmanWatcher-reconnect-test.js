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
// $FlowFixMe[untyped-import] Exercise the real client's wire protocol.
import {dumpToBuffer} from 'bser'; // eslint-disable-line import/no-extraneous-dependencies -- fb-watchman's wire encoder
import * as childProcess from 'child_process'; // eslint-disable-line import/enforce-node-protocol-usage -- match fb-watchman's module identifier
import * as net from 'net'; // eslint-disable-line import/enforce-node-protocol-usage -- match fb-watchman's module identifier
import EventEmitter from 'node:events';

jest.unmock('fb-watchman');
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: jest.fn(),
}));
jest.mock('net', () => ({
  ...jest.requireActual('net'),
  createConnection: jest.fn(),
}));

class DiscoveryProcess extends EventEmitter {
  stdout: EventEmitter = new EventEmitter();
  stderr: EventEmitter = new EventEmitter();
}

class Socket extends EventEmitter {
  end: JestMockFn<[], void> = jest.fn();
  write: JestMockFn<[Buffer], void> = jest.fn();
}

describe('Watchman reconnect discovery after shutdown', () => {
  let originalSock: ?string;
  let watcher: WatchmanWatcher;
  let discovery: DiscoveryProcess;
  let socket: Socket;

  beforeEach(() => {
    jest.clearAllMocks();
    originalSock = process.env.WATCHMAN_SOCK;
    delete process.env.WATCHMAN_SOCK;
    discovery = new DiscoveryProcess();
    socket = new Socket();
    // $FlowFixMe[incompatible-type] Model only the client's process boundary.
    jest.spyOn(childProcess, 'spawn').mockReturnValue(discovery);
    // $FlowFixMe[incompatible-type] Model only the client's socket boundary.
    jest.spyOn(net, 'createConnection').mockReturnValue(socket);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    watcher = new WatchmanWatcher('/project', {
      ignored: null,
      included: null,
      watchmanDeferStates: [],
    });
  });

  afterEach(async () => {
    await watcher.stopWatching();
    jest.clearAllTimers();
    jest.restoreAllMocks();
    if (originalSock == null) {
      delete process.env.WATCHMAN_SOCK;
    } else {
      process.env.WATCHMAN_SOCK = originalSock;
    }
  });

  test.each(['connect', 'error'])(
    'ends a socket that reports %s after reconnect discovery finishes late',
    async event => {
      const onError = jest.fn();
      watcher.onError(onError);
      const started = watcher.startWatching();
      discovery.stdout.emit(
        'data',
        JSON.stringify({sockname: '/initial.sock'}),
      );
      discovery.emit('close', 0, null);
      socket.emit('connect');
      for (const response of [
        {watch: '/project'},
        {clock: 'c:123'},
        {subscribe: watcher.subscriptionName},
      ]) {
        socket.emit('data', dumpToBuffer(response));
        jest.runAllTicks();
      }
      await started;

      const reconnectDiscovery = new DiscoveryProcess();
      const lateSocket = new Socket();
      // $FlowFixMe[incompatible-type] Model only the client's process boundary.
      jest.spyOn(childProcess, 'spawn').mockReturnValue(reconnectDiscovery);
      // $FlowFixMe[incompatible-type] Model only the client's socket boundary.
      jest.spyOn(net, 'createConnection').mockReturnValue(lateSocket);
      socket.emit('end');
      jest.advanceTimersByTime(1000);
      await watcher.stopWatching();

      reconnectDiscovery.stdout.emit(
        'data',
        JSON.stringify({sockname: '/late.sock'}),
      );
      reconnectDiscovery.emit('close', 0, null);
      expect(net.createConnection).toHaveBeenLastCalledWith('/late.sock');
      expect(() =>
        lateSocket.emit(event, new Error('Late error')),
      ).not.toThrow();
      expect(lateSocket.end).toHaveBeenCalledTimes(1);
      expect(lateSocket.write).not.toHaveBeenCalled();
      lateSocket.emit('end');
      jest.advanceTimersByTime(60000);
      expect(childProcess.spawn).toHaveBeenCalledTimes(2);
      expect(onError).not.toHaveBeenCalled();
    },
  );
});
