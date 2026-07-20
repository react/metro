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

import type {TransformResultDependency} from '../DeltaBundler/types';
import type {Client} from '../HmrServer';
import type {InputConfigT} from 'metro-config';
import type {HmrClientMessage} from 'metro-runtime/src/modules/types';

import DeltaBundler from '../DeltaBundler';
import HmrServer from '../HmrServer';
import IncrementalBundler from '../IncrementalBundler';
import getGraphId from '../lib/getGraphId';
import {mergeConfig} from 'metro-config';
import EventEmitter from 'node:events';

const {
  getDefaultConfig: {getDefaultValues},
} = require('metro-config');

jest.mock('../lib/transformHelpers', () => ({
  getResolveDependencyFn:
    () => (from: string, to: TransformResultDependency) => ({
      type: 'sourceFile',
      filePath: `${require('node:path').resolve(from, to.name)}.js`,
    }),
}));

jest.mock('../IncrementalBundler');

describe('HmrServer', () => {
  let hmrServer;
  let incrementalBundlerMock;
  const getRevisionMock = jest.fn();
  const getRevisionByGraphIdMock = jest.fn();
  let changeEventSource;
  let deltaBundlerMock;
  let mockedGraph;
  let connect;
  let message;
  let id;
  const updateGraphMock = jest.fn();

  const hiModule = {
    dependencies: new Map<$FlowFixMe, $FlowFixMe>(),
    inverseDependencies: new Set<$FlowFixMe>(),
    path: '/root/hi',
    getSource: () => "alert('hi');",
    output: [
      {
        type: 'js/module',
        data: {
          map: [],
          code: '__d(function() { alert("hi"); });',
          lineCount: 1,
        },
      },
    ],
  };

  const changeHandlerPromises = new Set<$FlowFixMe>();
  async function waitForAllChangeHandlers() {
    const promisesArray = [...changeHandlerPromises];
    changeHandlerPromises.clear();
    await Promise.all(promisesArray);
  }

  async function emitChangeEvent() {
    // TODO: Can we achieve this with less mocking / special-casing?
    jest.useFakeTimers();
    changeEventSource.emit('change');
    jest.runAllTimers();
    jest.useRealTimers();
    await waitForAllChangeHandlers();
  }

  beforeEach(() => {
    mockedGraph = {
      dependencies: new Map<$FlowFixMe, $FlowFixMe>(),
      entryPoint: '/root/EntryPoint.js',
    };
    changeHandlerPromises.clear();

    changeEventSource = new EventEmitter();
    deltaBundlerMock = new DeltaBundler(changeEventSource);

    jest
      .spyOn(deltaBundlerMock, 'listen')
      .mockImplementation((graph, callback) => {
        changeEventSource.on('change', (...args) => {
          const promise = callback(...args);
          changeHandlerPromises.add(promise);
          return promise;
        });

        return () => {
          changeEventSource.removeListener('change', callback);
        };
      });

    getRevisionMock.mockReturnValue(
      Promise.resolve({graph: mockedGraph, id: 'rev0'}),
    );
    getRevisionByGraphIdMock.mockReturnValue(
      Promise.resolve({graph: mockedGraph, id: 'rev0'}),
    );
    updateGraphMock.mockResolvedValue({
      revision: {
        id: 'rev0',
        graph: mockedGraph,
      },
      delta: {
        added: new Map(),
        modified: new Map(),
        deleted: new Set(),
      },
    });

    const config = mergeConfig(getDefaultValues('/root'), {
      serializer: {experimentalSerializerHook: () => {}},
      reporter: {update: jest.fn()},
      transformer: {
        unstable_allowRequireContext: false,
      },
      resolver: {platforms: []},
      server: {
        rewriteRequestUrl(requrl) {
          const rewritten = requrl.replace(
            /__REMOVE_THIS_WHEN_REWRITING__/g,
            '',
          );
          if (rewritten !== requrl) {
            return rewritten + '&TEST_URL_WAS_REWRITTEN=true';
          }
          return requrl;
        },
      },
    } as InputConfigT);

    incrementalBundlerMock = new IncrementalBundler(config);
    jest
      .spyOn(incrementalBundlerMock, 'getDeltaBundler')
      .mockImplementation(() => deltaBundlerMock);
    jest
      .spyOn(incrementalBundlerMock, 'getRevision')
      .mockImplementation(getRevisionMock);
    jest
      .spyOn(incrementalBundlerMock, 'getRevisionByGraphId')
      .mockImplementation(getRevisionByGraphIdMock);
    jest
      .spyOn(incrementalBundlerMock, 'updateGraph')
      .mockImplementation(updateGraphMock);
    jest
      .spyOn(incrementalBundlerMock, 'getBundler')
      .mockImplementation(() => {});

    id = config.serializer.createModuleIdFactory();

    // $FlowFixMe[underconstrained-implicit-instantiation]
    hmrServer = new HmrServer(incrementalBundlerMock, id, config);

    connect = async (
      relativeUrl: string,
      sendFn?: string => void,
      {baseUrl = 'ws://localhost'}: {baseUrl?: string} = {},
    ) => {
      const absoluteUrl = baseUrl + relativeUrl;
      const client = await hmrServer.onClientConnect(
        absoluteUrl,
        sendFn || jest.fn(),
      );
      await message(
        client,
        {
          type: 'register-entrypoints',
          entryPoints: [absoluteUrl],
        },
        sendFn,
      );
      return client;
    };

    message = async (
      client: Client,
      message: HmrClientMessage,
      sendFn?: string => void,
    ) => {
      await hmrServer.onClientMessage(
        client,
        JSON.stringify(message),
        sendFn || jest.fn(),
      );
    };
  });

  test('should retrieve the correct graph from the incremental bundler (graphId)', async () => {
    await connect('/hot?bundleEntry=EntryPoint.js&platform=ios');

    expect(getRevisionByGraphIdMock).toBeCalledWith(
      getGraphId(
        '/root/EntryPoint.js',
        {
          customTransformOptions: {},
          dev: true,
          minify: false,
          platform: 'ios',
          type: 'module',
          unstable_transformProfile: 'default',
        },
        {
          shallow: false,
          lazy: false,
          unstable_allowRequireContext: false,
          resolverOptions: {
            dev: true,
          },
        },
      ),
    );
  });

  test('should retrieve for relative urls without host and protocol', async () => {
    expect(
      connect('/hot?bundleEntry=EntryPoint.js&platform=ios', undefined, {
        baseUrl: '',
      }),
    ).rejects.toThrowError(
      'Expecting the request url to have a valid protocol, e.g. "http://", "https://", or "//"',
    );
  });

  test('should retrieve for non standard protocols', async () => {
    await connect('/hot?bundleEntry=EntryPoint.js&platform=ios', undefined, {
      baseUrl: 'foo://localhost',
    });

    expect(getRevisionByGraphIdMock).toBeCalledWith(
      getGraphId(
        '/root/EntryPoint.js',
        {
          customTransformOptions: {},
          dev: true,
          minify: false,
          platform: 'ios',
          type: 'module',
          unstable_transformProfile: 'default',
        },
        {
          shallow: false,
          lazy: false,
          unstable_allowRequireContext: false,
          resolverOptions: {
            dev: true,
          },
        },
      ),
    );
  });

  test('should retrieve the correct graph when there are extra params', async () => {
    await connect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios&unusedExtraParam=42',
    );

    expect(getRevisionByGraphIdMock).toBeCalledWith(
      getGraphId(
        '/root/EntryPoint.js',
        {
          customTransformOptions: {},
          dev: true,
          minify: false,
          platform: 'ios',
          type: 'module',
          unstable_transformProfile: 'default',
        },
        {
          shallow: false,
          lazy: false,
          unstable_allowRequireContext: false,
          resolverOptions: {
            dev: true,
          },
        },
      ),
    );
  });

  test('should rewrite URLs before retrieving the graph', async () => {
    await connect(
      '/hot?bundleEntry=Entry__REMOVE_THIS_WHEN_REWRITING__Point.js&platform=ios',
    );

    expect(getRevisionByGraphIdMock).toBeCalledWith(
      getGraphId(
        '/root/EntryPoint.js',
        {
          customTransformOptions: {},
          dev: true,
          minify: false,
          platform: 'ios',
          type: 'module',
          unstable_transformProfile: 'default',
        },
        {
          shallow: false,
          lazy: false,
          unstable_allowRequireContext: false,
          resolverOptions: {
            dev: true,
          },
        },
      ),
    );
  });

  test('should send an error message when the graph cannot be found', async () => {
    const sendMessage = jest.fn();
    getRevisionByGraphIdMock.mockReturnValueOnce(undefined);

    await connect('/hot?bundleEntry=EntryPoint.js&platform=ios', sendMessage);

    const expectedMessage = `The graph \`${getGraphId(
      '/root/EntryPoint.js',
      {
        customTransformOptions: {},
        dev: true,
        minify: false,
        platform: 'ios',
        type: 'module',
        unstable_transformProfile: 'default',
      },
      {
        shallow: false,
        lazy: false,
        unstable_allowRequireContext: false,
        resolverOptions: {
          dev: true,
        },
      },
    )}\` was not found.`;

    const sentErrorMessage = JSON.parse(sendMessage.mock.calls[0][0]);
    expect(sentErrorMessage).toMatchObject({type: 'error'});
    expect(sentErrorMessage.body).toMatchObject({
      type: 'GraphNotFoundError',
      message: expectedMessage,
      errors: [],
    });
  });

  test('should send an initial update when a client connects', async () => {
    const sendMessage = jest.fn();

    updateGraphMock.mockResolvedValue({
      revision: {
        id: 'rev0',
        graph: mockedGraph,
      },
      delta: {
        added: new Map(),
        modified: new Map([[hiModule.path, hiModule]]),
        deleted: new Set(['/root/bye']),
      },
    });

    await connect('/hot?bundleEntry=EntryPoint.js&platform=ios', sendMessage);

    const messages = sendMessage.mock.calls.map(call => JSON.parse(call[0]));
    expect(messages).toMatchObject([
      {
        type: 'update-start',
      },
      {
        type: 'update',
        body: {
          revisionId: 'rev0',
          added: [],
          modified: [
            {
              module: [
                id('/root/hi'),
                '__d(function() { alert("hi"); },' +
                  id('/root/hi') +
                  ',[],"hi",{});\n' +
                  '//# sourceMappingURL=http://localhost/hi.map?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true\n' +
                  '//# sourceURL=http://localhost/hi.bundle//&platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true\n',
              ],
              sourceMappingURL:
                'http://localhost/hi.map?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
              sourceURL:
                'http://localhost/hi.bundle//&platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
            },
          ],
          deleted: [id('/root/bye')],
        },
      },
      {
        type: 'update-done',
      },
      {
        type: 'bundle-registered',
      },
    ]);
  });

  test('should send the same update to all connected clients', async () => {
    const sendMessage1 = jest.fn();
    const sendMessage2 = jest.fn();

    const client = await connect('/hot?platform=ios', sendMessage1);
    const client2 = await connect('/hot?platform=ios', sendMessage2);

    await message(
      client,
      {
        type: 'register-entrypoints',
        entryPoints: [
          'http://localhost/hot?bundleEntry=EntryPoint.js&platform=ios',
        ],
      },
      sendMessage1,
    );
    await message(
      client2,
      {
        type: 'register-entrypoints',
        entryPoints: [
          'http://localhost/hot?bundleEntry=EntryPoint.js&platform=ios',
        ],
      },
      sendMessage2,
    );

    sendMessage1.mockReset();
    sendMessage2.mockReset();

    updateGraphMock.mockResolvedValue({
      revision: {
        id: 'rev0',
        graph: mockedGraph,
      },
      delta: {
        added: new Map(),
        modified: new Map([[hiModule.path, hiModule]]),
        deleted: new Set(['/root/bye']),
      },
    });
    await emitChangeEvent();

    const messages1 = sendMessage1.mock.calls.map(call => JSON.parse(call[0]));
    const messages2 = sendMessage2.mock.calls.map(call => JSON.parse(call[0]));

    expect(messages1).toMatchObject([
      {
        type: 'update-start',
      },
      {
        type: 'update',
        body: {
          revisionId: 'rev0',
          added: [],
          modified: [
            {
              module: [
                id('/root/hi'),
                '__d(function() { alert("hi"); },' +
                  id('/root/hi') +
                  ',[],"hi",{});\n' +
                  '//# sourceMappingURL=http://localhost/hi.map?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true\n' +
                  '//# sourceURL=http://localhost/hi.bundle//&platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true\n',
              ],

              sourceURL:
                'http://localhost/hi.bundle//&platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
              sourceMappingURL:
                'http://localhost/hi.map?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
            },
          ],
          deleted: [id('/root/bye')],
        },
      },
      {
        type: 'update-done',
      },
    ]);
    expect(messages1).toEqual(messages2);
  });

  test('should return the correctly formatted HMR message after a file change', async () => {
    const sendMessage = jest.fn();

    await connect('/hot?bundleEntry=EntryPoint.js&platform=ios', sendMessage);

    sendMessage.mockReset();

    updateGraphMock.mockResolvedValue({
      revision: {
        id: 'rev1',
        graph: mockedGraph,
      },
      delta: {
        added: new Map(),
        modified: new Map([[hiModule.path, hiModule]]),
        deleted: new Set(['/root/bye']),
      },
    });

    await emitChangeEvent();

    const messages = sendMessage.mock.calls.map(call => JSON.parse(call[0]));

    expect(messages).toMatchObject([
      {
        type: 'update-start',
      },
      {
        type: 'update',
        body: {
          revisionId: 'rev1',
          added: [],
          modified: [
            {
              module: [
                id('/root/hi'),
                '__d(function() { alert("hi"); },' +
                  id('/root/hi') +
                  ',[],"hi",{});\n' +
                  '//# sourceMappingURL=http://localhost/hi.map?platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true\n' +
                  '//# sourceURL=http://localhost/hi.bundle//&platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true\n',
              ],
              sourceURL:
                'http://localhost/hi.bundle//&platform=ios&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
            },
          ],
          deleted: [id('/root/bye')],
        },
      },
      {
        type: 'update-done',
      },
    ]);
  });

  test('should propagate extra params to module URLs', async () => {
    const sendMessage = jest.fn();

    await connect(
      '/hot?bundleEntry=EntryPoint.js&platform=ios&unusedExtraParam=42',
      sendMessage,
    );

    sendMessage.mockReset();

    updateGraphMock.mockResolvedValue({
      revision: {
        id: 'rev1',
        graph: mockedGraph,
      },
      delta: {
        added: new Map(),
        modified: new Map([[hiModule.path, hiModule]]),
        deleted: new Set(['/root/bye']),
      },
    });

    await emitChangeEvent();

    const messages = sendMessage.mock.calls.map(call => JSON.parse(call[0]));

    expect(messages).toMatchObject([
      {
        type: 'update-start',
      },
      {
        type: 'update',
        body: {
          revisionId: 'rev1',
          added: [],
          modified: [
            {
              module: expect.any(Array),
              sourceURL:
                'http://localhost/hi.bundle//&platform=ios&unusedExtraParam=42&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
            },
          ],
          deleted: [id('/root/bye')],
        },
      },
      {
        type: 'update-done',
      },
    ]);
  });

  test('should propagate rewritten URL params to module URLs', async () => {
    const sendMessage = jest.fn();

    await connect(
      '/hot?bundleEntry=Entry__REMOVE_THIS_WHEN_REWRITING__Point.js&platform=ios',
      sendMessage,
    );

    sendMessage.mockReset();

    updateGraphMock.mockResolvedValue({
      revision: {
        id: 'rev1',
        graph: mockedGraph,
      },
      delta: {
        added: new Map(),
        modified: new Map([[hiModule.path, hiModule]]),
        deleted: new Set(['/root/bye']),
      },
    });

    await emitChangeEvent();

    const messages = sendMessage.mock.calls.map(call => JSON.parse(call[0]));

    expect(messages).toMatchObject([
      {
        type: 'update-start',
      },
      {
        type: 'update',
        body: {
          revisionId: 'rev1',
          added: [],
          modified: [
            {
              module: expect.any(Array),
              sourceURL:
                'http://localhost/hi.bundle//&platform=ios&TEST_URL_WAS_REWRITTEN=true&dev=true&minify=false&modulesOnly=true&runModule=false&shallow=true',
            },
          ],
          deleted: [id('/root/bye')],
        },
      },
      {
        type: 'update-done',
      },
    ]);
  });

  test('should return error messages when there is a transform error', async () => {
    jest.useRealTimers();
    const sendMessage = jest.fn();

    await connect('/hot?bundleEntry=EntryPoint.js&platform=ios', sendMessage);

    sendMessage.mockReset();

    updateGraphMock.mockImplementation(() => {
      const transformError = new TransformError('test syntax error');
      transformError.filename = 'EntryPoint.js';
      transformError.lineNumber = 123;
      throw transformError;
    });

    await emitChangeEvent();

    const messages = sendMessage.mock.calls.map(call => JSON.parse(call[0]));

    expect(messages).toMatchObject([
      {
        type: 'update-start',
      },
      {
        type: 'error',
        body: {
          type: 'TransformError',
          message: 'test syntax error',
          errors: [
            {
              description: 'test syntax error',
              filename: 'EntryPoint.js',
              lineNumber: 123,
            },
          ],
        },
      },
      {
        type: 'update-done',
      },
    ]);
  });
});

class TransformError extends SyntaxError {
  readonly type: string = 'TransformError';
  filename: string;
}
