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

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

jest.setTimeout(30 * 1000);

test('builds and executes a RAM bundle', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const bundlePath = path.join(os.tmpdir(), 'rambundle.js');

  try {
    await Metro.runBuild(config, {
      entry: 'TestBundle.js',
      output: ramBundleOutput,
      out: bundlePath,
    });

    const bundleBuffer = fs.readFileSync(bundlePath);
    const parser = new RamBundleParser(bundleBuffer);

    // Create a context with a global nativeRequire function, which reads the
    // module code from the RAM bundle and injects it into the VM.
    const context = vm.createContext({
      nativeRequire(id) {
        vm.runInContext(parser.getModule(id), context);
      },
    });

    expect(vm.runInContext(parser.getStartupCode(), context)).toMatchSnapshot();
  } finally {
    fs.unlinkSync(bundlePath);
  }
});
