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
import {
  createPackageAccessors,
  createResolutionContext,
  posixToSystemPath as p,
} from './utils';

// The resolver looks up package scopes through `getPackageForModule`. These
// tests pin down which paths it asks about for each kind of specifier, so
// that changes to the number of lookups per resolution are deliberate. Metro
// memoizes the answer per path, so a repeated path is cheap and a new one is
// not: in particular, the files in a directory are looked up once, through a
// stand-in file name, for all of their extension candidates.
describe('package scope lookups', () => {
  // The path the resolver asks about for the files in a directory
  const filesIn = (dirPath: string) => p(dirPath + '/.metro-package-scope');

  const fileMap = {
    [p('/root/package.json')]: JSON.stringify({name: 'root'}),
    [p('/root/src/main.js')]: '',
    [p('/root/src/foo.js')]: '',
    [p('/root/src/lib/index.js')]: '',
    [p('/root/node_modules/pkg/package.json')]: JSON.stringify({
      name: 'pkg',
      main: 'lib/index',
      browser: {'./lib/redirected.js': './lib/other.js'},
    }),
    [p('/root/node_modules/pkg/lib/index.js')]: '',
    [p('/root/node_modules/pkg/lib/sub.js')]: '',
    [p('/root/node_modules/pkg/lib/other.js')]: '',
    [p('/root/node_modules/nopkg/index.js')]: '',
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
      originModulePath: p('/root/src/main.js'),
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
      filePath: p('/root/src/foo.js'),
    });
    expect(lookedUpPaths()).toEqual([p('/root/src/foo'), filesIn('/root/src')]);
  });

  test('relative file, when the stand-in file name is a package root', () => {
    useFileMap({
      ...fileMap,
      // A package whose "browser" field must not apply to the files beside it
      [p('/root/src/.metro-package-scope/package.json')]: JSON.stringify({
        name: 'stand-in',
        browser: {'./foo.js': false},
      }),
    });
    expect(Resolver.resolve(context, './foo', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/src/foo.js'),
    });
    // The stand-in is retried with another name
    expect(lookedUpPaths()).toEqual([
      p('/root/src/foo'),
      filesIn('/root/src'),
      filesIn('/root/src') + '_',
    ]);
  });

  test('throws if the scope is never that of the stand-in file', () => {
    getPackageForModule = jest.fn(() => ({
      rootPath: p('/root'),
      packageJson: {name: 'root'},
      packageRelativePath: '',
    }));
    context = {...context, getPackageForModule};
    expect(() => Resolver.resolve(context, './foo', 'ios')).toThrow(
      `getPackageForModule(${JSON.stringify(filesIn('/root/src') + '__')}) ` +
        'returned packageRelativePath "", which should end in ' +
        '".metro-package-scope__".',
    );
    expect(lookedUpPaths()).toEqual([
      p('/root/src/foo'),
      filesIn('/root/src'),
      filesIn('/root/src') + '_',
      filesIn('/root/src') + '__',
    ]);
  });

  test('relative file in the file system root', () => {
    useFileMap({[p('/main.js')]: '', [p('/foo.js')]: ''});
    context = {...context, originModulePath: p('/main.js')};
    expect(Resolver.resolve(context, './foo', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: p('/foo.js'),
    });
    expect(lookedUpPaths()).toEqual([p('/foo'), filesIn('')]);
  });

  test('relative file with an explicit extension', () => {
    expect(Resolver.resolve(context, './foo.js', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/src/foo.js'),
    });
    expect(lookedUpPaths()).toEqual([
      p('/root/src/foo.js'),
      filesIn('/root/src'),
    ]);
  });

  test('relative directory, resolved to its index', () => {
    expect(Resolver.resolve(context, './lib', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/src/lib/index.js'),
    });
    expect(lookedUpPaths()).toEqual([
      p('/root/src/lib'),
      filesIn('/root/src'),
      filesIn('/root/src/lib'),
    ]);
  });

  test('package entry point', () => {
    expect(Resolver.resolve(context, 'pkg', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/pkg/lib/index.js'),
    });
    // The origin, the package directory, the files in node_modules (`pkg` as
    // a file), and the files in the directory of the entry point.
    expect(lookedUpPaths()).toEqual([
      p('/root/src/main.js'),
      p('/root/node_modules/pkg'),
      p('/root/node_modules/pkg'),
      filesIn('/root/node_modules'),
      filesIn('/root/node_modules/pkg/lib'),
    ]);
  });

  test('package subpath', () => {
    expect(Resolver.resolve(context, 'pkg/lib/sub', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/pkg/lib/sub.js'),
    });
    expect(lookedUpPaths()).toEqual([
      p('/root/src/main.js'),
      p('/root/node_modules/pkg/lib/sub'),
      p('/root/node_modules/pkg/lib/sub'),
      filesIn('/root/node_modules/pkg/lib'),
    ]);
  });

  test('package subpath redirected by the "browser" field', () => {
    expect(Resolver.resolve(context, 'pkg/lib/redirected', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/pkg/lib/other.js'),
    });
    // The redirected path may be redirected again by its own scope
    expect(lookedUpPaths()).toEqual([
      p('/root/src/main.js'),
      p('/root/node_modules/pkg/lib/redirected'),
      p('/root/node_modules/pkg/lib/other.js'),
      filesIn('/root/node_modules/pkg/lib'),
    ]);
  });

  test('module under node_modules without a package.json', () => {
    expect(Resolver.resolve(context, 'nopkg', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/nopkg/index.js'),
    });
    expect(lookedUpPaths()).toEqual([
      p('/root/src/main.js'),
      p('/root/node_modules/nopkg'),
      p('/root/node_modules/nopkg'),
      filesIn('/root/node_modules'),
      filesIn('/root/node_modules/nopkg'),
    ]);
  });

  test('package subpath with package exports', () => {
    useFileMap({
      ...fileMap,
      [p('/root/node_modules/pkg/package.json')]: JSON.stringify({
        name: 'pkg',
        exports: {'./sub': './lib/sub.js'},
      }),
    });
    context = {...context, unstable_enablePackageExports: true};
    expect(Resolver.resolve(context, 'pkg/sub', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/pkg/lib/sub.js'),
    });
    expect(lookedUpPaths()).toEqual([
      p('/root/src/main.js'),
      p('/root/node_modules/pkg/sub'),
      p('/root/node_modules/pkg/sub'),
    ]);
  });
});
