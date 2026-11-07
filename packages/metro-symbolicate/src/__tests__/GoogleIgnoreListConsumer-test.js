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

import GoogleIgnoreListConsumer from '../GoogleIgnoreListConsumer';

describe('GoogleIgnoreListConsumer', () => {
  test('discards indices beyond the range of the sources array', () => {
    const consumer = new GoogleIgnoreListConsumer({
      version: 3,
      mappings: '',
      sources: ['foo'],
      names: [],
      x_google_ignoreList: [9000],
    });
    expect(consumer.toArray(['foo'])).toEqual([]);
  });

  test('discards the index of a null source', () => {
    const consumer = new GoogleIgnoreListConsumer(
      // $FlowFixMe[incompatible-type] intentionally malformed source map
      {
        version: 3,
        mappings: '',
        sources: ['foo', null],
        names: [],
        x_google_ignoreList: [0, 1],
      },
    );
    expect(consumer.toArray(['foo', null])).toEqual([0]);
  });

  test('isIgnored works with a basic map', () => {
    const consumer = new GoogleIgnoreListConsumer({
      version: 3,
      mappings: '',
      sources: ['foo', 'bar'],
      names: [],
      x_google_ignoreList: [1],
    });
    expect(consumer.isIgnored({source: 'foo'})).toBe(false);
    expect(consumer.isIgnored({source: 'bar'})).toBe(true);
  });
});
