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

// Preloaded with --require into every Node.js process of a benchmarked server.
// In the process whose HTTP(S) server listens on METRO_BENCHMARK_PORT, serves a
// heap probe on a free local port: GET / forces two full GCs and responds with
// `process.memoryUsage()` as JSON. METRO_BENCHMARK_PROBE_FILE receives
// `{"port": <probe port>, "serverHost": <address the server listens on>}`.

const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const v8 = require('node:v8');
const vm = require('node:vm');

const serverPort = Number(process.env.METRO_BENCHMARK_PORT);
const probeFile = process.env.METRO_BENCHMARK_PROBE_FILE;

if (serverPort > 0 && probeFile != null) {
  const listen = net.Server.prototype.listen;
  let started = false;
  net.Server.prototype.listen = function (...args) {
    this.once('listening', () => {
      const address = this.address();
      if (
        !started &&
        (this instanceof http.Server || this instanceof https.Server) &&
        address?.port === serverPort
      ) {
        started = true;
        startProbe(probeFile, address.address);
      }
    });
    return listen.apply(this, args);
  };
}

function startProbe(file, serverHost) {
  v8.setFlagsFromString('--expose-gc');
  const gc = vm.runInNewContext('gc');
  const probe = http.createServer((req, res) => {
    gc();
    gc();
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(process.memoryUsage()));
  });
  probe.listen(0, '127.0.0.1', () => {
    fs.writeFileSync(
      file,
      JSON.stringify({port: probe.address().port, serverHost}),
    );
  });
  probe.unref();
}
