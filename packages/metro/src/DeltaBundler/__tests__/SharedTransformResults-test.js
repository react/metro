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

const SharedTransformResults = require('../SharedTransformResults').default;

const moduleA = Buffer.from('aa', 'hex');
const moduleB = Buffer.from('bb', 'hex');
const keyA1 = Buffer.from('aa01', 'hex');
const keyA2 = Buffer.from('aa02', 'hex');
const keyB1 = Buffer.from('bb01', 'hex');

function makeResult(code) {
  return {
    dependencies: [{name: './dep', data: {key: 'dep', locs: []}}],
    output: [{type: 'js/module', data: {code, map: {mappings: '', names: []}}}],
  };
}

function computing(key, code) {
  return jest.fn(async () => ({key, result: makeResult(code)}));
}

describe('SharedTransformResults', () => {
  test('returns the same output and dependencies for the same key', async () => {
    const shared = new SharedTransformResults();
    const compute = computing(keyA1, 'a');

    const first = await shared.getOrCompute(
      {key: keyA1, moduleKey: moduleA, path: '/a'},
      compute,
    );
    const second = await shared.getOrCompute(
      {key: Buffer.from(keyA1), moduleKey: Buffer.from(moduleA), path: '/a'},
      compute,
    );

    expect(compute).toHaveBeenCalledTimes(1);
    expect(second.result.output).toBe(first.result.output);
    expect(second.result.dependencies).toBe(first.result.dependencies);
    expect(second.key).toEqual(keyA1);
  });

  test('computes once for concurrent requests for the same key', async () => {
    const shared = new SharedTransformResults();
    let resolve;
    const compute = jest.fn(
      () =>
        new Promise(r => {
          resolve = r;
        }),
    );

    const first = shared.getOrCompute(
      {key: keyA1, moduleKey: moduleA, path: '/a'},
      compute,
    );
    const second = shared.getOrCompute(
      {key: keyA1, moduleKey: moduleA, path: '/a'},
      compute,
    );
    resolve({key: keyA1, result: makeResult('a')});

    expect(compute).toHaveBeenCalledTimes(1);
    expect((await second).result.output).toBe((await first).result.output);
  });

  test('does not share between modules', async () => {
    const shared = new SharedTransformResults();

    const a = await shared.getOrCompute(
      {key: keyA1, moduleKey: moduleA, path: '/a'},
      computing(keyA1, 'a'),
    );
    const b = await shared.getOrCompute(
      {key: keyB1, moduleKey: moduleB, path: '/b'},
      computing(keyB1, 'b'),
    );

    expect(b.result.output).not.toBe(a.result.output);
    expect(b.result.output[0].data.code).toBe('b');
  });

  test("replaces a module's entry when its key changes", async () => {
    const shared = new SharedTransformResults();
    await shared.getOrCompute(
      {key: keyA1, moduleKey: moduleA, path: '/a'},
      computing(keyA1, '1'),
    );
    await shared.getOrCompute(
      {key: keyA2, moduleKey: moduleA, path: '/a'},
      computing(keyA2, '2'),
    );
    expect(shared.countEntries()).toBe(1);

    const computeA2 = jest.fn();
    await shared.getOrCompute(
      {key: keyA2, moduleKey: moduleA, path: '/a'},
      computeA2,
    );
    expect(computeA2).not.toHaveBeenCalled();

    const computeA1 = computing(keyA1, '1');
    await shared.getOrCompute(
      {key: keyA1, moduleKey: moduleA, path: '/a'},
      computeA1,
    );
    expect(computeA1).toHaveBeenCalledTimes(1);
  });

  test('stores a result under the key it was computed for', async () => {
    // The file changed between hashing and transforming it, so the result
    // belongs to keyA2 although keyA1 was requested.
    const shared = new SharedTransformResults();
    const first = await shared.getOrCompute(
      {key: keyA1, moduleKey: moduleA, path: '/a'},
      computing(keyA2, '2'),
    );
    expect(first.key).toBe(keyA2);

    const computeA2 = jest.fn();
    const second = await shared.getOrCompute(
      {key: keyA2, moduleKey: moduleA, path: '/a'},
      computeA2,
    );
    expect(computeA2).not.toHaveBeenCalled();
    expect(second.result.output).toBe(first.result.output);

    const computeA1 = computing(keyA1, '1');
    await shared.getOrCompute(
      {key: keyA1, moduleKey: moduleA, path: '/a'},
      computeA1,
    );
    expect(computeA1).toHaveBeenCalledTimes(1);
  });

  test('rejects every waiter on failure and recomputes on the next request', async () => {
    const shared = new SharedTransformResults();
    let reject;
    const failing = jest.fn(
      () =>
        new Promise((_, r) => {
          reject = r;
        }),
    );

    const first = shared.getOrCompute(
      {key: keyA1, moduleKey: moduleA, path: '/a'},
      failing,
    );
    const second = shared.getOrCompute(
      {key: keyA1, moduleKey: moduleA, path: '/a'},
      failing,
    );
    reject(new Error('transform failed'));
    await expect(first).rejects.toThrow('transform failed');
    await expect(second).rejects.toThrow('transform failed');
    expect(failing).toHaveBeenCalledTimes(1);

    const retry = computing(keyA1, 'a');
    await shared.getOrCompute(
      {key: keyA1, moduleKey: moduleA, path: '/a'},
      retry,
    );
    expect(retry).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['every path', null],
    ['the released paths', ['/a', '/b']],
  ])(
    'release of %s drops entries whose output is not held',
    async (_, paths) => {
      const shared = new SharedTransformResults();
      const a = await shared.getOrCompute(
        {key: keyA1, moduleKey: moduleA, path: '/a'},
        computing(keyA1, 'a'),
      );
      await shared.getOrCompute(
        {key: keyB1, moduleKey: moduleB, path: '/b'},
        computing(keyB1, 'b'),
      );

      shared.release({paths, heldOutputs: new Set([a.result.output])});
      expect(shared.countEntries()).toBe(1);

      const computeA = jest.fn();
      await shared.getOrCompute(
        {key: keyA1, moduleKey: moduleA, path: '/a'},
        computeA,
      );
      expect(computeA).not.toHaveBeenCalled();

      const computeB = computing(keyB1, 'b');
      await shared.getOrCompute(
        {key: keyB1, moduleKey: moduleB, path: '/b'},
        computeB,
      );
      expect(computeB).toHaveBeenCalledTimes(1);
    },
  );

  test('release keeps entries at paths that were not released', async () => {
    const shared = new SharedTransformResults();
    await shared.getOrCompute(
      {key: keyA1, moduleKey: moduleA, path: '/a'},
      computing(keyA1, 'a'),
    );
    await shared.getOrCompute(
      {key: keyB1, moduleKey: moduleB, path: '/b'},
      computing(keyB1, 'b'),
    );

    shared.release({paths: ['/b'], heldOutputs: new Set()});

    expect(shared.countEntries()).toBe(1);
    const computeA = jest.fn();
    await shared.getOrCompute(
      {key: keyA1, moduleKey: moduleA, path: '/a'},
      computeA,
    );
    expect(computeA).not.toHaveBeenCalled();
  });
});
