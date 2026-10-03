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

const Metro = require('../../..');
const execBundle = require('../execBundle');
const path = require('node:path');

jest.setTimeout(30 * 1000);

const PROJECT_ROOT = path.resolve(__dirname, '../basic_bundle/babel-runtime');

// The `interopRequireWildcard` helper of the `@babel/runtime` that
// metro-runtime depends on.
function getBabelRuntimeHelperPath() {
  return require.resolve('@babel/runtime/helpers/interopRequireWildcard', {
    paths: [path.dirname(require.resolve('metro-runtime/package.json'))],
  });
}

async function build(enableBabelRuntime) {
  const baseConfig = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  // Build with Metro's own Babel transformer, which leaves Babel to discover
  // the fixture's `babel.config.js` from the project root, and have Babel
  // (rather than Metro) compile ESM so its helpers are exercised.
  const config = {
    ...baseConfig,
    projectRoot: PROJECT_ROOT,
    // Metro's own `@babel/runtime` is hoisted to the repo root, outside the
    // shared config's watch folders.
    watchFolders: [
      ...baseConfig.watchFolders,
      path.dirname(path.dirname(getBabelRuntimeHelperPath())),
    ],
    transformer: {
      ...baseConfig.transformer,
      babelTransformerPath: require.resolve('metro-babel-transformer'),
      enableBabelRuntime,
      getTransformOptions: async () => ({
        transform: {experimentalImportSupport: false, inlineRequires: false},
      }),
    },
  };
  const result = await Metro.runBuild(config, {
    entry: 'index.js',
    dev: true,
    minify: false,
  });
  return result.code;
}

test("imports helpers from Metro's own @babel/runtime when enableBabelRuntime is true", async () => {
  const code = await build(true);

  expect(code).toContain(
    '"metro:babel-runtime/helpers/interopRequireWildcard"',
  );

  // The helper is bundled from the `@babel/runtime` that metro-runtime depends
  // on.
  const helperPath = getBabelRuntimeHelperPath();
  expect(code.replaceAll('\\\\', '/')).toContain(
    JSON.stringify(
      path.relative(PROJECT_ROOT, helperPath).replaceAll('\\', '/'),
    ),
  );

  expect(execBundle(code)).toMatchObject({answer: 42});
});

test('inlines helpers when enableBabelRuntime is false', async () => {
  const code = await build(false);

  expect(code).not.toContain('metro:babel-runtime');
  expect(code).toContain('function _interopRequireWildcard(');

  expect(execBundle(code)).toMatchObject({answer: 42});
});
