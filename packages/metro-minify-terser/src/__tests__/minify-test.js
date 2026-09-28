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

'use strict';

import type {BasicSourceMap} from 'metro-source-map';
import type {MinifierOptions} from 'metro-transform-worker';

const minify = require('..');

jest.mock('terser', () => ({
  minify: jest.fn(code => {
    return Promise.resolve({
      code: code.replace(/(^|\W)\s+/g, '$1'),
      map: {},
    });
  }),
}));
const {objectContaining} = expect;

function getFakeMap(): BasicSourceMap {
  return {
    version: 3,
    sources: ['?'],
    mappings: '',
    names: [],
  };
}

const baseOptions: MinifierOptions = {
  code: '',
  map: getFakeMap(),
  filename: '',
  reserved: [],
  config: {},
};

describe('Minification:', () => {
  const filename = '/arbitrary/file.js';
  const code = 'arbitrary(code)';
  let map: BasicSourceMap;
  let terser;

  beforeEach(() => {
    terser = require('terser');
    /* $FlowFixMe[incompatible-type](>=0.99.0 site=react_native_fb) This comment suppresses an
     * error found when Flow v0.99 was deployed. To see the error, delete this
     * comment and run Flow. */
    terser.minify.mockClear();
    /* $FlowFixMe[incompatible-type](>=0.99.0 site=react_native_fb) This comment suppresses an
     * error found when Flow v0.99 was deployed. To see the error, delete this
     * comment and run Flow. */
    terser.minify.mockResolvedValue({code: '', map: '{}'});
    map = getFakeMap();
  });

  test('passes file name, code, and source map to `terser`', async () => {
    await minify({
      ...baseOptions,
      code,
      map,
      filename,
      config: {sourceMap: {includeSources: false}},
    });
    expect(terser.minify).toBeCalledWith(
      code,
      objectContaining({
        sourceMap: {
          content: map,
          includeSources: false,
        },
      }),
    );
  });

  test('returns the code provided by terser', async () => {
    /* $FlowFixMe[incompatible-type](>=0.99.0 site=react_native_fb) This comment suppresses an
     * error found when Flow v0.99 was deployed. To see the error, delete this
     * comment and run Flow. */
    terser.minify.mockResolvedValue({code, map: '{}'});
    const result = await minify(baseOptions);
    expect(result.code).toBe(code);
  });

  test('returns the decoded source map provided by terser', async () => {
    /* $FlowFixMe[incompatible-type] The mocked `minify` result isn't typed as
     * Terser's. */
    terser.minify.mockResolvedValue({
      code: '',
      decoded_map: {...map, names: ['name0'], mappings: [[[0, 0, 0, 0, 0]]]},
    });
    const result = await minify({...baseOptions, filename});
    expect(result).toEqual({
      code: '',
      decodedMap: {names: ['name0'], mappings: [[[0, 0, 0, 0, 0]]]},
    });
  });
});
