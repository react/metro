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
import {
  createPackageAccessors,
  createResolutionContext,
  posixToSystemPath as p,
} from './utils';

// Implementation of PACKAGE_IMPORTS_RESOLVE described in https://nodejs.org/api/esm.html
describe('subpath imports resolution support', () => {
  const baseContext = {
    ...createResolutionContext({
      [p('/root/src/main.js')]: '',
      [p('/root/node_modules/test-pkg/package.json')]: '',
      [p('/root/node_modules/test-pkg/index.js')]: '',
      [p('/root/node_modules/test-pkg/index-main.js')]: '',
      [p('/root/node_modules/test-pkg/symlink.js')]: {
        realPath: p('/root/node_modules/test-pkg/symlink-target.js'),
      },
    }),
    originModulePath: p('/root/src/main.js'),
  };

  test('"imports" subpath that maps directly to a file', () => {
    const context = {
      ...baseContext,
      // $FlowFixMe[incompatible-type]
      ...createPackageAccessors({
        [p('/root/node_modules/test-pkg/package.json')]: {
          main: 'index-main.js',
          imports: {
            '#foo': './index.js',
          },
        },
      }),
      originModulePath: p('/root/node_modules/test-pkg/lib/foo.js'),
    };

    expect(Resolver.resolve(context, '#foo', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/test-pkg/index.js'),
    });
  });
});

describe('import subpath patterns resolution support', () => {
  const baseContext = {
    ...createResolutionContext({
      [p('/root/src/main.js')]: '',
      [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
        name: 'test-pkg',
        main: 'index.js',
        imports: {
          '#features/*': './src/features/*.js',
        },
      }),
      [p('/root/node_modules/test-pkg/src/index.js')]: '',
      [p('/root/node_modules/test-pkg/src/features/foo.js')]: '',
      [p('/root/node_modules/test-pkg/src/features/foo.js.js')]: '',
      [p('/root/node_modules/test-pkg/src/features/bar/Bar.js')]: '',
      [p('/root/node_modules/test-pkg/src/features/baz.native.js')]: '',
    }),
    originModulePath: p('/root/node_modules/test-pkg/src/index.js'),
  };

  test('resolving subpath patterns in "imports" matching import specifier', () => {
    expect(Resolver.resolve(baseContext, '#features/foo', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/test-pkg/src/features/foo.js'),
    });

    expect(Resolver.resolve(baseContext, '#features/foo.js', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/test-pkg/src/features/foo.js.js'),
    });
  });
});

describe('import subpath conditional imports resolution', () => {
  const baseContext = {
    ...createResolutionContext({
      [p('/root/src/main.js')]: '',
      [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
        name: 'test-pkg',
        main: 'index.js',
        imports: {
          '#foo': {
            development: './lib/foo-dev.js',
            'react-native': {
              import: './lib/foo-react-native.mjs',
              require: './lib/foo-react-native.cjs',
              default: './lib/foo-react-native.js',
            },
            browser: './lib/foo-browser.js',
            import: './lib/foo-module.mjs',
            require: './lib/foo-require.cjs',
            default: './lib/foo.js',
          },
        },
      }),
      [p('/root/node_modules/test-pkg/index.js')]: '',
      [p('/root/node_modules/test-pkg/lib/foo.js')]: '',
      [p('/root/node_modules/test-pkg/lib/foo-require.cjs')]: '',
      [p('/root/node_modules/test-pkg/lib/foo-module.mjs')]: '',
      [p('/root/node_modules/test-pkg/lib/foo-dev.js')]: '',
      [p('/root/node_modules/test-pkg/lib/foo-browser.js')]: '',
      [p('/root/node_modules/test-pkg/lib/foo-react-native.cjs')]: '',
      [p('/root/node_modules/test-pkg/lib/foo-react-native.mjs')]: '',
      [p('/root/node_modules/test-pkg/lib/foo-react-native.js')]: '',
      [p('/root/node_modules/test-pkg/lib/foo.web.js')]: '',
    }),
    originModulePath: p('/root/node_modules/test-pkg/src/index.js'),
  };

  test('resolving imports subpath with conditions', () => {
    const context = {
      ...baseContext,
      unstable_conditionNames: ['react-native'],
    };

    expect(
      Resolver.resolve({...context, isESMImport: false}, '#foo', null),
    ).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/test-pkg/lib/foo-react-native.cjs'),
    });

    expect(
      Resolver.resolve({...context, isESMImport: true}, '#foo', null),
    ).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/test-pkg/lib/foo-react-native.mjs'),
    });
  });
});
