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

jest.setTimeout(30 * 1000);

async function build({dev}: {dev: boolean}) {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
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

test('the virtual module is named after its importer and a hash of its source', async () => {
  const {code} = await build({dev: true});
  const names = [
    ...code.matchAll(/"([^"]*inline-module\/[^"]*\?virtual=[0-9a-f]+)"/g),
  ]
    .map(match => match[1])
    .sort();
  expect(names).toEqual([
    expect.stringMatching(/^inline-module\/index\.js\?virtual=[0-9a-f]{40}$/),
    expect.stringMatching(/^inline-module\/sibling\.js\?virtual=[0-9a-f]{40}$/),
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
