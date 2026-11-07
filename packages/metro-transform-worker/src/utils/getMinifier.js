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

import type {Minifier} from '../index.js';

export default function getMinifier(minifierPath: string): Minifier {
  // Note: minifierPath should be an absolute path OR a module name here!
  // The options allow relative paths but they HAVE to be normalized at
  // any entry point that accepts them...
  try {
    // $FlowFixMe[unsupported-syntax] TODO t0 cannot do require with literal
    const mod = require(minifierPath);
    return mod.__esModule === true && 'default' in mod ? mod.default : mod;
  } catch (e) {
    throw new Error(
      'A problem occurred while trying to fetch the minifier. Path: "' +
        minifierPath +
        '", error message: ' +
        e.message,
    );
  }
}
