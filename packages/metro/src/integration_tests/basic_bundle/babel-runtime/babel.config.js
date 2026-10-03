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

// A minimal stand-in for a preset such as `@react-native/babel-preset`, which
// reads `@babel/runtime` configuration from Babel caller data. As a root config
// it applies to every file in the bundle, so beyond stripping Flow (from
// Metro's own polyfills) it only transforms the fixture's modules.
module.exports = api => {
  const moduleName = api.caller(caller => caller?.babelRuntimeModuleName);
  const version = api.caller(caller => caller?.enableBabelRuntime);
  return {
    plugins: [
      require.resolve('flow-parser/babel-plugin'),
      require.resolve('@babel/plugin-transform-flow-strip-types'),
    ],
    overrides: [
      {
        test: __dirname,
        plugins: [
          require.resolve('@babel/plugin-transform-modules-commonjs'),
          ...(typeof moduleName === 'string' && typeof version === 'string'
            ? [
                [
                  require.resolve('@babel/plugin-transform-runtime'),
                  {helpers: true, regenerator: false, moduleName, version},
                ],
              ]
            : []),
        ],
      },
    ],
  };
};
