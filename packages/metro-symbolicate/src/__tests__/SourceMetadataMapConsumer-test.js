/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

import SourceMetadataMapConsumer from '../SourceMetadataMapConsumer';

describe('SourceMetadataMapConsumer', () => {
  test('ignores metadata beyond the range of the sources array', () => {
    const consumer = new SourceMetadataMapConsumer({
      version: 3,
      mappings: '',
      sources: ['foo'],
      names: [],
      x_facebook_sources: [
        null,
        [
          {
            mappings: '',
            names: [],
          },
        ],
      ],
    });
    expect(consumer.toArray(['foo'])).toEqual([null]);
  });

  test('ignores metadata for a null source', () => {
    const consumer = new SourceMetadataMapConsumer({
      version: 3,
      mappings: '',
      sources: ['foo', null],
      names: [],
      x_facebook_sources: [
        [
          {
            mappings: '',
            names: [],
          },
        ],
      ],
    });
    expect(consumer.toArray(['foo', null])).toEqual([
      [
        {
          mappings: '',
          names: [],
        },
      ],
      null,
    ]);
  });

  test('accepts metadata blob with null function map', () => {
    const consumer = new SourceMetadataMapConsumer({
      version: 3,
      mappings: 'AAAA',
      sources: ['foo'],
      names: [],
      x_facebook_sources: [[null]],
    });
    expect(consumer.functionNameFor({line: 1, column: 0, source: 'foo'})).toBe(
      null,
    );
  });

  test('accepts null metadata blob', () => {
    const consumer = new SourceMetadataMapConsumer({
      version: 3,
      mappings: 'AAAA',
      sources: ['foo'],
      names: [],
      x_facebook_sources: [null],
    });
    expect(consumer.functionNameFor({line: 1, column: 0, source: 'foo'})).toBe(
      null,
    );
  });
});
