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

import type {ObservedChanges} from '../ObservationIndex';
import type {ResolutionObservations} from '../types';

import ObservationIndex from '../ObservationIndex';

function record({
  existence = [],
  content = [],
  haste,
}: {
  existence?: ReadonlyArray<string>,
  content?: ReadonlyArray<string>,
  haste?: ReadonlyArray<string>,
}): ResolutionObservations {
  return {
    existence: new Set(existence),
    content: new Set(content),
    haste: haste == null ? null : new Set(haste),
  };
}

function changes({
  addedOrRemoved = [],
  modified = [],
  hasteNames = [],
}: {
  addedOrRemoved?: ReadonlyArray<string>,
  modified?: ReadonlyArray<string>,
  hasteNames?: ReadonlyArray<string> | 'all',
}): ObservedChanges {
  return {
    addedOrRemoved: new Set(addedOrRemoved),
    modified: new Set(modified),
    hasteNames: hasteNames === 'all' ? 'all' : new Set(hasteNames),
  };
}

describe('ObservationIndex', () => {
  let index: ObservationIndex;

  beforeEach(() => {
    index = new ObservationIndex();
    index.set(
      'existence',
      new Map([['dep', record({existence: ['a.ios.js', 'node_modules']})]]),
    );
    index.set(
      'content',
      new Map([['dep', record({content: ['link', 'dir']})]]),
    );
    index.set('haste', new Map([['dep', record({haste: ['Foo']})]]));
  });

  test.each([
    // Existence is invalidated by additions and removals only
    [{addedOrRemoved: ['a.ios.js']}, ['existence']],
    [{addedOrRemoved: ['node_modules']}, ['existence']],
    [{modified: ['a.ios.js']}, []],
    // Content by modification, as well as by addition or removal
    [{modified: ['link']}, ['content']],
    [{modified: ['dir']}, ['content']],
    [{addedOrRemoved: ['link']}, ['content']],
    // Haste names by name, or all names
    [{hasteNames: ['Foo']}, ['haste']],
    [{hasteNames: ['Bar']}, []],
    [{hasteNames: 'all'}, ['haste']],
    // Unrelated paths
    [{addedOrRemoved: ['a.js'], modified: ['a.js']}, []],
  ])('changes %j invalidate %j', (given, expected) => {
    expect(index.getInvalidated(changes(given))).toEqual(new Set(expected));
  });

  test('a key with several records is invalidated by any of them', () => {
    index.set(
      'several',
      new Map([
        ['first', record({existence: ['first.js']})],
        ['second', record({existence: ['second.js']})],
      ]),
    );
    expect(
      index.getInvalidated(changes({addedOrRemoved: ['second.js']})),
    ).toEqual(new Set(['several']));
  });

  test('replaces, and forgets, what a key observed', () => {
    index.set('existence', new Map([['dep', record({existence: ['b.js']})]]));
    expect(
      index.getInvalidated(changes({addedOrRemoved: ['a.ios.js']})),
    ).toEqual(new Set());
    expect(index.getInvalidated(changes({addedOrRemoved: ['b.js']}))).toEqual(
      new Set(['existence']),
    );

    index.delete('existence');
    expect(index.getInvalidated(changes({addedOrRemoved: ['b.js']}))).toEqual(
      new Set(),
    );

    index.set('content', null);
    expect(index.get('content')).toBeUndefined();
  });
});
