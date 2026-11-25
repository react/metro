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
 * A batch of file system changes, by canonical path, as the observations it
 * can invalidate see them.
 */
export type ObservedChanges = Readonly<{
  // Added or removed files and directories, including a file whose type
  // changed (e.g. replaced by a symlink), which is a removal and an addition.
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
export default class ObservationIndex<K> {
  readonly #records: Map<K, ReadonlyMap<string, ResolutionObservations>> =
    new Map();

  get(key: K): ReadonlyMap<string, ResolutionObservations> | void {
    return this.#records.get(key);
  }

  set(key: K, records: ?ReadonlyMap<string, ResolutionObservations>): void {
    if (records == null || records.size === 0) {
      this.#records.delete(key);
    } else {
      this.#records.set(key, records);
    }
  }

  delete(key: K): void {
    this.#records.delete(key);
  }

  getInvalidated(changes: ObservedChanges): Set<K> {
    const invalidated = new Set<K>();
    // Records are shared by every resolution served from the same cache
    // entry, so each is checked once.
    const checked = new Map<ResolutionObservations, boolean>();
    for (const [key, records] of this.#records) {
      for (const record of records.values()) {
        let isInvalidated = checked.get(record);
        if (isInvalidated == null) {
          isInvalidated = recordIsInvalidated(record, changes);
          checked.set(record, isInvalidated);
        }
        if (isInvalidated) {
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
  if (record.haste != null && record.haste.size > 0) {
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
