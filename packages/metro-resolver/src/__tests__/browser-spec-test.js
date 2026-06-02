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

import * as Resolver from '../index';
import {createPackageAccessors, createResolutionContext} from './utils';

describe('browser field spec', () => {
  describe('alternate main fields', () => {
    const packageJson = {
      name: 'test-pkg',
      main: 'index.js',
      browser: 'index-browser.js',
      'react-native': 'index-react-native.js',
    };
    const baseContext = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': JSON.stringify(packageJson),
        '/root/node_modules/test-pkg/index.js': '',
        '/root/node_modules/test-pkg/index-browser.js': '',
        '/root/node_modules/test-pkg/index-react-native.js': '',
      }),
      originModulePath: '/root/src/main.js',
    };

    test('should resolve package entry point using passed `mainFields` in order', () => {
      expect(
        Resolver.resolve(
          {
            ...baseContext,
            mainFields: ['browser', 'main'],
          },
          'test-pkg',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index-browser.js',
      });

      expect(
        Resolver.resolve(
          {
            ...baseContext,
            mainFields: ['react-native', 'browser', 'main'],
          },
          'test-pkg',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index-react-native.js',
      });

      expect(
        Resolver.resolve(
          {
            ...baseContext,
            ...createPackageAccessors({
              '/root/node_modules/test-pkg/package.json': {
                name: 'test-pkg',
                main: 'index.js',
              },
            }),
            mainFields: ['browser', 'main'],
          },
          'test-pkg',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index.js',
      });
    });

    test('should resolve .js and .json file extensions implicitly', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            ...packageJson,
            browser: 'index-browser',
          },
        }),
        mainFields: ['browser', 'main'],
      };

      expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index-browser.js',
      });
    });
  });

  describe('replace specific files', () => {
    test('should resolve a bare-specifier redirect relative to the origin package root, not its containing directory', () => {
      // Per the browser spec, paths in the `browser` map are relative to the
      // package.json file location. When the origin module lives in a
      // subdirectory of its package (here `lib/nested/`), the redirect target
      // must still resolve against the package root.
      const packageJson = {
        name: 'origin-pkg',
        main: 'lib/nested/index.js',
        browser: {
          'foo-pkg': './shims/foo.js',
        },
      };
      const context = {
        ...createResolutionContext({
          '/root/node_modules/origin-pkg/package.json':
            JSON.stringify(packageJson),
          '/root/node_modules/origin-pkg/lib/nested/index.js': '',
          '/root/node_modules/origin-pkg/shims/foo.js': '',
        }),
        originModulePath: '/root/node_modules/origin-pkg/lib/nested/index.js',
        mainFields: ['browser', 'main'],
      };

      expect(Resolver.resolve(context, 'foo-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/origin-pkg/shims/foo.js',
      });
    });

    test('should resolve a bare-specifier redirect for an origin outside of `node_modules`', () => {
      // Project-level package.json — there is no enclosing `node_modules`
      // segment, so the old heuristic of slicing after `node_modules/` would
      // misbehave. The redirect must resolve against the package root.
      const context = {
        ...createResolutionContext({
          '/root/project/package.json': JSON.stringify({
            name: 'project',
            main: 'src/index.js',
            browser: {
              'foo-pkg': './shims/foo.js',
            },
          }),
          '/root/project/src/index.js': '',
          '/root/project/shims/foo.js': '',
        }),
        originModulePath: '/root/project/src/index.js',
        mainFields: ['browser', 'main'],
      };

      expect(Resolver.resolve(context, 'foo-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/project/shims/foo.js',
      });
    });
  });
});
