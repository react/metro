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

// A minimal stand-in for a plugin that reads the environment from Babel caller
// data. As a root config it applies to every file in the bundle, so it also
// strips Flow, from Metro's own polyfills.
module.exports = api => {
  const environment = api.caller(caller => caller?.environment);
  return {
    plugins: [
      require.resolve('flow-parser/babel-plugin'),
      require.resolve('@babel/plugin-transform-flow-strip-types'),
      ({types}) => ({
        visitor: {
          Identifier(path) {
            if (path.node.name === 'ENVIRONMENT') {
              path.replaceWith(types.valueToNode(environment ?? null));
            }
          },
        },
      }),
    ],
  };
};
