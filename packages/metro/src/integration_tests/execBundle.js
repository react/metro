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

import vm from 'node:vm';

module.exports = function execBundle(code: string, context: any = {}): unknown {
  if (vm.isContext(context)) {
    return vm.runInContext(code, context);
  }
  return vm.runInNewContext(code, context);
};
