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
const baseJSBundle =
  require('../../DeltaBundler/Serializers/baseJSBundle').default;
const {
  sourceMapString,
} = require('../../DeltaBundler/Serializers/sourceMapString');
const bundleToString = require('../../lib/bundleToString').default;
const CountingSet = require('../../lib/CountingSet').default;
const countLines = require('../../lib/countLines').default;
const execBundle = require('../execBundle');
const MetroConfig = require('metro-config');
const fs = require('node:fs');
const path = require('node:path');
const {SourceMapConsumer} = require('source-map');

jest.useRealTimers();
jest.setTimeout(60 * 1000);

// Workaround for https://github.com/nodejs/node/issues/54484:
// Fetch with {Connection: 'close'} to prevent Node reusing connections across tests
const fetchAndClose = (path: string) =>
  fetch(path, {
    headers: {Connection: 'close'},
  });

const sourcesOfIndexMap = (indexMap: {
  readonly sections: ReadonlyArray<{
    readonly map: {readonly sources: ReadonlyArray<string>, ...},
    ...
  }>,
  ...
}): Array<string> => indexMap.sections.flatMap(section => section.map.sources);

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
        '/import-export/export-5.js.bundle?platform=ios&dev=true&minify=false&lazy=true&modulesOnly=true&runModule=false',
        '/import-export/export-6.js.bundle?platform=ios&dev=true&minify=false&lazy=true&modulesOnly=true&runModule=false',
        '/import-export/export-7.js.bundle?platform=ios&dev=true&minify=false&lazy=true&modulesOnly=true&runModule=false',
        '/import-export/export-8.js.bundle?platform=ios&dev=true&minify=false&lazy=true&modulesOnly=true&runModule=false',
      ]),
    );
  });

  test('builds lazy bundles for the platform inferred from the entry file name', async () => {
    const object = await downloadAndExec(
      '/async-platform/index.ios.bundle?dev=true&minify=false&lazy=true',
    );
    await expect(object.asyncImport).resolves.toHaveProperty(
      'default',
      'dep.ios.js',
    );
    expect(bundlesDownloaded).toEqual(
      new Set([
        '/async-platform/index.ios.bundle?dev=true&minify=false&lazy=true',
        '/async-platform/chunk.js.bundle?dev=true&minify=false&lazy=true&platform=ios&modulesOnly=true&runModule=false',
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

  test('should serve bundles with [metro-watchFolders] entry point', async () => {
    expect(
      await downloadAndExec(
        '/[metro-watchFolders]/1/metro/src/integration_tests/basic_bundle/TestBundle.bundle?platform=ios&dev=true&minify=false',
      ),
    ).toBeDefined();
  });

  test('should serve bundles with [metro-project] entry point', async () => {
    expect(
      await downloadAndExec(
        '/[metro-project]/TestBundle.bundle?platform=ios&dev=true&minify=false',
      ),
    ).toBeDefined();
  });

  test('[metro-project] source map resolves same modules as non-prefixed', async () => {
    const directResponse = await fetchAndClose(
      'http://localhost:' +
        httpServer.address().port +
        '/TestBundle.map?platform=ios&dev=true&minify=false',
    );
    expect(directResponse.ok).toBe(true);
    const directMap = await directResponse.json();
    const prefixedResponse = await fetchAndClose(
      'http://localhost:' +
        httpServer.address().port +
        '/[metro-project]/TestBundle.map?platform=ios&dev=true&minify=false',
    );
    expect(prefixedResponse.ok).toBe(true);
    const prefixedMap = await prefixedResponse.json();
    expect(sourcesOfIndexMap(prefixedMap).sort()).toEqual(
      sourcesOfIndexMap(directMap).sort(),
    );
  });

  test('[metro-watchFolders] source map resolves same modules as non-prefixed', async () => {
    const directResponse = await fetchAndClose(
      'http://localhost:' +
        httpServer.address().port +
        '/TestBundle.map?platform=ios&dev=true&minify=false',
    );
    expect(directResponse.ok).toBe(true);
    const directMap = await directResponse.json();
    const watchFolderResponse = await fetchAndClose(
      'http://localhost:' +
        httpServer.address().port +
        '/[metro-watchFolders]/1/metro/src/integration_tests/basic_bundle/TestBundle.map?platform=ios&dev=true&minify=false',
    );
    expect(watchFolderResponse.ok).toBe(true);
    const watchFolderMap = await watchFolderResponse.json();
    expect(sourcesOfIndexMap(watchFolderMap).sort()).toEqual(
      sourcesOfIndexMap(directMap).sort(),
    );
  });

  test('responds with 404 for [metro-watchFolders] with out-of-bounds index', async () => {
    const response = await fetchAndClose(
      'http://localhost:' +
        httpServer.address().port +
        '/[metro-watchFolders]/99/TestBundle.bundle?platform=ios&dev=true&minify=false',
    );
    expect(response.status).toBe(404);
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

describe('Metro development server with a custom serializer', () => {
  const QUERY = '?platform=ios&dev=true&minify=false';
  let httpServer;
  let serverClosedPromise;
  let preModuleCounts;
  let mutatePreModules;

  const url = (pathname: string) =>
    'http://localhost:' + httpServer.address().port + pathname;

  const virtualModule = (modulePath: string, code: string) => ({
    dependencies: new Map(),
    getSource: () => Buffer.from(code),
    inverseDependencies: new CountingSet(),
    path: modulePath,
    output: [
      {
        type: 'js/script/virtual',
        data: {code, lineCount: countLines(code), map: []},
      },
    ],
  });

  // Adds a three-line pre-module after the prelude and returns a source map
  // that describes the result. With `mutatePreModules`, it also splices a
  // module into its input, which the code and map it returns don't include.
  async function serializer(entryPoint, preModules, graph, options) {
    preModuleCounts.push(preModules.length);
    const pre = [
      ...preModules.slice(0, 1),
      virtualModule('__injected__', 'var a = 1;\nvar b = 2;\nvar c = 3;'),
      ...preModules.slice(1),
    ];
    if (mutatePreModules) {
      // Mutate the array, as some serializers have.
      preModules.splice(1, 0, virtualModule('__spliced__', 'var d = 4;'));
    }
    const code = bundleToString(
      baseJSBundle(entryPoint, pre, graph, options),
    ).code;
    const modules = [...graph.dependencies.values()].sort(
      (a, b) => options.createModuleId(a.path) - options.createModuleId(b.path),
    );
    const map = sourceMapString([...pre, ...modules], {
      excludeSource: false,
      processModuleFilter: options.processModuleFilter,
      shouldAddToIgnoreList: options.shouldAddToIgnoreList,
      getSourceUrl: options.getSourceUrl,
    });
    return {code, map};
  }

  beforeEach(async () => {
    preModuleCounts = [];
    mutatePreModules = false;
    const config = MetroConfig.mergeConfig(
      await Metro.loadConfig({config: require.resolve('../metro.config.js')}),
      {serializer: {customSerializer: serializer}},
    );
    let onCloseResolve;
    serverClosedPromise = new Promise(resolve => (onCloseResolve = resolve));
    ({httpServer} = await Metro.runServer(config, {
      reporter: {update() {}},
      onClose: () => onCloseResolve(),
    }));
  });

  afterEach(async () => {
    httpServer.close();
    await serverClosedPromise;
  });

  test('.map requests use the source map the serializer returns', async () => {
    const code = await (
      await fetchAndClose(url('/ErrorBundle.bundle' + QUERY))
    ).text();
    const linesBefore = code
      .slice(0, code.indexOf("new Error('SOURCEMAP:"))
      .split('\n');
    const map = await (
      await fetchAndClose(url('/ErrorBundle.map' + QUERY))
    ).json();
    const original = new SourceMapConsumer(map).originalPositionFor({
      line: linesBefore.length,
      column: linesBefore[linesBefore.length - 1].length,
    });
    expect({source: original.source, line: original.line}).toEqual({
      source: path.join(__dirname, '../basic_bundle/ErrorBundle.js'),
      line: 18,
    });
  });

  test('.map requests pass the serializer a copy of the pre-modules', async () => {
    mutatePreModules = true;
    for (let i = 0; i < 3; i++) {
      const response = await fetchAndClose(url('/TestBundle.map' + QUERY));
      expect(response.ok).toBe(true);
      await response.text();
    }
    expect(preModuleCounts).toEqual(Array(3).fill(preModuleCounts[0]));
  });

  test('.map requests for modulesOnly bundles do not run the serializer', async () => {
    const response = await fetchAndClose(
      url('/TestBundle.map' + QUERY + '&modulesOnly=true&runModule=false'),
    );
    expect(response.ok).toBe(true);
    await response.text();
    expect(preModuleCounts).toEqual([]);
  });
});
