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
const {getDynamicRootId} = require('../../lib/dynamicRoots');
const {
  getMetroBabelRuntimePackageJsonPath,
} = require('../../lib/metroBabelRuntime');
const execBundle = require('../execBundle');
const fs = require('node:fs');
const path = require('node:path');

jest.useRealTimers();
jest.setTimeout(60 * 1000);

// Workaround for https://github.com/nodejs/node/issues/54484:
// Fetch with {Connection: 'close'} to prevent Node reusing connections across tests
const fetchAndClose = (url: string) =>
  fetch(url, {
    headers: {Connection: 'close'},
  });

describe("Metro's own @babel/runtime outside every configured root", () => {
  const babelRuntimeDir = path.dirname(getMetroBabelRuntimePackageJsonPath());
  let config;
  let httpServer;
  let serverClosedPromise;
  let helperUrlPathname;

  const urlOf = (pathname: string) =>
    'http://localhost:' + httpServer.address().port + pathname;

  beforeEach(async () => {
    const baseConfig = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });
    config = {
      ...baseConfig,
      // Enough for the bundle's own modules and Metro's runtime polyfills,
      // but not the repository root, where node_modules is.
      watchFolders: [
        baseConfig.projectRoot,
        path.dirname(require.resolve('metro-runtime/package.json')),
      ],
    };
    helperUrlPathname =
      '/[metro-watchFolders]/' +
      getDynamicRootId(path.relative(config.projectRoot, babelRuntimeDir)) +
      '/helpers/esm/interopRequireDefault.js';

    let onCloseResolve;
    serverClosedPromise = new Promise(resolve => (onCloseResolve = resolve));
    ({httpServer} = await Metro.runServer(config, {
      reporter: {update() {}},
      onClose: () => {
        onCloseResolve();
      },
    }));
  });

  afterEach(async () => {
    httpServer.close();
    await serverClosedPromise;
  });

  test('the fixture has @babel/runtime outside projectRoot and watchFolders', () => {
    for (const root of config.watchFolders) {
      expect(babelRuntimeDir.startsWith(root + path.sep)).toBe(false);
    }
  });

  test('builds and runs a bundle that imports metro:babel-runtime', async () => {
    const response = await fetchAndClose(
      urlOf('/metro-babel-runtime/index.bundle?platform=ios&dev=true'),
    );
    const body = await response.text();
    expect({status: response.status, body: response.ok ? null : body}).toEqual({
      status: 200,
      body: null,
    });
    expect(execBundle(body)).toEqual({helperType: 'function'});
  });

  test('addresses its modules by a dynamic root id, and serves them from it', async () => {
    const mapResponse = await fetchAndClose(
      urlOf(
        '/metro-babel-runtime/index.map?platform=ios&dev=true&sourcePaths=url-server',
      ),
    );
    expect(mapResponse.status).toBe(200);
    const sources = (await mapResponse.json()).sections.flatMap(
      section => section.map.sources,
    );
    expect(sources).toContain(helperUrlPathname);

    const sourceResponse = await fetchAndClose(urlOf(helperUrlPathname));
    expect(sourceResponse.status).toBe(200);
    expect(await sourceResponse.text()).toEqual(
      await fs.promises.readFile(
        path.join(
          babelRuntimeDir,
          'helpers',
          'esm',
          'interopRequireDefault.js',
        ),
        'utf8',
      ),
    );
  });

  test('serves a dynamic root source request made before any build', async () => {
    const sourceResponse = await fetchAndClose(urlOf(helperUrlPathname));
    expect(sourceResponse.status).toBe(200);
  });
});
