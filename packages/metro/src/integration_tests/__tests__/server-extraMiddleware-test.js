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

  test('calls unstable_onServerCreated before listening', async () => {
    const events = [];
    await startServer(await loadConfig(), {
      unstable_onServerCreated: metroServer => {
        events.push(metroServer instanceof MetroServer);
      },
      onReady: () => {
        events.push('ready');
      },
    });

    expect(events).toEqual([true, 'ready']);
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
