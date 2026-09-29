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

import CountingSet from '../CountingSet';

describe('CountingSet', () => {
  test('basic add/delete', () => {
    const set = new CountingSet<string>();

    set.add('a');
    expect(set.has('a')).toBe(true);
    expect(set.count('a')).toBe(1);
    expect(set.size).toBe(1);

    set.delete('a');
    expect(set.has('a')).toBe(false);
    expect(set.count('a')).toBe(0);
    expect(set.size).toBe(0);
  });

  test('multiple add/delete', () => {
    const set = new CountingSet<string>();

    set.add('a');
    set.add('a');
    expect(set.has('a')).toBe(true);
    expect(set.count('a')).toBe(2);
    expect(set.size).toBe(1);

    set.delete('a');
    expect(set.has('a')).toBe(true);
    expect(set.count('a')).toBe(1);
    expect(set.size).toBe(1);

    set.delete('a');
    expect(set.has('a')).toBe(false);
    expect(set.count('a')).toBe(0);
    expect(set.size).toBe(0);
  });

  test('more deletes than adds', () => {
    const set = new CountingSet<string>();

    set.add('a');
    set.delete('a');
    set.delete('a');
    expect(set.has('a')).toBe(false);
    expect(set.count('a')).toBe(0);
    expect(set.size).toBe(0);
  });

  test('delete nonexistent value', () => {
    const set = new CountingSet<string>();

    set.delete('a');
    expect(set.has('a')).toBe(false);
    expect(set.count('a')).toBe(0);
    expect(set.size).toBe(0);
  });

  test('construct from array', () => {
    const set = new CountingSet(['a', 'b', 'c', 'a']);
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(true);
    expect(set.has('c')).toBe(true);
    expect(set.count('a')).toBe(2);
    expect(set.count('b')).toBe(1);
    expect(set.count('c')).toBe(1);
    expect(set.size).toBe(3);
  });

  test('construct from Set', () => {
    const set = new CountingSet(new Set(['a', 'b', 'c']));
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(true);
    expect(set.has('c')).toBe(true);
    expect(set.count('a')).toBe(1);
    expect(set.count('b')).toBe(1);
    expect(set.count('c')).toBe(1);
    expect(set.size).toBe(3);
  });

  test('construct from CountingSet', () => {
    const originalSet = new CountingSet(['a', 'a', 'b', 'c']);
    const set = new CountingSet(originalSet);
    originalSet.clear();

    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(true);
    expect(set.has('c')).toBe(true);
    expect(set.count('a')).toBe(2);
    expect(set.count('b')).toBe(1);
    expect(set.count('c')).toBe(1);
    expect(set.size).toBe(3);
  });

  test('clear', () => {
    const set = new CountingSet(['a', 'a', 'b', 'c']);

    set.clear();
    expect(set.size).toBe(0);
    expect(set.has('a')).toBe(false);
    expect(set.count('a')).toBe(0);
    expect(set.has('b')).toBe(false);
    expect(set.count('b')).toBe(0);
    expect(set.has('c')).toBe(false);
    expect(set.count('c')).toBe(0);
  });

  test('forEach', () => {
    const set = new CountingSet(['a', 'a', 'b', 'c']);
    // TODO: Migrate to callback.mock.contexts when we upgrade to Jest 28
    const contexts = [];
    /* $FlowFixMe[missing-this-annot] The 'this' type annotation(s) required by
     * Flow's LTI update could not be added via codemod */
    const callback = jest.fn(function captureContext(
      _value: string,
      _key: string,
      _set: CountingSet<string>,
    ) {
      contexts.push(this);
    });

    set.forEach(callback);
    expect(callback.mock.calls).toEqual([
      ['a', 'a', set],
      ['b', 'b', set],
      ['c', 'c', set],
    ]);
    expect(contexts).toEqual([undefined, undefined, undefined]);
  });

  test('forEach with context', () => {
    const set = new CountingSet(['a', 'a', 'b', 'c']);
    // TODO: Migrate to callback.mock.contexts when we upgrade to Jest 28
    const contexts = [];
    /* $FlowFixMe[missing-this-annot] The 'this' type annotation(s) required by
     * Flow's LTI update could not be added via codemod */
    const callback = jest.fn(function captureContext(
      _value: string,
      _key: string,
      _set: CountingSet<string>,
    ) {
      contexts.push(this);
    });

    const context = {};
    set.forEach(callback, context);
    expect(callback.mock.calls).toEqual([
      ['a', 'a', set],
      ['b', 'b', set],
      ['c', 'c', set],
    ]);
    expect(contexts).toEqual([context, context, context]);
  });

  test('spread', () => {
    const set = new CountingSet<string>();

    set.add('a');
    set.add('a');
    set.add('b');
    set.add('c');

    expect([...set]).toEqual(['a', 'b', 'c']);
  });

  test('keys()', () => {
    const set = new CountingSet<string>();

    set.add('a');
    set.add('a');
    set.add('b');
    set.add('c');

    expect([...set.keys()]).toEqual(['a', 'b', 'c']);
  });

  test('values()', () => {
    const set = new CountingSet<string>();

    set.add('a');
    set.add('a');
    set.add('b');
    set.add('c');

    expect([...set.values()]).toEqual(['a', 'b', 'c']);
  });

  test('entries()', () => {
    const set = new CountingSet<string>();

    set.add('a');
    set.add('a');
    set.add('b');
    set.add('c');

    expect([...set.entries()]).toEqual([
      ['a', 'a'],
      ['b', 'b'],
      ['c', 'c'],
    ]);
  });
});
