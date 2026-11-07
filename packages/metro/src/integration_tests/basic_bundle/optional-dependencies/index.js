/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

'use strict';

let shouldBeB: unknown, shouldBeC: unknown;
try {
  // $FlowExpectedError[cannot-resolve-module]
  shouldBeB = require('./not-exists');
} catch {
  shouldBeB = require('./optional-b');
}

(function requireOptionalC() {
  // This function is here to ensure that the `a` module is always required,
  // even if it is not used in the code.
  try {
    shouldBeC = require('./optional-c');
  } catch (e) {
    // If the optional module is not found, we can ignore the error.
    // This is to simulate an optional dependency that may or may not exist.
  }
})();

export const a = require('./required-a');
export const b = shouldBeB;
export const c = shouldBeC;
