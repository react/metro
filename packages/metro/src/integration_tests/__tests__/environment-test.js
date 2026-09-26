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

import type {CustomResolutionContext} from 'metro-resolver';

const Metro = require('../../..');
const execBundle = require('../execBundle');
const MetroConfig = require('metro-config');

jest.setTimeout(30 * 1000);

async function buildWithEnvironment(
  unstable_environment: ?string,
): Promise<{code: string, environments: Set<?string>}> {
  const environments = new Set<?string>();
  const baseConfig = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const config = MetroConfig.mergeConfig(baseConfig, {
    resolver: {
      resolveRequest: (
        context: CustomResolutionContext,
        moduleName: string,
        platform: string | null,
      ) => {
        environments.add(context.unstable_environment);
        return context.resolveRequest(context, moduleName, platform);
      },
    },
  });

  const {code} = await Metro.runBuild(config, {
    entry: 'TestBundle.js',
    ...(unstable_environment != null ? {unstable_environment} : null),
  });

  return {code, environments};
}

test('passes the environment to the resolver', async () => {
  const {code, environments} = await buildWithEnvironment('react-server');

  expect(execBundle(code)).toMatchObject({Bar: {type: 'bar'}});
  expect([...environments]).toEqual(['react-server']);
});

test('omits the environment from the resolver when unset', async () => {
  const {environments} = await buildWithEnvironment(null);

  expect([...environments]).toEqual([undefined]);
});

test('an environment alone does not change the bundle', async () => {
  const [withEnvironment, withoutEnvironment] = await Promise.all([
    buildWithEnvironment('react-server'),
    buildWithEnvironment(null),
  ]);

  expect(withEnvironment.code).toBe(withoutEnvironment.code);
});
