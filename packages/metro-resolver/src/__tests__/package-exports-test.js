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
import path from 'node:path';

// Tests validating Package Exports resolution behaviour. See RFC0534:
// https://github.com/react-native-community/discussions-and-proposals/blob/master/proposals/0534-metro-package-exports-support.md
//
// '[nonstrict]' tests describe behaviour that is out-of-spec, but which Metro
// supports at feature launch for backwards compatibility. A future strict mode
// for exports will disable these features.

describe('with package exports resolution disabled', () => {
  test('should ignore "exports" field for main entry point', () => {
    const context = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': JSON.stringify({
          main: 'index.js',
          exports: './index-exports.js',
        }),
        '/root/node_modules/test-pkg/index.js': '',
        '/root/node_modules/test-pkg/index-exports.js': '',
      }),
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: false,
    };

    expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/test-pkg/index.js',
    });
  });

  test('should ignore "exports" field for subpaths', () => {
    const context = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': JSON.stringify({
          main: 'index.js',
          exports: {
            './foo.js': './lib/foo.js',
          },
        }),
        '/root/node_modules/test-pkg/index.js': '',
        '/root/node_modules/test-pkg/foo.js': '',
        '/root/node_modules/test-pkg/foo.ios.js': '',
        '/root/node_modules/test-pkg/lib/foo.js': '',
      }),
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: false,
    };

    expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/test-pkg/foo.js',
    });

    const logWarning = jest.fn();

    expect(
      Resolver.resolve(
        {...context, unstable_logWarning: logWarning},
        'test-pkg/foo',
        'ios',
      ),
    ).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/test-pkg/foo.ios.js',
    });
    expect(logWarning).not.toHaveBeenCalled();
  });

  test('should ignore invalid "exports" field', () => {
    const context = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': JSON.stringify({
          main: 'index.js',
          exports: {
            '.': './index-exports.js',
            browser: './index.js',
          },
        }),
        '/root/node_modules/test-pkg/index.js': '',
      }),
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: false,
    };

    expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
      type: 'sourceFile',
      filePath: '/root/node_modules/test-pkg/index.js',
    });
  });
});

describe('with package exports resolution enabled', () => {
  describe('main entry point', () => {
    const baseContext = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': '',
        '/root/node_modules/test-pkg/index.js': '',
        '/root/node_modules/test-pkg/index-main.js': '',
        '/root/node_modules/test-pkg/index-exports.js.js': '',
        '/root/node_modules/test-pkg/index-exports.ios.js': '',
        '/root/node_modules/test-pkg/symlink.js': {
          realPath: '/root/node_modules/test-pkg/symlink-target.js',
        },
      }),
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: true,
    };

    test('should resolve package using "exports" field', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            main: 'index-main.js',
            exports: {
              '.': './index.js',
            },
          },
        }),
      };

      expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index.js',
      });
    });

    test('should resolve package using "exports" field (shorthand)', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            main: 'index-main.js',
            exports: './index.js',
          },
        }),
      };

      expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index.js',
      });
    });

    test('[nonstrict] should fall back to "main" field resolution when file does not exist', () => {
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            main: 'index-main.js',
            exports: './foo.js',
          },
        }),
        unstable_logWarning: logWarning,
      };

      expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index-main.js',
      });
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toMatchInlineSnapshot(`
        "The package /root/node_modules/test-pkg contains an invalid package.json configuration. Consider raising this issue with the package maintainer(s).
        Reason: The resolution for \\"/root/node_modules/test-pkg\\" defined in \\"exports\\" is /root/node_modules/test-pkg/foo.js, however this file does not exist. Falling back to file-based resolution."
      `);
    });

    test('[nonstrict] should fall back to "main" field resolution when "exports" is an invalid subpath', () => {
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            main: 'index-main.js',
            exports: 'index.js',
          },
        }),
        unstable_logWarning: logWarning,
      };

      expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/index-main.js',
      });
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toMatchInlineSnapshot(`
        "The package /root/node_modules/test-pkg contains an invalid package.json configuration. Consider raising this issue with the package maintainer(s).
        Reason: One or more mappings for subpaths defined in \\"exports\\" are invalid. All values must begin with \\"./\\". Falling back to file-based resolution."
      `);
    });

    describe('should resolve "exports" target directly', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            exports: './index-exports.js',
          },
        }),
      };

      test('without expanding `sourceExts`', () => {
        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          // [nonstrict] Falls back to index.js based on file resolution
          filePath: '/root/node_modules/test-pkg/index.js',
        });
      });

      test('without expanding platform-specific extensions', () => {
        expect(Resolver.resolve(context, 'test-pkg', 'ios')).toEqual({
          type: 'sourceFile',
          // [nonstrict] Falls back to index.js based on file resolution
          filePath: '/root/node_modules/test-pkg/index.js',
        });
      });

      test('following symlinks and resolving real paths', () => {
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            '/root/node_modules/test-pkg/package.json': {
              main: 'index-main.js',
              exports: './symlink.js',
            },
          }),
        };

        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/symlink-target.js',
        });
      });
    });

    describe('array root shorthand', () => {
      const logWarning = jest.fn();
      const context = {
        ...createResolutionContext({
          '/root/src/main.js': '',
          '/root/node_modules/test-pkg/index.js': '',
          '/root/node_modules/test-pkg/foo.js': '',
          '/root/node_modules/test-pkg/package.json': JSON.stringify({
            exports: ['bad-specifier', './index.js', './foo.js'],
          }),
        }),
        originModulePath: '/root/src/main.js',
        unstable_enablePackageExports: true,
        unstable_logWarning: logWarning,
      };

      test('should pick the first valid "exports" array entry', () => {
        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/index.js',
        });
        expect(logWarning).not.toHaveBeenCalled();
      });
    });
  });

  describe('subpath exports', () => {
    const baseContext = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': JSON.stringify({
          name: 'test-pkg',
          main: 'index.js',
          exports: {
            '.': './index.js',
            './foo.js': './lib/foo.js',
            './baz': './node_modules/baz/index.js',
            './metadata.json': './metadata.min.json',
          },
        }),
        '/root/node_modules/test-pkg/index.js': '',
        '/root/node_modules/test-pkg/foo.js': '',
        '/root/node_modules/test-pkg/foo.ios.js': '',
        '/root/node_modules/test-pkg/lib/foo.js': '',
        '/root/node_modules/test-pkg/lib/foo.js.js': '',
        '/root/node_modules/test-pkg/lib/foo.ios.js': '',
        '/root/node_modules/test-pkg/private/bar.js': '',
        '/root/node_modules/test-pkg/node_modules/baz/index.js': '',
        '/root/node_modules/test-pkg/node_modules/baz/package.json': '',
        '/root/node_modules/test-pkg/metadata.json': '',
        '/root/node_modules/test-pkg/metadata.min.json': '',
      }),
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: true,
    };

    test('should resolve subpath in "exports" using exact import specifier', () => {
      expect(Resolver.resolve(baseContext, 'test-pkg/foo.js', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/lib/foo.js',
      });
    });

    test('[nonstrict] should fall back to "browser" spec resolution and log inaccessible import warning', () => {
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        unstable_logWarning: logWarning,
      };

      expect(Resolver.resolve(context, 'test-pkg/foo', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/foo.js',
      });
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toMatchInlineSnapshot(
        `"Attempted to import the module \\"/root/node_modules/test-pkg/foo\\" which is not listed in the \\"exports\\" of \\"/root/node_modules/test-pkg\\" under the requested subpath \\"./foo\\". Falling back to file-based resolution. Consider updating the call site or asking the package maintainer(s) to expose this API."`,
      );
    });

    test('[nonstrict] should fall back and log warning for an invalid "exports" target value', () => {
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        unstable_logWarning: logWarning,
      };

      // TODO(T145206395): Improve this error trace
      expect(() => Resolver.resolve(context, 'test-pkg/baz', null))
        .toThrowErrorMatchingInlineSnapshot(`
        "Module does not exist in the Haste module map or in these directories:
          /root/src/node_modules
          /root/node_modules
          /node_modules
        "
      `);
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toMatchInlineSnapshot(`
        "The package /root/node_modules/test-pkg contains an invalid package.json configuration. Consider raising this issue with the package maintainer(s).
        Reason: The target for \\"./baz\\" defined in \\"exports\\" is \\"./node_modules/baz/index.js\\", however this value is an invalid subpath or subpath pattern because it includes \\"node_modules\\". Falling back to file-based resolution."
      `);
    });

    test('should use "exports" for bare specifiers within the same package', () => {
      const context = {
        ...baseContext,
        originModulePath: '/root/node_modules/test-pkg/lib/foo.js',
      };

      expect(Resolver.resolve(context, 'test-pkg/metadata.json', null)).toEqual(
        {
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/metadata.min.json',
        },
      );
    });

    test('should not use "exports" for internal relative imports within a package', () => {
      const context = {
        ...baseContext,
        originModulePath: '/root/node_modules/test-pkg/lib/foo.js',
      };

      expect(Resolver.resolve(context, '../metadata.json', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/metadata.json',
      });
    });

    test('should not use "exports" for an absolute import path', () => {
      expect(
        Resolver.resolve(
          baseContext,
          '/root/node_modules/test-pkg/metadata.json',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/metadata.json',
      });
    });

    test('should resolve subpath when package is located in nested node_modules path', () => {
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            exports: './index-exports.js',
          },
          '/root/node_modules/test-pkg/node_modules/baz/package.json': {
            exports: './index.js',
          },
        }),
        originModulePath: '/root/node_modules/test-pkg/private/bar.js',
        unstable_logWarning: logWarning,
      };

      expect(Resolver.resolve(context, 'baz', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/node_modules/baz/index.js',
      });
      // If a warning was logged, we have incorrectly tried to resolve "exports"
      // against the parent package.json.
      expect(logWarning).not.toHaveBeenCalled();
    });

    describe('should resolve "exports" target directly', () => {
      test('without expanding `sourceExts`', () => {
        expect(Resolver.resolve(baseContext, 'test-pkg/foo.js', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/lib/foo.js',
        });
      });

      test('without expanding platform-specific extensions', () => {
        expect(Resolver.resolve(baseContext, 'test-pkg/foo.js', 'ios')).toEqual(
          {
            type: 'sourceFile',
            filePath: '/root/node_modules/test-pkg/lib/foo.js',
          },
        );
      });
    });

    describe('package encapsulation', () => {
      test('[nonstrict] should fall back to "browser" spec resolution and log inaccessible import warning', () => {
        const logWarning = jest.fn();
        const context = {
          ...baseContext,
          unstable_logWarning: logWarning,
        };

        expect(Resolver.resolve(context, 'test-pkg/private/bar', null)).toEqual(
          {
            type: 'sourceFile',
            filePath: '/root/node_modules/test-pkg/private/bar.js',
          },
        );
        expect(logWarning).toHaveBeenCalledTimes(1);
        expect(logWarning.mock.calls[0][0]).toMatchInlineSnapshot(
          `"Attempted to import the module \\"/root/node_modules/test-pkg/private/bar\\" which is not listed in the \\"exports\\" of \\"/root/node_modules/test-pkg\\" under the requested subpath \\"./private/bar\\". Falling back to file-based resolution. Consider updating the call site or asking the package maintainer(s) to expose this API."`,
        );
      });

      test('should not log warning when no "exports" field is present', () => {
        const logWarning = jest.fn();
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            '/root/node_modules/test-pkg/package.json': {
              main: 'index-main.js',
            },
          }),
          unstable_logWarning: logWarning,
        };

        expect(Resolver.resolve(context, 'test-pkg/private/bar', null)).toEqual(
          {
            type: 'sourceFile',
            filePath: '/root/node_modules/test-pkg/private/bar.js',
          },
        );
        expect(logWarning).not.toHaveBeenCalled();
      });
    });

    describe('haste package', () => {
      test('should resolve subpath in "exports"', () => {
        const context = {
          ...baseContext,
          resolveHastePackage(name: string) {
            if (name === 'test-pkg') {
              return '/root/node_modules/test-pkg/package.json';
            }
            return null;
          },
        };
        expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/lib/foo.js',
        });
      });
    });
  });

  describe('subpath patterns', () => {
    const baseContext = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': JSON.stringify({
          name: 'test-pkg',
          main: 'index.js',
          exports: {
            '.': './src/index.js',
            './features/*.js': './src/features/*.js',
            './features/bar/*.js': {
              'react-native': null,
            },
            './node/*': './lib/node/*.js',
            './*': './misc/*.js',
            './node/*/types': './types/*/types.d.ts',
            './assets/*': './assets/*',
            './repeated*/repeated': './repeated*/repeated.js',
            './*/private': './src/forbidden.js',
            './data.*': './data/*/data.*',
          },
        }),
        '/root/node_modules/test-pkg/lib/node/test.js': '',
        '/root/node_modules/test-pkg/lib/node/foo/public.js': '',
        '/root/node_modules/test-pkg/src/index.js': '',
        '/root/node_modules/test-pkg/src/features/foo.js': '',
        '/root/node_modules/test-pkg/src/features/foo.js.js': '',
        '/root/node_modules/test-pkg/src/features/bar/Bar.js': '',
        '/root/node_modules/test-pkg/src/features/baz.native.js': '',
        '/root/node_modules/test-pkg/src/features/node_modules/foo/index.js':
          '',
        '/root/node_modules/test-pkg/src/forbidden.js': '',
        '/root/node_modules/test-pkg/misc/repeated.js': '',
        '/root/node_modules/test-pkg/repeated/repeated.js': '',
        '/root/node_modules/test-pkg/repeated/repeated/repeated.js': '',
        '/root/node_modules/test-pkg/types/foo/types.d.ts': '',
        '/root/node_modules/test-pkg/assets/Logo.js': '',
        '/root/node_modules/test-pkg/data/json/data.json': '',
        '/root/node_modules/test-pkg/data/csv/data.csv': '',
      }),
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: true,
    };

    test('should resolve subpath patterns in "exports" matching import specifier', () => {
      for (const [importSpecifier, filePath] of [
        [
          'test-pkg/features/foo.js',
          '/root/node_modules/test-pkg/src/features/foo.js',
        ],
        // Valid: Subpath patterns allow the match to be any substring between
        // the pattern base and pattern trailer
        [
          'test-pkg/features/foo.js.js',
          '/root/node_modules/test-pkg/src/features/foo.js.js',
        ],
      ]) {
        expect(Resolver.resolve(baseContext, importSpecifier, null)).toEqual({
          type: 'sourceFile',
          filePath,
        });
      }

      expect(() =>
        Resolver.resolve(baseContext, 'test-pkg/features/foo', null),
      ).toThrowError();
      expect(() =>
        Resolver.resolve(baseContext, 'test-pkg/features/baz.js', null),
      ).toThrowError();
    });

    test('should use the most specific pattern base - implicit default condition', () => {
      expect(() =>
        Resolver.resolve(baseContext, 'test-pkg/features/bar/Bar.js', null),
      ).toThrowError();
    });

    test('should use most specific pattern base - custom condition', () => {
      const context = {
        ...baseContext,
        unstable_conditionNames: ['react-native'],
      };

      // TODO(T145206395): Improve this error trace
      expect(() =>
        Resolver.resolve(context, 'test-pkg/features/bar/Bar.js', null),
      ).toThrowErrorMatchingInlineSnapshot(`
        "Module does not exist in the Haste module map or in these directories:
          /root/src/node_modules
          /root/node_modules
          /node_modules
        "
      `);
    });

    test('should resolve prefixed wildcard export, using the most specific export path', () => {
      const context = baseContext;

      expect(Resolver.resolve(context, 'test-pkg/node/test', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/lib/node/test.js',
      });
    });

    test('longer patterns have higher specificity if bases are equal', () => {
      const context = baseContext;
      expect(
        Resolver.resolve(context, 'test-pkg/node/foo/public', null),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/lib/node/foo/public.js',
      });

      expect(
        Resolver.resolve(context, 'test-pkg/node/foo/types', null),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/types/foo/types.d.ts',
      });
    });

    test('patternBase and patternTrailer must match non-overlapping ends of matchKey', () => {
      // ./repeated/repeated *should* match ./repeated*/repeated
      expect(
        Resolver.resolve(baseContext, 'test-pkg/repeated/repeated', null),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/repeated/repeated.js',
      });

      // ./repeated should *not* match ./repeated*/repeated
      expect(Resolver.resolve(baseContext, 'test-pkg/repeated', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/misc/repeated.js',
      });
    });

    test('patterns can resolve to static targets', () => {
      const context = baseContext;
      expect(Resolver.resolve(context, 'test-pkg/foo/private', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/src/forbidden.js',
      });
    });

    test('patterns can resolve to targets with multiple *', () => {
      const context = baseContext;
      expect(Resolver.resolve(context, 'test-pkg/data.json', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/data/json/data.json',
      });

      expect(Resolver.resolve(context, 'test-pkg/data.csv', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/data/csv/data.csv',
      });
    });

    describe('package encapsulation', () => {
      test('[nonstrict] should fall back to "browser" spec resolution and log inaccessible import warning', () => {
        const logWarning = jest.fn();
        const context = {
          ...baseContext,
          unstable_logWarning: logWarning,
        };

        expect(
          Resolver.resolve(context, 'test-pkg/assets/Logo.js', null),
        ).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/assets/Logo.js',
        });
        expect(logWarning).not.toHaveBeenCalled();
      });
    });
  });

  describe('conditional exports', () => {
    const baseContext = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': JSON.stringify({
          name: 'test-pkg',
          main: 'index.js',
          exports: {
            './foo.js': {
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
        '/root/node_modules/test-pkg/index.js': '',
        '/root/node_modules/test-pkg/lib/foo.js': '',
        '/root/node_modules/test-pkg/lib/foo-require.cjs': '',
        '/root/node_modules/test-pkg/lib/foo-module.mjs': '',
        '/root/node_modules/test-pkg/lib/foo-dev.js': '',
        '/root/node_modules/test-pkg/lib/foo-browser.js': '',
        '/root/node_modules/test-pkg/lib/foo-react-native.cjs': '',
        '/root/node_modules/test-pkg/lib/foo-react-native.mjs': '',
        '/root/node_modules/test-pkg/lib/foo-react-native.js': '',
        '/root/node_modules/test-pkg/lib/foo.web.js': '',
      }),
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: true,
    };

    test('should resolve "exports" subpath with conditions', () => {
      const context = {
        ...baseContext,
        unstable_conditionNames: ['require', 'react-native'],
      };

      expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/lib/foo-react-native.cjs',
      });
    });

    test('should resolve "exports" subpath with nested conditions', () => {
      const context = {
        ...baseContext,
        unstable_conditionNames: ['require', 'react-native'],
      };

      expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/lib/foo-react-native.cjs',
      });
    });

    test('should resolve asserted conditions in order specified by package', () => {
      expect(
        Resolver.resolve(
          {
            ...baseContext,
            unstable_conditionNames: ['react-native', 'browser'],
          },
          'test-pkg/foo.js',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/lib/foo-react-native.cjs',
      });

      expect(
        Resolver.resolve(
          {
            ...baseContext,
            unstable_conditionNames: ['browser'],
          },
          'test-pkg/foo.js',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/lib/foo-browser.js',
      });

      expect(
        Resolver.resolve(
          {
            ...baseContext,
            unstable_conditionNames: [],
          },
          'test-pkg/foo.js',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/lib/foo-require.cjs',
      });
    });

    test('should fall back to "default" condition if present', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            main: 'index.js',
            exports: {
              './foo.js': {
                import: './lib/foo-module.mjs',
                default: './lib/foo.js',
              },
            },
          },
        }),
        isESMImport: false,
        unstable_conditionNames: [],
      };

      expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/test-pkg/lib/foo.js',
      });
    });

    test('should throw FailedToResolvePathError when no conditions are matched', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/test-pkg/package.json': {
            main: 'index.js',
            exports: {
              './foo.js': {
                // ESM-only package, but we'll require() it
                import: './lib/foo-module.mjs',
                // 'default' entry can be omitted
              },
            },
          },
        }),
        isESMImport: false,
        unstable_conditionNames: [],
      };

      // TODO(T145206395): Improve this error trace
      expect(() => Resolver.resolve(context, 'test-pkg/foo.js', null))
        .toThrowErrorMatchingInlineSnapshot(`
        "Module does not exist in the Haste module map or in these directories:
          /root/src/node_modules
          /root/node_modules
          /node_modules
        "
      `);
    });

    describe('unstable_conditionsByPlatform', () => {
      test('should resolve "browser" condition for `web` platform when configured', () => {
        const context = {
          ...baseContext,
          unstable_conditionNames: [],
          unstable_conditionsByPlatform: {
            web: ['browser'],
          },
        };

        // Null platform => no per-platform conditions asserted.
        expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/lib/foo-require.cjs',
        });

        // 'web' platform => 'browser' condition is asserted.
        expect(Resolver.resolve(context, 'test-pkg/foo.js', 'web')).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/lib/foo-browser.js',
        });
      });

      test('should resolve using overridden per-platform conditions', () => {
        const context = {
          ...baseContext,
          unstable_conditionNames: [],
          unstable_conditionsByPlatform: {
            web: ['development', 'browser'],
          },
        };

        // Asserting 'development' condition prefers foo-dev.
        expect(Resolver.resolve(context, 'test-pkg/foo.js', 'web')).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/lib/foo-dev.js',
        });

        // Without 'development' or 'browser', 'require' is the first match.
        expect(
          Resolver.resolve(
            {...context, unstable_conditionsByPlatform: {}},
            'test-pkg/foo.js',
            'web',
          ),
        ).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/lib/foo-require.cjs',
        });
      });
    });

    describe('main entry point', () => {
      const baseContext = {
        ...createResolutionContext({
          '/root/src/main.js': '',
          '/root/node_modules/test-pkg/package.json': '',
          '/root/node_modules/test-pkg/index.js': '',
          '/root/node_modules/test-pkg/index-browser.js': '',
        }),
        originModulePath: '/root/src/main.js',
        unstable_enablePackageExports: true,
      };

      test('should resolve main entry point using conditional exports', () => {
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            '/root/node_modules/test-pkg/package.json': {
              main: 'index-main.js',
              exports: {
                '.': {
                  browser: './index-browser.js',
                  default: './index.js',
                },
              },
            },
          }),
          unstable_conditionNames: ['browser'],
        };

        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/index-browser.js',
        });
      });

      test('should resolve main entry point when root keys are a condition mapping (shorthand)', () => {
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            '/root/node_modules/test-pkg/package.json': {
              main: 'index-main.js',
              exports: {
                browser: './index-browser.js',
                default: './index.js',
              },
            },
          }),
          unstable_conditionNames: ['browser'],
        };

        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/index-browser.js',
        });
      });
    });

    describe('package encapsulation', () => {
      test('[nonstrict] should fall back to "browser" spec resolution and log inaccessible import warning', () => {
        const logWarning = jest.fn();
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            '/root/node_modules/test-pkg/package.json': {
              main: 'index.js',
              exports: {
                './lib/foo.js': {
                  // ESM-only package, but we'll require() it
                  import: './lib/foo-module.mjs',
                  // 'default' entry can be omitted
                },
              },
            },
          }),
          isESMImport: false,
          unstable_conditionNames: [],
          unstable_logWarning: logWarning,
        };

        expect(Resolver.resolve(context, 'test-pkg/lib/foo.js', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/lib/foo.js',
        });
        expect(logWarning).toHaveBeenCalledTimes(1);
        expect(logWarning.mock.calls[0][0]).toMatchInlineSnapshot(
          `"Attempted to import the module \\"/root/node_modules/test-pkg/lib/foo.js\\" which is listed in the \\"exports\\" of \\"/root/node_modules/test-pkg\\", however no match was resolved for this request (platform = null). Falling back to file-based resolution. Consider updating the call site or asking the package maintainer(s) to expose this API."`,
        );
      });
    });
  });

  describe('asset resolutions', () => {
    const assetResolutions = ['1', '1.5', '2', '3', '4'];

    const baseContext = {
      ...createResolutionContext({
        '/root/src/main.js': '',
        '/root/node_modules/test-pkg/package.json': JSON.stringify({
          main: './index.js',
          exports: {
            './icons/metro.png': './assets/icons/metro.png',
          },
        }),
        '/root/node_modules/test-pkg/assets/icons/metro.png': '',
        '/root/node_modules/test-pkg/assets/icons/metro@2x.png': '',
        '/root/node_modules/test-pkg/assets/icons/metro@3x.png': '',
      }),
      assetExts: new Set(['png']),
      originModulePath: '/root/src/main.js',
      unstable_enablePackageExports: true,
    };

    test('should resolve assets using "exports" field and calling `resolveAsset`', () => {
      const resolveAsset = jest.fn(
        (dirPath: string, basename: string, extension: string) => {
          const basePath = dirPath + path.sep + basename;
          const assets = [
            basePath + extension,
            ...assetResolutions.map(
              resolution => basePath + '@' + resolution + 'x' + extension,
            ),
          ].filter(candidate => baseContext.doesFileExist(candidate));

          return assets.length ? assets : null;
        },
      );
      const context = {
        ...baseContext,
        resolveAsset,
      };

      expect(
        Resolver.resolve(context, 'test-pkg/icons/metro.png', null),
      ).toEqual({
        type: 'assetFiles',
        filePaths: [
          '/root/node_modules/test-pkg/assets/icons/metro.png',
          '/root/node_modules/test-pkg/assets/icons/metro@2x.png',
          '/root/node_modules/test-pkg/assets/icons/metro@3x.png',
        ],
      });
      expect(resolveAsset).toHaveBeenLastCalledWith(
        '/root/node_modules/test-pkg/assets/icons',
        'metro',
        '.png',
      );
    });
  });

  describe('compatibility with non-standard "exports" array formats', () => {
    // Node.js versions >=13.0.0, <13.7.0 support the `exports` field but not
    // conditional exports. Used by packages such as @babel/runtime.
    // See https://github.com/babel/babel/pull/12877
    describe('early Node.js 13 versions', () => {
      test('should use first value when subpath is an array including a condition mapping', () => {
        const context = {
          ...createResolutionContext({
            '/root/src/main.js': '',
            '/root/node_modules/test-pkg/package.json': JSON.stringify({
              exports: {
                '.': [
                  {
                    'react-native': './index-react-native.js',
                    default: './index.js',
                  },
                  './index.js',
                ],
              },
            }),
            '/root/node_modules/test-pkg/index.js': '',
            '/root/node_modules/test-pkg/index-react-native.js': '',
          }),
          originModulePath: '/root/src/main.js',
          unstable_conditionNames: [],
          unstable_enablePackageExports: true,
        };

        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/index.js',
        });
        expect(
          Resolver.resolve(
            {...context, unstable_conditionNames: ['react-native']},
            'test-pkg',
            null,
          ),
        ).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/index-react-native.js',
        });
      });

      test('should use first value when subpath (root shorthand) is an array including a condition mapping', () => {
        const context = {
          ...createResolutionContext({
            '/root/src/main.js': '',
            '/root/node_modules/test-pkg/package.json': JSON.stringify({
              exports: [
                {browser: './index-browser.js', default: 'index.js'},
                './index-alt.js',
              ],
            }),
            '/root/node_modules/test-pkg/index.js': '',
            '/root/node_modules/test-pkg/index-browser.js': '',
          }),
          originModulePath: '/root/src/main.js',
          unstable_conditionNames: ['browser'],
          unstable_enablePackageExports: true,
        };

        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/index-browser.js',
        });
      });
    });

    // Array as order-preserving data structure for other environments.
    // See https://github.com/nodejs/node/issues/37777#issuecomment-804164719
    describe('[unsupported] exotic nested arrays', () => {
      test('should fall back and log warning for nested array at root', () => {
        const logWarning = jest.fn();
        const context = {
          ...createResolutionContext({
            '/root/src/main.js': '',
            '/root/node_modules/test-pkg/package.json': JSON.stringify({
              main: './index.js',
              exports: [
                [{import: 'index.mjs'}],
                [{require: 'index.cjs'}],
                ['index.cjs'],
              ],
            }),
            '/root/node_modules/test-pkg/index.js': '',
          }),
          originModulePath: '/root/src/main.js',
          unstable_enablePackageExports: true,
          unstable_logWarning: logWarning,
        };

        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/index.js',
        });
        expect(logWarning).toHaveBeenCalledTimes(1);
        expect(logWarning.mock.calls[0][0]).toMatchInlineSnapshot(`
          "The package /root/node_modules/test-pkg contains an invalid package.json configuration. Consider raising this issue with the package maintainer(s).
          Reason: Could not parse non-standard array value at root of \\"exports\\" field. Falling back to file-based resolution."
        `);
      });

      test('should fall back and log warning for nested array at subpath', () => {
        const logWarning = jest.fn();
        const context = {
          ...createResolutionContext({
            '/root/src/main.js': '',
            '/root/node_modules/test-pkg/package.json': JSON.stringify({
              main: './index.js',
              exports: {
                '.': [
                  [{import: 'index.mjs'}],
                  [{require: 'index.cjs'}],
                  ['index.cjs'],
                ],
              },
            }),
            '/root/node_modules/test-pkg/index.js': '',
          }),
          originModulePath: '/root/src/main.js',
          unstable_enablePackageExports: true,
          unstable_logWarning: logWarning,
        };

        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: '/root/node_modules/test-pkg/index.js',
        });
        expect(logWarning).toHaveBeenCalledTimes(1);
        expect(logWarning.mock.calls[0][0]).toMatchInlineSnapshot(`
          "The package /root/node_modules/test-pkg contains an invalid package.json configuration. Consider raising this issue with the package maintainer(s).
          Reason: Could not parse non-standard array value in \\"exports\\" field. Falling back to file-based resolution."
        `);
      });
    });
  });

  describe('@babel/runtime compatibility (special case)', () => {
    test('should never assert "import" condition', () => {
      const context = {
        ...createResolutionContext({
          '/root/src/main.js': '',
          '/root/node_modules/@babel/runtime/package.json': JSON.stringify({
            exports: {
              './helpers/interopRequireDefault': [
                {
                  node: './helpers/interopRequireDefault.js',
                  import: './helpers/esm/interopRequireDefault.js',
                  default: './helpers/interopRequireDefault.js',
                },
                './helpers/interopRequireDefault.js',
              ],
            },
          }),
          '/root/node_modules/@babel/runtime/helpers/interopRequireDefault.js':
            '',
        }),
        originModulePath: '/root/src/main.js',
        unstable_conditionNames: [],
        unstable_enablePackageExports: true,
      };

      expect(
        Resolver.resolve(
          context,
          '@babel/runtime/helpers/interopRequireDefault',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath:
          '/root/node_modules/@babel/runtime/helpers/interopRequireDefault.js',
      });
    });
  });

  describe('self-referencing imports (PACKAGE_SELF_RESOLVE)', () => {
    const packageJson = {
      name: 'self-pkg',
      main: 'index-main.js',
      exports: {
        '.': './index.js',
        './sub': './lib/sub.js',
      },
    };
    const baseContext = {
      ...createResolutionContext({
        '/root/node_modules/self-pkg/package.json': JSON.stringify(packageJson),
        '/root/node_modules/self-pkg/index.js': '',
        '/root/node_modules/self-pkg/index-main.js': '',
        '/root/node_modules/self-pkg/lib/sub.js': '',
        '/root/node_modules/self-pkg/lib/internal.js': '',
      }),
      originModulePath: '/root/node_modules/self-pkg/index.js',
      unstable_enablePackageExports: true,
    };

    test('should resolve own package name via its own "exports" field', () => {
      expect(Resolver.resolve(baseContext, 'self-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/self-pkg/index.js',
      });
    });

    test('should resolve a subpath of the own package via "exports"', () => {
      expect(Resolver.resolve(baseContext, 'self-pkg/sub', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/self-pkg/lib/sub.js',
      });
    });

    test('[nonstrict] should warn and fall back when self subpath is not in "exports"', () => {
      const logWarning = jest.fn();
      // `./lib/internal.js` is not exported, but exists on disk. We log the
      // out-of-exports access and fall through to the regular hierarchical
      // lookup, which finds the file inside `node_modules/self-pkg/`.
      expect(
        Resolver.resolve(
          {...baseContext, unstable_logWarning: logWarning},
          'self-pkg/lib/internal',
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/self-pkg/lib/internal.js',
      });
      expect(logWarning).toHaveBeenCalled();
      expect(logWarning.mock.calls[0][0]).toMatch(
        /which is not listed in the "exports"/,
      );
    });

    test('should not self-resolve when origin package has no name', () => {
      const noNameContext = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/self-pkg/package.json': {
            main: 'index-main.js',
            exports: {'.': './index.js'},
          },
        }),
      };
      // With no `name`, falls through to hierarchical lookup (and finds the
      // package in node_modules, going through "exports" as a normal import).
      expect(Resolver.resolve(noNameContext, 'self-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/self-pkg/index.js',
      });
    });

    test('should not self-resolve when the package has no "exports" field', () => {
      const noExportsContext = {
        ...baseContext,
        ...createPackageAccessors({
          '/root/node_modules/self-pkg/package.json': {
            name: 'self-pkg',
            main: 'index-main.js',
          },
        }),
      };
      // Without `exports`, self-resolve does not apply. Falls back to
      // node_modules lookup, which resolves via "main".
      expect(Resolver.resolve(noExportsContext, 'self-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: '/root/node_modules/self-pkg/index-main.js',
      });
    });
  });
});
