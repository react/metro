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

import type {ResolutionObservations} from '../../DeltaBundler/types';

import path from 'node:path';

export type ObservationsId = number;

/**
 * An append-only list of observed paths. A resolution records into these
 * rather than into sets: duplicates are allowed, and `ObservationIndex`
 * deduplicates when it ingests the record.
 */
export class ObservationList {
  readonly items: Array<string> = [];

  add(item: string): void {
    this.items.push(item);
  }
}

// Same shape for every record, to keep lookups monomorphic.
export function createObservations(): {...ResolutionObservations} {
  return {
    existence: new ObservationList(),
    content: new ObservationList(),
    haste: null,
  };
}

/**
 * Existence is indexed by an entry's missing-name key: its parent directory
 * plus its basename up to the first '.' (a leading '.' is part of the name).
 * Every candidate probed for one module (`Button`, `Button.ios.tsx`,
 * `Button.native.tsx`, ...) shares one key, so each resolution keeps one entry
 * per module it looked for rather than one per candidate. Matching a change
 * by the same key is sound for any entry, found or missing, at the cost of
 * also matching other names with the same stem (e.g. `Button.test.tsx`).
 */
function missingNameKey(canonicalPath: string): string {
  const nameStart = canonicalPath.lastIndexOf(path.sep) + 1;
  const dotIdx = canonicalPath.indexOf('.', nameStart);
  return dotIdx <= nameStart ? canonicalPath : canonicalPath.slice(0, dotIdx);
}

// A key retained by the index must not retain the larger string it was
// sliced or concatenated from, such as a candidate path the resolver built.
function flatCopy(value: string): string {
  const copy = Buffer.from(value, 'utf8').toString('utf8');
  // Not lossless for unpaired surrogates; keep the original then.
  return copy === value ? copy : value;
}

const NO_EDGE = -1;
const DOT = 46; // '.'

function growInt32(array: Int32Array, minLength: number): Int32Array {
  if (array.length >= minLength) {
    return array;
  }
  const grown = new Int32Array(Math.max(minLength, array.length * 2));
  grown.set(array);
  return grown;
}

function growUint32(array: Uint32Array, minLength: number): Uint32Array {
  if (array.length >= minLength) {
    return array;
  }
  const grown = new Uint32Array(Math.max(minLength, array.length * 2));
  grown.set(array);
  return grown;
}

/**
 * What each resolution in one resolution cache observed, in reduced and
 * interned form, and the inverse: which resolutions observed each path. The
 * raw records producers append to are dropped once ingested.
 *
 * The reduction is private to this index: producers (`TreeFS`, and so any
 * custom resolver, through the context's capabilities) record exact paths,
 * and only `ingest` and `getInvalidated` need to agree on how they are keyed.
 *
 * Storage is one pool of edges (a record's key ids, in record order), with
 * each key's edges threaded into a linked list for the inverse lookup.
 */
export class ObservationIndex {
  readonly #existenceIds: Map<string, number> = new Map();
  readonly #contentIds: Map<string, number> = new Map();
  readonly #hasteIds: Map<string, number> = new Map();
  #keyCount: number = 0;
  // Key id -> its most recent edge, or NO_EDGE.
  #keyHead: Int32Array = new Int32Array(1024);
  // Key id -> 1 + the last record that added it, to deduplicate a record.
  #keyLastRecord: Uint32Array = new Uint32Array(1024);
  #edgeCount: number = 0;
  // Edge -> key id, the next edge of the same key (or NO_EDGE), its record.
  #edgeKey: Uint32Array = new Uint32Array(4096);
  #edgeNext: Int32Array = new Int32Array(4096);
  #edgeRecord: Uint32Array = new Uint32Array(4096);
  // Record id -> its first edge; a record's edges are contiguous.
  #recordStart: Uint32Array = new Uint32Array(1024);
  #recordCount: number = 0;

  ingest(observations: ResolutionObservations): ObservationsId {
    const recordId = this.#recordCount++;
    this.#recordStart = growUint32(this.#recordStart, recordId + 2);
    this.#recordStart[recordId] = this.#edgeCount;

    // A module's candidates are recorded consecutively and share a key
    // (`D/Button`, `D/Button.ios.ts`, ...), so a run of them is recognized by
    // its prefix without slicing or hashing. The key is `missingNameKey`'s,
    // computed inline to also learn whether it can prefix a run.
    let previousKey = '';
    let previousId = -1;
    // Whether `previousKey`'s name has no '.', so that previousKey + '.' +
    // anything without a separator has the same key.
    let previousIsStem = false;
    for (const canonicalPath of observations.existence.items) {
      if (
        previousId !== -1 &&
        (canonicalPath === previousKey ||
          (previousIsStem &&
            canonicalPath.startsWith(previousKey) &&
            canonicalPath.charCodeAt(previousKey.length) === DOT &&
            canonicalPath.indexOf(path.sep, previousKey.length) === -1))
      ) {
        continue;
      }
      const nameStart = canonicalPath.lastIndexOf(path.sep) + 1;
      const dotIdx = canonicalPath.indexOf('.', nameStart);
      if (dotIdx === -1) {
        previousKey = canonicalPath;
        previousIsStem = nameStart < canonicalPath.length;
      } else if (dotIdx > nameStart) {
        previousKey = canonicalPath.slice(0, dotIdx);
        previousIsStem = true;
      } else {
        // A leading '.' is part of the name, which keys as is.
        previousKey = canonicalPath;
        previousIsStem = false;
      }
      previousId = this.#idFor(this.#existenceIds, previousKey);
      this.#addEdge(previousId, recordId);
    }
    for (const canonicalPath of observations.content.items) {
      this.#addEdge(this.#idFor(this.#contentIds, canonicalPath), recordId);
    }
    if (observations.haste != null) {
      for (const name of observations.haste) {
        this.#addEdge(this.#idFor(this.#hasteIds, name), recordId);
      }
    }
    this.#recordStart[recordId + 1] = this.#edgeCount;
    return recordId;
  }

  #idFor(ids: Map<string, number>, key: string): number {
    let id = ids.get(key);
    if (id == null) {
      id = this.#keyCount++;
      ids.set(flatCopy(key), id);
      this.#keyHead = growInt32(this.#keyHead, id + 1);
      this.#keyHead[id] = NO_EDGE;
      this.#keyLastRecord = growUint32(this.#keyLastRecord, id + 1);
    }
    return id;
  }

  #addEdge(keyId: number, recordId: ObservationsId): void {
    if (this.#keyLastRecord[keyId] === recordId + 1) {
      return;
    }
    this.#keyLastRecord[keyId] = recordId + 1;
    const edge = this.#edgeCount++;
    if (edge >= this.#edgeKey.length) {
      this.#edgeKey = growUint32(this.#edgeKey, edge + 1);
      this.#edgeNext = growInt32(this.#edgeNext, edge + 1);
      this.#edgeRecord = growUint32(this.#edgeRecord, edge + 1);
    }
    this.#edgeKey[edge] = keyId;
    this.#edgeNext[edge] = this.#keyHead[keyId];
    this.#edgeRecord[edge] = recordId;
    this.#keyHead[keyId] = edge;
  }

  /**
   * The records a change may invalidate. `addedOrRemoved` are added or
   * removed files and directories, including any whose type changed (e.g. a
   * file replaced by a symlink); `modified` are modified files and modified
   * directories (the parent of every added or removed entry).
   */
  getInvalidated(
    addedOrRemoved: Iterable<string>,
    modified: Iterable<string>,
    hasteNames: Iterable<string>,
  ): Set<ObservationsId> {
    const invalidated = new Set<ObservationsId>();
    const addObservers = (id: ?number) => {
      if (id != null) {
        for (let e = this.#keyHead[id]; e !== NO_EDGE; e = this.#edgeNext[e]) {
          invalidated.add(this.#edgeRecord[e]);
        }
      }
    };
    for (const canonicalPath of addedOrRemoved) {
      addObservers(this.#existenceIds.get(missingNameKey(canonicalPath)));
      addObservers(this.#contentIds.get(canonicalPath));
    }
    for (const canonicalPath of modified) {
      addObservers(this.#contentIds.get(canonicalPath));
    }
    for (const name of hasteNames) {
      addObservers(this.#hasteIds.get(name));
    }
    return invalidated;
  }

  /** For tests and diagnostics: a record's reduced keys, by bucket. */
  getKeys(recordId: ObservationsId): {
    existence: Array<string>,
    content: Array<string>,
    haste: Array<string>,
  } {
    const record = new Set<number>();
    for (
      let e = this.#recordStart[recordId];
      e < this.#recordStart[recordId + 1];
      e++
    ) {
      record.add(this.#edgeKey[e]);
    }
    const pick = (ids: Map<string, number>) =>
      [...ids].filter(([, id]) => record.has(id)).map(([key]) => key);
    return {
      existence: pick(this.#existenceIds),
      content: pick(this.#contentIds),
      haste: pick(this.#hasteIds),
    };
  }
}
