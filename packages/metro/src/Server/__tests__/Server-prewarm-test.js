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

import type {Graph} from '../../DeltaBundler/Graph';
import type {
  Dependency,
  Module,
  Options,
  ReadOnlyGraph,
} from '../../DeltaBundler/types';
import type {InputConfigT} from 'metro-config';

import CountingSet from '../../lib/CountingSet';
import {mergeConfig} from 'metro-config';
import {posixToSystemPath as p} from 'metro-resolver/private/__tests__/utils';
// $FlowFixMe[untyped-import]
import MockRequest from 'mock-req';
// $FlowFixMe[untyped-import]
import MockResponse from 'mock-res';

const {
  getDefaultConfig: {getDefaultValues},
} = require('metro-config');
const path = require('node:path');

jest
  .mock('jest-worker', () => ({}))
  .mock('fs')
  .mock('../../Bundler')
  .mock('../../DeltaBundler')
  .mock('../../node-haste/DependencyGraph')
  .mock('metro-core/src/Logger');

const mockConsoleError = jest
  .spyOn(console, 'error')
  .mockImplementation(() => {});
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

const NativeDate = global.Date;

describe('pre-warm', () => {
  let Bundler;
  let Server;
  let fs;
  let buildGraph;
  let getDelta;

  let callOrder: Array<string>;
  let buildCounts: Map<string, number>;
  let deferredByEntry: Map<
    string,
    {resolve: () => void, reject: mixed => void},
  >;
  let failOnceEntries: Set<string>;
  let failAlwaysEntries: Set<string>;

  async function tick(times: number = 20): Promise<void> {
    for (let i = 0; i < times; i++) {
      await Promise.resolve();
    }
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 10; round++) {
      const before = callOrder.length;
      await tick(30);
      if (callOrder.length === before) {
        return;
      }
    }
    throw new Error('builds did not settle');
  }

  function entryFromPath(entryPath: string): string {
    return path.basename(entryPath, '.js');
  }

  function graphFor(
    entryPath: string,
    transformOptions: mixed = {},
  ): ReadOnlyGraph<> {
    const entry = entryFromPath(entryPath);
    const dependencies = new Map<string, Module<>>([
      [
        entryPath,
        {
          path: entryPath,
          dependencies: new Map<string, Dependency>(),
          inverseDependencies: new CountingSet<string>([]),
          getSource: () => Buffer.from(`code-${entry}`),
          output: [
            {
              type: 'js/module',
              data: {
                code: `__d(function() {${entry}();});`,
                lineCount: 1,
                map: [[1, 16, 1, 0]],
              },
            },
          ],
        },
      ],
    ]);
    return {
      entryPoints: new Set([entryPath]),
      dependencies,
      transformOptions,
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    global.Date = NativeDate;

    callOrder = [];
    buildCounts = new Map();
    deferredByEntry = new Map();
    failOnceEntries = new Set();
    failAlwaysEntries = new Set();

    let i = 0;
    jest.doMock('node:crypto', () => ({
      ...jest.requireActual('node:crypto'),
      randomBytes: jest.fn().mockImplementation(() => `XXXXX-${i++}`),
    }));

    const mockFs = new (require('metro-memory-fs'))({
      platform: process.platform === 'win32' ? 'win32' : 'posix',
    });
    jest.doMock('fs', () => mockFs);
    jest.doMock('node:fs', () => mockFs);
    fs = mockFs;
    fs.realpath = jest.fn((file, cb) => {
      cb?.(null, file);
    });

    buildGraph = jest.fn();
    getDelta = jest.fn();
    jest.doMock('../../lib/getPrependedScripts', () =>
      jest.fn().mockResolvedValue([]),
    );
    jest.doMock('../../lib/transformHelpers', () => ({
      ...jest.requireActual('../../lib/transformHelpers'),
      getTransformFn: jest.fn().mockReturnValue(() => {}),
      getResolveDependencyFn: jest.fn().mockReturnValue(
        (a: string, b: {name: string, ...}) => ({
          type: 'sourceFile',
          filePath: path.resolve(a, `${b.name}.js`),
        }),
      ),
    }));

    Bundler = require('../../Bundler').default;
    const getDependencyGraph = jest.fn().mockReturnValue(
      Promise.resolve({
        getHasteMap: jest.fn().mockReturnValue({on: jest.fn()}),
        load: jest.fn(() => Promise.resolve()),
        getWatcher: jest.fn(() => ({})),
        doesFileExist: jest.fn().mockReturnValue(true),
        getOrComputeSha1: jest.fn(() => Promise.resolve({sha1: 'abcdef'})),
      }),
    );
    jest
      .spyOn(Bundler.prototype, 'getDependencyGraph')
      .mockImplementation(getDependencyGraph);
    jest
      .spyOn(Bundler.prototype, 'getDynamicRoots')
      .mockImplementation(jest.fn().mockReturnValue([]));

    const DeltaBundler = require('../../DeltaBundler').default;
    buildGraph.mockImplementation(
      async (
        entryPoints: ReadonlyArray<string>,
        options: {transformOptions: mixed, ...},
      ) => {
        const entryPath = entryPoints[0];
        const entry = entryFromPath(entryPath);
        callOrder.push(entry);
        buildCounts.set(entry, (buildCounts.get(entry) ?? 0) + 1);
        if (failAlwaysEntries.has(entry)) {
          throw new Error(`always fails: ${entry}`);
        }
        if (failOnceEntries.has(entry)) {
          failOnceEntries.delete(entry);
          throw new Error(`fails once: ${entry}`);
        }
        const pending = deferredByEntry.get(entry);
        if (pending != null) {
          await new Promise((resolve, reject) => {
            pending.resolve = resolve;
            pending.reject = reject;
          });
        }
        const graph: ReadOnlyGraph<> = graphFor(
          entryPath,
          options.transformOptions,
        );
        return graph;
      },
    );
    jest
      .spyOn(DeltaBundler.prototype, 'buildGraph')
      .mockImplementation(buildGraph);
    getDelta.mockImplementation(async () => ({
      added: new Map<string, Module<>>(),
      modified: new Map<string, Module<>>(),
      deleted: new Set<string>(),
      reset: false,
    }));
    jest.spyOn(DeltaBundler.prototype, 'getDelta').mockImplementation(getDelta);

    Server = require('../../Server').default;
  });

  afterEach(() => {
    expect(mockConsoleWarn).not.toHaveBeenCalled();
    expect(mockConsoleError).not.toHaveBeenCalled();
  });

  function makeConfig(): mixed {
    return mergeConfig(getDefaultValues(p('/')), {
      projectRoot: p('/root'),
      watchFolders: [p('/root')],
      resolver: {blockList: []},
      cacheVersion: '',
      serializer: {
        getRunModuleStatement: moduleId =>
          `require(${JSON.stringify(moduleId)});`,
        polyfillModuleNames: [],
        getModulesRunBeforeMainModule: () => ['InitializeCore'],
        isThirdPartyModule: module => module.path === p('/root/foo.js'),
      },
      reporter: require('../../lib/reporting').nullReporter,
      server: {
        rewriteRequestUrl: (requrl: string) => requrl,
      },
    } as InputConfigT);
  }

  function makeServer(): mixed {
    return new Server(makeConfig());
  }

  function makeRequest(
    server: mixed,
    requrl: string,
  ): Promise<mixed> {
    return new Promise((resolve, reject) => {
      const req = new MockRequest({
        url: requrl,
        method: 'GET',
        headers: {host: 'localhost:8081'},
      });
      req.socket = {};
      const res = new MockResponse(() => {
        resolve(res);
      });
      res.on('error', reject);
      server.processRequest(req, res, reject);
    });
  }

  async function requestBundle(
    server: mixed,
    entry: string,
  ): Promise<mixed> {
    return makeRequest(
      server,
      `${entry}.bundle?platform=ios&dev=true&minify=false&runModule=true`,
    );
  }

  function deferEntry(entry: string): void {
    deferredByEntry.set(entry, {resolve: () => {}, reject: () => {}});
  }

  function resolveEntry(entry: string): void {
    const pending = deferredByEntry.get(entry);
    if (pending != null) {
      pending.resolve();
    }
  }

  test('pre-builds the 3 most recently used bundles, most recent first', async () => {
    const first = makeServer();
    await requestBundle(first, 'delta');
    await requestBundle(first, 'gamma');
    await requestBundle(first, 'beta');
    await requestBundle(first, 'alpha');
    await first.end();

    const callOrderBefore = callOrder.length;
    const second = makeServer();
    await settle();
    await second.end();

    expect(callOrder.slice(callOrderBefore)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
    expect(buildCounts.get('delta')).toBe(1);
  });

  test('shares an in-flight pre-build with a request arriving while it runs', async () => {
    const first = makeServer();
    await requestBundle(first, 'alpha');
    await requestBundle(first, 'beta');
    await requestBundle(first, 'gamma');
    await first.end();

    deferEntry('gamma');
    const orderBefore = callOrder.length;
    const countsBefore = new Map(buildCounts);
    const second = makeServer();
    await settle();
    const delta = (entry: string) =>
      (buildCounts.get(entry) ?? 0) - (countsBefore.get(entry) ?? 0);
    expect(callOrder.slice(orderBefore)).toEqual(['gamma']);
    expect(delta('gamma')).toBe(1);

    const responsePromise = requestBundle(second, 'gamma');
    await tick();
    expect(delta('gamma')).toBe(1);
    expect(delta('beta')).toBe(0);
    expect(delta('alpha')).toBe(0);

    resolveEntry('gamma');
    const response = await responsePromise;
    expect(response._getString()).toContain('gamma();');
    expect(delta('gamma')).toBe(1);
    expect(delta('beta')).toBe(0);
    expect(delta('alpha')).toBe(0);
    await second.end();
  });

  test('an unrelated request cancels queued pre-warms without waiting for the in-flight one', async () => {
    const first = makeServer();
    await requestBundle(first, 'beta');
    await requestBundle(first, 'gamma');
    await requestBundle(first, 'alpha');
    await first.end();

    deferEntry('alpha');
    const countsBefore = new Map(buildCounts);
    const second = makeServer();
    await settle();
    const delta = (entry: string) =>
      (buildCounts.get(entry) ?? 0) - (countsBefore.get(entry) ?? 0);
    expect(delta('alpha')).toBe(1);

    let settled = false;
    const responsePromise = requestBundle(second, 'delta').then(response => {
      settled = true;
      return response;
    });
    await tick(30);
    expect(settled).toBe(true);
    const response = await responsePromise;
    expect(response._getString()).toContain('delta();');

    resolveEntry('alpha');
    await settle();
    expect(delta('alpha')).toBe(1);
    expect(delta('delta')).toBe(1);
    expect(delta('beta')).toBe(0);
    expect(delta('gamma')).toBe(0);
    await second.end();
  });

  test('a request for a queued pre-warmed bundle builds it once for the request', async () => {
    const first = makeServer();
    await requestBundle(first, 'alpha');
    await requestBundle(first, 'beta');
    await requestBundle(first, 'gamma');
    await first.end();

    deferEntry('beta');
    const countsBefore = new Map(buildCounts);
    const second = makeServer();
    await settle();
    const delta = (entry: string) =>
      (buildCounts.get(entry) ?? 0) - (countsBefore.get(entry) ?? 0);
    expect(delta('gamma')).toBe(1);
    expect(delta('beta')).toBe(1);
    expect(delta('alpha')).toBe(0);

    const responsePromise = requestBundle(second, 'alpha');
    await tick();
    expect(delta('alpha')).toBe(1);

    resolveEntry('beta');
    const response = await responsePromise;
    expect(response._getString()).toContain('alpha();');
    await settle();
    expect(delta('gamma')).toBe(1);
    expect(delta('beta')).toBe(1);
    expect(delta('alpha')).toBe(1);
    await second.end();
  });

  test('a failed pre-warm build does not stop the rest or a later request', async () => {
    const first = makeServer();
    await requestBundle(first, 'alpha');
    await requestBundle(first, 'beta');
    await first.end();

    failOnceEntries.add('beta');
    const countsBefore = new Map(buildCounts);
    const second = makeServer();
    await settle();
    const delta = (entry: string) =>
      (buildCounts.get(entry) ?? 0) - (countsBefore.get(entry) ?? 0);
    expect(delta('beta')).toBe(1);
    expect(delta('alpha')).toBe(1);

    const response = await requestBundle(second, 'beta');
    expect(response._getString()).toContain('beta();');
    expect(delta('beta')).toBe(2);
    await second.end();
  });

  test('pre-warming keeps recency and only successful requests update it', async () => {
    const first = makeServer();
    await requestBundle(first, 'alpha');
    await requestBundle(first, 'beta');
    await first.end();

    const second = makeServer();
    await settle();
    await requestBundle(second, 'gamma');
    await second.end();

    failAlwaysEntries.add('nope');
    const orderBeforeThird = callOrder.length;
    const third = makeServer();
    await settle();
    expect(callOrder.slice(orderBeforeThird)).toEqual([
      'gamma',
      'beta',
      'alpha',
    ]);
    const failing = await makeRequest(
      third,
      'nope.bundle?platform=ios&dev=true&minify=false&runModule=true',
    );
    expect(failing.statusCode).toBe(500);
    await third.end();

    const orderBeforeFourth = callOrder.length;
    const fourth = makeServer();
    await settle();
    expect(callOrder.slice(orderBeforeFourth)).toEqual([
      'gamma',
      'beta',
      'alpha',
    ]);
    await fourth.end();
  });
});
