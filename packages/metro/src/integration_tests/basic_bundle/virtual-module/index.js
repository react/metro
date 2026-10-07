/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

declare var require: {
  (id: string | number): any,
  resolveWeak: (id: string) => string | number,
};

const {default: bumpFromSibling} = require('./sibling');
// `virtual:bump` is resolved by the test's `resolveRequest` to a virtual
// module anchored at this file. Its relative import resolves from here.
const virtual = require('virtual:bump');

const weakId = require.resolveWeak('virtual:bump');

const dynamicRequire = require;

module.exports = {
  fromVirtual: virtual.default(10),
  // Same source, different importer: a separate module instance sharing the
  // counter it imports.
  fromSibling: bumpFromSibling(100),
  // Requiring by the weak id reaches the same instance as the static require.
  fromWeakId: dynamicRequire(weakId).default(1000),
  weakIdIsOwnModuleId: weakId === virtual.ownModuleId,
};
