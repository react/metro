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

import type {BabelDecodedMap, BasicSourceMap} from 'metro-source-map';
import type {MinifierOptions, MinifierResult} from 'metro-transform-worker';

import terser from 'terser';

export default async function minifier(
  options: MinifierOptions,
): Promise<MinifierResult> {
  const result = await minify(options);
  const {getMap} = result;

  if (!options.map || getMap == null) {
    return {code: result.code};
  }

  let map: ?BasicSourceMap;

  return {
    code: result.code,
    // Terser encodes its map only when `result.map` is read.
    // flowlint-next-line unsafe-getters-setters:off
    get map(): BasicSourceMap {
      if (map == null) {
        map = {...JSON.parse(getMap()), sources: [options.filename]};
      }
      return map;
    },
    decodedMap: result.decodedMap,
  };
}

async function minify({code, map, reserved, config}: MinifierOptions): Promise<{
  code: string,
  getMap: ?() => string,
  decodedMap: ?BabelDecodedMap,
}> {
  const options = {
    ...config,
    output: {
      // Mitigate https://github.com/terser/terser/issues/1341 - Terser may
      // set its internal data on this object, so give it a shallow copy.
      ...(config.output ?? {}),
    },
    mangle:
      config.mangle === false
        ? false
        : {
            ...config.mangle,
            reserved,
          },
    sourceMap: map
      ? config.sourceMap === false
        ? false
        : {
            ...config.sourceMap,
            content: map,
          }
      : false,
  };

  /* $FlowFixMe[incompatible-type](>=0.111.0 site=react_native_fb) This comment suppresses an
   * error found when Flow v0.111 was deployed. To see the error, delete this
   * comment and run Flow. */
  const result = await terser.minify(code, options);

  return {
    code: result.code,
    getMap: options.sourceMap ? () => result.map : null,
    decodedMap: result.decoded_map,
  };
}
