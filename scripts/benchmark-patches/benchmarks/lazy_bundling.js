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

const {change, formatPct, stats} = require('../stats');
const {spawn} = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const METRO_CLI = path.resolve(__dirname, '../../../packages/metro/src/cli.js');
const HEAP_PROBE = path.resolve(__dirname, '../heap-probe.js');

const HELP = `  lazy_bundling [--server-command=CMD] [--chunks=N] [--query=QUERY]
                <entry>:<platform>...
    Starts a dev server, requests each entry's lazy dev bundle, then up to N
    lazy chunks, as an app loads them, and reports, vs unpatched with
    Welch's t, the heap the chunk graphs add to the server (Δ memory) and the
    time of all chunk requests (Δ time), and whether every run's bundles are
    byte-identical to unpatched. Heap is heapUsed in the server process after
    two forced GCs. Chunks are the async dependency bundles named in the main
    bundle and then in each chunk, breadth first, requested one at a time.

    <entry>:<platform>    Entry point relative to the server root, and
                          platform. E.g. index.js:ios
    --server-command=CMD  Space-separated command that starts a dev server and
                          accepts --port (default: this checkout's
                          \`metro serve\`). Its Node.js processes run with
                          --require=heap-probe.js.
    --chunks=N            Chunks to request per run (default: 20).
    --query=QUERY         Extra query for the entry's bundle URL, e.g.
                          app=com.example. Chunk URLs inherit it.

    Runs keep the server's cache stores, so the warmup run fills them.
    Progress lines also show the main bundle time and the heap after it. The
    main bundle time includes startup work the server does after it starts
    listening, such as updating its file map: a patch applied in a watched
    directory makes that work longer for the patched variant.
`;

const OPTIONS = {
  chunks: {type: 'string'},
  query: {type: 'string'},
  'server-command': {type: 'string'},
};

const SERVER_START_TIMEOUT_MS = 10 * 60 * 1000;

const MEMORY = {digits: 1, unit: 'MB', value: r => r.heapChunksMB};
const TIME = {digits: 2, unit: 's', value: r => r.chunkTotalMs / 1000};

function parseTargets(specs, options) {
  const serverCommand = options['server-command']?.split(' ') ?? [
    process.execPath,
    METRO_CLI,
    'serve',
  ];
  const chunks = Number(options.chunks ?? '20');
  if (!Number.isInteger(chunks) || chunks < 1) {
    throw new Error(
      `--chunks must be an integer >= 1, got "${options.chunks}"`,
    );
  }
  return specs.map(spec => {
    const [entry, platform] = spec.split(':');
    if (platform == null) {
      throw new Error(`Missing platform in "${spec}"`);
    }
    const query = new URLSearchParams({
      platform,
      dev: 'true',
      minify: 'false',
      lazy: 'true',
    });
    for (const [key, value] of new URLSearchParams(options.query ?? '')) {
      query.set(key, value);
    }
    const extension = path.extname(entry);
    return {
      bundlePath: `/${entry.slice(0, entry.length - extension.length)}.bundle?${query.toString()}`,
      chunks,
      name: `${path.basename(entry, extension)}-${platform}`,
      serverCommand,
    };
  });
}

// A lazy bundle names each async dependency's bundle URL in the dependency map
// of the module that imports it: `__d(..., {..., "paths": {"<id>": "<url>"}})`.
function getAsyncBundlePaths(code) {
  const paths = [];
  for (const match of code.matchAll(/"paths":(\{[^{}]*\})/g)) {
    for (const value of Object.values(JSON.parse(match[1]))) {
      if (typeof value === 'string') {
        paths.push(value);
      }
    }
  }
  return paths;
}

// Bundles embed the server's origin, whose port changes every run.
function withoutOrigin(body, origin) {
  return Buffer.from(body.toString().replaceAll(origin, 'http://metro-server'));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const {port} = server.address();
      server.close(() => resolve(port));
    });
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    http
      .get(url, response => {
        const parts = [];
        response.on('data', part => parts.push(part));
        response.on('error', reject);
        response.on('end', () => {
          const body = Buffer.concat(parts);
          if (response.statusCode !== 200) {
            reject(
              new Error(
                `GET ${url} responded ${response.statusCode}: ` +
                  body.toString('utf8', 0, 2000),
              ),
            );
            return;
          }
          resolve({body, ms: performance.now() - start});
        });
      })
      .on('error', reject);
  });
}

async function getHeapUsedMB(probePort) {
  const {body} = await get(`http://127.0.0.1:${probePort}/`);
  return JSON.parse(body.toString()).heapUsed / 1e6;
}

// Resolves to the heap probe's port and the server's origin, once the server
// listens.
async function waitForProbe(server, probeFile) {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (server.closed !== true) {
    if (Date.now() > deadline) {
      throw new Error(
        `Server did not listen on port ${server.port} within ` +
          `${SERVER_START_TIMEOUT_MS / 60000} minutes`,
      );
    }
    const probe = fs.existsSync(probeFile)
      ? JSON.parse(fs.readFileSync(probeFile, 'utf8') || 'null')
      : null;
    if (probe != null) {
      // A server listening on all addresses also accepts IPv4 loopback.
      const host =
        probe.serverHost === '::' || probe.serverHost === '0.0.0.0'
          ? '127.0.0.1'
          : probe.serverHost;
      return {
        origin: `http://${net.isIPv6(host) ? `[${host}]` : host}:${server.port}`,
        probePort: probe.port,
      };
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(
    `Server exited before listening: ${server.error ?? server.process.signalCode ?? server.process.exitCode}`,
  );
}

function killGroup(server, signal) {
  if (server.process.pid == null) {
    return;
  }
  try {
    process.kill(-server.process.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') {
      throw error;
    }
  }
}

async function stop(server) {
  if (server.closed !== true) {
    killGroup(server, 'SIGTERM');
    const timeout = new Promise(resolve => setTimeout(resolve, 15000));
    await Promise.race([server.exited, timeout]);
  }
  // Also stops workers that outlive the server.
  killGroup(server, 'SIGKILL');
  await server.exited;
}

async function measure(target, outDir) {
  const port = await getFreePort();
  const probeFile = path.join(outDir, '.heap-probe');
  const bundleDir = path.join(outDir, target.name);
  fs.rmSync(bundleDir, {force: true, recursive: true});
  fs.mkdirSync(bundleDir);
  fs.rmSync(probeFile, {force: true});
  const log = fs.openSync(path.join(outDir, `${target.name}.log`), 'w');
  const [command, ...args] = target.serverCommand;
  // In its own process group, so that stopping it stops its workers too.
  const child = spawn(command, [...args, `--port=${port}`], {
    detached: true,
    env: {
      ...process.env,
      METRO_BENCHMARK_PORT: String(port),
      METRO_BENCHMARK_PROBE_FILE: probeFile,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${HEAP_PROBE}`]
        .filter(Boolean)
        .join(' '),
    },
    stdio: ['ignore', log, log],
  });
  const server = {
    closed: false,
    error: null,
    exited: null,
    port,
    process: child,
  };
  child.once('error', error => {
    server.error = error;
  });
  server.exited = new Promise(resolve =>
    child.once('close', () => {
      server.closed = true;
      resolve();
    }),
  );
  // Ctrl-C doesn't reach the server's process group: stop the server, which
  // fails the run.
  const onSigint = () => killGroup(server, 'SIGKILL');
  process.on('SIGINT', onSigint);
  try {
    const {origin, probePort} = await waitForProbe(server, probeFile);
    const hash = crypto.createHash('sha256');

    const main = await get(origin + target.bundlePath);
    const mainBundle = withoutOrigin(main.body, origin);
    hash.update(mainBundle);
    fs.writeFileSync(path.join(bundleDir, 'main.js'), mainBundle);
    const heapAfterMainMB = await getHeapUsedMB(probePort);

    const queue = getAsyncBundlePaths(main.body.toString());
    const queued = new Set(queue);
    const chunkTimes = [];
    while (chunkTimes.length < target.chunks && queue.length > 0) {
      const chunkPath = queue.shift();
      const chunk = await get(origin + chunkPath);
      const chunkBundle = withoutOrigin(chunk.body, origin);
      hash.update(chunkBundle);
      chunkTimes.push(chunk.ms);
      fs.writeFileSync(
        path.join(bundleDir, `chunk-${chunkTimes.length}.js`),
        chunkBundle,
      );
      fs.appendFileSync(path.join(bundleDir, 'chunks.txt'), chunkPath + '\n');
      for (const asyncPath of getAsyncBundlePaths(chunk.body.toString())) {
        if (!queued.has(asyncPath)) {
          queued.add(asyncPath);
          queue.push(asyncPath);
        }
      }
    }
    if (chunkTimes.length === 0) {
      throw new Error(`${target.bundlePath} has no lazy chunks`);
    }
    const heapAfterChunksMB = await getHeapUsedMB(probePort);

    return {
      chunkCount: chunkTimes.length,
      chunkTotalMs: chunkTimes.reduce((a, b) => a + b, 0),
      hash: hash.digest('hex'),
      heapAfterMainMB,
      heapChunksMB: heapAfterChunksMB - heapAfterMainMB,
      mainMs: main.ms,
    };
  } finally {
    process.off('SIGINT', onSigint);
    await stop(server);
    fs.closeSync(log);
  }
}

function describe(result) {
  return (
    `main ${(result.mainMs / 1000).toFixed(1)}s, heap ` +
    `${result.heapAfterMainMB.toFixed(0)}MB; ${result.chunkCount} chunks: ` +
    `${(result.chunkTotalMs / 1000).toFixed(1)}s, ` +
    `${result.heapChunksMB >= 0 ? '+' : ''}${result.heapChunksMB.toFixed(0)}MB; ` +
    `sha256 ${result.hash.slice(0, 12)}`
  );
}

function formatMean(metric, samples) {
  const sample = stats(samples.map(metric.value));
  return (
    `${sample.mean.toFixed(metric.digits)} ± ` +
    `${sample.sd.toFixed(metric.digits)} ${metric.unit}`
  );
}

// "-94.13% (544.0 → 31.9 MB, t -617.5)": the change in the mean, both means,
// and Welch's t.
function formatChange(metric, samples, base) {
  const sample = stats(samples.map(metric.value));
  const baseSample = stats(base.map(metric.value));
  const {pct, t} = change(sample, baseSample);
  return (
    `${formatPct(pct)} (${baseSample.mean.toFixed(metric.digits)} → ` +
    `${sample.mean.toFixed(metric.digits)} ${metric.unit}, t ${t.toFixed(1)})`
  );
}

function formatTable(targets, variants, results) {
  const lines = [
    '| Bundle | Variant | Δ memory | Δ time |',
    '|---|---|--:|--:|',
  ];
  const differing = [];
  for (const target of targets) {
    const base = results.get(target.name).get(variants[0].name);
    const name = `${target.name} (${base[0].chunkCount} chunks)`;
    lines.push(
      `| ${name} | ${variants[0].name} | ${formatMean(MEMORY, base)} | ` +
        `${formatMean(TIME, base)} |`,
    );
    for (const variant of variants.slice(1)) {
      const samples = results.get(target.name).get(variant.name);
      lines.push(
        `| ${name} | ${variant.name} | ` +
          `${formatChange(MEMORY, samples, base)} | ` +
          `${formatChange(TIME, samples, base)} |`,
      );
      if (!samples.every((r, i) => r.hash === base[i].hash)) {
        differing.push(`${target.name} ${variant.name}`);
      }
    }
  }
  lines.push(
    '',
    'Δ memory: heap the chunk graphs add to the server. Δ time: all chunk ' +
      'requests. Unpatched rows show mean ± sample sd; patched rows show the ' +
      "change and the unpatched → patched means. t is Welch's t vs " +
      'unpatched; at 5 runs, |t| < 2.3 is not significant (p > 0.05).',
    differing.length === 0
      ? "Every run's bundles are byte-identical to unpatched."
      : `Bundles differ from unpatched: ${differing.join(', ')}.`,
  );
  return lines.join('\n') + '\n';
}

module.exports = {
  HELP,
  OPTIONS,
  describe,
  formatTable,
  getAsyncBundlePaths,
  measure,
  parseTargets,
};
