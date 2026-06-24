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
  TransformResultDependency,
} from '../../DeltaBundler/types';
import type {InputConfigT} from 'metro-config';

import ResourceNotFoundError from '../../IncrementalBundler/ResourceNotFoundError';
import CountingSet from '../../lib/CountingSet';
import {mergeConfig} from 'metro-config';
// $FlowFixMe[untyped-import]
import MockRequest from 'mock-req';
// $FlowFixMe[untyped-import]
import MockResponse from 'mock-res';

const {
  getDefaultConfig: {getDefaultValues},
} = require('metro-config');
const path = require('path');

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
const mockConsoleWarn = jest
  .spyOn(console, 'warn')
  .mockImplementation(() => {});

const NativeDate = global.Date;

describe('processRequest', () => {
  let Bundler;
  let Server;
  let dependencies: Map<string, Module<>>;
  let fs;
  let getPrependedScripts;
  let DeltaBundler;

  let buildGraph;
  let getDelta;
  let getDependencyGraph;
  let getTransformFn;
  let getResolveDependencyFn;
  let getAsset;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    global.Date = NativeDate;

    buildGraph = jest.fn();
    getDelta = jest.fn();
    getDependencyGraph = jest.fn();
    getTransformFn = jest.fn();
    getResolveDependencyFn = jest.fn();
    getAsset = jest.fn();

    let i = 0;
    jest.doMock('crypto', () => ({
      ...jest.requireActual('crypto'),
      randomBytes: jest.fn().mockImplementation(() => `XXXXX-${i++}`),
    }));

    jest.doMock('../../Assets', () => ({
      ...jest.requireActual('../../Assets'),
      getAsset,
    }));

    getPrependedScripts = jest.fn();
    jest.doMock('../../lib/getPrependedScripts', () => getPrependedScripts);

    jest.doMock('../../lib/transformHelpers', () => ({
      ...jest.requireActual('../../lib/transformHelpers'),
      getTransformFn,
      getResolveDependencyFn,
    }));

    Bundler = require('../../Bundler').default;
    jest
      .spyOn(Bundler.prototype, 'getDependencyGraph')
      .mockImplementation(getDependencyGraph);

    jest.mock('fs', () => new (require('metro-memory-fs'))());
    fs = require('fs');

    DeltaBundler = require('../../DeltaBundler').default;
    jest
      .spyOn(DeltaBundler.prototype, 'buildGraph')
      .mockImplementation(buildGraph);
    jest.spyOn(DeltaBundler.prototype, 'getDelta').mockImplementation(getDelta);

    Server = require('../../Server').default;
  });

  afterEach(() => {
    expect(mockConsoleWarn).not.toHaveBeenCalled();
    expect(mockConsoleError).not.toHaveBeenCalled();
  });

  let server;

  const config = mergeConfig(getDefaultValues('/'), {
    projectRoot: '/root',
    watchFolders: ['/root'],
    resolver: {blockList: []},
    cacheVersion: '',
    serializer: {
      getRunModuleStatement: moduleId =>
        `require(${JSON.stringify(moduleId)});`,
      polyfillModuleNames: [],
      getModulesRunBeforeMainModule: () => ['InitializeCore'],
      isThirdPartyModule: module => module.path === '/root/foo.js',
    },

    reporter: require('../../lib/reporting').nullReporter,
    server: {
      rewriteRequestUrl: jest.fn().mockImplementation(requrl => {
        const rewritten = requrl.replace(/__REMOVE_THIS_WHEN_REWRITING__/g, '');
        if (rewritten !== requrl) {
          return rewritten + '&TEST_URL_WAS_REWRITTEN=true';
        }
        return requrl;
      }),
    },
    symbolicator: {
      customizeFrame: ({file}) => {
        if (file === '/root/foo.js') {
          return {collapse: true};
        }
        return null;
      },
      customizeStack: (stack, extraData) => {
        return stack.map(frame => {
          return {
            ...frame,
            ...extraData,
            wasCollapsedBefore: frame.collapse === true ? true : undefined,
          };
        });
      },
    },
  } as InputConfigT);

  const makeRequest = (
    requrl: string,
    options?: ?Readonly<{
      method?: string,
      headers?: Readonly<{[string]: string}>,
      data?: string,
    }>,
  ) =>
    new Promise<$FlowFixMe>((resolve, reject) => {
      const {data, method, headers, ...reqOptions} = options ?? {};
      const actualMethod = method ?? (data != null ? 'POST' : 'GET');
      const req = new MockRequest({
        url: requrl,
        method: actualMethod,
        headers: {...headers, host: 'localhost:8081'},
        ...reqOptions,
      });
      req.socket = {};
      if (data != null) {
        req.write(data);
        req.end();
      }
      const res: $FlowFixMe = new MockResponse(() => {
        resolve(res);
      });
      res.on('error', reject);
      server.processRequest(req, res, reject);
    });

  beforeEach(() => {
    const currentGraphs = new Set<ReadOnlyGraph<>>();
    buildGraph.mockImplementation(
      async (
        entryPoints: ReadonlyArray<string>,
        options: Options<>,
        resolverOptions: unknown,
        otherOptions: unknown,
      ) => {
        dependencies = new Map<string, Module<>>([
          [
            '/root/mybundle.js',
            {
              path: '/root/mybundle.js',
              dependencies: new Map<string, Dependency>([
                [
                  'foo',
                  {
                    absolutePath: '/root/foo.js',
                    data: {
                      data: {
                        asyncType: null,
                        isESMImport: false,
                        key: 'foo',
                        locs: [],
                      },
                      name: 'foo',
                    },
                  },
                ],
              ]),
              inverseDependencies: new CountingSet<string>([]),
              getSource: () => Buffer.from('code-mybundle'),
              output: [
                {
                  type: 'js/module',
                  data: {
                    code: '__d(function() {entry();});',
                    lineCount: 1,
                    map: [[1, 16, 1, 0]],
                  },
                },
              ],
            },
          ],
        ]);
        if (!options.shallow) {
          dependencies.set('/root/foo.js', {
            path: '/root/foo.js',
            dependencies: new Map(),
            inverseDependencies: new CountingSet(['/root/mybundle.js']),
            getSource: () => Buffer.from('code-foo'),
            output: [
              {
                type: 'js/module',
                data: {
                  code: '__d(function() {foo();});',
                  lineCount: 1,
                  map: [[1, 16, 1, 0]],
                  functionMap: {names: ['<global>'], mappings: 'AAA'},
                },
              },
            ],
          });
        }

        // NOTE: The real buildGraph returns a mutable Graph instance, but we
        // mock out all of the code paths that depend on this so we can use this
        // simpler interface instead.
        const graph: ReadOnlyGraph<> = {
          entryPoints: new Set(['/root/mybundle.js']),
          dependencies,
          transformOptions: options.transformOptions,
        };
        currentGraphs.add(graph);

        return graph;
      },
    );
    getDelta.mockImplementation(
      async (graph: Graph<>, {reset}: {reset: boolean, ...}) => {
        if (!currentGraphs.has(graph)) {
          throw new Error('Graph not found');
        }

        return {
          added: reset ? dependencies : new Map<string, Module<>>(),
          modified: new Map<string, Module<>>(),
          deleted: new Set<string>(),
          reset,
        };
      },
    );

    getPrependedScripts.mockReturnValue(
      Promise.resolve([
        {
          path: 'require-js',
          dependencies: new Map<string, Module<>>(),
          getSource: () => Buffer.from('code-require'),
          output: [
            {
              type: 'js/script',
              data: {
                code: 'function () {require();}',
                lineCount: 1,
                map: [],
              },
            },
          ],
        },
      ]),
    );

    getDependencyGraph.mockReturnValue(
      Promise.resolve({
        getHasteMap: jest.fn().mockReturnValue({on: jest.fn()}),
        load: jest.fn(() => Promise.resolve()),
        getWatcher: jest.fn(() => ({})),
        doesFileExist: jest.fn().mockReturnValue(true),
      }),
    );

    server = new Server(config);

    getTransformFn.mockReturnValue(() => {});
    getResolveDependencyFn.mockReturnValue(
      (a: string, b: TransformResultDependency) => ({
        type: 'sourceFile',
        filePath: path.resolve(a, `${b.name}.js`),
      }),
    );

    // $FlowFixMe[cannot-write]
    fs.realpath = jest.fn((file, cb) => cb?.(null, '/root/foo.js'));
  });

  test.each(['?', '//&'])(
    'returns JS bundle source on request of *.bundle (delimiter: %s)',
    async delimiter => {
      const response = await makeRequest(
        `mybundle.bundle${delimiter}runModule=true`,
        null,
      );

      expect(response._getString()).toEqual(
        [
          'function () {require();}',
          '__d(function() {entry();},0,[1],"mybundle.js");',
          '__d(function() {foo();},1,[],"foo.js");',
          'require(0);',
          '//# sourceMappingURL=http://localhost:8081/mybundle.map?runModule=true',
          '//# sourceURL=http://localhost:8081/mybundle.bundle//&runModule=true',
        ].join('\n'),
      );
    },
  );

  test('returns JS bundle without the initial require() call', async () => {
    const response = await makeRequest('mybundle.bundle?runModule=false', null);

    expect(response._getString()).toEqual(
      [
        'function () {require();}',
        '__d(function() {entry();},0,[1],"mybundle.js");',
        '__d(function() {foo();},1,[],"foo.js");',
        '//# sourceMappingURL=http://localhost:8081/mybundle.map?runModule=false',
        '//# sourceURL=http://localhost:8081/mybundle.bundle//&runModule=false',
      ].join('\n'),
    );
  });

  test('returns Last-Modified header on request of *.bundle', () => {
    return makeRequest('mybundle.bundle?runModule=true').then(response => {
      expect(response.getHeader('Last-Modified')).toBeDefined();
    });
  });

  test('returns build info headers on request of *.bundle', async () => {
    const response = await makeRequest('mybundle.bundle?runModule=true');

    expect(response.getHeader('X-Metro-Files-Changed-Count')).toEqual('3');
  });

  test('returns Content-Length header on request of *.bundle', () => {
    return makeRequest('mybundle.bundle?runModule=true').then(response => {
      expect(response.getHeader('Content-Length')).toEqual(
        '' + Buffer.byteLength(response._getString()),
      );
    });
  });

  test('returns Content-Location header on request of *.bundle', () => {
    return makeRequest('mybundle.bundle?runModule=true').then(response => {
      expect(response.getHeader('Content-Location')).toEqual(
        'http://localhost:8081/mybundle.bundle//&runModule=true',
      );
    });
  });

  test('returns 404 on request of *.bundle when resource does not exist', async () => {
    // $FlowFixMe[cannot-write]
    fs.realpath = jest.fn((file, cb: $FlowFixMe) =>
      cb(new ResourceNotFoundError('unknown.bundle')),
    );

    return makeRequest('unknown.bundle?runModule=true').then(response => {
      expect(response.statusCode).toEqual(404);
      expect(response._getString()).toEqual(
        expect.stringContaining('ResourceNotFoundError'),
      );
    });
  });

  test('returns 304 on request of *.bundle when if-modified-since equals Last-Modified', async () => {
    const response = await makeRequest('mybundle.bundle?runModule=true');
    const lastModified = response.getHeader('Last-Modified');

    global.Date = class {
      constructor() {
        return new NativeDate('2017-07-07T00:10:20.000Z');
      }
      now(): number {
        return NativeDate.now();
      }
    };

    return makeRequest('mybundle.bundle?runModule=true', {
      headers: {'if-modified-since': lastModified},
    }).then(response => {
      expect(response.statusCode).toEqual(304);
    });
  });

  test('returns 200 on request of *.bundle when something changes (ignoring if-modified-since headers)', async () => {
    const response = await makeRequest('mybundle.bundle?runModule=true');
    const lastModified = response.getHeader('Last-Modified');

    getDelta.mockReturnValue(
      Promise.resolve({
        added: new Map<string, Module<>>(),
        modified: new Map<number, string>([
          [0, '__d(function() {entry();},0,[1],"mybundle.js");'],
        ]),
        deleted: new Set<string>(),
        reset: false,
      }),
    );

    global.Date = class {
      constructor() {
        return new NativeDate('2017-07-07T00:10:20.000Z');
      }
      now(): number {
        return NativeDate.now();
      }
    };

    return makeRequest('mybundle.bundle?runModule=true', {
      headers: {'if-modified-since': lastModified},
    }).then(response => {
      expect(response.statusCode).toEqual(200);
      expect(response.getHeader('X-Metro-Files-Changed-Count')).toEqual('1');
    });
  });

  test('supports the `modulesOnly` option', async () => {
    const response = await makeRequest(
      'mybundle.bundle?modulesOnly=true&runModule=false',
      null,
    );

    expect(response._getString()).toEqual(
      [
        '__d(function() {entry();},0,[1],"mybundle.js");',
        '__d(function() {foo();},1,[],"foo.js");',
        '//# sourceMappingURL=http://localhost:8081/mybundle.map?modulesOnly=true&runModule=false',
        '//# sourceURL=http://localhost:8081/mybundle.bundle//&modulesOnly=true&runModule=false',
      ].join('\n'),
    );
  });

  test('support "x-forwarded-host" and "x-forwarded-proto" proxy headers for bundles', async () => {
    const response = await makeRequest(
      'mybundle.bundle?modulesOnly=true&runModule=false&platform=vr',
      {
        headers: {
          'x-forwarded-host': 'forwardedhost.com',
          'x-forwarded-proto': 'https',
        },
      },
    );

    expect(response._getString()).toEqual(
      [
        '__d(function() {entry();},0,[1],"mybundle.js");',
        '__d(function() {foo();},1,[],"foo.js");',
        '//# sourceMappingURL=https://forwardedhost.com/mybundle.map?modulesOnly=true&runModule=false&platform=vr',
        '//# sourceURL=https://forwardedhost.com/mybundle.bundle//&modulesOnly=true&runModule=false&platform=vr',
      ].join('\n'),
    );
  });

  test('supports the `shallow` option', async () => {
    const response = await makeRequest(
      'mybundle.bundle?shallow=true&modulesOnly=true&runModule=false',
      null,
    );

    expect(response._getString()).toEqual(
      [
        '__d(function() {entry();},0,[1],"mybundle.js");',
        '//# sourceMappingURL=http://localhost:8081/mybundle.map?shallow=true&modulesOnly=true&runModule=false',
        '//# sourceURL=http://localhost:8081/mybundle.bundle//&shallow=true&modulesOnly=true&runModule=false',
      ].join('\n'),
    );
  });

  test('should handle DELETE requests on *.bundle', async () => {
    const IncrementalBundler = require('../../IncrementalBundler').default;
    const updateSpy = jest.spyOn(IncrementalBundler.prototype, 'updateGraph');
    const initSpy = jest.spyOn(IncrementalBundler.prototype, 'initializeGraph');

    // When building a bundle for the first time, we expect to create a graph for it.
    await makeRequest('mybundle.bundle', null);
    expect(initSpy).toBeCalledTimes(1);
    expect(updateSpy).not.toBeCalled();

    jest.clearAllMocks();

    // When building again, the graph should already exist and only need an update.
    await makeRequest('mybundle.bundle', null);
    expect(initSpy).not.toBeCalled();
    expect(updateSpy).toBeCalledTimes(1);

    jest.clearAllMocks();

    // `DELETE`ing the bundle evicts its graph data from memory and doesn't trigger init/update.
    const deleteResponse = await makeRequest('mybundle.bundle', {
      method: 'DELETE',
    });
    expect(deleteResponse.statusCode).toBe(204);
    expect(initSpy).not.toBeCalled();
    expect(updateSpy).not.toBeCalled();

    jest.clearAllMocks();

    // Building the bundle again reinitialises the graph.
    await makeRequest('mybundle.bundle');
    expect(initSpy).toBeCalledTimes(1);
    expect(updateSpy).not.toBeCalled();
  });

  test('multiple DELETE requests on *.bundle succeed', async () => {
    await makeRequest('mybundle.bundle', null);
    await makeRequest('mybundle.bundle', {
      method: 'DELETE',
    });
    const secondDeleteResponse = await makeRequest('mybundle.bundle', {
      method: 'DELETE',
    });
    expect(secondDeleteResponse.statusCode).toBe(204);
  });

  test('DELETE succeeds with a nonexistent path', async () => {
    // $FlowFixMe[cannot-write]
    fs.realpath = jest.fn((file, cb: $FlowFixMe) =>
      cb(new ResourceNotFoundError('unknown.bundle')),
    );

    const response = await makeRequest('unknown.bundle?runModule=true', {
      method: 'DELETE',
    });
    expect(response.statusCode).toEqual(204);
  });

  test('DELETE handles errors', async () => {
    const IncrementalBundler = require('../../IncrementalBundler').default;
    jest
      .spyOn(IncrementalBundler.prototype, 'endGraph')
      .mockImplementationOnce(async () => {
        throw new Error('endGraph error');
      });

    await makeRequest('mybundle.bundle', null);
    const response = await makeRequest('mybundle.bundle', {
      method: 'DELETE',
    });

    expect(response.statusCode).toEqual(500);
    expect(response._getJSON()).toEqual({
      errors: [],
      message: expect.any(String),
      type: 'InternalError',
    });
  });

  test('returns sourcemap on request of *.map', async () => {
    const response = await makeRequest('mybundle.map');

    expect(response._getJSON()).toEqual({
      version: 3,
      sources: ['require-js', '/root/mybundle.js', '/root/foo.js'],
      sourcesContent: ['code-require', 'code-mybundle', 'code-foo'],
      names: [],
      mappings: ';gBCAA;gBCAA',
      x_facebook_sources: [
        null,
        null,
        [
          {
            mappings: 'AAA',
            names: ['<global>'],
          },
        ],
      ],
      x_google_ignoreList: [2],
    });
  });

  test('source map request respects `modulesOnly` option', async () => {
    const response = await makeRequest('mybundle.map?modulesOnly=true');

    expect(response._getJSON()).toEqual({
      version: 3,
      sources: ['/root/mybundle.js', '/root/foo.js'],
      sourcesContent: ['code-mybundle', 'code-foo'],
      names: [],
      mappings: 'gBAAA;gBCAA',
      x_facebook_sources: [
        null,
        [
          {
            mappings: 'AAA',
            names: ['<global>'],
          },
        ],
      ],
      x_google_ignoreList: [1],
    });
  });

  test('does not rebuild the graph when requesting the sourcemaps after having requested the same bundle', async () => {
    expect((await makeRequest('mybundle.bundle?platform=ios')).statusCode).toBe(
      200,
    );

    buildGraph.mockClear();

    expect((await makeRequest('mybundle.map?platform=ios')).statusCode).toBe(
      200,
    );

    expect(buildGraph.mock.calls.length).toBe(0);
  });

  test('does build a delta when requesting the sourcemaps after having requested the same bundle', async () => {
    expect((await makeRequest('mybundle.bundle?platform=ios')).statusCode).toBe(
      200,
    );

    getDelta.mockClear();

    expect((await makeRequest('mybundle.map?platform=ios')).statusCode).toBe(
      200,
    );

    expect(getDelta.mock.calls.length).toBe(1);
  });

  test('does rebuild the graph when requesting the sourcemaps if the bundle has not been built yet', async () => {
    expect((await makeRequest('mybundle.bundle?platform=ios')).statusCode).toBe(
      200,
    );

    buildGraph.mockClear();
    getDelta.mockClear();

    // request the map of a different bundle
    expect(
      (await makeRequest('mybundle.map?platform=android')).statusCode,
    ).toBe(200);

    expect(buildGraph.mock.calls.length).toBe(1);
  });

  test('passes in the platform param', async () => {
    await makeRequest('index.bundle?platform=ios');

    expect(getTransformFn).toBeCalledWith(
      ['/root/index.js'],
      expect.any(Bundler),
      expect.any(DeltaBundler),
      expect.any(Object),
      expect.objectContaining({
        platform: 'ios',
      }),
      expect.any(Object),
    );
    expect(getResolveDependencyFn).toBeCalled();

    expect(buildGraph).toBeCalledWith(['/root/index.js'], {
      lazy: false,
      onProgress: expect.any(Function),
      resolve: expect.any(Function),
      shallow: false,
      transform: expect.any(Function),
      transformOptions: {
        customTransformOptions: {},
        dev: true,
        minify: false,
        platform: 'ios',
        type: 'module',
        unstable_transformProfile: 'default',
      },
      unstable_allowRequireContext: false,
      unstable_enablePackageExports: true,
      unstable_incrementalResolution: false,
    });
  });

  test('sourcePaths=url-server mode', async () => {
    const response = await makeRequest('mybundle.map?sourcePaths=url-server');

    expect(response._getJSON()).toEqual({
      version: 3,
      sources: [
        '/require-js',
        '/[metro-project]/mybundle.js',
        '/[metro-project]/foo.js',
      ],
      sourcesContent: ['code-require', 'code-mybundle', 'code-foo'],
      names: [],
      mappings: ';gBCAA;gBCAA',
      x_facebook_sources: [
        null,
        null,
        [
          {
            mappings: 'AAA',
            names: ['<global>'],
          },
        ],
      ],
      x_google_ignoreList: [2],
    });
  });

  test('passes in the unstable_transformProfile param', async () => {
    await makeRequest('index.bundle?unstable_transformProfile=hermes-stable');

    expect(getTransformFn).toBeCalledWith(
      ['/root/index.js'],
      expect.any(Bundler),
      expect.any(DeltaBundler),
      expect.any(Object),
      expect.objectContaining({
        unstable_transformProfile: 'hermes-stable',
      }),
      expect.any(Object),
    );
    expect(getResolveDependencyFn).toBeCalled();

    expect(buildGraph).toBeCalledWith(['/root/index.js'], {
      lazy: false,
      onProgress: expect.any(Function),
      resolve: expect.any(Function),
      shallow: false,
      transform: expect.any(Function),
      transformOptions: {
        customTransformOptions: {},
        dev: true,
        minify: false,
        platform: null,
        type: 'module',
        unstable_transformProfile: 'hermes-stable',
      },
      unstable_allowRequireContext: false,
      unstable_enablePackageExports: true,
      unstable_incrementalResolution: false,
    });
  });

  test.each(['?', '//&'])(
    'rewrites URLs before bundling (query delimiter: %s)',
    async delimiter => {
      jest.clearAllMocks();

      const response = await makeRequest(
        `mybundle.bundle${delimiter}runModule=true__REMOVE_THIS_WHEN_REWRITING__`,
        null,
      );

      expect(config.server.rewriteRequestUrl).toHaveBeenCalledWith(
        'mybundle.bundle?runModule=true__REMOVE_THIS_WHEN_REWRITING__',
      );

      expect(response._getString()).toEqual(
        [
          'function () {require();}',
          '__d(function() {entry();},0,[1],"mybundle.js");',
          '__d(function() {foo();},1,[],"foo.js");',
          'require(0);',
          '//# sourceMappingURL=http://localhost:8081/mybundle.map?runModule=true&TEST_URL_WAS_REWRITTEN=true',
          '//# sourceURL=http://localhost:8081/mybundle.bundle//&runModule=true&TEST_URL_WAS_REWRITTEN=true',
        ].join('\n'),
      );
    },
  );

  test('does not rebuild the bundle when making concurrent requests', async () => {
    // Delay the response of the buildGraph method.
    const promise1 = makeRequest('index.bundle');
    const promise2 = makeRequest('index.bundle');

    const [result1, result2] = await Promise.all([promise1, promise2]);
    expect(result1._getString()).toEqual(result2._getString());
    expect(result1.getHeader('X-Metro-Files-Changed-Count')).toEqual('3');
    expect(result2.getHeader('X-Metro-Files-Changed-Count')).toEqual('0');

    expect(buildGraph.mock.calls.length).toBe(1);
    expect(getDelta.mock.calls.length).toBe(1);
  });

  describe('/assets endpoint', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    test('should serve simple case', async () => {
      getAsset.mockResolvedValue(Promise.resolve('i am image'));

      const response = await makeRequest('/assets/imgs/a.png');
      expect(response._getString()).toBe('i am image');
    });

    test('should parse the platform option', async () => {
      getAsset.mockResolvedValue(Promise.resolve('i am image'));

      const response = await makeRequest('/assets/imgs/a.png?platform=ios');
      expect(response._getString()).toBe('i am image');

      expect(getAsset).toBeCalledWith(
        'imgs/a.png',
        '/root',
        ['/root'],
        'ios',
        expect.any(Array),
        expect.any(Function),
      );
    });

    test('should serve range request', async () => {
      const mockData = 'i am image';
      getAsset.mockResolvedValue(mockData);

      const response = await makeRequest('/assets/imgs/a.png?platform=ios', {
        headers: {range: 'bytes=0-3'},
      });

      expect(getAsset).toBeCalledWith(
        'imgs/a.png',
        '/root',
        ['/root'],
        'ios',
        expect.any(Array),
        expect.any(Function),
      );
      expect(response._getString()).toBe(mockData.slice(0, 4));
    });

    test('should return headers in a range request', async () => {
      const mockData = 'i am image';
      getAsset.mockResolvedValue(mockData);

      const response = await makeRequest('/assets/imgs/a.png?platform=ios', {
        headers: {range: 'bytes=0-3'},
      });

      expect(response.getHeader('content-type')).toBe('image/png');
      expect(response.getHeader('accept-ranges')).toBe('bytes');
      expect(response.getHeader('content-length')).toBe('4');
      expect(response.getHeader('content-range')).toBe('bytes 0-3/10');
    });

    test('should return content-type and content-length header for a png asset', async () => {
      const mockData = 'i am image';
      getAsset.mockResolvedValue(mockData);

      const response = await makeRequest('/assets/imgs/a.png?platform=ios');

      expect(response.getHeader('content-type')).toBe('image/png');
      expect(response.getHeader('content-length')).toBe(
        String(Buffer.byteLength(mockData)),
      );
    });

    test('should return content-type and content-length header for an svg asset', async () => {
      const mockData = 'i am image';
      getAsset.mockResolvedValue(mockData);

      const response = await makeRequest('/assets/imgs/a.svg?platform=ios');

      expect(response.getHeader('content-type')).toBe('image/svg+xml');
      expect(response.getHeader('content-length')).toBe(
        String(Buffer.byteLength(mockData)),
      );
    });

    test("should serve assets files's name contain non-latin letter", async () => {
      getAsset.mockResolvedValue('i am image');

      const response = await makeRequest(
        '/assets/imgs/%2530/%D0%B0%D0%B9%D1%81%D0%B5%D1%82/%C3%98%E0%B2%9A%F0%9F%98%81/%E4%B8%BB%E9%A1%B5/logo.png',
      );
      expect(response._getString()).toBe('i am image');

      expect(getAsset).toBeCalledWith(
        'imgs/%30/айсет/Øಚ😁/主页/logo.png',
        '/root',
        ['/root'],
        null,
        expect.any(Array),
        expect.any(Function),
      );
    });

    test('should use unstable_path if provided', async () => {
      getAsset.mockResolvedValue('i am image');

      const response = await makeRequest('/assets?unstable_path=imgs/a.png');

      expect(response._getString()).toBe('i am image');
    });

    test('should parse the platform option if tacked onto unstable_path', async () => {
      getAsset.mockResolvedValue('i am image');

      const response = await makeRequest(
        '/assets?unstable_path=imgs/a.png?platform=ios',
      );

      expect(getAsset).toBeCalledWith(
        'imgs/a.png',
        '/root',
        ['/root'],
        'ios',
        expect.any(Array),
        expect.any(Function),
      );
      expect(response._getString()).toBe('i am image');
    });

    test('unstable_path can escape from projectRoot', async () => {
      getAsset.mockResolvedValue('i am image');

      const response = await makeRequest(
        '/assets?unstable_path=../otherFolder/otherImage.png',
      );

      expect(getAsset).toBeCalledWith(
        '../otherFolder/otherImage.png',
        '/root',
        ['/root'],
        null,
        expect.any(Array),
        expect.any(Function),
      );
      expect(response._getString()).toBe('i am image');
    });
  });

  describe('build(options)', () => {
    test('Calls the delta bundler with the correct args', async () => {
      await server.build({
        ...Server.DEFAULT_BUNDLE_OPTIONS,
        entryFile: 'foo file',
        platform: undefined,
      });

      expect(getTransformFn).toBeCalledWith(
        ['/root/foo file'],
        expect.any(Bundler),
        expect.any(DeltaBundler),
        expect.any(Object),
        {
          customTransformOptions: {},
          dev: true,
          minify: false,
          platform: undefined,
          type: 'module',
          unstable_transformProfile: 'default',
        },
        expect.any(Object),
      );
      expect(getResolveDependencyFn).toBeCalled();

      expect(buildGraph).toBeCalledWith(['/root/foo file'], {
        lazy: false,
        onProgress: null,
        resolve: expect.any(Function),
        shallow: false,
        transform: expect.any(Function),
        transformOptions: {
          customTransformOptions: {},
          dev: true,
          minify: false,
          platform: undefined,
          type: 'module',
          unstable_transformProfile: 'default',
        },
        unstable_allowRequireContext: false,
        unstable_enablePackageExports: true,
        unstable_incrementalResolution: false,
      });
    });
  });

  describe.each(['?', '//&'])(
    '/symbolicate endpoint (query delimiter: %s)',
    queryDelimiter => {
      beforeEach(() => {
        fs.mkdirSync('/root');
        fs.writeFileSync(
          '/root/mybundle.js',
          'this\nis\njust an example and it is all fake data, yay!',
        );
        fs.writeFileSync('/root/foo.js', 'mock data');
      });

      test('should symbolicate given stack trace', async () => {
        const response = await makeRequest('/symbolicate', {
          headers: {'content-type': 'application/json'},
          data: JSON.stringify({
            stack: [
              {
                file: `http://localhost:8081/mybundle.bundle${queryDelimiter}runModule=true`,
                lineNumber: 2,
                column: 18,
                customPropShouldBeLeftUnchanged: 'foo',
                methodName: 'clientSideMethodName',
              },
            ],
          }),
        });

        // If snapshots in this file have to be updated but fail with
        // "Multiple inline snapshots for the same call are not supported."
        // Change `describe.each(['?', '//&'])` above to run only for one option:
        // like so: `describe.each(['?'])`
        expect(response._getJSON()).toMatchInlineSnapshot(`
          Object {
            "codeFrame": Object {
              "content": "[0m[31m[1m>[22m[39m[90m 1 |[39m [36mthis[39m
           [90m   |[39m [31m[1m^[22m[39m
           [90m 2 |[39m is
           [90m 3 |[39m just an example and it is all fake data[33m,[39m yay[33m![39m[0m",
              "fileName": "/root/mybundle.js",
              "location": Object {
                "column": 0,
                "row": 1,
              },
            },
            "stack": Array [
              Object {
                "column": 0,
                "customPropShouldBeLeftUnchanged": "foo",
                "file": "/root/mybundle.js",
                "lineNumber": 1,
                "methodName": "clientSideMethodName",
              },
            ],
          }
        `);
      });

      describe('should rewrite URLs before symbolicating', () => {
        test('mapped location symbolicates correctly', async () => {
          const mappedLocation = {
            lineNumber: 2,
            column: 18,
            customPropShouldBeLeftUnchanged: 'foo',
            methodName: 'clientSideMethodName',
          };

          const response = await makeRequest('/symbolicate', {
            headers: {'content-type': 'application/json'},
            data: JSON.stringify({
              stack: [
                {
                  file: `http://localhost:8081/my__REMOVE_THIS_WHEN_REWRITING__bundle.bundle${queryDelimiter}runModule=true`,
                  ...mappedLocation,
                },
              ],
            }),
          });

          expect(response._getJSON()).toEqual(
            JSON.parse(
              (
                await makeRequest('/symbolicate', {
                  headers: {'content-type': 'application/json'},
                  data: JSON.stringify({
                    stack: [
                      {
                        file: `http://localhost:8081/mybundle.bundle${queryDelimiter}runModule=true`,
                        ...mappedLocation,
                      },
                    ],
                  }),
                })
              )._getString(),
            ),
          );
        });

        test('unmapped location returns the rewritten URL', async () => {
          const unmappedLocation = {
            lineNumber: 200000,
            column: 18,
            customPropShouldBeLeftUnchanged: 'foo',
            methodName: 'clientSideMethodName',
          };

          const response = await makeRequest('/symbolicate', {
            headers: {'content-type': 'application/json'},
            data: JSON.stringify({
              stack: [
                {
                  file: `http://localhost:8081/my__REMOVE_THIS_WHEN_REWRITING__bundle.bundle${queryDelimiter}runModule=true`,
                  ...unmappedLocation,
                },
              ],
            }),
          });

          expect(response._getJSON().stack[0].file).toBe(
            'http://localhost:8081/mybundle.bundle?runModule=true&TEST_URL_WAS_REWRITTEN=true',
          );
        });
      });

      test('should update the graph when symbolicating a second time', async () => {
        const requestData = {
          headers: {'content-type': 'application/json'},
          data: JSON.stringify({
            stack: [
              {
                file: `http://localhost:8081/mybundle.bundle${queryDelimiter}runModule=true`,
                lineNumber: 2,
                column: 18,
                customPropShouldBeLeftUnchanged: 'foo',
                methodName: 'clientSideMethodName',
              },
            ],
          }),
        };

        const IncrementalBundler = require('../../IncrementalBundler').default;
        const updateSpy = jest.spyOn(
          IncrementalBundler.prototype,
          'updateGraph',
        );
        const initSpy = jest.spyOn(
          IncrementalBundler.prototype,
          'initializeGraph',
        );

        // When symbolicating a bundle the first time, we expect to create a graph for it.
        await makeRequest('/symbolicate', requestData);
        expect(initSpy).toBeCalledTimes(1);
        expect(updateSpy).not.toBeCalled();

        // When symbolicating the same bundle a second time, the bundle graph may be out of date.
        // Let's be sure to update the bundle graph.
        await makeRequest('/symbolicate', requestData);
        expect(initSpy).toBeCalledTimes(1);
        expect(updateSpy).toBeCalledTimes(1);
      });

      test('supports the `modulesOnly` option', async () => {
        const response = await makeRequest('/symbolicate', {
          headers: {'content-type': 'application/json'},
          data: JSON.stringify({
            stack: [
              {
                file: `http://localhost:8081/mybundle.bundle${queryDelimiter}runModule=true&modulesOnly=true`,
                lineNumber: 2,
                column: 16,
              },
            ],
          }),
        });

        expect(response._getJSON()).toMatchObject({
          stack: [
            expect.objectContaining({
              column: 0,
              file: '/root/foo.js',
              lineNumber: 1,
            }),
          ],
        });
      });

      test('supports the `shallow` option', async () => {
        const response = await makeRequest('/symbolicate', {
          headers: {'content-type': 'application/json'},
          data: JSON.stringify({
            stack: [
              {
                file: `http://localhost:8081/mybundle.bundle${queryDelimiter}runModule=true&shallow=true`,
                lineNumber: 2,
                column: 18,
                customPropShouldBeLeftUnchanged: 'foo',
                methodName: 'clientSideMethodName',
              },
            ],
          }),
        });

        expect(response._getJSON()).toMatchInlineSnapshot(`
          Object {
            "codeFrame": Object {
              "content": "[0m[31m[1m>[22m[39m[90m 1 |[39m [36mthis[39m
           [90m   |[39m [31m[1m^[22m[39m
           [90m 2 |[39m is
           [90m 3 |[39m just an example and it is all fake data[33m,[39m yay[33m![39m[0m",
              "fileName": "/root/mybundle.js",
              "location": Object {
                "column": 0,
                "row": 1,
              },
            },
            "stack": Array [
              Object {
                "column": 0,
                "customPropShouldBeLeftUnchanged": "foo",
                "file": "/root/mybundle.js",
                "lineNumber": 1,
                "methodName": "clientSideMethodName",
              },
            ],
          }
        `);
      });

      test('should symbolicate function name if available', async () => {
        const response = await makeRequest('/symbolicate', {
          headers: {'content-type': 'application/json'},
          data: JSON.stringify({
            stack: [
              {
                file: `http://localhost:8081/mybundle.bundle${queryDelimiter}runModule=true`,
                lineNumber: 3,
                column: 18,
              },
            ],
          }),
        });

        expect(response._getJSON()).toMatchObject({
          stack: [
            expect.objectContaining({
              methodName: '<global>',
            }),
          ],
        });
      });

      test('should collapse frames as specified in customizeFrame', async () => {
        // NOTE: See implementation of symbolicator.customizeFrame above.

        const response = await makeRequest('/symbolicate', {
          headers: {'content-type': 'application/json'},
          data: JSON.stringify({
            stack: [
              {
                file: `http://localhost:8081/mybundle.bundle${queryDelimiter}runModule=true`,
                lineNumber: 3,
                column: 18,
              },
            ],
          }),
        });

        expect(response._getJSON()).toMatchObject({
          stack: [
            expect.objectContaining({
              file: '/root/foo.js',
              collapse: true,
            }),
          ],
        });
      });

      test('should transform frames as specified in customizeStack', async () => {
        // NOTE: See implementation of symbolicator.customizeStack above.

        const response = await makeRequest('/symbolicate', {
          headers: {'content-type': 'application/json'},
          data: JSON.stringify({
            stack: [
              {
                file: `http://localhost:8081/mybundle.bundle${queryDelimiter}runModule=true`,
                lineNumber: 3,
                column: 18,
              },
            ],
            extraData: {
              customAnnotation: 'Baz',
            },
          }),
        });

        expect(response._getJSON()).toMatchObject({
          stack: [
            expect.objectContaining({
              file: '/root/foo.js',
              wasCollapsedBefore: true,
              customAnnotation: 'Baz',
            }),
          ],
        });
      });

      test('should return null codeFrame when symbolicated file is not in the dependency graph', async () => {
        const depGraph = await getDependencyGraph();
        depGraph.doesFileExist.mockReturnValue(false);

        const response = await makeRequest('/symbolicate', {
          headers: {'content-type': 'application/json'},
          data: JSON.stringify({
            stack: [
              {
                file: `http://localhost:8081/mybundle.bundle${queryDelimiter}runModule=true`,
                lineNumber: 2,
                column: 18,
                methodName: 'clientSideMethodName',
              },
            ],
          }),
        });

        const result = response._getJSON();
        // Symbolication should still succeed
        expect(result.stack).toEqual([
          expect.objectContaining({
            file: '/root/mybundle.js',
            lineNumber: 1,
            column: 0,
            methodName: 'clientSideMethodName',
          }),
        ]);
        // But codeFrame should be null since the file is not in the dep graph
        expect(result.codeFrame).toBeNull();
      });

      // TODO: This probably should restore the *original* file before rewrite
      // or normalisation.
      test('should leave original file and position when cannot symbolicate (after normalisation and rewriting?)', async () => {
        const response = await makeRequest('/symbolicate', {
          headers: {'content-type': 'application/json'},
          data: JSON.stringify({
            stack: [
              {
                file: `http://localhost:8081/mybundle.bundle${queryDelimiter}runModule=true&foo__REMOVE_THIS_WHEN_REWRITING__=bar`,
                lineNumber: 200,
                column: 18,
                customPropShouldBeLeftUnchanged: 'foo',
                methodName: 'clientSideMethodName',
              },
            ],
          }),
        });

        expect(response._getJSON()).toMatchInlineSnapshot(`
                  Object {
                    "codeFrame": null,
                    "stack": Array [
                      Object {
                        "column": 18,
                        "customPropShouldBeLeftUnchanged": "foo",
                        "file": "http://localhost:8081/mybundle.bundle?runModule=true&foo=bar&TEST_URL_WAS_REWRITTEN=true",
                        "lineNumber": 200,
                        "methodName": "clientSideMethodName",
                      },
                    ],
                  }
              `);
      });
    },
  );

  describe('/symbolicate handles errors', () => {
    test.each([
      ['clearly-not-json'],
      ...['a string', null, [], 47, {}].map(input => [JSON.stringify(input)]),
    ])('should respond 400 on invalid input: %s', async body => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const response = await makeRequest('/symbolicate', {
        headers: {'content-type': 'application/json'},
        data: body,
      });
      expect(response.statusCode).toEqual(400);
      expect(response._getJSON()).toEqual({
        error:
          body === 'clearly-not-json'
            ? expect.stringContaining('not valid JSON')
            : 'Bad symbolication input, expected object with stack array, got: ' +
              body,
      });
      expect(errorSpy).not.toBeCalled();
    });

    test.each([
      [[], 'frame to be a JSON object'],
      ['', 'frame to be a JSON object'],
      [{file: 2}, 'file to be string or nullish'],
      [{methodName: 2}, 'methodName to be string or nullish'],
      [{lineNumber: 'foo'}, 'lineNumber to be number or nullish'],
      [{column: 'bar'}, 'column to be number or nullish'],
    ])(
      'should respond 400 on an invalid frame input: %s',
      async (frame, expectedReason) => {
        const errorSpy = jest
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        const response = await makeRequest('/symbolicate', {
          headers: {'content-type': 'application/json'},
          data: JSON.stringify({stack: [frame]}),
        });
        expect(response.statusCode).toEqual(400);
        expect(response._getJSON()).toEqual({
          error: 'Bad frame at line 0: Expected ' + expectedReason,
        });
        expect(errorSpy).not.toBeCalled();
      },
    );
  });
});
