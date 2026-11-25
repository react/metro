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

import type {ResolutionObservations} from './types';

/**
 * A batch of file system changes by canonical path, grouped by what each can
 * invalidate.
 */
export type ObservedChanges = Readonly<{
  // Added or removed files and directories.
  addedOrRemoved: ReadonlySet<string>,
  // Modified files, and modified directories, i.e. the parent of every added
  // or removed entry.
  modified: ReadonlySet<string>,
  // Haste names whose lookup may have changed, or 'all' if that is unknown.
  hasteNames: ReadonlySet<string> | 'all',
}>;

/**
 * What each key (e.g. a module) observed through its resolutions, and which
 * keys a batch of changes may invalidate. `existence` is matched by
 * additions and removals, `content` also by modifications, and `haste` by
 * names whose lookup changed.
 *
 * This implementation keeps each key's records as given and scans them for
 * every batch, which is simple to keep correct, not fast.
 */
export default class ObservationIndex {
  readonly #records: Map<string, ReadonlyMap<string, ResolutionObservations>> =
    new Map();

  get(key: string): ReadonlyMap<string, ResolutionObservations> | void {
    return this.#records.get(key);
  }

  set(
    key: string,
    records: ?ReadonlyMap<string, ResolutionObservations>,
  ): void {
    if (records == null) {
      this.#records.delete(key);
    } else {
      this.#records.set(key, records);
    }
  }

  delete(key: string): void {
    this.#records.delete(key);
  }

  getInvalidated(changes: ObservedChanges): Set<string> {
    const invalidated = new Set<string>();
    for (const [key, records] of this.#records) {
      for (const record of records.values()) {
        if (recordIsInvalidated(record, changes)) {
          invalidated.add(key);
          break;
        }
      }
    }
    return invalidated;
  }
}

function recordIsInvalidated(
  record: ResolutionObservations,
  {addedOrRemoved, modified, hasteNames}: ObservedChanges,
): boolean {
  for (const canonicalPath of record.existence) {
    if (addedOrRemoved.has(canonicalPath)) {
      return true;
    }
  }
  for (const canonicalPath of record.content) {
    if (addedOrRemoved.has(canonicalPath) || modified.has(canonicalPath)) {
      return true;
    }
  }
  if (record.haste != null) {
    if (hasteNames === 'all') {
      return true;
    }
    for (const name of record.haste) {
      if (hasteNames.has(name)) {
        return true;
      }
    }
  }
  return false;
}
