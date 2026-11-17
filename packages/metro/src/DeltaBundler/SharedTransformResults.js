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

import type {ReleasedModules, TransformResult} from './types';

export type Computed<T> = Readonly<{
  // The key the result belongs to, which differs from the requested key if
  // the file changed between hashing and transforming it.
  key: Buffer,
  result: TransformResult<T>,
}>;

type Entry<T> = Readonly<{
  ...Computed<T>,
  keyString: string,
  path: string,
}>;

/**
 * Shares transform results in memory between callers that request the same
 * transform cache key, i.e. between graphs with equal transform options.
 *
 * Entries use the cache stores' key, so they can only be stale where a store
 * hit would be, and need no invalidation of their own. Each module, i.e. each
 * file and set of transform options, holds only its latest result, so editing
 * a file replaces its entry. `release` drops the entries at released paths
 * whose output no live graph holds, and the next request for a dropped entry
 * reads the cache stores or transforms again. A graph that is still building is
 * not yet live, so a release during its build can drop an entry that it is
 * about to hold. Later graphs then get a second copy of that module, until the
 * module changes or the building graph ends.
 *
 * Callers must treat `output` and `dependencies` as read-only, as their types
 * declare, since every graph holding a result sees a write to it.
 */
export default class SharedTransformResults<T> {
  #inFlight: Map<string, Promise<Computed<T>>> = new Map();
  #settled: Map<string, Entry<T>> = new Map();
  // Module keys by path, so a release only checks the released modules.
  #moduleKeysByPath: Map<string, Set<string>> = new Map();

  /**
   * `moduleKey` identifies the module, i.e. every input to the transform
   * except the file's contents, `key` is the full transform cache key, and
   * `path` is the module's path in graphs.
   */
  async getOrCompute(
    {
      key,
      moduleKey,
      path,
    }: Readonly<{key: Buffer, moduleKey: Buffer, path: string}>,
    compute: () => Promise<Computed<T>>,
  ): Promise<Computed<T>> {
    const keyString = toKeyString(key);
    const moduleKeyString = toKeyString(moduleKey);
    const entry = this.#settled.get(moduleKeyString);
    if (entry != null && entry.keyString === keyString) {
      return {key: entry.key, result: entry.result};
    }

    const pending = this.#inFlight.get(keyString);
    if (pending != null) {
      return pending;
    }

    const promise = compute().then(
      computed => {
        this.#inFlight.delete(keyString);
        const result = {
          dependencies: computed.result.dependencies,
          output: computed.result.output,
        };
        this.#settled.set(moduleKeyString, {
          key: computed.key,
          keyString: toKeyString(computed.key),
          path,
          result,
        });
        let moduleKeys = this.#moduleKeysByPath.get(path);
        if (moduleKeys == null) {
          moduleKeys = new Set();
          this.#moduleKeysByPath.set(path, moduleKeys);
        }
        moduleKeys.add(moduleKeyString);
        return {key: computed.key, result};
      },
      error => {
        this.#inFlight.delete(keyString);
        throw error;
      },
    );
    this.#inFlight.set(keyString, promise);
    return promise;
  }

  /**
   * Drops the entries at `paths`, or every entry if `paths` is null, whose
   * output isn't in `heldOutputs`. Results still in flight are unaffected.
   */
  release({paths, heldOutputs}: ReleasedModules<T>): void {
    const moduleKeyStrings =
      paths == null
        ? Array.from(this.#settled.keys())
        : paths.flatMap(path =>
            Array.from(this.#moduleKeysByPath.get(path) ?? []),
          );
    for (const moduleKeyString of moduleKeyStrings) {
      const entry = this.#settled.get(moduleKeyString);
      if (entry != null && !heldOutputs.has(entry.result.output)) {
        this.#settled.delete(moduleKeyString);
        const moduleKeys = this.#moduleKeysByPath.get(entry.path);
        moduleKeys?.delete(moduleKeyString);
        if (moduleKeys?.size === 0) {
          this.#moduleKeysByPath.delete(entry.path);
        }
      }
    }
  }

  countEntries(): number {
    return this.#settled.size;
  }
}

// 'binary' (latin1) is a lossless one-character-per-byte encoding.
function toKeyString(key: Buffer): string {
  return key.toString('binary');
}
