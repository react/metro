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

import type {PackageForModule, ResolutionContext} from '../types';

import * as Resolver from '../index';
import {createPackageAccessors, createResolutionContext} from './utils';

// The resolver looks up package scopes through `getPackageForModule`. These
// tests pin down which paths it asks about for each kind of specifier, so
// that changes to the number of lookups per resolution are deliberate. Metro
// memoizes the answer per path, so a repeated path is cheap and a new one is
// not: in particular, the directory of a file is looked up once for all of
// its extension candidates.
describe('package scope lookups', () => {
  const fileMap = {
    '/root/package.json': JSON.stringify({name: 'root'}),
    '/root/src/main.js': '',
    '/root/src/foo.js': '',
    '/root/src/lib/index.js': '',
    '/root/node_modules/pkg/package.json': JSON.stringify({
      name: 'pkg',
      main: 'lib/index',
      browser: {'./lib/redirected.js': './lib/other.js'},
    }),
    '/root/node_modules/pkg/lib/index.js': '',
    '/root/node_modules/pkg/lib/sub.js': '',
    '/root/node_modules/pkg/lib/other.js': '',
    '/root/node_modules/nopkg/index.js': '',
  };

  let getPackageForModule: JestMockFn<[string], ?PackageForModule>;
  let context: ResolutionContext;

  function useFileMap(files: typeof fileMap) {
    const accessors = createPackageAccessors(files);
    getPackageForModule = jest.fn(accessors.getPackageForModule);
    context = {
      ...createResolutionContext(files),
      ...accessors,
      getPackageForModule,
      originModulePath: '/root/src/main.js',
    };
  }

  beforeEach(() => {
    useFileMap(fileMap);
  });

  const lookedUpPaths = () =>
    getPackageForModule.mock.calls.map(([modulePath]) => modulePath);

  test('relative file, found after trying several extensions', () => {
    expect(Resolver.resolve(context, './foo', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: '/root/src/foo.js',
    });
    expect(lookedUpPaths()).toEqual(['/root/src/foo', '/root/src']);
  });

  test('relative file with an explicit extension', () => {
    expect(Resolver.resolve(context, './foo.js', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: '/root/src/foo.js',
    });
    expect(lookedUpPaths()).toEqual(['/root/src/foo.js', '/root/src']);
  });

  test('relative directory, resolved to its index', () => {
    expect(Resolver.resolve(context, './lib', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: '/root/src/lib/index.js',
    });
    expect(lookedUpPaths()).toEqual([
      '/root/src/lib',
      '/root/src',
      '/root/src/lib',
    ]);
  });

  test('package entry point', () => {
    expect(Resolver.resolve(context, 'pkg', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/pkg/lib/index.js',
    });
    // The origin, the package directory, and the directory of the entry
    // point. Files directly under node_modules have no scope, so none is
    // looked up for the `pkg` file candidates.
    expect(lookedUpPaths()).toEqual([
      '/root/src/main.js',
      '/root/node_modules/pkg',
      '/root/node_modules/pkg',
      '/root/node_modules/pkg/lib',
    ]);
  });

  test('package subpath', () => {
    expect(Resolver.resolve(context, 'pkg/lib/sub', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/pkg/lib/sub.js',
    });
    expect(lookedUpPaths()).toEqual([
      '/root/src/main.js',
      '/root/node_modules/pkg/lib/sub',
      '/root/node_modules/pkg/lib/sub',
      '/root/node_modules/pkg/lib',
    ]);
  });

  test('package subpath redirected by the "browser" field', () => {
    expect(Resolver.resolve(context, 'pkg/lib/redirected', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/pkg/lib/other.js',
    });
    // The redirected path may be redirected again by its own scope
    expect(lookedUpPaths()).toEqual([
      '/root/src/main.js',
      '/root/node_modules/pkg/lib/redirected',
      '/root/node_modules/pkg/lib/other.js',
      '/root/node_modules/pkg/lib',
    ]);
  });

  test('module under node_modules without a package.json', () => {
    expect(Resolver.resolve(context, 'nopkg', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/nopkg/index.js',
    });
    expect(lookedUpPaths()).toEqual([
      '/root/src/main.js',
      '/root/node_modules/nopkg',
      '/root/node_modules/nopkg',
      '/root/node_modules/nopkg',
    ]);
  });

  test('package subpath with package exports', () => {
    useFileMap({
      ...fileMap,
      '/root/node_modules/pkg/package.json': JSON.stringify({
        name: 'pkg',
        exports: {'./sub': './lib/sub.js'},
      }),
    });
    context = {...context, unstable_enablePackageExports: true};
    expect(Resolver.resolve(context, 'pkg/sub', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/pkg/lib/sub.js',
    });
    expect(lookedUpPaths()).toEqual([
      '/root/src/main.js',
      '/root/node_modules/pkg/sub',
      '/root/node_modules/pkg/sub',
    ]);
  });
});
