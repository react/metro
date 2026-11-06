/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

import {transformSync} from '@babel/core';
import fs from 'node:fs';
import vm from 'node:vm';

const asyncRequireCode = transformSync(
  fs.readFileSync(require.resolve('../asyncRequire'), 'utf8'),
  {
    ast: false,
    babelrc: false,
    cwd: '/',
    filename: 'asyncRequire.js',
    presets: [
      [
        require.resolve('@react-native/babel-preset'),
        {enableBabelRuntime: false},
      ],
    ],
    sourceType: 'module',
  },
).code;

test('loads bundles through its own bundle loader after another bundle reassigns the prefix', async () => {
  const loaded: Array<string> = [];
  const context = vm.createContext({
    hostRequire: {importAll: () => 'HostSplit'},
    host__loadBundleAsync: async (path: string) => {
      loaded.push(`host:${path}`);
    },
    remote__loadBundleAsync: async (path: string) => {
      loaded.push(`remote:${path}`);
    },
  });
  vm.runInContext('var __METRO_GLOBAL_PREFIX__ = "host";', context);
  const asyncRequire = vm.runInContext(
    `(function (global, require) {
      var module = {exports: {}};
      ${asyncRequireCode}
      return module.exports;
    })(globalThis, hostRequire)`,
    context,
  );

  // A Module Federation remote's prelude.
  vm.runInContext('var __METRO_GLOBAL_PREFIX__ = "remote";', context);

  await expect(asyncRequire(1, {'1': '/host-split.bundle'})).resolves.toBe(
    'HostSplit',
  );
  expect(loaded).toEqual(['host:/host-split.bundle']);
});
