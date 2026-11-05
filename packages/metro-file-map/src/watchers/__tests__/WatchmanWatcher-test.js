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

import type {
  WatchmanClockResponse,
  WatchmanSubscribeResponse,
  WatchmanWatchResponse,
} from 'fb-watchman';

import WatchmanWatcher from '../WatchmanWatcher';
import EventEmitter from 'node:events';

class MockClient extends EventEmitter {
  command: JestMockFn<ReadonlyArray<$FlowFixMe>, unknown> = jest.fn();
  end: JestMockFn<[], void> = jest.fn();
}
let mockClient = new MockClient();

const cmdCallback = <T>(err: ?Error, result: Partial<T>): void => {
  expect(mockClient.command.mock.lastCall[1]).toEqual(expect.any(Function));
  mockClient.command.mock.lastCall[1](err, result);
};

// Convenience function to write paths with posix separators but convert them
// to system separators, and prepend a mock drive letter to absolute paths on
// Windows.
const p: string => string = filePath =>
  process.platform === 'win32'
    ? filePath.replaceAll('/', '\\').replace(/^\\/, 'C:\\')
    : filePath;

// Format a posix path as a Watchman-native path on the current platform, i.e.,
// on Windows, drive letters on absolute paths, but posix-style separators.
// This should be used for mocking Watchman *output*.
const wp: string => string = filePath =>
  process.platform === 'win32' ? filePath.replace(/^\//, 'C:/') : filePath;

jest.mock('fb-watchman', () => ({
  Client: jest.fn().mockImplementation(() => (mockClient = new MockClient())),
}));

describe('WatchmanWatcher', () => {
  describe('connection lifecycle', () => {
    let watcher: WatchmanWatcher;
    let onError: JestMockFn<[Error], void>;

    function completeSubscription() {
      cmdCallback<WatchmanWatchResponse>(null, {watch: wp('/project')});
      cmdCallback<WatchmanClockResponse>(null, {clock: 'c:123'});
      cmdCallback<WatchmanSubscribeResponse>(null, {'asserted-states': []});
    }

    beforeEach(async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      watcher = new WatchmanWatcher(p('/project'), {
        ignored: null,
        included: null,
        watchmanDeferStates: [],
      });
      onError = jest.fn();
      watcher.onError(onError);
      const started = watcher.startWatching();
      completeSubscription();
      await started;
    });

    afterEach(async () => {
      await watcher.stopWatching();
      jest.clearAllTimers();
      jest.restoreAllMocks();
    });

    test('does not warn about missed changes on initial startup', () => {
      expect(console.warn).not.toHaveBeenCalled();
    });

    test.each(['end', 'error'])(
      'warns once about missed changes after recovering from %s',
      event => {
        const warn = jest.spyOn(console, 'warn');
        mockClient.emit(event, new Error('Connection lost'));
        warn.mockClear();
        jest.advanceTimersByTime(1000);
        mockClient.emit('error', new Error('Still unavailable'));
        expect(console.warn).not.toHaveBeenCalled();

        jest.advanceTimersByTime(2000);
        completeSubscription();

        expect(console.warn).toHaveBeenCalledTimes(1);
        const warning = warn.mock.calls[0][0];
        expect(warning).toContain(p('/project'));
        expect(warning).toContain(
          'Changes made while disconnected may have been missed',
        );
        expect(warning).toContain('Restart Metro');

        mockClient.emit('subscription', {
          subscription: watcher.subscriptionName,
          files: [],
        });
        expect(console.warn).toHaveBeenCalledTimes(1);
      },
    );

    test('warns again after a separate connection outage recovers', () => {
      for (let outage = 0; outage < 2; outage++) {
        mockClient.emit('error', new Error('Connection lost'));
        jest.advanceTimersByTime(1000);
        completeSubscription();
      }
      expect(console.warn).toHaveBeenCalledTimes(2);
    });

    test('does not report recovery from a retired client', async () => {
      const warn = jest.spyOn(console, 'warn');
      mockClient.emit('end');
      jest.advanceTimersByTime(1000);
      cmdCallback<WatchmanWatchResponse>(null, {watch: wp('/project')});
      cmdCallback<WatchmanClockResponse>(null, {clock: 'c:123'});
      const onSubscribe = mockClient.command.mock.lastCall[1];
      warn.mockClear();

      await watcher.stopWatching();
      onSubscribe(null, {});

      expect(console.warn).not.toHaveBeenCalled();
    });

    test.each(['transport', 'watch-project', 'clock', 'subscribe'])(
      'recovers after a failed reconnect at %s',
      stage => {
        const firstClient = mockClient;
        firstClient.emit('end');
        jest.advanceTimersByTime(1000);
        const failedClient = mockClient;
        const error = new Error('Watchman unavailable');
        if (stage === 'transport') {
          failedClient.emit('error', error);
        } else {
          if (stage !== 'watch-project') {
            cmdCallback<WatchmanWatchResponse>(null, {watch: wp('/project')});
          }
          if (stage === 'subscribe') {
            cmdCallback<WatchmanClockResponse>(null, {clock: 'c:123'});
          }
          cmdCallback(error, {});
        }
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(error);
        expect(mockClient).toBe(failedClient);

        jest.advanceTimersByTime(60000);
        expect(mockClient).not.toBe(failedClient);
        completeSubscription();
        const onFileEvent = jest.fn();
        watcher.onFileEvent(onFileEvent);
        mockClient.emit('subscription', {
          subscription: watcher.subscriptionName,
          clock: 'c:124',
          files: [{name: 'deleted.js', exists: false}],
        });
        expect(onFileEvent).toHaveBeenCalledWith({
          event: 'delete',
          relativePath: 'deleted.js',
          root: p('/project'),
          clock: [p('/project'), 'c:124'],
        });
      },
    );

    test('reconnects after an established client errors without an end event', () => {
      const failedClient = mockClient;
      failedClient.emit('error', new Error('Connection reset'));
      expect(mockClient).toBe(failedClient);
      jest.advanceTimersByTime(1000);
      expect(mockClient).not.toBe(failedClient);
      completeSubscription();
    });

    test('backs off repeated failures and resets the delay after recovery', () => {
      mockClient.emit('error', new Error('Connection reset'));
      const firstClient = mockClient;
      jest.advanceTimersByTime(999);
      expect(mockClient).toBe(firstClient);
      jest.advanceTimersByTime(1);
      const secondClient = mockClient;
      secondClient.emit('error', new Error('Still unavailable'));
      jest.advanceTimersByTime(1999);
      expect(mockClient).toBe(secondClient);
      jest.advanceTimersByTime(1);
      expect(mockClient).not.toBe(secondClient);
      completeSubscription();
      const recoveredClient = mockClient;
      recoveredClient.emit('error', new Error('Connection reset again'));
      jest.advanceTimersByTime(1000);
      expect(mockClient).not.toBe(recoveredClient);
    });

    test('absorbs late errors from a replaced client', () => {
      const oldClient = mockClient;
      oldClient.emit('end');
      jest.advanceTimersByTime(1000);
      expect(() =>
        oldClient.emit('error', new Error('Late error')),
      ).not.toThrow();
      expect(onError).not.toHaveBeenCalled();
    });

    test('absorbs late client errors after stopping', async () => {
      await watcher.stopWatching();
      expect(() =>
        mockClient.emit('error', new Error('Late error')),
      ).not.toThrow();
      expect(onError).not.toHaveBeenCalled();
    });

    test('cancels a scheduled reconnect on stop', async () => {
      const oldClient = mockClient;
      oldClient.emit('end');
      await watcher.stopWatching();
      jest.advanceTimersByTime(60000);
      expect(mockClient).toBe(oldClient);
    });

    test('ignores an in-flight reconnect response after stopping', async () => {
      mockClient.emit('end');
      jest.advanceTimersByTime(1000);
      const client = mockClient;
      const callback = client.command.mock.lastCall[1];
      await watcher.stopWatching();
      client.command.mockClear();
      callback(null, {watch: wp('/project')});
      expect(client.command).not.toHaveBeenCalled();
    });
  });

  test('initializes with watch-project, clock, subscribe', () => {
    const watchmanWatcher = new WatchmanWatcher(p('/project/subdir/js'), {
      ignored: null,
      included: {
        extensions: new Set(['js']),
        basenames: new Set(),
        basenamePrefixes: [],
      },
      watchmanDeferStates: ['busy'],
    });
    let isSettled = false;
    const startPromise = watchmanWatcher
      .startWatching()
      .finally(() => (isSettled = true));

    expect(mockClient.command).toHaveBeenCalledWith(
      ['watch-project', p('/project/subdir/js')],
      expect.any(Function),
    );
    cmdCallback<WatchmanWatchResponse>(null, {
      watch: wp('/project'),
      relative_path: wp('subdir/js'),
    });

    expect(mockClient.command).toHaveBeenCalledWith(
      ['clock', p('/project')],
      expect.any(Function),
    );
    cmdCallback<WatchmanClockResponse>(null, {
      clock: 'c:1629095304.251049',
    });

    expect(mockClient.command).toHaveBeenCalledWith(
      [
        'subscribe',
        p('/project'),
        watchmanWatcher.subscriptionName,
        {
          defer: ['busy'],
          fields: ['name', 'exists', 'new', 'type', 'size', 'mtime_ms'],
          relative_root: p('subdir/js'),
          since: 'c:1629095304.251049',
        },
      ],
      expect.any(Function),
    );

    // Promise should not settle until we get a subscribe response.
    expect(isSettled).toBe(false);

    cmdCallback<WatchmanSubscribeResponse>(null, {});

    // Return to assert promise resolves, not rejects
    return startPromise;
  });

  test('subscribes since a supplied clock instead of fetching a fresh one', () => {
    const watchmanWatcher = new WatchmanWatcher(p('/project/subdir/js'), {
      ignored: null,
      included: {
        extensions: new Set(['js']),
        basenames: new Set(),
        basenamePrefixes: [],
      },
      watchmanDeferStates: ['busy'],
      clocks: new Map([[wp('/project'), 'c:crawl-clock:1']]),
    });
    const startPromise = watchmanWatcher.startWatching();

    cmdCallback<WatchmanWatchResponse>(null, {
      watch: wp('/project'),
      relative_path: wp('subdir/js'),
    });

    // With a clock for the watch root, there's no need for a `clock` command -
    // the subscription is made `since` the supplied clock directly.
    expect(mockClient.command).toHaveBeenLastCalledWith(
      [
        'subscribe',
        p('/project'),
        watchmanWatcher.subscriptionName,
        {
          defer: ['busy'],
          fields: ['name', 'exists', 'new', 'type', 'size', 'mtime_ms'],
          relative_root: p('subdir/js'),
          since: 'c:crawl-clock:1',
        },
      ],
      expect.any(Function),
    );

    cmdCallback<WatchmanSubscribeResponse>(null, {});
    return startPromise;
  });

  test('fetches a fresh clock when no supplied clock matches the watch root', () => {
    const watchmanWatcher = new WatchmanWatcher(p('/project/subdir/js'), {
      ignored: null,
      included: {
        extensions: new Set(['js']),
        basenames: new Set(),
        basenamePrefixes: [],
      },
      watchmanDeferStates: ['busy'],
      clocks: new Map([[wp('/other'), 'c:crawl-clock:1']]),
    });
    const startPromise = watchmanWatcher.startWatching();

    cmdCallback<WatchmanWatchResponse>(null, {
      watch: wp('/project'),
      relative_path: wp('subdir/js'),
    });

    expect(mockClient.command).toHaveBeenLastCalledWith(
      ['clock', p('/project')],
      expect.any(Function),
    );
    cmdCallback<WatchmanClockResponse>(null, {
      clock: 'c:fresh-clock:1',
    });

    expect(mockClient.command).toHaveBeenLastCalledWith(
      [
        'subscribe',
        p('/project'),
        watchmanWatcher.subscriptionName,
        {
          defer: ['busy'],
          fields: ['name', 'exists', 'new', 'type', 'size', 'mtime_ms'],
          relative_root: p('subdir/js'),
          since: 'c:fresh-clock:1',
        },
      ],
      expect.any(Function),
    );

    cmdCallback<WatchmanSubscribeResponse>(null, {});
    return startPromise;
  });

  describe('change handling', () => {
    let watchmanWatcher: WatchmanWatcher;
    beforeEach(async () => {
      watchmanWatcher = new WatchmanWatcher(p('/project/subdir/js'), {
        ignored: null,
        included: {
          extensions: new Set(['js']),
          basenames: new Set(),
          basenamePrefixes: [],
        },
        watchmanDeferStates: ['busy'],
      });
      const startPromise = watchmanWatcher.startWatching();
      cmdCallback<WatchmanWatchResponse>(null, {
        watch: wp('/project'),
        relative_path: wp('subdir/js'),
      });
      cmdCallback<WatchmanClockResponse>(null, {
        clock: 'c:123',
      });
      cmdCallback<WatchmanSubscribeResponse>(null, {
        'asserted-states': [],
      });
      return startPromise;
    });

    test('calls back onFileEvent when client emits subscription events', () => {
      const handler = jest.fn();
      watchmanWatcher.onFileEvent(handler);
      mockClient.emit('subscription', {
        since: 'c:123',
        unilateral: true,
        is_fresh_instance: false,
        files: [
          {
            name: 'Foo.js',
            type: 'f',
            exists: true,
            new: false,
            mtime_ms: 1,
            size: 10,
          },
        ],
        clock: 'c:124',
        root: '/project',
        subscription: watchmanWatcher.subscriptionName,
      });
      expect(handler).toHaveBeenCalledWith({
        event: 'touch',
        relativePath: p('Foo.js'),
        root: p('/project/subdir/js'),
        clock: [p('/project'), 'c:124'],
        metadata: expect.any(Object),
      });
    });
  });

  describe('getPauseReason', () => {
    let watchmanWatcher: WatchmanWatcher;
    let startPromise: Promise<void>;

    beforeEach(async () => {
      watchmanWatcher = new WatchmanWatcher(p('/project/subdir/js'), {
        ignored: null,
        included: {
          extensions: new Set(['js']),
          basenames: new Set(),
          basenamePrefixes: [],
        },
        watchmanDeferStates: ['busy'],
      });
      startPromise = watchmanWatcher.startWatching();
      cmdCallback<WatchmanWatchResponse>(null, {
        watch: wp('/project'),
        relative_path: wp('subdir/js'),
      });
      cmdCallback<WatchmanClockResponse>(null, {
        clock: 'c:123',
      });
    });

    afterEach(() => {
      return startPromise;
    });

    test('subscribe response is initially deferred', () => {
      cmdCallback<WatchmanSubscribeResponse>(null, {
        'asserted-states': ['busy'],
      });
      expect(watchmanWatcher.getPauseReason()).toMatch(/busy/);
      mockClient.emit('subscription', {
        subscription: watchmanWatcher.subscriptionName,
        'state-leave': 'busy',
      });
      expect(watchmanWatcher.getPauseReason()).toBe(null);
    });

    test('unknown states are ignored', () => {
      cmdCallback<WatchmanSubscribeResponse>(null, {
        'asserted-states': [],
      });
      mockClient.emit('subscription', {
        subscription: watchmanWatcher.subscriptionName,
        'state-enter': 'unknown-state',
      });
      expect(watchmanWatcher.getPauseReason()).toBe(null);
      mockClient.emit('subscription', {
        subscription: watchmanWatcher.subscriptionName,
        'state-enter': 'busy',
      });
      expect(watchmanWatcher.getPauseReason()).toMatch(/busy/);
    });

    test('known states are reported and cleared', () => {
      cmdCallback<WatchmanSubscribeResponse>(null, {
        'asserted-states': [],
      });
      mockClient.emit('subscription', {
        subscription: watchmanWatcher.subscriptionName,
        'state-enter': 'busy',
      });
      expect(watchmanWatcher.getPauseReason()).toMatch(/busy/);
      mockClient.emit('subscription', {
        subscription: watchmanWatcher.subscriptionName,
        'state-leave': 'busy',
      });
      expect(watchmanWatcher.getPauseReason()).toBe(null);
    });

    test('missing asserted-states in subscribe response', () => {
      cmdCallback<WatchmanSubscribeResponse>(null, {});
      expect(watchmanWatcher.getPauseReason()).toBe(null);
      mockClient.emit('subscription', {
        subscription: watchmanWatcher.subscriptionName,
        'state-enter': 'busy',
      });
      // We don't know the original states, so don't attempt to report states.
      expect(watchmanWatcher.getPauseReason()).toBe(null);
    });

    test('empty asserted-states in subscribe response', () => {
      cmdCallback<WatchmanSubscribeResponse>(null, {
        'asserted-states': [],
      });
      expect(watchmanWatcher.getPauseReason()).toBe(null);
      mockClient.emit('subscription', {
        subscription: watchmanWatcher.subscriptionName,
        'state-enter': 'busy',
      });
      expect(watchmanWatcher.getPauseReason()).toMatch(/busy/);
    });
  });
});
