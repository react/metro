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

'use strict';

const Metro = require('../../..');
const execBundle = require('../execBundle');
const MetroConfig = require('metro-config');

jest.setTimeout(30 * 1000);

async function build({dev}: {dev: boolean}) {
  const baseConfig = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const config = MetroConfig.mergeConfig(baseConfig, {
    resolver: {unstable_allowVirtualModules: true},
  });
  return Metro.runBuild(config, {
    entry: 'inline-module/index.js',
    dev,
    minify: !dev,
  });
}

test('an inline module resolves to a virtual module anchored at its importer', async () => {
  const {code} = await build({dev: true});
  expect(execBundle(code)).toEqual({
    // The inline module's relative import resolved to the shared counter.
    fromInline: 11,
    // Same source, different importer: a separate module instance, sharing the
    // counter it imports.
    fromSibling: 102,
    // The weak id refers to the same module instance as the static require.
    fromWeakId: 1003,
    weakIdIsOwnModuleId: true,
  });
});

test('each inline module is named beside its importer, in the virtual namespace', async () => {
  const {code} = await build({dev: true});
  const names = [...new Set(code.match(/"virtual:[^"]*"/g))].sort();
  expect(names).toEqual([
    expect.stringMatching(
      /^"virtual:inline-module\/index\.inline-[0-9a-f]{16}\.js"$/,
    ),
    expect.stringMatching(
      /^"virtual:inline-module\/sibling\.inline-[0-9a-f]{16}\.js"$/,
    ),
  ]);
});

test('development output abbreviates inline module specifiers in require names', async () => {
  const {code} = await build({dev: true});
  expect(code).toContain('"metro:inline;base64,..."');
  expect(code).not.toContain('"metro:inline;base64,aW1wb3J0');
});

test('builds in production', async () => {
  const {code} = await build({dev: false});
  expect(execBundle(code)).toMatchObject({fromInline: 11, fromSibling: 102});
});
