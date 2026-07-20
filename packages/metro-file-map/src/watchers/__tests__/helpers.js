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

import type {ChangeEventMetadata} from '../../flow-types';
import type {WatcherOptions} from '../common';

import FallbackWatcher from '../FallbackWatcher';
import NativeWatcher from '../NativeWatcher';
import WatchmanWatcher from '../WatchmanWatcher';
import invariant from 'invariant';
import {execSync} from 'node:child_process';
import {promises as fsPromises} from 'node:fs';
import os from 'node:os';
import {join} from 'node:path';

jest.useRealTimers();

const {mkdtemp, writeFile} = fsPromises;

// At runtime we use a more sophisticated + robust Watchman capability check,
// but this simple heuristic is fast to check, synchronous (we can't
// asynchronously skip tests: https://github.com/facebook/jest/issues/8604),
// and will tend to exercise our Watchman tests whenever possible.
const isWatchmanOnPath = () => {
  try {
    execSync(
      os.platform() === 'win32' ? 'where.exe /Q watchman' : 'which watchman',
    );
    return true;
  } catch {
    return false;
  }
};

// `null` Watchers will be marked as skipped tests.
export const WATCHERS: Readonly<{
  [key: 'Watchman' | 'Native' | 'Fallback']:
    | Class<FallbackWatcher>
    | Class<NativeWatcher>
    | Class<WatchmanWatcher>
    | null,
}> = {
  Watchman: isWatchmanOnPath() ? WatchmanWatcher : null,
  Native: NativeWatcher.isSupported() ? NativeWatcher : null,
  Fallback: FallbackWatcher,
};

export type WatcherName = keyof typeof WATCHERS;

export type EventHelpers = {
  nextEvent: (afterFn: () => Promise<void>) => Promise<{
    eventType: string,
    path: string,
    metadata?: ChangeEventMetadata,
  }>,
  untilEvent: (
    afterFn: () => Promise<void>,
    expectedPath: string,
    expectedEvent: 'touch' | 'delete' | 'recrawl',
  ) => Promise<void>,
  allEvents: (
    afterFn: () => Promise<void>,
    events: ReadonlyArray<[string, 'touch' | 'delete' | 'recrawl']>,
    opts?: {rejectUnexpected: boolean},
  ) => Promise<void>,
};

export const createTempWatchRoot = async (
  watcherName: WatcherName,
  watchmanConfig: {[key: string]: unknown} | false = {},
): Promise<string> => {
  const tmpDir = await mkdtemp(
    join(os.tmpdir(), `metro-watcher-${watcherName}-test-`),
  );

  // os.tmpdir() on macOS gives us a symlink /var/foo -> /private/var/foo,
  // we normalise it with realpath so that watchers report predictable
  // root-relative paths for change events.
  const watchRoot = await fsPromises.realpath(tmpDir);
  if (watchmanConfig) {
    await writeFile(
      join(watchRoot, '.watchmanconfig'),
      JSON.stringify(watchmanConfig),
    );
  }

  return watchRoot;
};

export const startWatching = async (
  watcherName: WatcherName,
  watchRoot: string,
  opts: WatcherOptions,
): (Promise<{
  eventHelpers: EventHelpers,
  stopWatching: () => Promise<void>,
}>) => {
  const Watcher = WATCHERS[watcherName];
  invariant(Watcher != null, `Watcher ${watcherName} is not supported`);
  const watcherInstance = new Watcher(watchRoot, opts);

  await watcherInstance.startWatching();

  const eventHelpers: EventHelpers = {
    nextEvent: afterFn =>
      Promise.all([
        new Promise<{
          eventType: string,
          metadata?: ChangeEventMetadata,
          path: string,
        }>((resolve, reject) => {
          const unsubscribe: () => void = watcherInstance.onFileEvent(
            change => {
              if (change.relativePath === '') {
                // FIXME: FSEventsWatcher sometimes reports 'touch' events to
                // the watch root.
                return;
              }
              unsubscribe();
              if (change.root !== watchRoot) {
                reject(
                  new Error(`Expected root ${watchRoot}, got ${change.root}`),
                );
              }

              resolve({
                eventType: change.event,
                path: change.relativePath,
                metadata: change.metadata,
              });
            },
          );
        }),
        afterFn(),
      ]).then(([event]) => event),

    untilEvent: (afterFn, expectedPath, expectedEventType) =>
      eventHelpers.allEvents(afterFn, [[expectedPath, expectedEventType]], {
        rejectUnexpected: false,
      }),

    // $FlowFixMe[incompatible-use]
    allEvents: (afterFn, expectedEvents, {rejectUnexpected = true} = {}) =>
      Promise.all([
        new Promise((resolve, reject) => {
          const tupleToKey = (tuple: ReadonlyArray<string>) => tuple.join('\0');
          const allEventKeys = new Set(
            expectedEvents.map(tuple => tupleToKey(tuple)),
          );
          const unsubscribe: () => void = watcherInstance.onFileEvent(
            change => {
              if (change.relativePath === '') {
                // FIXME: FSEventsWatcher sometimes reports 'touch' events to
                // the watch root.
                return;
              }
              const receivedKey = tupleToKey([
                change.relativePath,
                change.event,
              ]);
              if (allEventKeys.has(receivedKey)) {
                allEventKeys.delete(receivedKey);
                if (allEventKeys.size === 0) {
                  unsubscribe();
                  resolve();
                }
              } else if (rejectUnexpected) {
                unsubscribe();
                reject(
                  new Error(
                    `Unexpected event: ${change.event} ${change.relativePath}.`,
                  ),
                );
              }
            },
          );
        }),
        afterFn(),
      ]).then(() => {}),
  };

  return {
    eventHelpers,
    stopWatching: async () => {
      await watcherInstance.stopWatching();
    },
  };
};
