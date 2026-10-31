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

import pollForDirectory from '../pollForDirectory';
import fs from 'node:fs';
import * as path from 'node:path';

// node:timers is not faked by useFakeTimers, unlike the globals, which are
// looked up on each call because they are faked after this module loads.
jest.mock('node:timers', () => ({
  Timeout: class {},
  setTimeout: (callback: () => void, delay: number) =>
    globalThis.setTimeout(callback, delay),
  clearTimeout: (timeout: number) => globalThis.clearTimeout(timeout),
}));

const DIR = path.resolve('/', 'project', 'node_modules');
const INTERVAL = 250;

// What `stat` finds at DIR: a directory, by inode number, or nothing.
let onDisk: ?number;
let statCalls: number;

function enoent(): Error {
  const error = new Error('ENOENT: no such file or directory');
  // $FlowFixMe[prop-missing] - Node system errors carry a code
  error.code = 'ENOENT';
  return error;
}

beforeEach(() => {
  jest.useFakeTimers();
  onDisk = null;
  statCalls = 0;
  jest.spyOn(fs.promises, 'stat').mockImplementation(async absolutePath => {
    expect(absolutePath).toBe(DIR);
    statCalls++;
    const ino = onDisk;
    if (ino == null) {
      throw enoent();
    }
    // $FlowFixMe[incompatible-type] - only the fields read for a bigint stat
    return {isDirectory: () => true, dev: BigInt(1), ino: BigInt(ino)};
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const advance = (ms: number): Promise<void> =>
  // $FlowFixMe[prop-missing] - in Jest 29.5+, missing from flow-typed's defs
  jest.advanceTimersByTimeAsync(ms);
const nextCheck = () => advance(INTERVAL);

function poll(reportExisting: boolean) {
  const onDirectory = jest.fn<[], void>();
  const poller = pollForDirectory(DIR, {
    interval: INTERVAL,
    onDirectory,
    reportExisting,
  });
  return {onDirectory, stop: poller.stop};
}

test('reports a directory found by the first check at once, with reportExisting', async () => {
  onDisk = 1;
  const {onDirectory} = poll(true);
  await advance(0);
  expect(onDirectory).toHaveBeenCalledTimes(1);

  // And stops checking.
  await nextCheck();
  expect(statCalls).toBe(1);
});

test('checks every interval until a directory appears, then reports it once the next check finds it too', async () => {
  const {onDirectory} = poll(true);
  await advance(0);
  await nextCheck();
  expect(statCalls).toBe(2);

  onDisk = 1;
  await nextCheck();
  expect(onDirectory).not.toHaveBeenCalled();
  await nextCheck();
  expect(onDirectory).toHaveBeenCalledTimes(1);
  await nextCheck();
  expect(statCalls).toBe(4);
  expect(onDirectory).toHaveBeenCalledTimes(1);
});

test.each([
  ['deleted again', null],
  ['replaced', 2],
])(
  'does not report a directory %s before the next check',
  async (_, replacement) => {
    const {onDirectory} = poll(true);
    await advance(0);
    onDisk = 1;
    await nextCheck();
    onDisk = replacement;
    await nextCheck();
    expect(onDirectory).not.toHaveBeenCalled();
  },
);

test('without reportExisting, ignores a directory found by the first check until it is replaced', async () => {
  onDisk = 1;
  const {onDirectory} = poll(false);
  await advance(0);
  await nextCheck();
  await nextCheck();
  expect(onDirectory).not.toHaveBeenCalled();

  onDisk = 2;
  await nextCheck();
  await nextCheck();
  expect(onDirectory).toHaveBeenCalledTimes(1);
});

test('reports nothing once stopped, even from a check under way', async () => {
  const {onDirectory, stop} = poll(true);
  onDisk = 1;
  stop();
  await advance(0);
  await nextCheck();
  expect(statCalls).toBe(1);
  expect(onDirectory).not.toHaveBeenCalled();
});
