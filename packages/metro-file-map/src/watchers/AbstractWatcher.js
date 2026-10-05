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

import {posixPathMatchesPattern} from './common';
import EventEmitter from 'events';
import * as path from 'path';

export type Listeners = Readonly<{
  onFileEvent: (event: WatcherBackendChangeEvent) => void,
  onError: (error: Error) => void,
}>;

export class AbstractWatcher implements WatcherBackend {
  +root: string;
  +ignored: ?RegExp;
  +included: ?WatcherIncludedFiles;
  +doIgnore: (path: string) => boolean;

  #emitter: EventEmitter = new EventEmitter();

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
    this.#emitter.emit('fileevent', {
      ...event,
      root: this.root,
    });
  }

  emitError(error: Error) {
    this.#emitter.emit('error', error);
  }

  getPauseReason(): ?string {
    return null;
  }
}
