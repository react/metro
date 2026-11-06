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

jest.useRealTimers();
jest.setTimeout(60 * 1000);

const build = async (resolver: {...}) => {
  const baseConfig = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  return Metro.runBuild(
    {...baseConfig, resolver: {...baseConfig.resolver, ...resolver}},
    {entry: 'TestBundle.js'},
  );
};

const delegate = (context, moduleName, platform) =>
  context.resolveRequest(context, moduleName, platform);

test('resolves the module system through the resolver', async () => {
  const resolveRequest = jest.fn(delegate);
  await build({resolveRequest});
  expect(resolveRequest).toHaveBeenCalledWith(
    expect.anything(),
    'metro:runtime/polyfills/require',
    expect.anything(),
  );
});

test('rejects a module system that resolves to an empty module', async () => {
  await expect(
    build({
      resolveRequest: (context, moduleName, platform) =>
        moduleName === 'metro:runtime/polyfills/require'
          ? {type: 'empty'}
          : delegate(context, moduleName, platform),
    }),
  ).rejects.toThrow(
    "The module system ('metro:runtime/polyfills/require') resolved to an empty module.",
  );
});

test('does not resolve an unused `emptyModulePath`', async () => {
  const emptyModulePath = '/does/not/exist/empty.js';
  const resolveRequest = jest.fn(delegate);
  await build({emptyModulePath, resolveRequest});
  expect(resolveRequest).not.toHaveBeenCalledWith(
    expect.anything(),
    emptyModulePath,
    expect.anything(),
  );
});
