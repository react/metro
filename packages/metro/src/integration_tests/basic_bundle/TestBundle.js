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

const Bar = require('./Bar');
const Foo = require('./Foo');
// $FlowFixMe[cannot-resolve-module]: Flow doesn't understand TypeScript
const TypeScript = require('./TypeScript');

Object.keys({...Bar});

module.exports = {Foo, Bar, TypeScript};
