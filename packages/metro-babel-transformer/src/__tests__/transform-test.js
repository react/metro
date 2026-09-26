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

describe('unstable_environment', () => {
  // Babel requires `api.caller` callbacks to return primitives.
  function getCallerEnvironment(unstable_environment?: ?string): {
    hasEnvironment: boolean,
    environment: unknown,
  } {
    let hasEnvironment = false;
    let environment;
    transform({
      filename: 'foo.js',
      src: 'console.log("foo");',
      plugins: [
        babel => {
          hasEnvironment = babel.caller(
            c => c != null && Object.hasOwn(c, 'unstable_environment'),
          );
          environment = babel.caller(c => c?.unstable_environment);
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
        unstable_environment,
      },
    });
    return {hasEnvironment, environment};
  }

  test('is passed to plugins on the caller', () => {
    expect(getCallerEnvironment('react-server')).toEqual({
      hasEnvironment: true,
      environment: 'react-server',
    });
  });

  test.each([[undefined], [null]])(
    'is absent from the caller when it is %s',
    unstable_environment => {
      expect(getCallerEnvironment(unstable_environment).hasEnvironment).toBe(
        false,
      );
    },
  );
});
