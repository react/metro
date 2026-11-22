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

import type {Observations} from 'metro-file-map';
import type {PackageJson} from 'metro-resolver/private/types';

import {FileDataPlugin} from 'metro-file-map';

/**
 * Holds the parsed contents of each `package.json` the resolver reads, as file
 * map plugin data. A manifest is read from disk the first time it is asked
 * for, and not again until it changes. Its contents are saved with the file
 * map, so a later process with a warm cache does not read it at all.
 *
 * The object returned for a manifest is the stored one, shared by every reader
 * and saved with the file map, and stable while the file is unchanged.
 * `PackageJson` is read-only, so readers must not mutate it.
 */
export default class PackageJsonPlugin extends FileDataPlugin<> {
  constructor() {
    super({
      name: 'package-json',
      cacheKey: 'package-json-parsed-1',
      worker: {
        modulePath: require.resolve('./packageJsonWorker.js'),
        setupArgs: {},
      },
      // Not consulted for a lazy plugin
      filter: () => false,
      lazy: true,
    });
  }

  /**
   * The parsed `package.json` at the given absolute path, which must be a
   * regular file in the file map. Throws the `SyntaxError` from parsing it if
   * it is not valid JSON.
   *
   * If `observations` is given, records what the result depends upon, on
   * every call.
   */
  readPackageJson(
    absolutePackageJsonPath: string,
    observations?: ?Observations,
  ): PackageJson {
    const result = this.getOrComputeFileData(
      absolutePackageJsonPath,
      observations,
    );
    if (!result.exists || result.type !== 'f') {
      throw new Error(
        `${absolutePackageJsonPath} is not a regular file in the file map`,
      );
    }
    const data = result.data;
    if (data instanceof SyntaxError) {
      throw new SyntaxError(data.message);
    }
    // The worker stores parsed JSON, which Flow sees only as V8Serializable.
    return data as $FlowFixMe;
  }
}
