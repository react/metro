/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {
  WatcherBackend,
  WatcherBackendChangeEvent,
  WatcherBackendOptions,
  WatcherIncludedFiles,
} from '../flow-types';
import type {DirectoryIdentity} from '../lib/directoryIdentity';

import {getDirectoryIdentity, isSameDirectory} from '../lib/directoryIdentity';
import {LOST_EVENT, posixPathMatchesPattern} from './common';
import EventEmitter from 'node:events';
import * as path from 'node:path';

export type Listeners = Readonly<{
  onFileEvent: (event: WatcherBackendChangeEvent) => void,
  onError: (error: Error) => void,
}>;

export class AbstractWatcher implements WatcherBackend {
  readonly root: string;
  readonly ignored: ?RegExp;
  readonly included: ?WatcherIncludedFiles;
  readonly doIgnore: (path: string) => boolean;

  #emitter: EventEmitter = new EventEmitter();
  #rootIdentity: ?DirectoryIdentity = null;
  #rootLost: boolean = false;

  /**
   * Whether a watch reports every change made after `startWatching` resolves.
   * If not, `Watcher` confirms each watch with a change of its own before
   * relying on it.
   */
  static isLiveOnStart(): boolean {
    return true;
  }

  constructor(dir: string, opts: WatcherBackendOptions) {
    const {ignored, included} = opts;
    this.ignored = ignored;
    this.included = included;
    this.doIgnore = ignored
      ? (filePath: string) => posixPathMatchesPattern(ignored, filePath)
      : () => false;

    this.root = path.resolve(dir);
  }

  onFileEvent(
    listener: (event: WatcherBackendChangeEvent) => void,
  ): () => void {
    this.#emitter.on('fileevent', listener);
    return () => {
      this.#emitter.removeListener('fileevent', listener);
    };
  }

  onError(listener: (error: Error) => void): () => void {
    this.#emitter.on('error', listener);
    return () => {
      this.#emitter.removeListener('error', listener);
    };
  }

  async startWatching(): Promise<void> {
    // Must be implemented by subclasses
  }

  async stopWatching(): Promise<void> {
    this.#emitter.removeAllListeners();
  }

  emitFileEvent(event: Omit<WatcherBackendChangeEvent, 'root'>) {
    if (this.#rootLost) {
      return;
    }
    if (event.event === LOST_EVENT) {
      this.#rootLost = true;
    }
    this.#emitter.emit('fileevent', {
      ...event,
      root: this.root,
    });
  }

  /**
   * Record which directory the root is, before watching it. Resolves to false
   * if it is not a directory, in which case a subclass should report the root
   * lost instead of watching it.
   */
  async recordRootIdentity(): Promise<boolean> {
    this.#rootIdentity = await getDirectoryIdentity(this.root);
    return this.#rootIdentity != null;
  }

  /**
   * Whether the root is no longer the directory recorded by
   * `recordRootIdentity`, i.e. it has been deleted, or replaced by another
   * directory, e.g. one moved into its place.
   */
  async isRootLost(): Promise<boolean> {
    return !isSameDirectory(
      await getDirectoryIdentity(this.root),
      this.#rootIdentity,
    );
  }

  /**
   * Report that the root is no longer watched. Nothing is reported after this.
   */
  emitRootLost() {
    this.emitFileEvent({event: LOST_EVENT, relativePath: ''});
  }

  emitError(error: Error) {
    this.#emitter.emit('error', error);
  }

  getPauseReason(): ?string {
    return null;
  }
}
