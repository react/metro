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

const WorkerFarm = require('../WorkerFarm').default;
const {getDefaultConfig} = require('metro-config');
const {Logger} = require('metro-core');

jest.setTimeout(60 * 1000);
jest.useRealTimers();

const endEntries = [];
Logger.on('log', entry => {
  if (
    entry.action_name === 'Transforming file' &&
    entry.action_phase === 'end'
  ) {
    endEntries.push(entry);
  }
});

async function transformOneFile({maxWorkers, unstable_workerThreads}) {
  const config = await getDefaultConfig(__dirname);
  const farm = new WorkerFarm(
    {
      ...config,
      maxWorkers,
      projectRoot: __dirname,
      transformer: {...config.transformer, unstable_workerThreads},
    },
    {
      transformerPath: require.resolve('./cpuBusyTransformer'),
      transformerConfig: {},
    },
  );
  try {
    endEntries.length = 0;
    await farm.transform('file.js', {}, Buffer.from(''));
    return endEntries[0];
  } finally {
    await farm.kill();
  }
}

const threadCpuUsageSupported =
  typeof Reflect.get(process, 'threadCpuUsage') === 'function';

test('a child process worker logs the CPU time of a transform', async () => {
  const entry = await transformOneFile({
    maxWorkers: 2,
    unstable_workerThreads: false,
  });

  // The transformer keeps the CPU busy for 200 ms.
  expect(entry.cpu_time_us).toBeGreaterThan(100_000);
  expect(entry.cpu_time_us).toBeLessThanOrEqual(
    (entry.duration_ms + 50) * 1000,
  );
});

(threadCpuUsageSupported ? test : test.skip)(
  'a worker thread logs the CPU time of its own thread',
  async () => {
    const entry = await transformOneFile({
      maxWorkers: 2,
      unstable_workerThreads: true,
    });

    expect(entry.cpu_time_us).toBeGreaterThan(100_000);
    expect(entry.cpu_time_us).toBeLessThanOrEqual(
      (entry.duration_ms + 50) * 1000,
    );
  },
);

test('a transform in the server process logs no CPU time', async () => {
  // With `maxWorkers` of 1, transforms run in the server process alongside
  // each other, so process CPU time would include all of them.
  const entry = await transformOneFile({
    maxWorkers: 1,
    unstable_workerThreads: false,
  });

  expect(entry.duration_ms).toBeGreaterThan(100);
  expect(entry).not.toHaveProperty('cpu_time_us');
});
