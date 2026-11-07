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

import type {JsTransformerConfig} from '../index';

import {getCacheKey} from '../index';

const baseConfig: JsTransformerConfig = {
  allowOptionalDependencies: false,
  assetPlugins: [],
  assetRegistryPath: '',
  asyncRequireModulePath: 'asyncRequire',
  babelTransformerPath:
    require.resolve('@react-native/metro-babel-transformer'),
  dynamicDepsInPackages: 'reject',
  enableBabelRCLookup: false,
  enableBabelRuntime: true,
  globalPrefix: '',
  hermesParser: false,
  minifierConfig: {output: {comments: false}},
  minifierPath: require.resolve('metro-minify-terser'),
  optimizationSizeLimit: 100000,
  publicPath: '/assets',
  unstable_dependencyMapReservedName: null,
  unstable_compactOutput: false,
  unstable_disableModuleWrapping: false,
  unstable_disableNormalizePseudoGlobals: false,
  unstable_allowRequireContext: false,
};

test('varies with unstable_supportsInlineModules', () => {
  expect(
    getCacheKey({...baseConfig, unstable_supportsInlineModules: true}),
  ).not.toBe(getCacheKey(baseConfig));
});
