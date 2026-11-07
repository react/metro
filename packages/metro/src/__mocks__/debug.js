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

interface DebugFN {
  (...args: Array<unknown>): void;
  enabled: () => boolean;
}

function debug(namespace: string): DebugFN {
  const fn = (...args: Array<unknown>) => {};
  fn.enabled = () => false;
  return fn;
}

debug.enable = (match: string) => {};
debug.disable = () => {};

module.exports = debug;
