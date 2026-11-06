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
