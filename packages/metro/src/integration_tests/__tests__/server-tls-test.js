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
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const selfsigned = require('selfsigned');

jest.useRealTimers();
jest.setTimeout(60 * 1000);

describe('Metro development server with TLS configuration', () => {
  let httpServer;
  let serverClosedPromise;
  let tempDir;
  let keyFile;
  let certFile;
  let keyContent;
  let certContent;

  beforeAll(async () => {
    // Create temp directory for cert files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metro-tls-test-'));
    keyFile = path.join(tempDir, 'key.pem');
    certFile = path.join(tempDir, 'cert.pem');

    const selfSignedPems = await selfsigned.generate(
      [{name: 'commonName', value: 'localhost'}],
      {days: 1},
    );

    keyContent = selfSignedPems.private;
    certContent = selfSignedPems.cert;

    fs.writeFileSync(keyFile, keyContent, 'utf8');
    fs.writeFileSync(certFile, selfSignedPems.cert, 'utf8');
  });

  afterAll(() => {
    // Cleanup temp files
    if (tempDir) {
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
  });

  afterEach(async () => {
    if (httpServer) {
      httpServer.close();
      await serverClosedPromise;
      httpServer = null;
    }
  });

  test('should create HTTP server when no TLS config is provided', async () => {
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

    expect(httpServer).toBeInstanceOf(http.Server);
    expect(httpServer).not.toBeInstanceOf(https.Server);
  });

  test('should create HTTPS server when tls config with key/cert strings is provided', async () => {
    const config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

    config.server.tls = {key: keyContent, cert: certContent};

    let onCloseResolve;
    serverClosedPromise = new Promise(resolve => (onCloseResolve = resolve));

    ({httpServer} = await Metro.runServer(config, {
      reporter: {update() {}},
      onClose: () => {
        onCloseResolve();
      },
    }));

    expect(httpServer).toBeInstanceOf(https.Server);
  });

  test('should create HTTPS server with secureServerOptions', async () => {
    const config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

    let onCloseResolve;
    serverClosedPromise = new Promise(resolve => (onCloseResolve = resolve));

    ({httpServer} = await Metro.runServer(config, {
      reporter: {update() {}},
      secureServerOptions: {key: keyContent, cert: certContent},
      onClose: () => {
        onCloseResolve();
      },
    }));

    expect(httpServer).toBeInstanceOf(https.Server);
  });

  test('should create HTTPS server with deprecated secureKey/secureCert file paths', async () => {
    const config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

    let onCloseResolve;
    serverClosedPromise = new Promise(resolve => (onCloseResolve = resolve));

    // Suppress deprecation warning for test
    const originalWarn = console.warn;
    console.warn = jest.fn();

    try {
      ({httpServer} = await Metro.runServer(config, {
        reporter: {update() {}},
        secure: true,
        secureKey: keyFile,
        secureCert: certFile,
        onClose: () => {
          onCloseResolve();
        },
      }));

      expect(httpServer).toBeInstanceOf(https.Server);
      expect(console.warn).toHaveBeenCalled();
    } finally {
      console.warn = originalWarn;
    }
  });

  test('tls config should take precedence over secureKey/secureCert', async () => {
    const config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

    // Set tls config with valid certs
    config.server.tls = {key: keyContent, cert: certContent};

    let onCloseResolve;
    serverClosedPromise = new Promise(resolve => (onCloseResolve = resolve));

    // Suppress deprecation warning for test
    const originalWarn = console.warn;
    console.warn = jest.fn();

    try {
      // Pass invalid file paths - if tls config takes precedence, these won't be read
      ({httpServer} = await Metro.runServer(config, {
        reporter: {update() {}},
        secure: true,
        secureKey: '/nonexistent/key.pem',
        secureCert: '/nonexistent/cert.pem',
        onClose: () => {
          onCloseResolve();
        },
      }));

      // Server should start successfully using tls config
      expect(httpServer).toBeInstanceOf(https.Server);
    } finally {
      console.warn = originalWarn;
    }
  });

  test('secureServerOptions should merge with tls config', async () => {
    const config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

    // Set tls config with key/cert
    config.server.tls = {key: keyContent, cert: certContent};

    let onCloseResolve;
    serverClosedPromise = new Promise(resolve => (onCloseResolve = resolve));

    ({httpServer} = await Metro.runServer(config, {
      reporter: {update() {}},
      // secureServerOptions should be spread into the options
      secureServerOptions: {
        // This option should be merged in
        rejectUnauthorized: false,
      },
      onClose: () => {
        onCloseResolve();
      },
    }));

    expect(httpServer).toBeInstanceOf(https.Server);
  });
});
