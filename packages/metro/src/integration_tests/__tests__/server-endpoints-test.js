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
const http = require('node:http');
const https = require('node:https');
const selfsigned = require('selfsigned');
const WebSocket = require('ws');

jest.useRealTimers();
jest.setTimeout(60 * 1000);

function checkHttpEndpoint(
  port: number,
  secure: boolean,
): Promise<{
  success: boolean,
  status: number,
  url: string,
}> {
  const protocol = secure ? 'https' : 'http';
  const url = `${protocol}://localhost:${port}/TestBundle.bundle?platform=ios&dev=true&minify=false`;
  const client = secure ? https : http;
  const options = secure ? {rejectUnauthorized: false} : {};

  return new Promise((resolve, reject) => {
    const req = client.get(url, options, res => {
      // Consume the response body to properly close the connection
      res.on('data', () => {});
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({success: true, status: res.statusCode, url});
        } else {
          reject(new Error(`Metro returned status ${res.statusCode}`));
        }
      });
    });

    req.on('error', err => {
      reject(new Error(`Failed to connect to ${url}: ${err.message}`));
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error(`Request to ${url} timed out`));
    });
  });
}

function checkWebSocket(
  port: number,
  secure: boolean,
): Promise<{
  success: boolean,
  message: string,
  url: string,
}> {
  const protocol = secure ? 'wss' : 'ws';
  const url = `${protocol}://localhost:${port}/hot`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      rejectUnauthorized: false,
    });

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`WebSocket connection to ${url} timed out`));
    }, 5000);

    ws.on('open', () => {
      clearTimeout(timeout);
      ws.close();
      resolve({
        success: true,
        message: 'WebSocket connection established',
        url,
      });
    });

    ws.on('error', err => {
      clearTimeout(timeout);
      reject(
        new Error(`WebSocket connection to ${url} failed: ${err.message}`),
      );
    });
  });
}

describe('Metro development server endpoints', () => {
  let httpServer;
  let serverClosedPromise;
  let port;

  afterEach(async () => {
    if (httpServer) {
      httpServer.close();
      await serverClosedPromise;
      httpServer = null;
    }
  });

  describe('HTTP server (no TLS)', () => {
    beforeEach(async () => {
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

      port = httpServer.address().port;
    });

    test('HTTP endpoint is reachable', async () => {
      const result = await checkHttpEndpoint(port, false);
      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
    });

    test('WS /hot endpoint is reachable', async () => {
      const result = await checkWebSocket(port, false);
      expect(result.success).toBe(true);
    });

    test('HTTPS endpoint is not reachable on HTTP server', async () => {
      await expect(checkHttpEndpoint(port, true)).rejects.toThrow();
    });

    test('WSS /hot endpoint is not reachable on HTTP server', async () => {
      await expect(checkWebSocket(port, true)).rejects.toThrow();
    });
  });

  describe('HTTPS server (with TLS)', () => {
    beforeEach(async () => {
      const config = await Metro.loadConfig({
        config: require.resolve('../metro.config.js'),
      });

      const selfSignedPems = await selfsigned.generate(
        [{name: 'commonName', value: 'localhost'}],
        {days: 1},
      );
      config.server.tls = {
        key: selfSignedPems.private,
        cert: selfSignedPems.cert,
      };

      let onCloseResolve;
      serverClosedPromise = new Promise(resolve => (onCloseResolve = resolve));

      ({httpServer} = await Metro.runServer(config, {
        reporter: {update() {}},
        onClose: () => {
          onCloseResolve();
        },
      }));

      port = httpServer.address().port;
    });

    test('HTTPS endpoint is reachable', async () => {
      const result = await checkHttpEndpoint(port, true);
      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
    });

    test('WSS /hot endpoint is reachable', async () => {
      const result = await checkWebSocket(port, true);
      expect(result.success).toBe(true);
    });

    test('HTTP endpoint is not reachable on HTTPS server', async () => {
      await expect(checkHttpEndpoint(port, false)).rejects.toThrow();
    });

    test('WS /hot endpoint is not reachable on HTTPS server', async () => {
      await expect(checkWebSocket(port, false)).rejects.toThrow();
    });
  });
});
