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

test('resolveWeak() returns a different ID for each resolved module', async () => {
  await expect(execTest('require-resolveWeak/multiple.js')).resolves.toEqual({
    counterModuleId1: 1,
    counterModuleId2: 1,
    throwingModuleId: 2,
  });
});

describe('resolveWeak() without calling require()', () => {
  test('runtime semantics', async () => {
    await expect(
      execTest('require-resolveWeak/never-required.js'),
    ).resolves.toEqual({
      moduleId: 1,
    });
  });

  test('the weak dependency is omitted', async () => {
    const {code} = await buildTest('require-resolveWeak/never-required.js');
    expect(code).not.toContain('This module cannot be evaluated.');
  });
});

test('calling both require() and resolveWeak() with the same module', async () => {
  await expect(
    execTest('require-resolveWeak/require-and-resolveWeak.js'),
  ).resolves.toEqual({
    moduleId: 1,
    timesIncremented: 2,
  });
});

test('calling both import() and resolveWeak() with the same module', async () => {
  await expect(
    execTest('require-resolveWeak/import-and-resolveWeak.js'),
  ).resolves.toEqual({
    moduleId: 1,
    timesIncremented: 2,
  });
});

async function buildTest(entry, {dev = true}: Readonly<{dev: boolean}> = {}) {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });

  const result = await Metro.runBuild(config, {
    entry,
    dev,
    minify: !dev,
  });

  return result;
}

async function execTest(entry, {dev = true}: Readonly<{dev: boolean}> = {}) {
  const result = await buildTest(entry, {dev});
  return execBundle(result.code);
}
