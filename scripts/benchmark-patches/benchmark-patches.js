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

const bundlingSpeed = require('./benchmarks/bundling_speed');
const run = require('./run');
const fs = require('node:fs');
const path = require('node:path');
const {parseArgs} = require('node:util');

const BENCHMARKS = {bundling_speed: bundlingSpeed};

const DIST_DIR = path.join(__dirname, 'dist');
const PATCHES_DIR = path.join(__dirname, 'patches');
const METRO_ROOT = path.resolve(__dirname, '../..');

const HELP = `Usage: node benchmark-patches.js <benchmark> [--runs=N] <target>...

Runs <benchmark> on each target, unpatched and with every *.patch in the
patches directory applied, and prints a table comparing each patch with
unpatched.

Patches directory:
  ${PATCHES_DIR}

Each target gets one unmeasured warmup run, then variants are interleaved in a
rotating order. dist/ is cleared on start and holds the last run's outputs
(dist/<variant>/) and the table (dist/results.md).

Options:
  --runs=N  Measured runs per variant, at least 2 (default: 5).
  --help    Show this help.

Patches are diffs relative to the Metro repository root, e.g. \`git diff\`
output.

Benchmarks:

${Object.values(BENCHMARKS)
  .map(benchmark => benchmark.HELP)
  .join('\n')}`;

function patch(patchFile, {reverse = false, dryRun = false} = {}) {
  run(
    'patch',
    [
      '-p1',
      '--batch',
      '--silent',
      '--no-backup-if-mismatch',
      reverse ? '--reverse' : '--forward',
      ...(dryRun ? ['--dry-run'] : []),
      '-d',
      METRO_ROOT,
      '-i',
      patchFile,
    ],
    {stdio: 'inherit'},
  );
}

// Rotating the variant order each run spreads position bias evenly.
function rotate(items, offset) {
  return items.map((_, i) => items[(offset + i) % items.length]);
}

function main() {
  const benchmarkOptions = Object.assign(
    {},
    ...Object.values(BENCHMARKS).map(benchmark => benchmark.OPTIONS),
  );
  const {values, positionals} = parseArgs({
    allowPositionals: true,
    options: {
      help: {type: 'boolean'},
      runs: {type: 'string', default: '5'},
      ...benchmarkOptions,
    },
  });
  if (values.help === true || positionals.length === 0) {
    process.stdout.write(HELP);
    return;
  }
  const [benchmarkName, ...specs] = positionals;
  if (!Object.hasOwn(BENCHMARKS, benchmarkName)) {
    throw new Error(
      `Unknown benchmark "${benchmarkName}", expected one of: ` +
        Object.keys(BENCHMARKS).join(', '),
    );
  }
  const benchmark = BENCHMARKS[benchmarkName];
  const runs = Number(values.runs);
  if (!Number.isInteger(runs) || runs < 2) {
    throw new Error(`--runs must be an integer >= 2, got "${values.runs}"`);
  }
  if (specs.length === 0) {
    throw new Error(`Missing targets for ${benchmarkName}`);
  }
  const targets = benchmark.parseTargets(specs, values);
  const variants = [
    {name: 'unpatched', patchFile: null},
    ...fs
      .readdirSync(PATCHES_DIR)
      .filter(file => file.endsWith('.patch'))
      .sort()
      .map(file => ({
        name: path.basename(file, '.patch'),
        patchFile: path.join(PATCHES_DIR, file),
      })),
  ];
  for (const {patchFile} of variants) {
    if (patchFile != null) {
      patch(patchFile, {dryRun: true});
    }
  }

  fs.rmSync(DIST_DIR, {force: true, recursive: true});
  for (const variant of variants) {
    fs.mkdirSync(path.join(DIST_DIR, variant.name), {recursive: true});
  }

  // Ctrl-C reaches the benchmark child; the finally block below reverts the
  // patch.
  process.on('SIGINT', () => {});

  const results = new Map(
    targets.map(target => [
      target.name,
      new Map(variants.map(variant => [variant.name, []])),
    ]),
  );
  for (const target of targets) {
    const warmup = benchmark.measure(
      target,
      path.join(DIST_DIR, variants[0].name),
    );
    console.error(`[warmup] ${target.name}: ${benchmark.describe(warmup)}`);
  }

  const total = runs * targets.length * variants.length;
  let count = 0;
  for (let i = 1; i <= runs; i++) {
    for (const target of targets) {
      for (const variant of rotate(variants, i - 1)) {
        if (variant.patchFile != null) {
          patch(variant.patchFile);
        }
        let result;
        try {
          result = benchmark.measure(target, path.join(DIST_DIR, variant.name));
        } finally {
          if (variant.patchFile != null) {
            patch(variant.patchFile, {reverse: true});
          }
        }
        results.get(target.name).get(variant.name).push(result);
        console.error(
          `[${++count}/${total}] run ${i} ${target.name} ${variant.name}: ` +
            benchmark.describe(result),
        );
      }
    }
  }

  const table = benchmark.formatTable(targets, variants, results);
  fs.writeFileSync(path.join(DIST_DIR, 'results.md'), table);
  process.stdout.write(table);
}

if (require.main === module) {
  main();
}

module.exports = {BENCHMARKS, rotate};
