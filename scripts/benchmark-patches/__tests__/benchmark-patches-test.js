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

import {rotate} from '../benchmark-patches';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const SCRIPT = path.join(__dirname, '..', 'benchmark-patches.js');

function runScript(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {encoding: 'utf8'});
}

test('prints help without arguments and with --help', () => {
  for (const args of [[], ['--help']]) {
    const {status, stdout} = runScript(...args);
    expect(status).toBe(0);
    expect(stdout).toMatch(/^Usage: node benchmark-patches\.js <benchmark>/);
  }
});

test('rejects invalid arguments', () => {
  const noBenchmark = runScript('Entry.js:ios');
  expect(noBenchmark.status).not.toBe(0);
  expect(noBenchmark.stderr).toContain(
    'Unknown benchmark "Entry.js:ios", expected one of: bundling_speed',
  );

  const badRuns = runScript('bundling_speed', '--runs=1', 'Entry.js:ios');
  expect(badRuns.status).not.toBe(0);
  expect(badRuns.stderr).toContain('--runs must be an integer >= 2, got "1"');

  const noTargets = runScript('bundling_speed');
  expect(noTargets.status).not.toBe(0);
  expect(noTargets.stderr).toContain('Missing targets for bundling_speed');

  const noPlatform = runScript('bundling_speed', 'Entry.js');
  expect(noPlatform.status).not.toBe(0);
  expect(noPlatform.stderr).toContain('Missing platform in "Entry.js"');
});

test('rotates every variant through every position', () => {
  expect([0, 1, 2].map(offset => rotate(['a', 'b', 'c'], offset))).toEqual([
    ['a', 'b', 'c'],
    ['b', 'c', 'a'],
    ['c', 'a', 'b'],
  ]);
});
