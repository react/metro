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

const run = require('../run');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const METRO_CLI = path.resolve(__dirname, '../../../packages/metro/src/cli.js');
const METRO_BABEL_CONFIG = path.resolve(__dirname, '../../../babel.config.js');
const APP_DIR = path.join(os.tmpdir(), 'metro-benchmark-patches-app');
const APP_MODULE_COUNT = 5000;

const HELP = `  bundling_speed [--build-command=CMD]
    Cold-builds an app of ${APP_MODULE_COUNT} generated modules in prod and dev
    and reports wall time, CPU time (user + sys) and bundle size, with Welch's t
    vs unpatched, and whether every run's bundle is byte-identical to
    unpatched. The app is generated in ${APP_DIR}.
    The build's stdout and stderr are pipes. Requires GNU time at
    /usr/bin/time.

    --build-command=CMD  Space-separated command that builds a bundle and
                         accepts \`metro build\` arguments (default: this
                         checkout's \`metro build\`).
`;

const OPTIONS = {'build-command': {type: 'string'}};

function stats(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return {mean, n: values.length, sd: Math.sqrt(variance), variance};
}

// Percent change vs base, with Welch's t statistic.
function delta(sample, base) {
  const pct = (sample.mean / base.mean - 1) * 100;
  const t =
    (sample.mean - base.mean) /
    Math.sqrt(sample.variance / sample.n + base.variance / base.n);
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% (t ${t.toFixed(1)})`;
}

function parseTargets(specs, options) {
  if (specs.length > 0) {
    throw new Error(
      `bundling_speed takes no targets, got "${specs.join(' ')}"`,
    );
  }
  const buildCommand = options['build-command']?.split(' ') ?? [
    process.execPath,
    METRO_CLI,
    'build',
  ];
  return [false, true].map(dev => ({
    buildCommand,
    dev,
    name: `app-${dev ? 'dev' : 'prod'}`,
  }));
}

// Generates the app: module i requires modules 2i + 1 and 2i + 2, so the
// modules form a binary tree rooted at the entry point, m0.js.
function setUp() {
  fs.rmSync(APP_DIR, {force: true, recursive: true});
  fs.mkdirSync(APP_DIR, {recursive: true});
  fs.writeFileSync(
    path.join(APP_DIR, 'package.json'),
    '{"name": "app", "private": true}\n',
  );
  // Metro's polyfills are Flow source, compiled with Metro's Babel config
  fs.writeFileSync(
    path.join(APP_DIR, 'babel.config.js'),
    `module.exports = require(${JSON.stringify(METRO_BABEL_CONFIG)});\n`,
  );
  fs.writeFileSync(path.join(APP_DIR, '.watchmanconfig'), '{}\n');
  // The app has no node_modules to resolve Metro's runtime from
  fs.writeFileSync(
    path.join(APP_DIR, 'metro.config.js'),
    "module.exports = {transformer: {asyncRequireModulePath: 'metro:runtime/modules/asyncRequire'}};\n",
  );
  for (let i = 0; i < APP_MODULE_COUNT; i++) {
    const children = [2 * i + 1, 2 * i + 2].filter(
      child => child < APP_MODULE_COUNT,
    );
    fs.writeFileSync(
      path.join(APP_DIR, `m${i}.js`),
      [
        ...children.map(child => `const m${child} = require('./m${child}');`),
        `module.exports = function m${i}(n) {`,
        `  return [n, ${children.map(child => `m${child}(n + 1)`).join(', ')}].join(',');`,
        '};',
        '',
      ].join('\n'),
    );
  }
}

function measure(bundle, outDir) {
  const outFile = path.join(outDir, `${bundle.name}.js`);
  const timeFile = path.join(outDir, '.time');
  const {stdout, stderr} = run(
    '/usr/bin/time',
    [
      '-f',
      '%e %U %S',
      '-o',
      timeFile,
      ...bundle.buildCommand,
      '--reset-cache',
      '--max-workers=16',
      '--platform=ios',
      ...(bundle.dev ? ['--dev', '--no-minify'] : ['--no-dev', '--minify']),
      '-O',
      outFile,
      'm0.js',
    ],
    {cwd: APP_DIR, maxBuffer: 1024 ** 3, stdio: ['ignore', 'pipe', 'pipe']},
  );
  fs.writeFileSync(
    path.join(outDir, `${bundle.name}.log`),
    Buffer.concat([stdout, stderr]),
  );
  const [wall, user, sys] = fs
    .readFileSync(timeFile, 'utf8')
    .trim()
    .split(/\s+/)
    .map(Number);
  fs.rmSync(timeFile);
  const contents = fs.readFileSync(outFile);
  return {
    cpu: user + sys,
    hash: crypto.createHash('sha256').update(contents).digest('hex'),
    size: contents.length,
    wall,
  };
}

function describe(result) {
  return `wall ${result.wall.toFixed(1)}s, cpu ${result.cpu.toFixed(1)}s`;
}

function formatTable(bundles, variants, results) {
  const lines = [
    '| Bundle | Variant | Wall (s) | Wall Δ | CPU (s) | CPU Δ | Size (bytes) | Same as unpatched |',
    '|---|---|--:|--:|--:|--:|--:|---|',
  ];
  for (const bundle of bundles) {
    const base = results.get(bundle.name).get(variants[0].name);
    const baseWall = stats(base.map(r => r.wall));
    const baseCpu = stats(base.map(r => r.cpu));
    for (const variant of variants) {
      const samples = results.get(bundle.name).get(variant.name);
      const wall = stats(samples.map(r => r.wall));
      const cpu = stats(samples.map(r => r.cpu));
      const isBase = variant === variants[0];
      lines.push(
        [
          '',
          bundle.name,
          variant.name,
          `${wall.mean.toFixed(1)} ± ${wall.sd.toFixed(1)}`,
          isBase ? '' : delta(wall, baseWall),
          `${cpu.mean.toFixed(1)} ± ${cpu.sd.toFixed(1)}`,
          isBase ? '' : delta(cpu, baseCpu),
          samples[samples.length - 1].size.toLocaleString('en-US'),
          samples.every((r, i) => r.hash === base[i].hash) ? 'yes' : 'NO',
          '',
        ]
          .join(' | ')
          .trim(),
      );
    }
  }
  lines.push(
    '',
    "Values are mean ± sample sd. t is Welch's t vs unpatched; at 5 runs, " +
      '|t| < 2.3 is not significant (p > 0.05).',
  );
  return lines.join('\n') + '\n';
}

module.exports = {
  HELP,
  OPTIONS,
  describe,
  formatTable,
  measure,
  parseTargets,
  setUp,
};
