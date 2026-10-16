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
const MetroServer = require('../../Server').default;
const WebSocket = require('ws');

jest.useRealTimers();
jest.setTimeout(60 * 1000);

// Workaround for https://github.com/nodejs/node/issues/54484:
// Fetch with {Connection: 'close'} to prevent Node reusing connections across tests
const fetchAndClose = (path: string) =>
  fetch(path, {
    headers: {Connection: 'close'},
  });

const BUNDLE_PATH = '/TestBundle.bundle?platform=ios&dev=true&minify=false';

describe('runServer custom middleware', () => {
  let httpServer;
  let serverClosedPromise;

  const loadConfig = (server: {...} = {}) =>
    Metro.loadConfig({config: require.resolve('../metro.config.js')}, {server});

  async function startServer(config: {...}, options: {...} = {}) {
    let onCloseResolve;
    serverClosedPromise = new Promise(resolve => (onCloseResolve = resolve));
    ({httpServer} = await Metro.runServer(config, {
      reporter: {update() {}},
      onClose: () => {
        onCloseResolve();
      },
      ...options,
    }));
  }

  // Reads the body: undici crashes if the server closes the socket while an
  // unread body is paused.
  const request = async (pathname: string) => {
    const response = await fetchAndClose(
      'http://localhost:' + httpServer.address().port + pathname,
    );
    return {status: response.status, text: await response.text()};
  };

  afterEach(async () => {
    if (httpServer != null) {
      httpServer.close();
      await serverClosedPromise;
      httpServer = null;
    }
  });

  test('mounts config middleware inside framework middleware', async () => {
    const calls = [];
    const record =
      (name: string) =>
      (req, res, next): void => {
        calls.push(name);
        next();
      };
    const config = await loadConfig({
      unstable_priorityMiddleware: [record('config priority')],
      unstable_middleware: [record('config middleware')],
    });
    await startServer(config, {
      unstable_priorityMiddleware: [record('framework priority')],
      unstable_middleware: [
        record('framework middleware'),
        (req, res) => {
          res.end('not found');
        },
      ],
    });

    expect((await request(BUNDLE_PATH)).status).toBe(200);
    expect(calls).toEqual(['framework priority', 'config priority']);

    calls.length = 0;
    expect((await request('/unhandled')).text).toBe('not found');
    expect(calls).toEqual([
      'framework priority',
      'config priority',
      'config middleware',
      'framework middleware',
    ]);
  });

  test('mounts deprecated unstable_extraMiddleware before unstable_priorityMiddleware', async () => {
    const calls = [];
    await startServer(await loadConfig(), {
      unstable_extraMiddleware: [
        (req, res, next) => {
          calls.push('extra');
          next();
        },
      ],
      unstable_priorityMiddleware: [
        (req, res, next) => {
          calls.push('framework priority');
          next();
        },
      ],
    });

    expect((await request(BUNDLE_PATH)).status).toBe(200);
    expect(calls).toEqual(['extra', 'framework priority']);
  });

  test('mounts entries with a path using connect semantics', async () => {
    const config = await loadConfig({
      unstable_priorityMiddleware: [
        [
          '/custom',
          (req, res) => {
            res.end(`${req.url} ${req.originalUrl}`);
          },
        ],
      ],
    });
    await startServer(config);

    expect((await request('/custom/a')).text).toBe('/a /custom/a');
    expect((await request(BUNDLE_PATH)).status).toBe(200);
  });

  const greetingServer = (greeting: string) => {
    const wss = new WebSocket.Server({noServer: true});
    wss.on('connection', socket => socket.send(greeting));
    return wss;
  };

  const receiveGreeting = (pathname: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(
        `ws://localhost:${httpServer.address().port}${pathname}`,
      );
      ws.on('message', data => {
        ws.close();
        resolve(String(data));
      });
      ws.on('error', reject);
    });

  test('serves config websocket endpoints', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const wss = greetingServer('hello');
    await startServer(
      await loadConfig({unstable_websocketEndpoints: {'/custom-ws': wss}}),
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();

    expect(await receiveGreeting('/custom-ws')).toBe('hello');
    wss.close();
  });

  test('runServer websocket endpoints win over config ones', async () => {
    const configWss = greetingServer('config');
    const frameworkWss = greetingServer('framework');
    await startServer(
      await loadConfig({
        unstable_websocketEndpoints: {'/custom-ws': configWss},
      }),
      {websocketEndpoints: {'/custom-ws': frameworkWss}},
    );

    expect(await receiveGreeting('/custom-ws')).toBe('framework');
    configWss.close();
    frameworkWss.close();
  });

  test('a supplied /hot is ignored with a warning', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const wss = new WebSocket.Server({noServer: true});
    const onConnection = jest.fn();
    wss.on('connection', onConnection);
    await startServer(
      await loadConfig({unstable_websocketEndpoints: {'/hot': wss}}),
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('WARNING'),
      expect.stringContaining('`/hot`'),
    );
    warn.mockRestore();
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(
        `ws://localhost:${httpServer.address().port}/hot`,
      );
      ws.on('open', () => {
        ws.close();
        resolve();
      });
      ws.on('error', reject);
    });
    expect(onConnection).not.toHaveBeenCalled();
    wss.close();
  });

  test('calls config, then runServer unstable_onServerCreated, before listening', async () => {
    const events = [];
    await startServer(
      await loadConfig({
        unstable_onServerCreated: metroServer => {
          events.push(['config', metroServer instanceof MetroServer]);
        },
      }),
      {
        unstable_onServerCreated: metroServer => {
          events.push(['runServer', metroServer instanceof MetroServer]);
        },
        onReady: () => {
          events.push('ready');
        },
      },
    );

    expect(events).toEqual([['config', true], ['runServer', true], 'ready']);
  });

  test('does not warn for the default server.enhanceMiddleware', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await startServer(await loadConfig());

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test('warns when server.enhanceMiddleware is set', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await startServer(
      await loadConfig({enhanceMiddleware: middleware => middleware}),
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('DEPRECATED'),
      expect.stringContaining('`server.enhanceMiddleware`'),
    );
    expect((await request(BUNDLE_PATH)).status).toBe(200);
    warn.mockRestore();
  });
});
