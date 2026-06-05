/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import * as Metro from '../../..';
import RamBundleParser from '../../lib/RamBundleParser';
import * as ramBundleOutput from '../../shared/output/unbundle';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

jest.setTimeout(30 * 1000);

let config;

beforeAll(async () => {
  config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
});

async function buildAndExecRamBundle(entry: string): mixed {
  const bundlePath = path.join(os.tmpdir(), `rambundle-${Date.now()}.js`);
  try {
    await Metro.runBuild(config, {
      entry,
      output: ramBundleOutput,
      out: bundlePath,
    });

    const bundleBuffer = fs.readFileSync(bundlePath);
    const parser = new RamBundleParser(bundleBuffer);

    const context = vm.createContext({
      nativeRequire(id) {
        vm.runInContext(parser.getModule(id), context);
      },
    });

    return vm.runInContext(parser.getStartupCode(), context);
  } finally {
    if (fs.existsSync(bundlePath)) {
      fs.unlinkSync(bundlePath);
    }
  }
}

test('builds and executes a RAM bundle', async () => {
  expect(await buildAndExecRamBundle('TestBundle.js')).toMatchSnapshot();
});

test('rejects [metro-project] virtual prefix in runBuild entry', async () => {
  await expect(
    buildAndExecRamBundle('./[metro-project]/TestBundle.js'),
  ).rejects.toThrow('was not found');
});
