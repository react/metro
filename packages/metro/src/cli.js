#!/usr/bin/env node
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

/* eslint-disable import/no-commonjs */

'use strict';

try {
  require('metro-babel-register').unstable_registerForMetroMonorepo();
} catch {}

const {attachMetroCli} = require('./index');
const yargs = require('yargs');

// $FlowFixMe[unused-promise]
attachMetroCli(yargs.demandCommand(1)).argv;
