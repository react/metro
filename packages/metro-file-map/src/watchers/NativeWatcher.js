/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {WatcherBackendChangeEvent} from '../flow-types';
import type {FSWatcher} from 'node:fs';

import {AbstractWatcher} from './AbstractWatcher';
import {includedByGlob, typeFromStat} from './common';
import debugModule from 'debug';
import {promises as fsPromises, watch} from 'node:fs';
import {platform} from 'node:os';
import * as path from 'node:path';

const debug = debugModule('Metro:NativeWatcher');

const TOUCH_EVENT = 'touch';
const DELETE_EVENT = 'delete';
const RECRAWL_EVENT = 'recrawl';

/**
 * NativeWatcher uses Node's native fs.watch API with recursive: true.
 *
 * Supported on macOS (and potentially Windows), because both natively have a
 * concept of recurisve watching, via FSEvents and ReadDirectoryChangesW
 * respectively. Notably Linux lacks this capability at the OS level.
 *
 * Node.js has at times supported the `recursive` option to fs.watch on Linux
 * by walking the directory tree and creating a watcher on each directory, but
 * this fits poorly with the synchronous `watch` API - either it must block for
 * arbitrarily large IO, or it may drop changes after `watch` returns. See:
 * https://github.com/nodejs/node/issues/48437
 *
 * Therefore, we retain a fallback to our own application-level recursive
 * FallbackWatcher for Linux, which has async `startWatching`.
 *
 * On Windows, this watcher could be used in principle, but needs work around
 * some Windows-specific edge cases handled in FallbackWatcher, like
 * deduping file change events, ignoring directory changes, and handling EPERM.
 */
export default class NativeWatcher extends AbstractWatcher {
  #fsWatcher: ?FSWatcher;

  /**
   * Promise chain to emit events in the order they were received.
   */
  #emitQueue: Promise<void> = Promise.resolve();

  static isSupported(): boolean {
    return platform() === 'darwin';
  }

  constructor(
    dir: string,
    opts: Readonly<{
      ignored: ?RegExp,
      globs: ReadonlyArray<string>,
      dot: boolean,
      ...
    }>,
  ) {
    if (!NativeWatcher.isSupported()) {
      throw new Error('This watcher can only be used on macOS');
    }
    super(dir, opts);
  }

  async startWatching(): Promise<void> {
    this.#fsWatcher = watch(
      this.root,
      {
        // Don't hold the process open if we forget to close()
        persistent: false,
        // FSEvents or ReadDirectoryChangesW should mean this is cheap and
        // ~instant on macOS or Windows.
        recursive: true,
      },
      (event, relativePath) => {
        // Start handling immediately so that stats are gathered concurrently
        // and as close as possible to the event, but emit in arrival order.
        const settled = this.#handleEvent(event, relativePath).then(
          change => ({change, error: null}),
          (error: Error) => ({change: null, error}),
        );
        this.#emitQueue = this.#emitQueue
          .then(async () => {
            const {change, error} = await settled;
            if (error != null) {
              this.emitError(error);
            } else if (change != null) {
              this.emitFileEvent(change);
            }
          })
          .catch(error => {
            // Only reached if emitting threw
            this.emitError(error);
          });
      },
    );

    debug('Watching %s', this.root);
  }

  /**
   * End watching.
   */
  async stopWatching(): Promise<void> {
    await super.stopWatching();
    if (this.#fsWatcher) {
      this.#fsWatcher.close();
    }
  }

  /**
   * Resolve a raw `fs.watch` event into the event to emit for it, or `null` if
   * it should be dropped.
   */
  async #handleEvent(
    event: string,
    relativePath: string,
  ): Promise<?Omit<WatcherBackendChangeEvent, 'root'>> {
    const absolutePath = path.resolve(this.root, relativePath);
    if (this.doIgnore(relativePath)) {
      debug(
        'Ignoring event "%s" on %s (root: %s)',
        event,
        relativePath,
        this.root,
      );
      return null;
    }
    debug(
      'Handling event "%s" on %s (root: %s)',
      event,
      relativePath,
      this.root,
    );

    try {
      const stat = await fsPromises.lstat(absolutePath);
      const type = typeFromStat(stat);

      // Ignore files of an unrecognized type
      if (!type) {
        return null;
      }

      if (!includedByGlob(type, this.globs, this.dot, relativePath)) {
        return null;
      }

      // For directory "rename" events, notify that we need a recrawl since we
      // wont' receive events for unmodified files underneath a moved (or
      // cloned) directory. Renames are fired by the OS on moves, clones, and
      // creations. We ignore "change" events because they indiciate a change
      // to directory metadata, rather than its path or existence.
      if (type === 'd' && event === 'rename') {
        debug(
          'Directory rename detected on %s, requesting recrawl',
          relativePath,
        );
        return {
          event: RECRAWL_EVENT,
          relativePath,
        };
      }

      return {
        event: TOUCH_EVENT,
        relativePath,
        metadata: {
          type,
          modifiedTime: stat.mtime.getTime(),
          size: stat.size,
        },
      };
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }

      return {event: DELETE_EVENT, relativePath};
    }
  }
}
