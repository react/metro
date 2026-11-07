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

const Metro = require('../../..');
const execBundle = require('../execBundle');

jest.setTimeout(30 * 1000);

test('require-context/matching.js', async () => {
  await expect(
    execTest('require-context/matching.js'),
  ).resolves.toMatchSnapshot();
});

test('require-context/mode-lazy.js', async () => {
  await expect(
    execTest('require-context/mode-lazy.js'),
  ).resolves.toMatchSnapshot();
});

test('require-context/mode-lazy-once.js', async () => {
  await expect(
    execTest('require-context/mode-lazy-once.js'),
  ).resolves.toMatchSnapshot();
});

test('require-context/mode-eager.js', async () => {
  await expect(
    execTest('require-context/mode-eager.js'),
  ).resolves.toMatchSnapshot();
});

test('require-context/mode-sync.js', async () => {
  await expect(
    execTest('require-context/mode-sync.js'),
  ).resolves.toMatchSnapshot();
});

test('require-context/conflict.js', async () => {
  await expect(
    execTest('require-context/conflict.js'),
  ).resolves.toMatchSnapshot();
});

test('require-context/empty.js', async () => {
  await expect(execTest('require-context/empty.js')).resolves.toMatchSnapshot();
});

test('require-context/empty.js - release', async () => {
  await expect(
    execTest('require-context/empty.js', {dev: false}),
  ).resolves.toMatchSnapshot();
});

async function execTest(entry, {dev = true}: Readonly<{dev: boolean}> = {}) {
  const config = await Metro.loadConfig(
    {
      config: require.resolve('../metro.config.js'),
    },
    {
      transformer: {
        unstable_allowRequireContext: true,
      },
    },
  );

  const result = await Metro.runBuild(config, {
    entry,
    dev,
    minify: !dev,
  });

  return execBundle(result.code);
}
