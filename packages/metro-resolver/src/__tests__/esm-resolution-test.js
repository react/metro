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

'use strict';

import type {ResolutionContext} from '../index';

import {createPackageAccessors, createResolutionContext} from './utils';

const Resolver = require('../index');

describe('ESM bare specifier resolution skips sibling file lookups in node_modules', () => {
  const fileMap = {
    '/root/src/main.js': '',
    // A normal package with package.json and main entry
    '/root/node_modules/invariant/package.json': JSON.stringify({
      name: 'invariant',
      main: 'index.js',
    }),
    '/root/node_modules/invariant/index.js': '',
    '/root/node_modules/invariant/lib/utils.js': '',
    // A file sitting directly in node_modules (CJS pattern)
    '/root/node_modules/invariant.web.js': '',
    '/root/node_modules/invariant.js': '',
    // Scoped package
    '/root/node_modules/@scope/pkg/package.json': JSON.stringify({
      name: '@scope/pkg',
      main: 'index.js',
    }),
    '/root/node_modules/@scope/pkg/index.js': '',
    '/root/node_modules/@scope/pkg/utils.js': '',
    // Platform-specific file as sibling to scoped package dir
    '/root/node_modules/@scope/pkg.web.js': '',
  };

  const baseContext: ResolutionContext = {
    ...createResolutionContext(fileMap),
    originModulePath: '/root/src/main.js',
  };

  describe('bare package import (no subpath)', () => {
    test('CJS resolves bare import to sibling file when it exists', () => {
      // In CJS, resolveFile runs first, finding invariant.js as a sibling
      expect(
        Resolver.resolve(
          {...baseContext, isESMImport: false},
          'invariant',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/invariant.js',
      });
    });

    test('ESM resolves bare import via package.json main, not sibling file', () => {
      // In ESM, resolveFile is skipped for bare package root imports,
      // so it falls through to resolvePackageEntryPoint
      expect(
        Resolver.resolve(
          {...baseContext, isESMImport: true},
          'invariant',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/invariant/index.js',
      });
    });

    test('ESM does not resolve to a sibling file like node_modules/invariant.web.js', () => {
      // Remove the package directory to force file fallback
      const fileMapNoDir = {
        '/root/src/main.js': '',
        '/root/node_modules/invariant.web.js': '',
        '/root/node_modules/invariant.js': '',
      };

      const context: ResolutionContext = {
        ...createResolutionContext(fileMapNoDir),
        originModulePath: '/root/src/main.js',
        isESMImport: true,
      };

      // ESM should NOT resolve bare 'invariant' to node_modules/invariant.js
      expect(() => Resolver.resolve(context, 'invariant', null)).toThrow();
    });

    test('CJS can resolve to a standalone file in node_modules', () => {
      const fileMapNoDir = {
        '/root/src/main.js': '',
        '/root/node_modules/invariant.web.js': '',
        '/root/node_modules/invariant.js': '',
      };

      const context: ResolutionContext = {
        ...createResolutionContext(fileMapNoDir),
        originModulePath: '/root/src/main.js',
        isESMImport: false,
      };

      // CJS should still resolve bare 'invariant' to node_modules/invariant.js
      expect(Resolver.resolve(context, 'invariant', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/invariant.js',
      });
    });

    test('ESM does not try platform extensions as sibling files for bare import', () => {
      const fileSystemLookup = jest.fn(baseContext.fileSystemLookup);
      const context: ResolutionContext = {
        ...baseContext,
        fileSystemLookup,
        isESMImport: true,
      };

      Resolver.resolve(context, 'invariant', null);

      // Should NOT have looked up any of these sibling file paths
      const lookedUpPaths = fileSystemLookup.mock.calls.map(c => c[0]);
      expect(lookedUpPaths).not.toContain(
        '/root/node_modules/invariant.web.js',
      );
      expect(lookedUpPaths).not.toContain('/root/node_modules/invariant.js');
      expect(lookedUpPaths).not.toContain(
        '/root/node_modules/invariant.native.js',
      );
      // But should have looked up the directory
      expect(lookedUpPaths).toContain('/root/node_modules');
    });

    test('CJS tries file extensions as sibling files for bare import', () => {
      const fileSystemLookup = jest.fn(baseContext.fileSystemLookup);
      const context: ResolutionContext = {
        ...baseContext,
        fileSystemLookup,
        isESMImport: false,
      };

      Resolver.resolve(context, 'invariant', null);

      // CJS should try sibling file paths (even though the package resolves
      // first in this case, the file resolution runs in resolveModulePath)
      const lookedUpPaths = fileSystemLookup.mock.calls.map(c => c[0]);
      // The invariant directory exists as a package, so resolveFile is called
      // within resolveModulePath - it looks for the bare file first
      expect(lookedUpPaths).toContain('/root/node_modules/invariant');
    });
  });

  describe('scoped bare package import', () => {
    test('ESM resolves scoped package via package.json main', () => {
      expect(
        Resolver.resolve(
          {...baseContext, isESMImport: true},
          '@scope/pkg',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/@scope/pkg/index.js',
      });
    });

    test('ESM does not try file extensions on scoped package name', () => {
      const fileSystemLookup = jest.fn(baseContext.fileSystemLookup);
      const context: ResolutionContext = {
        ...baseContext,
        fileSystemLookup,
        isESMImport: true,
      };

      Resolver.resolve(context, '@scope/pkg', null);

      const lookedUpPaths = fileSystemLookup.mock.calls.map(c => c[0]);
      expect(lookedUpPaths).not.toContain(
        '/root/node_modules/@scope/pkg.web.js',
      );
      expect(lookedUpPaths).not.toContain('/root/node_modules/@scope/pkg.js');
    });
  });

  describe('subpath import (not package root)', () => {
    test('ESM resolves subpath with file extensions', () => {
      expect(
        Resolver.resolve(
          {...baseContext, isESMImport: true},
          'invariant/lib/utils',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/invariant/lib/utils.js',
      });
    });

    test('CJS resolves subpath with file extensions', () => {
      expect(
        Resolver.resolve(
          {...baseContext, isESMImport: false},
          'invariant/lib/utils',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/invariant/lib/utils.js',
      });
    });

    test('ESM subpath import still tries platform extensions inside the package', () => {
      const fileMapWithPlatform = {
        ...fileMap,
        '/root/node_modules/invariant/lib/utils.web.js': '',
      };

      const context: ResolutionContext = {
        ...createResolutionContext(fileMapWithPlatform),
        originModulePath: '/root/src/main.js',
        isESMImport: true,
      };

      expect(Resolver.resolve(context, 'invariant/lib/utils', 'web')).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/invariant/lib/utils.web.js',
      });
    });

    test('ESM scoped subpath import resolves with file extensions', () => {
      expect(
        Resolver.resolve(
          {...baseContext, isESMImport: true},
          '@scope/pkg/utils',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/@scope/pkg/utils.js',
      });
    });
  });

  describe('with package exports enabled', () => {
    const exportsFileMap = {
      '/root/src/main.js': '',
      '/root/node_modules/pkg-with-exports/package.json': JSON.stringify({
        name: 'pkg-with-exports',
        main: 'lib/index.js',
        exports: {
          '.': './lib/index.js',
          './utils': './lib/utils.js',
        },
      }),
      '/root/node_modules/pkg-with-exports/lib/index.js': '',
      '/root/node_modules/pkg-with-exports/lib/utils.js': '',
      // A sibling file that should never be picked
      '/root/node_modules/pkg-with-exports.js': '',
    };

    const exportsContext: ResolutionContext = {
      ...createResolutionContext(exportsFileMap),
      ...createPackageAccessors(exportsFileMap),
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: true,
    };

    test('ESM resolves via exports field, not sibling file', () => {
      expect(
        Resolver.resolve(
          {...exportsContext, isESMImport: true},
          'pkg-with-exports',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/pkg-with-exports/lib/index.js',
      });
    });

    test('ESM subpath resolves via exports field', () => {
      expect(
        Resolver.resolve(
          {...exportsContext, isESMImport: true},
          'pkg-with-exports/utils',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/pkg-with-exports/lib/utils.js',
      });
    });
  });

  describe('relative and absolute imports are unaffected', () => {
    const relFileMap = {
      '/root/src/main.js': '',
      '/root/src/utils.js': '',
      '/root/src/utils.web.js': '',
    };

    const relContext: ResolutionContext = {
      ...createResolutionContext(relFileMap),
      originModulePath: '/root/src/main.js',
    };

    test('ESM relative import still tries platform extensions', () => {
      expect(
        Resolver.resolve({...relContext, isESMImport: true}, './utils', 'web'),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/src/utils.web.js',
      });
    });

    test('ESM absolute import still tries platform extensions', () => {
      expect(
        Resolver.resolve(
          {...relContext, isESMImport: true},
          '/root/src/utils',
          'web',
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/src/utils.web.js',
      });
    });
  });
});
