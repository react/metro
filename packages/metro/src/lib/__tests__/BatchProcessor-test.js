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

jest.useRealTimers();

import BatchProcessor from '../BatchProcessor';

describe('BatchProcessor', () => {
  const options = {
    maximumDelayMs: 500,
    maximumItems: 3,
    concurrency: 2,
  };

  test('aggregate items concurrently', async () => {
    const input = [...Array(9).keys()].slice(1);
    const transform = (e: number) => e * 10;
    const batches = [];
    let concurrency = 0;
    let maxConcurrency = 0;
    const bp = new BatchProcessor<number, number>(
      options,
      (items: Array<number>) =>
        // $FlowFixMe[incompatible-type] Found when updating Promise type definition
        new Promise((resolve: (result?: Array<number>) => void) => {
          ++concurrency;
          expect(concurrency).toBeLessThanOrEqual(options.concurrency);
          maxConcurrency = Math.max(maxConcurrency, concurrency);
          batches.push(items);
          setTimeout(() => {
            resolve(items.map(transform));
            --concurrency;
          }, 0);
        }),
    );
    const results = [];
    await Promise.all(
      input.map((e: number) =>
        bp.queue(e).then(
          (res: number) => results.push(res),
          error =>
            process.nextTick(() => {
              throw error;
            }),
        ),
      ),
    );
    expect(batches).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8],
    ]);
    expect(maxConcurrency).toEqual(options.concurrency);
    expect(results).toEqual(input.map(transform));
  });

  test('report errors', async () => {
    const error = new Error('oh noes');
    const bp = new BatchProcessor(
      options,
      (items: Array<string>) =>
        new Promise<Array<string>>((_, reject) => {
          setTimeout(reject.bind(null, error), 0);
        }),
    );
    let receivedError;
    await bp.queue('foo').catch(err => {
      receivedError = err;
    });
    expect(receivedError).toBe(error);
  });
});
