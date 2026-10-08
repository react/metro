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

// The same source from a different origin is a different module with its own
// module scope.
const {default: bumpFromSibling} = require('./sibling');
// The inline module imports a sibling relatively: it resolves from this file's
// directory, because the virtual module is anchored here.
const inline = require('metro:inline;base64,aW1wb3J0IHtpbmNyZW1lbnR9IGZyb20gJy4vc3ViZGlyL2NvdW50ZXInOwpleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBidW1wKG4pIHsKICByZXR1cm4gaW5jcmVtZW50KCkgKyBuOwp9CmV4cG9ydCBjb25zdCBvd25Nb2R1bGVJZCA9IG1vZHVsZS5pZDsK');

const weakId = require.resolveWeak(
  'metro:inline;base64,aW1wb3J0IHtpbmNyZW1lbnR9IGZyb20gJy4vc3ViZGlyL2NvdW50ZXInOwpleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBidW1wKG4pIHsKICByZXR1cm4gaW5jcmVtZW50KCkgKyBuOwp9CmV4cG9ydCBjb25zdCBvd25Nb2R1bGVJZCA9IG1vZHVsZS5pZDsK',
);

const dynamicRequire = require;

module.exports = {
  fromInline: inline.default(10),
  fromSibling: bumpFromSibling(100),
  // Requiring by the weak id reaches the same instance as the static require.
  fromWeakId: dynamicRequire(weakId).default(1000),
  weakIdIsOwnModuleId: weakId === inline.ownModuleId,
};
