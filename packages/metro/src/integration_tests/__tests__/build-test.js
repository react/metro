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

const Metro = require('../../..');
const execBundle = require('../execBundle');
const MetroConfig = require('metro-config');
const path = require('node:path');

jest.setTimeout(30 * 1000);

const INPUT_PATH = path.resolve(__dirname, '../basic_bundle');

test('builds a simple bundle', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });

  const result = await Metro.runBuild(config, {
    entry: 'TestBundle.js',
  });

  expect(execBundle(result.code)).toMatchSnapshot();

  // Assets are not returned by default
  expect(result.assets).toBeUndefined();
});

test('build a simple bundle with polyfills', async () => {
  const baseConfig = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const config = MetroConfig.mergeConfig(baseConfig, {
    serializer: {
      polyfillModuleNames: [path.join(INPUT_PATH, 'polyfill.js')],
    },
  });

  const result = await Metro.runBuild(config, {
    entry: 'TestPolyfill.js',
  });
  expect(execBundle(result.code)).toBe('POLYFILL_IS_INJECTED');
});

test('builds a bundle with BigInt and exponentiation syntax', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });

  const result = await Metro.runBuild(config, {
    entry: 'TestBigInt.js',
  });

  const BI = BigInt;
  expect(execBundle(result.code)).toBe(BI(8));
});

test('build a simple bundle with assets', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const result = await Metro.runBuild(config, {
    assets: true,
    entry: 'TestBundle.js',
  });
  expect(result.assets).toEqual([
    {
      __packager_asset: true,
      fileSystemLocation: expect.stringMatching(/basic_bundle$/),
      files: [expect.stringMatching(/test.png$/)],
      hash: '77d45c1f7fa73c0f6c444a830dc42f67',
      height: 8,
      httpServerLocation: '/assets',
      name: 'test',
      scales: [1],
      type: 'png',
      width: 8,
    },
  ]);
});

test('allows specifying paths to save bundle and maps', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const mockSave = jest.fn();

  await Metro.runBuild(config, {
    entry: 'TestBundle.js',
    output: {
      ...require('../../shared/output/bundle'),
      save: mockSave,
    },
    sourceMapOut: 'TestBundle.custommap',
    sourceMap: true,
    bundleOut: 'TestBundle.jsbundle',
  });

  expect(mockSave).toBeCalledWith(
    {
      code: expect.any(String),
      map: expect.any(String),
    },
    expect.objectContaining({
      bundleOutput: 'TestBundle.jsbundle',
      sourcemapOutput: 'TestBundle.custommap',
    }),
    expect.any(Function),
  );
});

test('(unstable) allows specifying a transform profile', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const hermesResult = await Metro.runBuild(config, {
    entry: 'TestBundle.js',
    minify: true,
    unstable_transformProfile: 'hermes-stable',
  });
  const defaultResult = await Metro.runBuild(config, {
    entry: 'TestBundle.js',
    minify: true,
    unstable_transformProfile: 'default',
  });

  // Assumption: We won't minify JS for Hermes targets. Use this to infer that
  // transform profile passes through to the transformer.
  expect(hermesResult.code.length).toBeGreaterThan(defaultResult.code.length);
});
