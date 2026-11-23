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
const path = require('node:path');

jest.useRealTimers();
jest.setTimeout(60 * 1000);

async function getConfig() {
  const baseConfig = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const resolvedEnvironments = new Set<?string>();
  const config = {
    ...baseConfig,
    // Build with Metro's own Babel transformer, which leaves Babel to discover
    // the fixture's `babel.config.js` from the project root.
    projectRoot: path.resolve(__dirname, '../basic_bundle/environment'),
    resolver: {
      ...baseConfig.resolver,
      resolveRequest: (
        context: CustomResolutionContext,
        moduleName: string,
        platform: string | null,
      ) => {
        resolvedEnvironments.add(context.environment);
        return context.resolveRequest(context, moduleName, platform);
      },
    },
    transformer: {
      ...baseConfig.transformer,
      babelTransformerPath: require.resolve('metro-babel-transformer'),
    },
  };
  return {config, resolvedEnvironments};
}

test('one server builds the same entry with and without an environment', async () => {
  const {config, resolvedEnvironments} = await getConfig();
  let onClose;
  const closed = new Promise(resolve => (onClose = resolve));
  const {httpServer} = await Metro.runServer(config, {onClose});
  // Workaround for https://github.com/nodejs/node/issues/54484
  const fetchAndExec = async (pathname: string) =>
    execBundle(
      await (
        await fetch(
          'http://localhost:' + httpServer.address().port + pathname,
          {
            headers: {Connection: 'close'},
          },
        )
      ).text(),
    );
  try {
    expect(
      await fetchAndExec('/index.bundle?platform=ios&environment=react-server'),
    ).toMatchObject({environment: 'react-server'});
    expect(resolvedEnvironments).toEqual(new Set(['react-server']));

    resolvedEnvironments.clear();
    expect(await fetchAndExec('/index.bundle?platform=ios')).toMatchObject({
      environment: null,
    });
    expect(resolvedEnvironments).toEqual(new Set([undefined]));
  } finally {
    httpServer.close();
    await closed;
  }
});

test('runBuild passes the environment to the transformer and resolver', async () => {
  const {config, resolvedEnvironments} = await getConfig();
  const {code} = await Metro.runBuild(config, {
    entry: 'index.js',
    environment: 'react-server',
  });
  expect(execBundle(code)).toMatchObject({environment: 'react-server'});
  expect(resolvedEnvironments).toEqual(new Set(['react-server']));
});
