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

import type {DeltaResult, Options} from './types';
import type {ChangeEvent} from 'metro-file-map';

import {Graph} from './Graph';
import debugModule from 'debug';
import crypto from 'node:crypto';
import EventEmitter from 'node:events';
import path from 'node:path';

const debug = debugModule('Metro:DeltaCalculator');

/**
 * Assigns a unique, stable `changeId` to each `ChangeEvent` from the file
 * watcher. Since all `DeltaCalculator` instances share the same
 * `ChangeEvent` object reference per file system change, the `WeakMap`
 * ensures each gets the same `changeId`.
 */
const changeEventIds: WeakMap<ChangeEvent, string> = new WeakMap();

/**
 * This class is in charge of calculating the delta of changed modules that
 * happen between calls. To do so, it subscribes to file changes, so it can
 * traverse the files that have been changed between calls and avoid having to
 * traverse the whole dependency tree for trivial small changes.
 */
export default class DeltaCalculator<T> extends EventEmitter {
  _changeEventSource: EventEmitter;
  _options: Options<T>;

  _currentBuildPromise: ?Promise<DeltaResult<T>>;
  _deletedFiles: Set<string> = new Set();
  _modifiedFiles: Set<string> = new Set();
  _addedFiles: Set<string> = new Set();
  _requiresReset: boolean = false;

  _graph: Graph<T>;

  constructor(
    entryPoints: ReadonlySet<string>,
    changeEventSource: EventEmitter,
    options: Options<T>,
  ) {
    super();

    this._options = options;
    this._changeEventSource = changeEventSource;

    this._graph = new Graph({
      entryPoints,
      transformOptions: this._options.transformOptions,
    });

    this._changeEventSource.on('change', this._handleMultipleFileChanges);
  }

  /**
   * Stops listening for file changes and clears all the caches.
   */
  end(): void {
    this._changeEventSource.removeListener(
      'change',
      this._handleMultipleFileChanges,
    );

    this.removeAllListeners();

    // Clean up all the cache data structures to deallocate memory.
    this._graph = new Graph({
      entryPoints: this._graph.entryPoints,
      transformOptions: this._options.transformOptions,
    });
    this._modifiedFiles = new Set();
    this._deletedFiles = new Set();
    this._addedFiles = new Set();
  }

  /**
   * Main method to calculate the delta of modules. It returns a DeltaResult,
   * which contain the modified/added modules and the removed modules.
   */
  async getDelta({
    reset,
    shallow,
  }: {
    reset: boolean,
    shallow: boolean,
    ...
  }): Promise<DeltaResult<T>> {
    debug('Calculating delta (reset: %s, shallow: %s)', reset, shallow);
    // If there is already a build in progress, wait until it finish to start
    // processing a new one (delta server doesn't support concurrent builds).
    if (this._currentBuildPromise) {
      await this._currentBuildPromise;
    }

    // We don't want the modified files Set to be modified while building the
    // bundle, so we isolate them by using the current instance for the bundling
    // and creating a new instance for the file watcher.
    const modifiedFiles = this._modifiedFiles;
    this._modifiedFiles = new Set();
    const deletedFiles = this._deletedFiles;
    this._deletedFiles = new Set();
    const addedFiles = this._addedFiles;
    this._addedFiles = new Set();
    const requiresReset = this._requiresReset;
    this._requiresReset = false;

    // Revisit all files if changes require a graph reset - resolutions may be
    // invalidated but we don't yet know which. This should be optimized in the
    // future.
    if (requiresReset) {
      const markModified = (file: string) => {
        if (!addedFiles.has(file) && !deletedFiles.has(file)) {
          modifiedFiles.add(file);
        }
      };
      this._graph.dependencies.forEach((_, key) => markModified(key));
      this._graph.entryPoints.forEach(markModified);
    }

    // Concurrent requests should reuse the same bundling process. To do so,
    // this method stores the promise as an instance variable, and then it's
    // removed after it gets resolved.
    this._currentBuildPromise = this._getChangedDependencies(
      modifiedFiles,
      deletedFiles,
      addedFiles,
    );

    let result;

    try {
      result = await this._currentBuildPromise;
    } catch (error) {
      // In case of error, we don't want to mark the modified files as
      // processed (since we haven't actually created any delta). If we do not
      // do so, asking for a delta after an error will produce an empty Delta,
      // which is not correct.
      modifiedFiles.forEach((file: string) => this._modifiedFiles.add(file));
      deletedFiles.forEach((file: string) => this._deletedFiles.add(file));
      addedFiles.forEach((file: string) => this._addedFiles.add(file));

      throw error;
    } finally {
      this._currentBuildPromise = null;
    }

    // Return all the modules if the client requested a reset delta.
    if (reset) {
      this._graph.reorderGraph({shallow});

      return {
        added: this._graph.dependencies,
        deleted: new Set(),
        modified: new Map(),
        reset: true,
      };
    }

    return result;
  }

  /**
   * Returns the graph with all the dependencies. Each module contains the
   * needed information to do the traversing (dependencies, inverseDependencies)
   * plus some metadata.
   */
  getGraph(): Graph<T> {
    return this._graph;
  }

  #shouldReset(
    canonicalPath: string,
    metadata: {readonly isSymlink: boolean, ...},
  ): boolean {
    if (metadata.isSymlink) {
      return true;
    }

    if (
      this._options.unstable_enablePackageExports &&
      (canonicalPath === 'package.json' ||
        canonicalPath.endsWith(path.sep + 'package.json'))
    ) {
      return true;
    }

    return false;
  }

  _handleMultipleFileChanges = (changeEvent: ChangeEvent) => {
    const {changes, logger, rootDir} = changeEvent;

    // Process added files: deleted+added = modified, otherwise added
    for (const [canonicalPath, metadata] of changes.addedFiles) {
      debug('Handling add: %s', canonicalPath);
      if (this.#shouldReset(canonicalPath, metadata)) {
        this._requiresReset = true;
      }
      const absolutePath = path.join(rootDir, canonicalPath);
      if (this._deletedFiles.has(absolutePath)) {
        this._deletedFiles.delete(absolutePath);
        this._modifiedFiles.add(absolutePath);
      } else {
        this._addedFiles.add(absolutePath);
        this._modifiedFiles.delete(absolutePath);
      }
    }

    // Process modified files: added+modified stays added, otherwise modified
    for (const [canonicalPath, metadata] of changes.modifiedFiles) {
      debug('Handling change: %s', canonicalPath);
      if (this.#shouldReset(canonicalPath, metadata)) {
        this._requiresReset = true;
      }
      const absolutePath = path.join(rootDir, canonicalPath);
      if (!this._addedFiles.has(absolutePath)) {
        this._modifiedFiles.add(absolutePath);
      }
      this._deletedFiles.delete(absolutePath);
    }

    // Process removed files: added+deleted = no change, otherwise deleted
    for (const [canonicalPath, metadata] of changes.removedFiles) {
      debug('Handling delete: %s', canonicalPath);
      if (this.#shouldReset(canonicalPath, metadata)) {
        this._requiresReset = true;
      }
      const absolutePath = path.resolve(rootDir, canonicalPath);
      if (this._addedFiles.has(absolutePath)) {
        this._addedFiles.delete(absolutePath);
      } else {
        this._deletedFiles.add(absolutePath);
        this._modifiedFiles.delete(absolutePath);
      }
    }

    let changeId = changeEventIds.get(changeEvent);
    if (changeId == null) {
      changeId = crypto.randomUUID();
      changeEventIds.set(changeEvent, changeId);
    }

    this.emit('change', {logger, changeId});
  };

  async _getChangedDependencies(
    modifiedFiles: Set<string>,
    deletedFiles: Set<string>,
    addedFiles: Set<string>,
  ): Promise<DeltaResult<T>> {
    if (!this._graph.dependencies.size) {
      const {added} = await this._graph.initialTraverseDependencies(
        this._options,
      );

      return {
        added,
        deleted: new Set(),
        modified: new Map(),
        reset: true,
      };
    }

    // If a file has been deleted, we want to invalidate any other file that
    // depends on it, so we can process it and correctly return an error.
    deletedFiles.forEach((filePath: string) => {
      for (const modifiedModulePath of this._graph.getModifiedModulesForDeletedPath(
        filePath,
      )) {
        // Only mark the inverse dependency as modified if it's not already
        // marked as deleted (in that case we can just ignore it).
        if (!deletedFiles.has(modifiedModulePath)) {
          modifiedFiles.add(modifiedModulePath);
        }
      }
    });

    // NOTE(EvanBacon): This check adds extra complexity so we feature gate it
    // to enable users to opt out.
    if (this._options.unstable_allowRequireContext) {
      // Check if any added or removed files are matched in a context module.
      // We only need to do this for added files because (1) deleted files will have a context
      // module as an inverse dependency, (2) modified files don't invalidate the contents
      // of the context module.
      addedFiles.forEach(filePath => {
        this._graph.markModifiedContextModules(filePath, modifiedFiles);
      });
    }

    // We only want to process files that are in the bundle.
    const modifiedDependencies = Array.from(modifiedFiles).filter(
      (filePath: string) => this._graph.dependencies.has(filePath),
    );

    // No changes happened. Return empty delta.
    if (modifiedDependencies.length === 0) {
      return {
        added: new Map(),
        deleted: new Set(),
        modified: new Map(),
        reset: false,
      };
    }

    debug('Traversing dependencies for %s paths', modifiedDependencies.length);
    const {added, modified, deleted} = await this._graph.traverseDependencies(
      modifiedDependencies,
      this._options,
    );
    debug(
      'Calculated graph delta {added: %s, modified: %d, deleted: %d}',
      added.size,
      modified.size,
      deleted.size,
    );

    return {
      added,
      deleted,
      modified,
      reset: false,
    };
  }
}
