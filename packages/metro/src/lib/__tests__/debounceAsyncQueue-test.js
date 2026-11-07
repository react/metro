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

import debounceAsyncQueue from '../debounceAsyncQueue';

describe('debounceAsyncQueue', () => {
  test('debounces calls', async () => {
    const fn = jest.fn();
    const debounced = debounceAsyncQueue<void>(fn, 50);
    // $FlowFixMe[unused-promise]
    debounced();
    // $FlowFixMe[unused-promise]
    debounced();
    // $FlowFixMe[unused-promise]
    debounced();
    expect(fn).toHaveBeenCalledTimes(0);
    jest.runAllTimers();
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('returns a Promise to the eventual return value', async () => {
    const fn = jest.fn(() => Promise.resolve('foo'));
    const debounced = debounceAsyncQueue(fn, 50);
    const pro1 = debounced();
    const pro2 = debounced();
    const pro3 = debounced();
    jest.runAllTimers();
    await Promise.resolve();
    expect(await pro1).toBe('foo');
    expect(await pro2).toBe('foo');
    expect(await pro3).toBe('foo');
  });

  test('queues calls that happen while the previous call is still executing', async () => {
    let finishExecuting:
      ((result?: Promise<string>) => void) | ((result: string) => void) = (
      result: string,
    ) => {};
    const fn = jest.fn(
      () =>
        new Promise((resolve: (result?: Promise<string>) => void) => {
          finishExecuting = resolve;
        }),
    );
    const debounced = debounceAsyncQueue(fn, 50);
    const pro1 = debounced();
    jest.runAllTimers();
    await Promise.resolve();
    const pro2 = debounced();
    const pro3 = debounced();
    // $FlowFixMe[incompatible-type]
    finishExecuting('foo');
    jest.runAllTimers();
    await Promise.resolve();
    // $FlowFixMe[incompatible-type]
    finishExecuting('bar');
    expect(await pro1).toBe('foo');
    expect(await pro2).toBe('bar');
    expect(await pro3).toBe('bar');
  });
});
