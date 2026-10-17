/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const {transform} = require('../index.js');
const path = require('node:path');

const PROJECT_ROOT = path.sep === '/' ? '/my/project' : 'C:\\my\\project';

test('exposes the correct absolute path to a source file to plugins', () => {
  let visitorFilename;
  let pluginCwd;
  transform({
    filename: 'foo.js',
    src: 'console.log("foo");',
    plugins: [
      (babel, opts, cwd) => {
        pluginCwd = cwd;
        return {
          visitor: {
            CallExpression: {
              enter: (_, state) => {
                visitorFilename = state.filename;
              },
            },
          },
        };
      },
    ],
    options: {
      dev: true,
      enableBabelRuntime: false,
      enableBabelRCLookup: false,
      globalPrefix: '__metro__',
      minify: false,
      platform: null,
      publicPath: 'test',
      projectRoot: PROJECT_ROOT,
    },
  });
  expect(pluginCwd).toEqual(PROJECT_ROOT);
  expect(visitorFilename).toEqual(path.resolve(PROJECT_ROOT, 'foo.js'));
});

test('exposes the Babel runtime module name and version to presets via the caller', () => {
  let callerRuntime;
  transform({
    filename: 'foo.js',
    src: 'console.log("foo");',
    plugins: [
      babel => {
        callerRuntime = {
          babelRuntimeModuleName: babel.caller(
            caller => caller?.babelRuntimeModuleName,
          ),
          enableBabelRuntime: babel.caller(
            caller => caller?.enableBabelRuntime,
          ),
        };
        return {visitor: {}};
      },
    ],
    options: {
      babelRuntimeModuleName: 'metro:babel-runtime',
      babelRuntimeVersion: '7.29.7',
      dev: true,
      enableBabelRuntime: true,
      enableBabelRCLookup: false,
      globalPrefix: '__metro__',
      minify: false,
      platform: null,
      publicPath: 'test',
      projectRoot: PROJECT_ROOT,
    },
  });
  expect(callerRuntime).toEqual({
    babelRuntimeModuleName: 'metro:babel-runtime',
    enableBabelRuntime: '7.29.7',
  });
});

test('omits the Babel runtime from the caller when not provided', () => {
  let callerKeys;
  transform({
    filename: 'foo.js',
    src: 'console.log("foo");',
    plugins: [
      babel => {
        callerKeys = ['babelRuntimeModuleName', 'enableBabelRuntime'].filter(
          key =>
            babel.caller(
              caller => caller != null && Object.hasOwn(caller, key),
            ),
        );
        return {visitor: {}};
      },
    ],
    options: {
      dev: true,
      enableBabelRuntime: false,
      enableBabelRCLookup: false,
      globalPrefix: '__metro__',
      minify: false,
      platform: null,
      publicPath: 'test',
      projectRoot: PROJECT_ROOT,
    },
  });
  expect(callerKeys).toEqual([]);
});
