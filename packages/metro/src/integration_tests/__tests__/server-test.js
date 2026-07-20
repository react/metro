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
const fs = require('node:fs');
const path = require('node:path');

jest.useRealTimers();
jest.setTimeout(60 * 1000);

// Workaround for https://github.com/nodejs/node/issues/54484:
// Fetch with {Connection: 'close'} to prevent Node reusing connections across tests
const fetchAndClose = (path: string) =>
  fetch(path, {
    headers: {Connection: 'close'},
  });

describe('Metro development server serves bundles via HTTP', () => {
  let httpServer;
  const bundlesDownloaded = new Set();
  let serverClosedPromise;

  async function downloadAndExec(pathname: string, context = {}): unknown {
    const response = await fetchAndClose(
      'http://localhost:' + httpServer.address().port + pathname,
    );
    bundlesDownloaded.add(pathname.replaceAll('\\', '/'));

    const body = await response.text();

    if (!response.ok) {
      console.error(body);

      throw new Error('Metro responded with status code: ' + response.status);
    }
    if (!context.__DOWNLOAD_AND_EXEC_FOR_TESTS__) {
      context.__DOWNLOAD_AND_EXEC_FOR_TESTS__ = p =>
        downloadAndExec(p, context);
    }
    return execBundle(body, context);
  }

  beforeEach(async () => {
    bundlesDownloaded.clear();

    const config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

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

  test('should serve development bundles', async () => {
    expect(
      await downloadAndExec(
        '/TestBundle.bundle?platform=ios&dev=true&minify=false',
      ),
    ).toMatchSnapshot();
  });

  test('should serve production bundles', async () => {
    expect(
      await downloadAndExec(
        '/TestBundle.bundle?platform=ios&dev=false&minify=true',
      ),
    ).toMatchSnapshot();
  });

  test('should serve lazy bundles', async () => {
    const object = await downloadAndExec(
      '/import-export/index.bundle?platform=ios&dev=true&minify=false&lazy=true',
    );
    await expect(object.asyncImportCJS).resolves.toMatchSnapshot();
    await expect(object.asyncImportESM).resolves.toMatchSnapshot();
    await expect(object.asyncImportMaybeSyncCJS).resolves.toMatchSnapshot();
    await expect(object.asyncImportMaybeSyncESM).resolves.toMatchSnapshot();
    expect(bundlesDownloaded).toEqual(
      new Set([
        '/import-export/index.bundle?platform=ios&dev=true&minify=false&lazy=true',
        '/import-export/export-5.bundle?platform=ios&dev=true&minify=false&lazy=true&modulesOnly=true&runModule=false',
        '/import-export/export-6.bundle?platform=ios&dev=true&minify=false&lazy=true&modulesOnly=true&runModule=false',
        '/import-export/export-7.bundle?platform=ios&dev=true&minify=false&lazy=true&modulesOnly=true&runModule=false',
        '/import-export/export-8.bundle?platform=ios&dev=true&minify=false&lazy=true&modulesOnly=true&runModule=false',
      ]),
    );
  });

  test('should serve non-lazy bundles by default', async () => {
    const object = await downloadAndExec(
      '/import-export/index.bundle?platform=ios&dev=true&minify=false',
    );
    await expect(object.asyncImportCJS).resolves.toMatchSnapshot();
    await expect(object.asyncImportESM).resolves.toMatchSnapshot();
    await expect(object.asyncImportMaybeSyncCJS).toMatchSnapshot();
    await expect(object.asyncImportMaybeSyncESM).toMatchSnapshot();
    expect(bundlesDownloaded).toEqual(
      new Set([
        '/import-export/index.bundle?platform=ios&dev=true&minify=false',
      ]),
    );
  });

  test('responds with 404 when the bundle cannot be resolved', async () => {
    const response = await fetchAndClose(
      'http://localhost:' + httpServer.address().port + '/doesnotexist.bundle',
    );
    expect(response.status).toBe(404);
  });

  test('responds with 500 when an import inside the bundle cannot be resolved', async () => {
    const response = await fetchAndClose(
      'http://localhost:' +
        httpServer.address().port +
        '/build-errors/inline-requires-cannot-resolve-import.bundle',
    );
    expect(response.status).toBe(500);
  });

  describe('dedicated endpoints for serving source files', () => {
    test('under /[metro-project]/', async () => {
      const response = await fetchAndClose(
        'http://localhost:' +
          httpServer.address().port +
          '/[metro-project]/TestBundle.js',
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toEqual(
        await fs.promises.readFile(
          path.join(__dirname, '../basic_bundle/TestBundle.js'),
          'utf8',
        ),
      );
    });

    test('under /[metro-watchFolders]/', async () => {
      const response = await fetchAndClose(
        'http://localhost:' +
          httpServer.address().port +
          '/[metro-watchFolders]/1/metro/src/integration_tests/basic_bundle/TestBundle.js',
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toEqual(
        await fs.promises.readFile(
          path.join(__dirname, '../basic_bundle/TestBundle.js'),
          'utf8',
        ),
      );
    });

    test('under /[metro-project]/', async () => {
      const response = await fetchAndClose(
        'http://localhost:' +
          httpServer.address().port +
          '/[metro-project]/TestBundle.js',
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toEqual(
        await fs.promises.readFile(
          path.join(__dirname, '../basic_bundle/TestBundle.js'),
          'utf8',
        ),
      );
    });

    test('no access to files without source extensions', async () => {
      const response = await fetchAndClose(
        'http://localhost:' +
          httpServer.address().port +
          '/[metro-project]/not_a_source_file.xyz',
      );
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain(
        await fs.promises.readFile(
          path.join(__dirname, '../basic_bundle/not_a_source_file.xyz'),
          'utf8',
        ),
      );
    });

    test('no access to source files excluded from the file map', async () => {
      const response = await fetchAndClose(
        'http://localhost:' +
          httpServer.address().port +
          '/[metro-project]/excluded_from_file_map.js',
      );
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain(
        await fs.promises.readFile(
          path.join(__dirname, '../basic_bundle/excluded_from_file_map.js'),
          'utf8',
        ),
      );
    });

    test('requested with aggressive URL encoding /%5Bmetro-project%5D', async () => {
      const response = await fetchAndClose(
        'http://localhost:' +
          httpServer.address().port +
          '/%5Bmetro-project%5D/Foo%2Ejs',
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toEqual(
        await fs.promises.readFile(
          path.join(__dirname, '../basic_bundle/Foo.js'),
          'utf8',
        ),
      );
    });
  });
});
