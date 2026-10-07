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

import type {CustomResolver} from 'metro-resolver';

const Metro = require('../../..');
const execBundle = require('../execBundle');
const MetroConfig = require('metro-config');
const path = require('node:path');

jest.setTimeout(30 * 1000);

const VIRTUAL_SOURCE = `
import {increment} from './subdir/counter';
export default function bump(n) {
  return increment() + n;
}
export const ownModuleId = module.id;
`;

// A custom resolver that answers one specifier with a virtual module anchored
// at the importer, and delegates everything else.
// A virtual path that does not exist on disk, with an extension the transform
// pipeline keys on: the TypeScript here only parses if the transformer sees
// the `.ts` and not the module's identity suffix.
const TYPED_SOURCE = 'export default (n: number): number => n * 2;';

const resolveRequest: CustomResolver = (context, moduleName, platform) => {
  switch (moduleName) {
    case 'virtual:bump':
      return {
        type: 'virtualModule',
        virtualPath: context.originModulePath,
        source: VIRTUAL_SOURCE,
      };
    case 'virtual:typed':
      return {
        type: 'virtualModule',
        virtualPath: path.join(
          path.dirname(context.originModulePath),
          'typed.ts',
        ),
        source: TYPED_SOURCE,
      };
    default:
      return context.resolveRequest(context, moduleName, platform);
  }
};

async function build({dev}: {dev: boolean}) {
  const baseConfig = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const config = MetroConfig.mergeConfig(baseConfig, {
    resolver: {resolveRequest},
  });
  return Metro.runBuild(config, {
    entry: 'virtual-module/index.js',
    dev,
    minify: !dev,
  });
}

test('a resolver may answer with a virtual module anchored at the importer', async () => {
  const {code} = await build({dev: true});
  expect(execBundle(code)).toEqual({
    // The virtual module's relative import resolved from the importer's
    // directory to the shared counter.
    fromVirtual: 11,
    // Same source, different importer: a separate module instance, sharing the
    // counter it imports.
    fromSibling: 102,
    // The weak id refers to the same module instance as the static require.
    fromWeakId: 1003,
    weakIdIsOwnModuleId: true,
    // A `.ts` virtual path is transformed as TypeScript.
    fromTyped: 21,
  });
});

test('the virtual module is named after its importer and a hash of its source', async () => {
  const {code} = await build({dev: true});
  const names = [
    ...code.matchAll(/"([^"]*virtual-module\/[^"]*\?virtual=[0-9a-f]+)"/g),
  ]
    .map(match => match[1])
    .sort();
  expect(names).toEqual([
    expect.stringMatching(/^virtual-module\/index\.js\?virtual=[0-9a-f]{40}$/),
    expect.stringMatching(
      /^virtual-module\/sibling\.js\?virtual=[0-9a-f]{40}$/,
    ),
    expect.stringMatching(/^virtual-module\/typed\.ts\?virtual=[0-9a-f]{40}$/),
  ]);
});

test('builds in production', async () => {
  const {code} = await build({dev: false});
  expect(execBundle(code)).toMatchObject({fromVirtual: 11, fromSibling: 102});
});
