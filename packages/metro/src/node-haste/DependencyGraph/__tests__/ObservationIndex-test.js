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

import type {ResolutionObservations} from '../../../DeltaBundler/types';
import typeof * as ObservationIndexModule from '../ObservationIndex';

let mockPathModule;
jest.mock('node:path', () => mockPathModule);

describe.each([['posix'], ['win32']])('ObservationIndex on %s', platform => {
  let ObservationIndex: ObservationIndexModule['ObservationIndex'];
  let createObservations: ObservationIndexModule['createObservations'];

  // Canonical paths: root-relative, with system separators.
  const c = (posixPath: string) =>
    platform === 'win32' ? posixPath.replaceAll('/', '\\') : posixPath;

  beforeEach(() => {
    jest.resetModules();
    mockPathModule = jest.requireActual<{}>('path')[platform];
    ({ObservationIndex, createObservations} = require('../ObservationIndex'));
  });

  function record({
    existence = [],
    content = [],
    haste,
  }: {
    existence?: ReadonlyArray<string>,
    content?: ReadonlyArray<string>,
    haste?: ReadonlyArray<string>,
  }): ResolutionObservations {
    const observations = createObservations();
    existence.forEach(p => observations.existence.add(c(p)));
    content.forEach(p => observations.content.add(c(p)));
    if (haste != null) {
      observations.haste = new Set(haste);
    }
    return observations;
  }

  test.each([
    // Every candidate for a module shares one key
    [
      ['d/Button', 'd/Button.ios.tsx', 'd/Button.native.tsx', 'd/Button.tsx'],
      ['d/Button'],
    ],
    // Duplicates and interleaved modules
    [
      ['d/a.js', 'd/package.json', 'd/a.ios.js', 'd/package.json', 'd/a'],
      ['d/a', 'd/package'],
    ],
    // A leading '.' is part of the name
    [
      ['d/.env', 'd/.env.local'],
      ['d/.env', 'd/.env.local'],
    ],
    // A '.' followed by a separator is in a directory's name
    [
      ['d/a', 'd/a.b/c.js'],
      ['d/a', 'd/a.b/c'],
    ],
    // A root-level name
    [
      ['package.json', 'index.js'],
      ['package', 'index'],
    ],
  ])('keys existence %j as %j', (existence, expected) => {
    const index = new ObservationIndex();
    const id = index.ingest(record({existence}));
    expect(new Set(index.getKeys(id).existence)).toEqual(
      new Set(expected.map(c)),
    );
  });

  test('keeps content and Haste names as recorded, deduplicated', () => {
    const index = new ObservationIndex();
    const id = index.ingest(
      record({
        content: ['link', 'd/link.js', 'link'],
        haste: ['Foo', 'Bar'],
      }),
    );
    expect(index.getKeys(id)).toEqual({
      existence: [],
      content: [c('link'), c('d/link.js')],
      haste: ['Foo', 'Bar'],
    });
  });

  test('finds every record that observed a changed path', () => {
    const index = new ObservationIndex();
    const button = index.ingest(
      record({existence: ['d/Button', 'd/Button.ios.tsx', 'd/Button.tsx']}),
    );
    const other = index.ingest(
      record({existence: ['d/Other.tsx', 'd/package.json']}),
    );
    const linked = index.ingest(
      record({content: ['d/link'], haste: ['Thing']}),
    );

    // A candidate appearing, or the found file being removed
    expect(index.getInvalidated([c('d/Button.native.tsx')], [], [])).toEqual(
      new Set([button]),
    );
    expect(index.getInvalidated([c('d/Button.tsx')], [], [])).toEqual(
      new Set([button]),
    );
    // Another name with the same stem matches too, which is safe
    expect(index.getInvalidated([c('d/Button.test.tsx')], [], [])).toEqual(
      new Set([button]),
    );
    // An unrelated name
    expect(index.getInvalidated([c('d/New.tsx')], [], [])).toEqual(new Set());
    // Content, by modification or by addition or removal
    expect(index.getInvalidated([], [c('d/link')], [])).toEqual(
      new Set([linked]),
    );
    expect(index.getInvalidated([c('d/link')], [], [])).toEqual(
      new Set([linked]),
    );
    // Haste names
    expect(index.getInvalidated([], [], ['Thing'])).toEqual(new Set([linked]));
    // Several at once
    expect(
      index.getInvalidated([c('d/package.json'), c('d/Button')], [], []),
    ).toEqual(new Set([button, other]));
  });

  test('shares one key between records', () => {
    const index = new ObservationIndex();
    const first = index.ingest(record({existence: ['d/a.js']}));
    const second = index.ingest(record({existence: ['d/a.ios.js']}));
    expect(index.getInvalidated([c('d/a.native.js')], [], [])).toEqual(
      new Set([first, second]),
    );
  });

  test('grows past its initial capacity', () => {
    const index = new ObservationIndex();
    const ids = [];
    for (let i = 0; i < 5000; i++) {
      ids.push(index.ingest(record({existence: [`d${i}/a.js`, `d${i}/b.js`]})));
    }
    expect(index.getKeys(ids[4999]).existence).toEqual([
      c('d4999/a'),
      c('d4999/b'),
    ]);
    expect(index.getInvalidated([c('d2500/b.ts')], [], [])).toEqual(
      new Set([ids[2500]]),
    );
  });
});
