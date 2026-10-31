/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {DirectoryIdentity} from './directoryIdentity';

import {getDirectoryIdentity, isSameDirectory} from './directoryIdentity';
import {Timeout, clearTimeout, setTimeout} from 'node:timers';

export type DirectoryPoller = Readonly<{stop: () => void}>;

/**
 * Check every `interval` ms until `absolutePath` is a directory, then call
 * `onDirectory` once.
 *
 * The first check runs at once. With `reportExisting`, a directory it finds is
 * reported straight away; without, that directory is ignored until it is
 * replaced. A directory found by a later check is reported only once the next
 * check finds the same directory, so that one deleted as soon as it is created
 * is not reported.
 *
 * Polling holds no watch on the path or its ancestors, which need not exist,
 * and does not keep the process alive.
 */
export default function pollForDirectory(
  absolutePath: string,
  options: Readonly<{
    interval: number,
    onDirectory: () => void,
    reportExisting: boolean,
  }>,
): DirectoryPoller {
  const {interval, onDirectory, reportExisting} = options;
  let stopped = false;
  let timeout: ?Timeout = null;
  let isFirstCheck = true;
  // A directory found by the first check, and ignored.
  let existing: ?DirectoryIdentity = null;
  // A directory found by the previous check, to report if it is still there.
  let candidate: ?DirectoryIdentity = null;

  const check = async () => {
    const current = await getDirectoryIdentity(absolutePath);
    if (stopped) {
      return;
    }
    let found = false;
    if (isFirstCheck) {
      isFirstCheck = false;
      found = current != null && reportExisting;
      existing = current;
    } else if (current == null) {
      existing = null;
      candidate = null;
    } else if (!isSameDirectory(current, existing)) {
      existing = null;
      found = isSameDirectory(current, candidate);
      candidate = current;
    }
    if (found) {
      stopped = true;
      onDirectory();
      return;
    }
    timeout = setTimeout(() => void check(), interval).unref();
  };
  void check();

  return {
    stop: () => {
      stopped = true;
      if (timeout != null) {
        clearTimeout(timeout);
      }
    },
  };
}
