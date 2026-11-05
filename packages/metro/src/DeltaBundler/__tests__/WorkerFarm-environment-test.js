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

jest.setTimeout(60 * 1000);
jest.useRealTimers();

async function getWorkerEnv(unstable_workerThreads) {
  const config = await getDefaultConfig(__dirname);
  const farm = new WorkerFarm(
    {
      ...config,
      maxWorkers: 2,
      projectRoot: __dirname,
      transformer: {...config.transformer, unstable_workerThreads},
    },
    {
      transformerPath: require.resolve('./envSnapshotTransformer'),
      transformerConfig: {},
    },
  );
  try {
    const {result} = await farm.transform('file.js', {}, Buffer.from(''));
    return JSON.parse(result.output[0].data.code);
  } finally {
    await farm.kill();
  }
}

test('a transformer observes the same environment in worker threads and child processes', async () => {
  const [inThread, inProcess] = await Promise.all([
    getWorkerEnv(true),
    getWorkerEnv(false),
  ]);

  expect(inThread.envAtLoad.JEST_WORKER_ID).toBeUndefined();
  expect(inThread.envAtCall.JEST_WORKER_ID).toBeUndefined();
  expect(inThread).toEqual(inProcess);
});
