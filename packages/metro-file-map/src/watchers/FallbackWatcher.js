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

/**
 * Originally vendored from https://github.com/amasad/sane/blob/64ff3a870c42e84f744086884bf55a4f9c22d376/src/node_watcher.js
 */

import type {
  ChangeEventMetadata,
  WatcherBackendChangeEvent,
} from '../flow-types';
import type {WatcherOptions} from './common';
import type {FSWatcher, Stats} from 'node:fs';

import {AbstractWatcher} from './AbstractWatcher';
import * as common from './common';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const platform = os.platform();

const fsPromises = fs.promises;

const TOUCH_EVENT = common.TOUCH_EVENT;
const DELETE_EVENT = common.DELETE_EVENT;
const RECRAWL_EVENT = common.RECRAWL_EVENT;

/**
 * This setting delays all events. It suppresses 'change' events that
 * immediately follow an 'add', and debounces successive 'change' events to
 * only emit the latest.
 */
const DEBOUNCE_MS = 100;

/**
 * The number of entries `recReaddir` visits at a time. Enough to keep the libuv
 * thread pool saturated, few enough that a large tree does not queue up an
 * unbounded number of fs requests.
 */
const CRAWL_CONCURRENCY = 32;

export default class FallbackWatcher extends AbstractWatcher {
  readonly #changeTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();
  // Directories and symlinks we have registered. Regular files aren't
  // tracked: whether a deletion is wanted follows from the file's name, and the
  // file map removes a directory's files when told the directory is deleted.
  readonly #knownDirs: Set<string> = new Set();
  readonly #knownSymlinks: Set<string> = new Set();
  readonly #watched: {[key: string]: FSWatcher, __proto__: null} =
    Object.create(null);

  readonly #crawlFed: boolean;
  // Directories reported by the crawl that are not to be watched, because
  // they or an ancestor are ignored.
  readonly #crawlSkipped: Set<string> = new Set();

  constructor(dir: string, opts: WatcherOptions) {
    super(dir, opts);
    this.#crawlFed = opts.crawlFed === true;
  }

  async startWatching(): Promise<void> {
    this.#watchdir(this.root);
    if (this.#crawlFed) {
      return;
    }

    await recReaddirTypes(
      this.root,
      dir => {
        this.#watchdir(dir);
      },
      () => {},
      symlink => {
        this.#register(symlink, 'l');
      },
      this.#checkedEmitError,
      this.ignored,
    );
  }

  #isCrawlSkipped(dir: string): boolean {
    if (this.#crawlSkipped.has(path.dirname(dir))) {
      this.#crawlSkipped.add(dir);
      return true;
    }
    if (
      this.ignored != null &&
      common.posixPathMatchesPattern(this.ignored, dir)
    ) {
      this.#crawlSkipped.add(dir);
      return true;
    }
    return false;
  }

  /**
   * In crawl-fed mode, a directory under the root the crawl is about to list.
   */
  watchCrawledDirectory(dir: string): void {
    if (dir !== this.root && !this.#isCrawlSkipped(dir)) {
      this.#watchdir(dir);
    }
  }

  /**
   * In crawl-fed mode, a symlink the crawl found.
   */
  registerCrawledSymlink(symlink: string): void {
    if (!this.#crawlSkipped.has(path.dirname(symlink))) {
      this.#register(symlink, 'l');
    }
  }

  /**
   * In crawl-fed mode, a directory the crawl skipped as ignored, which is
   * walked and watched here unless this watcher ignores it too.
   */
  async walkCrawlSkippedDirectory(dir: string): Promise<void> {
    if (this.#isCrawlSkipped(dir)) {
      return;
    }
    await recReaddirTypes(
      dir,
      subdir => {
        this.#watchdir(subdir);
      },
      () => {},
      symlink => {
        this.#register(symlink, 'l');
      },
      this.#checkedEmitError,
      this.ignored,
    );
  }

  /**
   * Whether events for a path are wanted, i.e. it is neither ignored nor (for
   * a regular file) excluded. A directory or symlink is also recorded as known,
   * and false is returned if it already was.
   */
  #register(filepath: string, type: ChangeEventMetadata['type']): boolean {
    const relativePath = path.relative(this.root, filepath);
    if (
      this.doIgnore(relativePath) ||
      (type === 'f' && !common.isIncluded('f', this.included, relativePath))
    ) {
      return false;
    }
    const known =
      type === 'd'
        ? this.#knownDirs
        : type === 'l'
          ? this.#knownSymlinks
          : null;
    if (known != null) {
      if (known.has(filepath)) {
        return false;
      }
      known.add(filepath);
    }
    return true;
  }

  /**
   * Forget a path, and if it was a directory, everything beneath it.
   */
  #unregister(filepath: string): void {
    this.#knownSymlinks.delete(filepath);
    if (!this.#knownDirs.has(filepath)) {
      return;
    }
    const prefix = filepath + path.sep;
    for (const known of [this.#knownDirs, this.#knownSymlinks]) {
      for (const entry of known) {
        if (entry === filepath || entry.startsWith(prefix)) {
          known.delete(entry);
        }
      }
    }
  }

  /**
   * Emit "error" event if it's not an ignorable event
   */
  #checkedEmitError: (error: Error) => void = error => {
    if (!isIgnorableFileError(error)) {
      this.emitError(error);
    }
  };

  /**
   * Watch a directory.
   */
  #watchdir: (dir: string) => boolean = (dir: string) => {
    if (this.#watched[dir]) {
      return false;
    }
    let watcher: FSWatcher;
    try {
      watcher = fs.watch(dir, {persistent: true}, (event, filename) => {
        // libuv on Windows reports a deleted watched directory to its own
        // handle as a rename naming the directory's absolute path, and before
        // libuv 1.53 repeats that report until the handle is closed. If the
        // directory is recreated first, the open handle also stops it from
        // being watched again. Linux and macOS name the directory by its
        // basename instead, so this branch is Windows-only.
        if (filename != null && path.isAbsolute(filename)) {
          this.#reconcileWatchedDirectory(dir, watcher).catch(error =>
            this.emitError(error),
          );
          return;
        }
        this.#normalizeChange(dir, event, filename);
      });
    } catch (error) {
      // A directory we cannot watch is still worth crawling, so report the
      // error and carry on rather than losing the subtree under it.
      this.#checkedEmitError(error);
      return false;
    }
    this.#watched[dir] = watcher;

    watcher.on('error', error => {
      // Node has already closed the watcher, and will not emit 'close'. Forget
      // it, so that stopping doesn't wait on it and the path can be watched
      // again.
      if (this.#watched[dir] === watcher) {
        delete this.#watched[dir];
      }
      this.#checkedEmitError(error);
    });

    if (this.root !== dir) {
      this.#register(dir, 'd');
    }
    return true;
  };

  /**
   * Stop watching a directory.
   */
  async #stopWatching(dir: string): Promise<void> {
    if (this.#watched[dir]) {
      await new Promise(resolve => {
        this.#watched[dir].once('close', () => process.nextTick(resolve));
        this.#watched[dir].close();
        delete this.#watched[dir];
      });
    }
  }

  /**
   * Stop watching a directory and every directory beneath it.
   */
  async #stopWatchingTree(dirpath: string): Promise<void> {
    const prefix = dirpath + path.sep;
    const nested = Object.keys(this.#watched).filter(watchedDir =>
      watchedDir.startsWith(prefix),
    );
    await Promise.all(
      [dirpath, ...nested].map(watchedDir => this.#stopWatching(watchedDir)),
    );
  }

  /**
   * A watched directory reported its own path, so it was deleted or replaced:
   * close its handles and process it as its parent's rename event would.
   */
  async #reconcileWatchedDirectory(
    dir: string,
    watcher: FSWatcher,
  ): Promise<void> {
    if (this.#watched[dir] !== watcher) {
      return;
    }
    if (dir === this.root) {
      await this.#stopWatching(dir);
      return;
    }
    await this.#stopWatchingTree(dir);
    await this.#processChange(path.dirname(dir), 'rename', path.basename(dir));
  }

  /**
   * End watching.
   */
  async stopWatching(): Promise<void> {
    await super.stopWatching();
    const promises = Object.keys(this.#watched).map(dir =>
      this.#stopWatching(dir),
    );
    await Promise.all(promises);
  }

  /**
   * Normalize fs events and pass it on to be processed.
   */
  #normalizeChange(dir: string, event: string, file: string) {
    if (!file) {
      this.#processUnnamedChange(dir).catch(error => this.emitError(error));
    } else {
      this.#processChange(dir, event, path.normalize(file)).catch(error =>
        this.emitError(error),
      );
    }
  }

  /**
   * Process an event that doesn't name the changed entry. Windows sends these
   * when changes to a directory overflow the buffer they're reported through,
   * so any number of entries under `dir` may have been added, changed or
   * removed.
   */
  async #processUnnamedChange(dir: string) {
    // Watch and register anything new, so that later changes are reported.
    await recReaddirTypes(
      dir,
      subdir => {
        this.#watchdir(subdir);
      },
      () => {},
      symlink => {
        this.#register(symlink, 'l');
      },
      this.#checkedEmitError,
      this.ignored,
    );
    // Then have the file map reconcile everything under `dir`.
    this.#emitEvent({
      event: RECRAWL_EVENT,
      relativePath: path.relative(this.root, dir),
    });
  }

  /**
   * Process changes.
   */
  async #processChange(dir: string, event: string, file: string) {
    const fullPath = path.join(dir, file);
    const relativePath = path.join(path.relative(this.root, dir), file);

    const isKnownDir = this.#knownDirs.has(fullPath);
    const isKnownSymlink = this.#knownSymlinks.has(fullPath);

    try {
      const stat = await fsPromises.lstat(fullPath);
      if (stat.isDirectory()) {
        // win32 emits useless change events on dirs.
        if (event === 'change') {
          return;
        }

        if (
          this.doIgnore(relativePath) ||
          !common.isIncluded('d', this.included, relativePath)
        ) {
          return;
        }
        await recReaddir(
          path.resolve(this.root, relativePath),
          (dir, stats) => {
            if (this.#watchdir(dir)) {
              this.#emitEvent({
                event: TOUCH_EVENT,
                relativePath: path.relative(this.root, dir),
                metadata: {
                  modifiedTime: stats.mtime.getTime(),
                  size: stats.size,
                  type: 'd',
                },
              });
            }
          },
          (file, stats) => {
            if (this.#register(file, 'f')) {
              this.#emitEvent({
                event: TOUCH_EVENT,
                relativePath: path.relative(this.root, file),
                metadata: {
                  modifiedTime: stats.mtime.getTime(),
                  size: stats.size,
                  type: 'f',
                },
              });
            }
          },
          (symlink, stats) => {
            if (this.#register(symlink, 'l')) {
              this.emitFileEvent({
                event: TOUCH_EVENT,
                relativePath: path.relative(this.root, symlink),
                metadata: {
                  modifiedTime: stats.mtime.getTime(),
                  size: stats.size,
                  type: 'l',
                },
              });
            }
          },
          this.#checkedEmitError,
          this.ignored,
        );
        // A directory we already knew about has been replaced, so entries we
        // registered under it may since have changed or been removed. Have the
        // file map reconcile it.
        if (isKnownDir) {
          this.#emitEvent({event: RECRAWL_EVENT, relativePath});
        }
      } else {
        const type = common.typeFromStat(stat);
        if (type == null) {
          return;
        }
        const metadata: ChangeEventMetadata = {
          modifiedTime: stat.mtime.getTime(),
          size: stat.size,
          type,
        };
        if (this.#register(fullPath, type)) {
          this.#emitEvent({event: TOUCH_EVENT, relativePath, metadata});
        }
      }
    } catch (error) {
      if (!isIgnorableFileError(error)) {
        this.emitError(error);
        return;
      }
      this.#unregister(fullPath);
      // For a directory, the file map removes everything under it too.
      if (
        isKnownDir ||
        isKnownSymlink ||
        (!this.doIgnore(relativePath) &&
          common.isIncluded('f', this.included, relativePath))
      ) {
        this.#emitEvent({event: DELETE_EVENT, relativePath});
      }
      // Close every handle under a deleted directory. Left open, a handle stops
      // its path from being watched again once it is recreated. On Linux it
      // also follows the directory if it was moved (as npm moves a package
      // aside to update it), so it goes on watching the old copy. macOS
      // watches by path, so there an open handle is merely redundant.
      if (isKnownDir || this.#watched[fullPath]) {
        await this.#stopWatchingTree(fullPath);
      }
    }
  }

  /**
   * Emits the given event after debouncing, to emit only the latest
   * information when we receive several events in quick succession. E.g.,
   * Linux emits two events for every new file.
   *
   * See also note above for DEBOUNCE_MS.
   */
  #emitEvent(change: Omit<WatcherBackendChangeEvent, 'root'>) {
    const {event, relativePath} = change;
    const key = event + '-' + relativePath;
    const existingTimer = this.#changeTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    this.#changeTimers.set(
      key,
      setTimeout(() => {
        this.#changeTimers.delete(key);
        this.emitFileEvent(change);
      }, DEBOUNCE_MS),
    );
  }

  getPauseReason(): ?string {
    return null;
  }
}
/**
 * Determine if a given FS error can be ignored
 */
function isIgnorableFileError(error: Error | {code: string}) {
  return (
    error.code === 'ENOENT' ||
    // Workaround Windows EPERM on watched folder deletion, and when
    // reading locked files (pending further writes or pending deletion).
    // In such cases, we'll receive a subsequent event when the file is
    // deleted or ready to read.
    // https://github.com/react/metro/issues/1001
    // https://github.com/nodejs/node-v0.x-archive/issues/4337
    (error.code === 'EPERM' && platform === 'win32')
  );
}

/**
 * Traverse a directory recursively, reporting every entry with its stats.
 */
async function recReaddir(
  root: string,
  dirCallback: (string, Stats) => void,
  fileCallback: (string, Stats) => void,
  symlinkCallback: (string, Stats) => void,
  errorCallback: Error => void,
  ignored: ?RegExp,
): Promise<void> {
  const pending = [root];

  const visit = async (entry: string) => {
    let stats;
    let names;
    try {
      stats = await fsPromises.lstat(entry);
      if (!stats.isDirectory()) {
        if (stats.isSymbolicLink()) {
          symlinkCallback(entry, stats);
        } else if (stats.isFile()) {
          fileCallback(entry, stats);
        }
        return;
      }
      if (ignored != null && common.posixPathMatchesPattern(ignored, entry)) {
        return;
      }
      // Report the directory before listing it. A consumer that starts watching
      // here would otherwise miss anything written between the two.
      dirCallback(entry, stats);
      names = await fsPromises.readdir(entry);
    } catch (error) {
      errorCallback(error);
      return;
    }
    for (const name of names) {
      pending.push(path.join(entry, name));
    }
  };

  await visitAll(pending, visit);
}

/**
 * As `recReaddir`, but without stats: entries are classified by the types
 * `readdir` reports, so nothing is stat'd unless its type is unknown.
 */
async function recReaddirTypes(
  root: string,
  dirCallback: string => void,
  fileCallback: string => void,
  symlinkCallback: string => void,
  errorCallback: Error => void,
  ignored: ?RegExp,
): Promise<void> {
  const isIgnored = (dir: string) =>
    ignored != null && common.posixPathMatchesPattern(ignored, dir);
  if (isIgnored(root)) {
    return;
  }
  const pending = [root];

  const visit = async (dir: string) => {
    // Report the directory before listing it. A consumer that starts watching
    // here would otherwise miss anything written between the two.
    dirCallback(dir);
    let entries;
    try {
      entries = await fsPromises.readdir(dir, {withFileTypes: true});
    } catch (error) {
      errorCallback(error);
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name.toString());
      let isDirectory = entry.isDirectory();
      let isSymbolicLink = entry.isSymbolicLink();
      let isFile = entry.isFile();
      if (!isDirectory && !isSymbolicLink && !isFile) {
        // A file system that doesn't report types gives none of these.
        try {
          const stats = await fsPromises.lstat(entryPath);
          isDirectory = stats.isDirectory();
          isSymbolicLink = stats.isSymbolicLink();
          isFile = stats.isFile();
        } catch (error) {
          errorCallback(error);
          continue;
        }
      }
      if (isDirectory) {
        if (!isIgnored(entryPath)) {
          pending.push(entryPath);
        }
      } else if (isSymbolicLink) {
        symlinkCallback(entryPath);
      } else if (isFile) {
        fileCallback(entryPath);
      }
    }
  };

  await visitAll(pending, visit);
}

/**
 * Visit `pending` and whatever visits add to it, depth-first, by a bounded
 * pool, so neither the queue of pending entries nor the number of in-flight fs
 * requests grows with the size of the tree.
 */
function visitAll(
  pending: Array<string>,
  visit: string => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let active = 0;
    const pump = () => {
      while (active < CRAWL_CONCURRENCY) {
        const entry = pending.pop();
        if (entry == null) {
          break;
        }
        active++;
        visit(entry).then(() => {
          active--;
          pump();
        }, reject);
      }
      if (active === 0) {
        resolve();
      }
    };
    pump();
  });
}
