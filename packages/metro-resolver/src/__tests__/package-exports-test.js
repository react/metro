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

import PackagePathNotExportedError from '../errors/PackagePathNotExportedError';
import * as Resolver from '../index';
import {resolvePackageTargetFromExports} from '../PackageExportsResolve';
import {
  createPackageAccessors,
  createResolutionContext,
  posixToSystemPath as p,
} from './utils';
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
        [p('/root/src/main.js')]: '',
        [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
          main: 'index.js',
          exports: './index-exports.js',
        }),
        [p('/root/node_modules/test-pkg/index.js')]: '',
        [p('/root/node_modules/test-pkg/index-exports.js')]: '',
      }),
      originModulePath: p('/root/src/main.js'),
      unstable_enablePackageExports: false,
    };

    expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/test-pkg/index.js'),
    });
  });

  test('should ignore "exports" field for subpaths', () => {
    const context = {
      ...createResolutionContext({
        [p('/root/src/main.js')]: '',
        [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
          main: 'index.js',
          exports: {
            './foo.js': './lib/foo.js',
          },
        }),
        [p('/root/node_modules/test-pkg/index.js')]: '',
        [p('/root/node_modules/test-pkg/foo.js')]: '',
        [p('/root/node_modules/test-pkg/foo.ios.js')]: '',
        [p('/root/node_modules/test-pkg/lib/foo.js')]: '',
      }),
      originModulePath: p('/root/src/main.js'),
      unstable_enablePackageExports: false,
    };

    expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/test-pkg/foo.js'),
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
      filePath: p('/root/node_modules/test-pkg/foo.ios.js'),
    });
    expect(logWarning).not.toHaveBeenCalled();
  });

  test('should ignore invalid "exports" field', () => {
    const context = {
      ...createResolutionContext({
        [p('/root/src/main.js')]: '',
        [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
          main: 'index.js',
          exports: {
            '.': './index-exports.js',
            browser: './index.js',
          },
        }),
        [p('/root/node_modules/test-pkg/index.js')]: '',
      }),
      originModulePath: p('/root/src/main.js'),
      unstable_enablePackageExports: false,
    };

    expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/test-pkg/index.js'),
    });
  });
});

describe('with package exports resolution enabled', () => {
  describe('main entry point', () => {
    const baseContext = {
      ...createResolutionContext({
        [p('/root/src/main.js')]: '',
        [p('/root/node_modules/test-pkg/package.json')]: '',
        [p('/root/node_modules/test-pkg/index.js')]: '',
        [p('/root/node_modules/test-pkg/index-main.js')]: '',
        [p('/root/node_modules/test-pkg/index-exports.js.js')]: '',
        [p('/root/node_modules/test-pkg/index-exports.ios.js')]: '',
        [p('/root/node_modules/test-pkg/symlink.js')]: {
          realPath: p('/root/node_modules/test-pkg/symlink-target.js'),
        },
      }),
      originModulePath: p('/root/src/main.js'),
      unstable_enablePackageExports: true,
    };

    test('should resolve package using "exports" field', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          [p('/root/node_modules/test-pkg/package.json')]: {
            main: 'index-main.js',
            exports: {
              '.': './index.js',
            },
          },
        }),
      };

      expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/index.js'),
      });
    });

    test('should resolve package using "exports" field (shorthand)', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          [p('/root/node_modules/test-pkg/package.json')]: {
            main: 'index-main.js',
            exports: './index.js',
          },
        }),
      };

      expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/index.js'),
      });
    });

    test('[nonstrict] should fall back to "main" field resolution when file does not exist', () => {
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          [p('/root/node_modules/test-pkg/package.json')]: {
            main: 'index-main.js',
            exports: './foo.js',
          },
        }),
        unstable_logWarning: logWarning,
      };

      expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/index-main.js'),
      });
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toBe(
        `The package ${p('/root/node_modules/test-pkg')} contains an invalid package.json configuration. Consider raising this issue with the package maintainer(s).\n` +
          `Reason: The resolution for "${p('/root/node_modules/test-pkg')}" defined in "exports" is ${p('/root/node_modules/test-pkg/foo.js')}, however this file does not exist. Falling back to file-based resolution.`,
      );
    });

    test('[nonstrict] should fall back to "main" field resolution when "exports" is an invalid subpath', () => {
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          [p('/root/node_modules/test-pkg/package.json')]: {
            main: 'index-main.js',
            exports: 'index.js',
          },
        }),
        unstable_logWarning: logWarning,
      };

      expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/index-main.js'),
      });
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toBe(
        `The package ${p('/root/node_modules/test-pkg')} contains an invalid package.json configuration. Consider raising this issue with the package maintainer(s).\n` +
          'Reason: The target for "." defined in "exports" is "index.js", however this value is invalid because it does not begin with "./". Falling back to file-based resolution.',
      );
    });

    describe('should resolve "exports" target directly', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          [p('/root/node_modules/test-pkg/package.json')]: {
            exports: './index-exports.js',
          },
        }),
      };

      test('without expanding `sourceExts`', () => {
        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          // [nonstrict] Falls back to index.js based on file resolution
          filePath: p('/root/node_modules/test-pkg/index.js'),
        });
      });

      test('without expanding platform-specific extensions', () => {
        expect(Resolver.resolve(context, 'test-pkg', 'ios')).toEqual({
          type: 'sourceFile',
          // [nonstrict] Falls back to index.js based on file resolution
          filePath: p('/root/node_modules/test-pkg/index.js'),
        });
      });

      test('following symlinks and resolving real paths', () => {
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            [p('/root/node_modules/test-pkg/package.json')]: {
              main: 'index-main.js',
              exports: './symlink.js',
            },
          }),
        };

        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/symlink-target.js'),
        });
      });
    });

    describe('array root shorthand', () => {
      const logWarning = jest.fn();
      const context = {
        ...createResolutionContext({
          [p('/root/src/main.js')]: '',
          [p('/root/node_modules/test-pkg/index.js')]: '',
          [p('/root/node_modules/test-pkg/foo.js')]: '',
          [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
            exports: ['bad-specifier', './index.js', './foo.js'],
          }),
        }),
        originModulePath: p('/root/src/main.js'),
        unstable_enablePackageExports: true,
        unstable_logWarning: logWarning,
      };

      test('should pick the first valid "exports" array entry', () => {
        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/index.js'),
        });
        expect(logWarning).not.toHaveBeenCalled();
      });
    });
  });

  describe('subpath exports', () => {
    const baseContext = {
      ...createResolutionContext({
        [p('/root/src/main.js')]: '',
        [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
          name: 'test-pkg',
          main: 'index.js',
          exports: {
            '.': './index.js',
            './foo.js': './lib/foo.js',
            './baz': './node_modules/baz/index.js',
            './metadata.json': './metadata.min.json',
          },
        }),
        [p('/root/node_modules/test-pkg/index.js')]: '',
        [p('/root/node_modules/test-pkg/foo.js')]: '',
        [p('/root/node_modules/test-pkg/foo.ios.js')]: '',
        [p('/root/node_modules/test-pkg/lib/foo.js')]: '',
        [p('/root/node_modules/test-pkg/lib/foo.js.js')]: '',
        [p('/root/node_modules/test-pkg/lib/foo.ios.js')]: '',
        [p('/root/node_modules/test-pkg/private/bar.js')]: '',
        [p('/root/node_modules/test-pkg/node_modules/baz/index.js')]: '',
        [p('/root/node_modules/test-pkg/node_modules/baz/package.json')]: '',
        [p('/root/node_modules/test-pkg/metadata.json')]: '',
        [p('/root/node_modules/test-pkg/metadata.min.json')]: '',
      }),
      originModulePath: p('/root/src/main.js'),
      unstable_enablePackageExports: true,
    };

    test('should resolve subpath in "exports" using exact import specifier', () => {
      expect(Resolver.resolve(baseContext, 'test-pkg/foo.js', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/lib/foo.js'),
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
        filePath: p('/root/node_modules/test-pkg/foo.js'),
      });
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toBe(
        `Attempted to import the module "${p('/root/node_modules/test-pkg/foo')}" which is not listed in the "exports" of "${p('/root/node_modules/test-pkg')}" under the requested subpath "./foo". Falling back to file-based resolution. Consider updating the call site or asking the package maintainer(s) to expose this API.`,
      );
    });

    test('[nonstrict] should fall back and log warning for an invalid "exports" target value', () => {
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        unstable_logWarning: logWarning,
      };

      // TODO(T145206395): Improve this error trace
      expect(() => Resolver.resolve(context, 'test-pkg/baz', null)).toThrow(
        new Error(
          'Module does not exist in the Haste module map or in these directories:\n' +
            `  ${p('/root/src/node_modules')}\n` +
            `  ${p('/root/node_modules')}\n` +
            `  ${p('/node_modules')}\n`,
        ),
      );
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toBe(
        `The package ${p('/root/node_modules/test-pkg')} contains an invalid package.json configuration. Consider raising this issue with the package maintainer(s).\n` +
          'Reason: The target for "./baz" defined in "exports" is "./node_modules/baz/index.js", however this value is an invalid subpath or subpath pattern because it includes "node_modules". Falling back to file-based resolution.',
      );
    });

    test('should use "exports" for bare specifiers within the same package', () => {
      const context = {
        ...baseContext,
        originModulePath: p('/root/node_modules/test-pkg/lib/foo.js'),
      };

      expect(Resolver.resolve(context, 'test-pkg/metadata.json', null)).toEqual(
        {
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/metadata.min.json'),
        },
      );
    });

    test('should not use "exports" for internal relative imports within a package', () => {
      const context = {
        ...baseContext,
        originModulePath: p('/root/node_modules/test-pkg/lib/foo.js'),
      };

      expect(Resolver.resolve(context, '../metadata.json', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/metadata.json'),
      });
    });

    test('should not use "exports" for an absolute import path', () => {
      expect(
        Resolver.resolve(
          baseContext,
          p('/root/node_modules/test-pkg/metadata.json'),
          null,
        ),
      ).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/metadata.json'),
      });
    });

    test('should resolve subpath when package is located in nested node_modules path', () => {
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          [p('/root/node_modules/test-pkg/package.json')]: {
            exports: './index-exports.js',
          },
          [p('/root/node_modules/test-pkg/node_modules/baz/package.json')]: {
            exports: './index.js',
          },
        }),
        originModulePath: p('/root/node_modules/test-pkg/private/bar.js'),
        unstable_logWarning: logWarning,
      };

      expect(Resolver.resolve(context, 'baz', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/node_modules/baz/index.js'),
      });
      // If a warning was logged, we have incorrectly tried to resolve "exports"
      // against the parent package.json.
      expect(logWarning).not.toHaveBeenCalled();
    });

    describe('should resolve "exports" target directly', () => {
      test('without expanding `sourceExts`', () => {
        expect(Resolver.resolve(baseContext, 'test-pkg/foo.js', null)).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/lib/foo.js'),
        });
      });

      test('without expanding platform-specific extensions', () => {
        expect(Resolver.resolve(baseContext, 'test-pkg/foo.js', 'ios')).toEqual(
          {
            type: 'sourceFile',
            filePath: p('/root/node_modules/test-pkg/lib/foo.js'),
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
            filePath: p('/root/node_modules/test-pkg/private/bar.js'),
          },
        );
        expect(logWarning).toHaveBeenCalledTimes(1);
        expect(logWarning.mock.calls[0][0]).toBe(
          `Attempted to import the module "${p('/root/node_modules/test-pkg/private/bar')}" which is not listed in the "exports" of "${p('/root/node_modules/test-pkg')}" under the requested subpath "./private/bar". Falling back to file-based resolution. Consider updating the call site or asking the package maintainer(s) to expose this API.`,
        );
      });

      test('should not log warning when no "exports" field is present', () => {
        const logWarning = jest.fn();
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            [p('/root/node_modules/test-pkg/package.json')]: {
              main: 'index-main.js',
            },
          }),
          unstable_logWarning: logWarning,
        };

        expect(Resolver.resolve(context, 'test-pkg/private/bar', null)).toEqual(
          {
            type: 'sourceFile',
            filePath: p('/root/node_modules/test-pkg/private/bar.js'),
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
              return p('/root/node_modules/test-pkg/package.json');
            }
            return null;
          },
        };
        expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/lib/foo.js'),
        });
      });
    });
  });

  describe('subpath patterns', () => {
    const baseContext = {
      ...createResolutionContext({
        [p('/root/src/main.js')]: '',
        [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
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
        [p('/root/node_modules/test-pkg/lib/node/test.js')]: '',
        [p('/root/node_modules/test-pkg/lib/node/foo/public.js')]: '',
        [p('/root/node_modules/test-pkg/src/index.js')]: '',
        [p('/root/node_modules/test-pkg/src/features/foo.js')]: '',
        [p('/root/node_modules/test-pkg/src/features/foo.js.js')]: '',
        [p('/root/node_modules/test-pkg/src/features/bar/Bar.js')]: '',
        [p('/root/node_modules/test-pkg/src/features/baz.native.js')]: '',
        [p(
          '/root/node_modules/test-pkg/src/features/node_modules/foo/index.js',
        )]: '',
        [p('/root/node_modules/test-pkg/src/forbidden.js')]: '',
        [p('/root/node_modules/test-pkg/misc/repeated.js')]: '',
        [p('/root/node_modules/test-pkg/repeated/repeated.js')]: '',
        [p('/root/node_modules/test-pkg/repeated/repeated/repeated.js')]: '',
        [p('/root/node_modules/test-pkg/types/foo/types.d.ts')]: '',
        [p('/root/node_modules/test-pkg/assets/Logo.js')]: '',
        [p('/root/node_modules/test-pkg/data/json/data.json')]: '',
        [p('/root/node_modules/test-pkg/data/csv/data.csv')]: '',
      }),
      originModulePath: p('/root/src/main.js'),
      unstable_enablePackageExports: true,
    };

    test('should resolve subpath patterns in "exports" matching import specifier', () => {
      for (const [importSpecifier, filePath] of [
        [
          'test-pkg/features/foo.js',
          p('/root/node_modules/test-pkg/src/features/foo.js'),
        ],
        // Valid: Subpath patterns allow the match to be any substring between
        // the pattern base and pattern trailer
        [
          'test-pkg/features/foo.js.js',
          p('/root/node_modules/test-pkg/src/features/foo.js.js'),
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
      ).toThrow(
        new Error(
          'Module does not exist in the Haste module map or in these directories:\n' +
            `  ${p('/root/src/node_modules')}\n` +
            `  ${p('/root/node_modules')}\n` +
            `  ${p('/node_modules')}\n`,
        ),
      );
    });

    test('should resolve prefixed wildcard export, using the most specific export path', () => {
      const context = baseContext;

      expect(Resolver.resolve(context, 'test-pkg/node/test', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/lib/node/test.js'),
      });
    });

    test('longer patterns have higher specificity if bases are equal', () => {
      const context = baseContext;
      expect(
        Resolver.resolve(context, 'test-pkg/node/foo/public', null),
      ).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/lib/node/foo/public.js'),
      });

      expect(
        Resolver.resolve(context, 'test-pkg/node/foo/types', null),
      ).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/types/foo/types.d.ts'),
      });
    });

    test('patternBase and patternTrailer must match non-overlapping ends of matchKey', () => {
      // ./repeated/repeated *should* match ./repeated*/repeated
      expect(
        Resolver.resolve(baseContext, 'test-pkg/repeated/repeated', null),
      ).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/repeated/repeated.js'),
      });

      // ./repeated should *not* match ./repeated*/repeated
      expect(Resolver.resolve(baseContext, 'test-pkg/repeated', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/misc/repeated.js'),
      });
    });

    test('patterns can resolve to static targets', () => {
      const context = baseContext;
      expect(Resolver.resolve(context, 'test-pkg/foo/private', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/src/forbidden.js'),
      });
    });

    test('patterns can resolve to targets with multiple *', () => {
      const context = baseContext;
      expect(Resolver.resolve(context, 'test-pkg/data.json', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/data/json/data.json'),
      });

      expect(Resolver.resolve(context, 'test-pkg/data.csv', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/data/csv/data.csv'),
      });
    });

    test.each([
      ['null', 'internal'],
      ['no matching condition', 'server'],
    ])(
      'exact subpath with %s target does not fall back to a pattern',
      (_, subpath) => {
        const logWarning = jest.fn();
        const context = {
          ...createResolutionContext({
            [p('/root/src/main.js')]: '',
            [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
              name: 'test-pkg',
              exports: {
                './*': './lib/*.js',
                './internal': null,
                './server': {browser: './server-browser.js'},
              },
            }),
            [p('/root/node_modules/test-pkg/lib/internal.js')]: '',
            [p('/root/node_modules/test-pkg/lib/server.js')]: '',
            [p('/root/node_modules/test-pkg/internal.js')]: '',
            [p('/root/node_modules/test-pkg/server.js')]: '',
          }),
          originModulePath: p('/root/src/main.js'),
          unstable_enablePackageExports: true,
          unstable_logWarning: logWarning,
        };

        expect(Resolver.resolve(context, `test-pkg/${subpath}`, null)).toEqual({
          type: 'sourceFile',
          filePath: p(`/root/node_modules/test-pkg/${subpath}.js`),
        });
        expect(logWarning).toHaveBeenCalledTimes(1);
        expect(logWarning.mock.calls[0][0]).toContain(
          `"${p(`/root/node_modules/test-pkg/${subpath}`)}" which is listed in the "exports"`,
        );
      },
    );

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
          filePath: p('/root/node_modules/test-pkg/assets/Logo.js'),
        });
        expect(logWarning).not.toHaveBeenCalled();
      });
    });
  });

  describe('conditional exports', () => {
    const baseContext = {
      ...createResolutionContext({
        [p('/root/src/main.js')]: '',
        [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
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
      originModulePath: p('/root/src/main.js'),
      unstable_enablePackageExports: true,
    };

    test('should resolve "exports" subpath with conditions', () => {
      const context = {
        ...baseContext,
        unstable_conditionNames: ['require', 'react-native'],
      };

      expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/lib/foo-react-native.cjs'),
      });
    });

    test('should resolve "exports" subpath with nested conditions', () => {
      const context = {
        ...baseContext,
        unstable_conditionNames: ['require', 'react-native'],
      };

      expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/lib/foo-react-native.cjs'),
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
        filePath: p('/root/node_modules/test-pkg/lib/foo-react-native.cjs'),
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
        filePath: p('/root/node_modules/test-pkg/lib/foo-browser.js'),
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
        filePath: p('/root/node_modules/test-pkg/lib/foo-require.cjs'),
      });
    });

    test('should fall back to "default" condition if present', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          [p('/root/node_modules/test-pkg/package.json')]: {
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
        filePath: p('/root/node_modules/test-pkg/lib/foo.js'),
      });
    });

    test.each([
      [
        'unmatched condition',
        {require: './lib/foo.js'},
        {browser: './lib/foo-browser.js'},
      ],
      ['empty condition object', {require: './lib/foo.js'}, {}],
      [
        'nested unmatched condition',
        {require: './lib/foo.js'},
        {require: {browser: './lib/foo-browser.js'}},
      ],
      [
        'unmatched condition',
        {default: './lib/foo.js'},
        {browser: './lib/foo-browser.js'},
      ],
      ['empty condition object', {default: './lib/foo.js'}, {}],
      [
        'nested unmatched condition',
        {default: './lib/foo.js'},
        {require: {browser: './lib/foo-browser.js'}},
      ],
    ])(
      'should continue parent conditions after %s to %p',
      (_, fallback, nestedConditions) => {
        const logWarning = jest.fn();
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            [p('/root/node_modules/test-pkg/package.json')]: {
              exports: {
                './foo.js': {
                  'react-native': nestedConditions,
                  ...fallback,
                },
              },
            },
          }),
          unstable_conditionNames: ['react-native'],
          unstable_logWarning: logWarning,
        };

        expect(Resolver.resolve(context, 'test-pkg/foo.js', null)).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/lib/foo.js'),
        });
        expect(logWarning).not.toHaveBeenCalled();
      },
    );

    test.each([
      ['null', null, 'no match was resolved'],
      ['invalid', 'invalid-target', 'invalid package.json configuration'],
      ['numeric', 42, 'invalid package.json configuration'],
      ['boolean', false, 'invalid package.json configuration'],
      ['empty array', [], 'no match was resolved'],
    ])(
      'should not continue parent conditions after a %s target',
      (_, target, warning) => {
        const logWarning = jest.fn();
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
              exports: {
                './foo.js': {
                  'react-native': {require: target},
                  default: './lib/foo.js',
                },
              },
            }),
          }),
          unstable_conditionNames: ['react-native'],
          unstable_logWarning: logWarning,
        };

        expect(() =>
          Resolver.resolve(context, 'test-pkg/foo.js', null),
        ).toThrow();
        expect(logWarning).toHaveBeenCalledTimes(1);
        expect(logWarning.mock.calls[0][0]).toContain(warning);
      },
    );

    test('should throw FailedToResolvePathError when no conditions are matched', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          [p('/root/node_modules/test-pkg/package.json')]: {
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
      expect(() => Resolver.resolve(context, 'test-pkg/foo.js', null)).toThrow(
        new Error(
          'Module does not exist in the Haste module map or in these directories:\n' +
            `  ${p('/root/src/node_modules')}\n` +
            `  ${p('/root/node_modules')}\n` +
            `  ${p('/node_modules')}\n`,
        ),
      );
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
          filePath: p('/root/node_modules/test-pkg/lib/foo-require.cjs'),
        });

        // 'web' platform => 'browser' condition is asserted.
        expect(Resolver.resolve(context, 'test-pkg/foo.js', 'web')).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/lib/foo-browser.js'),
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
          filePath: p('/root/node_modules/test-pkg/lib/foo-dev.js'),
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
          filePath: p('/root/node_modules/test-pkg/lib/foo-require.cjs'),
        });
      });
    });

    describe('main entry point', () => {
      const baseContext = {
        ...createResolutionContext({
          [p('/root/src/main.js')]: '',
          [p('/root/node_modules/test-pkg/package.json')]: '',
          [p('/root/node_modules/test-pkg/index.js')]: '',
          [p('/root/node_modules/test-pkg/index-browser.js')]: '',
        }),
        originModulePath: p('/root/src/main.js'),
        unstable_enablePackageExports: true,
      };

      test('should resolve main entry point using conditional exports', () => {
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            [p('/root/node_modules/test-pkg/package.json')]: {
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
          filePath: p('/root/node_modules/test-pkg/index-browser.js'),
        });
      });

      test('should resolve main entry point when root keys are a condition mapping (shorthand)', () => {
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            [p('/root/node_modules/test-pkg/package.json')]: {
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
          filePath: p('/root/node_modules/test-pkg/index-browser.js'),
        });
      });
    });

    describe('package encapsulation', () => {
      test('[nonstrict] should fall back to "browser" spec resolution and log inaccessible import warning', () => {
        const logWarning = jest.fn();
        const context = {
          ...baseContext,
          ...createPackageAccessors({
            [p('/root/node_modules/test-pkg/package.json')]: {
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
          filePath: p('/root/node_modules/test-pkg/lib/foo.js'),
        });
        expect(logWarning).toHaveBeenCalledTimes(1);
        expect(logWarning.mock.calls[0][0]).toBe(
          `Attempted to import the module "${p('/root/node_modules/test-pkg/lib/foo.js')}" which is listed in the "exports" of "${p('/root/node_modules/test-pkg')}", however no match was resolved for this request (platform = null). Falling back to file-based resolution. Consider updating the call site or asking the package maintainer(s) to expose this API.`,
        );
      });
    });
  });

  describe('asset resolutions', () => {
    const assetResolutions = ['1', '1.5', '2', '3', '4'];

    const baseContext = {
      ...createResolutionContext({
        [p('/root/src/main.js')]: '',
        [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
          main: './index.js',
          exports: {
            './icons/metro.png': './assets/icons/metro.png',
          },
        }),
        [p('/root/node_modules/test-pkg/assets/icons/metro.png')]: '',
        [p('/root/node_modules/test-pkg/assets/icons/metro@2x.png')]: '',
        [p('/root/node_modules/test-pkg/assets/icons/metro@3x.png')]: '',
      }),
      assetExts: new Set(['png']),
      originModulePath: p('/root/src/main.js'),
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
          ].filter(candidate => baseContext.fileSystemLookup(candidate).exists);

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
          p('/root/node_modules/test-pkg/assets/icons/metro.png'),
          p('/root/node_modules/test-pkg/assets/icons/metro@2x.png'),
          p('/root/node_modules/test-pkg/assets/icons/metro@3x.png'),
        ],
      });
      expect(resolveAsset).toHaveBeenLastCalledWith(
        p('/root/node_modules/test-pkg/assets/icons'),
        'metro',
        '.png',
      );
    });

    test('should not apply "browser" spec redirections to assets with unstable_applyBrowserSpecAfterExports', () => {
      const context = {
        ...baseContext,
        ...createPackageAccessors({
          [p('/root/node_modules/test-pkg/package.json')]: {
            main: './index.js',
            exports: {
              './icons/metro.png': './assets/icons/metro.png',
            },
            browser: {'./assets/icons/metro.png': false},
          },
        }),
        resolveAsset: (dirPath: string, basename: string, extension: string) =>
          [dirPath + path.sep + basename + extension].filter(
            candidate => baseContext.fileSystemLookup(candidate).exists,
          ),
        unstable_applyBrowserSpecAfterExports: true,
      };

      expect(
        Resolver.resolve(context, 'test-pkg/icons/metro.png', null),
      ).toEqual({
        type: 'assetFiles',
        filePaths: [p('/root/node_modules/test-pkg/assets/icons/metro.png')],
      });
    });
  });

  describe('compatibility with legacy "exports" array formats', () => {
    // Node.js versions >=13.0.0, <13.7.0 support the `exports` field but not
    // conditional exports. Used by packages such as @babel/runtime.
    // See https://github.com/babel/babel/pull/12877
    describe('early Node.js 13 versions', () => {
      test('should use the first resolved value when subpath is an array including a condition mapping', () => {
        const context = {
          ...createResolutionContext({
            [p('/root/src/main.js')]: '',
            [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
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
            [p('/root/node_modules/test-pkg/index.js')]: '',
            [p('/root/node_modules/test-pkg/index-react-native.js')]: '',
          }),
          originModulePath: p('/root/src/main.js'),
          unstable_conditionNames: [],
          unstable_enablePackageExports: true,
        };

        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/index.js'),
        });
        expect(
          Resolver.resolve(
            {...context, unstable_conditionNames: ['react-native']},
            'test-pkg',
            null,
          ),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/index-react-native.js'),
        });
      });

      test('should use the first resolved value when subpath (root shorthand) is an array including a condition mapping', () => {
        const context = {
          ...createResolutionContext({
            [p('/root/src/main.js')]: '',
            [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
              exports: [
                {browser: './index-browser.js', default: 'index.js'},
                './index-alt.js',
              ],
            }),
            [p('/root/node_modules/test-pkg/index.js')]: '',
            [p('/root/node_modules/test-pkg/index-browser.js')]: '',
          }),
          originModulePath: p('/root/src/main.js'),
          unstable_conditionNames: ['browser'],
          unstable_enablePackageExports: true,
        };

        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/index-browser.js'),
        });
      });
    });

    // Array as order-preserving data structure for other environments.
    // See https://github.com/nodejs/node/issues/37777#issuecomment-804164719
    describe('invalid targets in nested arrays', () => {
      test('should fall back and log warning for nested array at root', () => {
        const logWarning = jest.fn();
        const context = {
          ...createResolutionContext({
            [p('/root/src/main.js')]: '',
            [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
              main: './index.js',
              exports: [
                [{import: 'index.mjs'}],
                [{require: 'index.cjs'}],
                ['index.cjs'],
              ],
            }),
            [p('/root/node_modules/test-pkg/index.js')]: '',
          }),
          originModulePath: p('/root/src/main.js'),
          unstable_enablePackageExports: true,
          unstable_logWarning: logWarning,
        };

        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/index.js'),
        });
        expect(logWarning).toHaveBeenCalledTimes(1);
        expect(logWarning.mock.calls[0][0]).toBe(
          `The package ${p('/root/node_modules/test-pkg')} contains an invalid package.json configuration. Consider raising this issue with the package maintainer(s).\n` +
            'Reason: The target for "." defined in "exports" is "index.cjs", however this value is invalid because it does not begin with "./". Falling back to file-based resolution.',
        );
      });

      test('should fall back and log warning for nested array at subpath', () => {
        const logWarning = jest.fn();
        const context = {
          ...createResolutionContext({
            [p('/root/src/main.js')]: '',
            [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
              main: './index.js',
              exports: {
                '.': [
                  [{import: 'index.mjs'}],
                  [{require: 'index.cjs'}],
                  ['index.cjs'],
                ],
              },
            }),
            [p('/root/node_modules/test-pkg/index.js')]: '',
          }),
          originModulePath: p('/root/src/main.js'),
          unstable_enablePackageExports: true,
          unstable_logWarning: logWarning,
        };

        expect(Resolver.resolve(context, 'test-pkg', null)).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/index.js'),
        });
        expect(logWarning).toHaveBeenCalledTimes(1);
        expect(logWarning.mock.calls[0][0]).toBe(
          `The package ${p('/root/node_modules/test-pkg')} contains an invalid package.json configuration. Consider raising this issue with the package maintainer(s).\n` +
            'Reason: The target for "." defined in "exports" is "index.cjs", however this value is invalid because it does not begin with "./". Falling back to file-based resolution.',
        );
      });
    });
  });

  describe('@babel/runtime compatibility (special case)', () => {
    test('should never assert "import" condition', () => {
      const context = {
        ...createResolutionContext({
          [p('/root/src/main.js')]: '',
          [p('/root/node_modules/@babel/runtime/package.json')]: JSON.stringify(
            {
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
            },
          ),
          [p(
            '/root/node_modules/@babel/runtime/helpers/interopRequireDefault.js',
          )]: '',
        }),
        originModulePath: p('/root/src/main.js'),
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
        filePath: p(
          '/root/node_modules/@babel/runtime/helpers/interopRequireDefault.js',
        ),
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
        [p('/root/node_modules/self-pkg/package.json')]:
          JSON.stringify(packageJson),
        [p('/root/node_modules/self-pkg/index.js')]: '',
        [p('/root/node_modules/self-pkg/index-main.js')]: '',
        [p('/root/node_modules/self-pkg/lib/sub.js')]: '',
        [p('/root/node_modules/self-pkg/lib/internal.js')]: '',
      }),
      originModulePath: p('/root/node_modules/self-pkg/index.js'),
      unstable_enablePackageExports: true,
    };

    test('should resolve own package name via its own "exports" field', () => {
      expect(Resolver.resolve(baseContext, 'self-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/self-pkg/index.js'),
      });
    });

    test('should resolve a subpath of the own package via "exports"', () => {
      expect(Resolver.resolve(baseContext, 'self-pkg/sub', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/self-pkg/lib/sub.js'),
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
        filePath: p('/root/node_modules/self-pkg/lib/internal.js'),
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
          [p('/root/node_modules/self-pkg/package.json')]: {
            main: 'index-main.js',
            exports: {'.': './index.js'},
          },
        }),
      };
      // With no `name`, falls through to hierarchical lookup (and finds the
      // package in node_modules, going through "exports" as a normal import).
      expect(Resolver.resolve(noNameContext, 'self-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/self-pkg/index.js'),
      });
    });

    test('should not self-resolve when the package has no "exports" field', () => {
      const noExportsContext = {
        ...baseContext,
        ...createPackageAccessors({
          [p('/root/node_modules/self-pkg/package.json')]: {
            name: 'self-pkg',
            main: 'index-main.js',
          },
        }),
      };
      // Without `exports`, self-resolve does not apply. Falls back to
      // node_modules lookup, which resolves via "main".
      expect(Resolver.resolve(noExportsContext, 'self-pkg', null)).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/self-pkg/index-main.js'),
      });
    });
  });

  describe('"browser" spec redirections with "exports"', () => {
    const baseContext = {
      ...createResolutionContext({
        [p('/root/src/main.js')]: '',
        [p('/root/node_modules/test-pkg/package.json')]: JSON.stringify({
          name: 'test-pkg',
          exports: {
            '.': './index.js',
            './hash': {
              browser: './hash-browser.js',
              default: './hash-node.js',
            },
            './server': {
              browser: './server-browser.js',
              default: './server-node.js',
            },
            './fs': './fs-node.js',
            './broken': './broken-node.js',
            './dir': './dir-node.js',
          },
          browser: {
            './index.js': './index-browser.js',
            // Redirects both the exported subpath and the file it resolves
            // to, as in multiformats.
            './hash': './hash-browser.js',
            './hash-node.js': './hash-browser.js',
            // Matches the "./server" subpath (as "./server.js"), as in
            // react-dom.
            './server.js': './server-browser.js',
            './fs-node.js': false,
            './broken-node.js': './does-not-exist.js',
            './dir-node.js': './broken-dir',
            './private': './private-browser.js',
          },
        }),
        [p('/root/node_modules/test-pkg/index.js')]: '',
        [p('/root/node_modules/test-pkg/index-browser.js')]: '',
        [p('/root/node_modules/test-pkg/hash-browser.js')]: '',
        [p('/root/node_modules/test-pkg/hash-node.js')]: '',
        [p('/root/node_modules/test-pkg/server-browser.js')]: '',
        [p('/root/node_modules/test-pkg/server-node.js')]: '',
        [p('/root/node_modules/test-pkg/fs-node.js')]: '',
        [p('/root/node_modules/test-pkg/broken-node.js')]: '',
        [p('/root/node_modules/test-pkg/dir-node.js')]: '',
        [p('/root/node_modules/test-pkg/broken-dir/package.json')]:
          JSON.stringify({main: './missing.js'}),
        [p('/root/node_modules/test-pkg/private-browser.js')]: '',
      }),
      mainFields: ['react-native', 'browser', 'main'],
      originModulePath: p('/root/src/main.js'),
      unstable_enablePackageExports: true,
    };

    test('should redirect the requested subpath before "exports" with unstable_applyBrowserSpecAfterExports: false', () => {
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        unstable_applyBrowserSpecAfterExports: false,
        unstable_logWarning: logWarning,
      };

      expect(Resolver.resolve(context, 'test-pkg/hash', 'ios')).toEqual({
        type: 'sourceFile',
        filePath: p('/root/node_modules/test-pkg/hash-browser.js'),
      });
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toContain(
        'under the requested subpath "./hash-browser.js"',
      );
    });

    describe('with unstable_applyBrowserSpecAfterExports', () => {
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        unstable_applyBrowserSpecAfterExports: true,
        unstable_logWarning: logWarning,
      };

      beforeEach(() => {
        logWarning.mockClear();
      });

      afterEach(() => {
        expect(logWarning).not.toHaveBeenCalled();
      });

      test('should redirect the file resolved from "exports"', () => {
        expect(Resolver.resolve(context, 'test-pkg/hash', 'ios')).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/hash-browser.js'),
        });
        expect(Resolver.resolve(context, 'test-pkg/hash', 'web')).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/hash-browser.js'),
        });
      });

      test('should redirect the main entry point resolved from "exports"', () => {
        expect(Resolver.resolve(context, 'test-pkg', 'ios')).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/index-browser.js'),
        });
      });

      test('should not redirect an exported subpath', () => {
        expect(Resolver.resolve(context, 'test-pkg/server', 'ios')).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/server-node.js'),
        });
        expect(Resolver.resolve(context, 'test-pkg/server', 'web')).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/server-browser.js'),
        });
      });

      test('should resolve to the empty module for a file mapped to `false`', () => {
        expect(Resolver.resolve(context, 'test-pkg/fs', 'ios')).toEqual({
          type: 'empty',
        });
      });

      test('should not redirect when the field is not in `mainFields`', () => {
        expect(
          Resolver.resolve(
            {...context, mainFields: ['main']},
            'test-pkg/hash',
            'ios',
          ),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/hash-node.js'),
        });
      });

      test('should redirect the file resolved from "exports" for a self-reference', () => {
        expect(
          Resolver.resolve(
            {
              ...context,
              originModulePath: p('/root/node_modules/test-pkg/index.js'),
            },
            'test-pkg/hash',
            'ios',
          ),
        ).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/hash-browser.js'),
        });
      });

      test('[nonstrict] should warn about the requested subpath, then redirect it, when it is not exported', () => {
        expect(Resolver.resolve(context, 'test-pkg/private', 'ios')).toEqual({
          type: 'sourceFile',
          filePath: p('/root/node_modules/test-pkg/private-browser.js'),
        });
        expect(logWarning).toHaveBeenCalledTimes(1);
        expect(logWarning.mock.calls[0][0]).toContain(
          'under the requested subpath "./private"',
        );
        logWarning.mockClear();
      });

      test.each([
        [
          'a missing file',
          'an import',
          'broken',
          'does-not-exist.js',
          p('/root/src/main.js'),
        ],
        [
          'a missing file',
          'a self-reference',
          'broken',
          'does-not-exist.js',
          p('/root/node_modules/test-pkg/index.js'),
        ],
        [
          'a directory with an invalid "main"',
          'an import',
          'dir',
          'broken-dir',
          p('/root/src/main.js'),
        ],
      ])(
        '[nonstrict] should warn and keep the "exports" target when it is redirected to %s, for %s',
        (_, __, subpath, redirectTarget, originModulePath) => {
          expect(
            Resolver.resolve(
              {...context, originModulePath},
              `test-pkg/${subpath}`,
              'ios',
            ),
          ).toEqual({
            type: 'sourceFile',
            filePath: p(`/root/node_modules/test-pkg/${subpath}-node.js`),
          });
          expect(logWarning).toHaveBeenCalledTimes(1);
          expect(logWarning.mock.calls[0][0]).toBe(
            `The package ${p('/root/node_modules/test-pkg')} contains an invalid package.json configuration. Consider raising this issue with the package maintainer(s).\n` +
              `Reason: The file "${p(`/root/node_modules/test-pkg/${subpath}-node.js`)}" resolved from "exports" is redirected to "${p(`/root/node_modules/test-pkg/${redirectTarget}`)}" by the "browser" spec, however this could not be resolved. Falling back to the file resolved from "exports".`,
          );
          logWarning.mockClear();
        },
      );
    });
  });
});

describe('"exports" of the package at the root of a bare specifier', () => {
  const pkg = p('/root/node_modules/test-pkg');
  const files = {
    [p('/root/src/main.js')]: '',
    [p(pkg + '/package.json')]: JSON.stringify({
      name: 'test-pkg',
      exports: {
        './shim': './dist/shim.js',
        './typed': './dist/typed.js',
      },
    }),
    // A legacy shim for tools without "exports" support.
    [p(pkg + '/shim/package.json')]: JSON.stringify({main: './legacy.js'}),
    [p(pkg + '/shim/legacy.js')]: '',
    [p(pkg + '/dist/shim.js')]: '',
    // A manifest that only sets the module type of a directory.
    [p(pkg + '/typed/package.json')]: JSON.stringify({type: 'commonjs'}),
    [p(pkg + '/typed/index.js')]: '',
    [p(pkg + '/dist/typed.js')]: '',
    [p(pkg + '/internal/package.json')]: JSON.stringify({main: './main.js'}),
    [p(pkg + '/internal/main.js')]: '',
    // Without "exports" at the root, those of a nested manifest do not apply.
    [p('/root/node_modules/no-exports/package.json')]: JSON.stringify({}),
    [p('/root/node_modules/no-exports/sub/package.json')]: JSON.stringify({
      main: './main.js',
      exports: './from-exports.js',
    }),
    [p('/root/node_modules/no-exports/sub/main.js')]: '',
    [p('/root/node_modules/no-exports/sub/from-exports.js')]: '',
    // Without a manifest at the root, a nested manifest's "exports" don't apply.
    [p('/root/node_modules/no-root/sub/package.json')]: JSON.stringify({
      main: './main.js',
      exports: './from-exports.js',
    }),
    [p('/root/node_modules/no-root/sub/main.js')]: '',
    [p('/root/node_modules/no-root/sub/from-exports.js')]: '',
    // Its "browser" field still does.
    [p('/root/node_modules/no-root-browser/sub/package.json')]: JSON.stringify({
      main: './main.js',
      browser: {'./main.js': './browser.js'},
      exports: './from-exports.js',
    }),
    [p('/root/node_modules/no-root-browser/sub/main.js')]: '',
    [p('/root/node_modules/no-root-browser/sub/browser.js')]: '',
    [p('/root/node_modules/no-root-browser/sub/from-exports.js')]: '',
    // A closest manifest with "browser" still applies to the resolved file.
    [p('/root/node_modules/nested-browser/package.json')]: JSON.stringify({
      exports: {'./lib': './lib/node.js'},
    }),
    [p('/root/node_modules/nested-browser/lib/package.json')]: JSON.stringify({
      browser: {'./node.js': './browser.js'},
    }),
    [p('/root/node_modules/nested-browser/lib/node.js')]: '',
    [p('/root/node_modules/nested-browser/lib/browser.js')]: '',
    // A scoped package with a nested manifest.
    [p('/root/node_modules/@scope/pkg/package.json')]: JSON.stringify({
      exports: {'./shim': './dist/shim.js'},
    }),
    [p('/root/node_modules/@scope/pkg/shim/package.json')]: JSON.stringify({
      main: './legacy.js',
    }),
    [p('/root/node_modules/@scope/pkg/shim/legacy.js')]: '',
    [p('/root/node_modules/@scope/pkg/dist/shim.js')]: '',
    // A package whose root is requested directly.
    [p('/root/node_modules/root-entry/package.json')]: JSON.stringify({
      main: './main.js',
      exports: {'.': './dist/index.js'},
    }),
    [p('/root/node_modules/root-entry/main.js')]: '',
    [p('/root/node_modules/root-entry/dist/index.js')]: '',
    // A nested "browser" map with a target exported by the root.
    [p('/root/node_modules/nested-map/package.json')]: JSON.stringify({
      exports: {'./lib/a.js': './dist/a.js', './lib/b.js': './dist/b.js'},
    }),
    [p('/root/node_modules/nested-map/lib/package.json')]: JSON.stringify({
      browser: {'./a.js': './b.js'},
    }),
    [p('/root/node_modules/nested-map/lib/a.js')]: '',
    [p('/root/node_modules/nested-map/lib/b.js')]: '',
    [p('/root/node_modules/nested-map/dist/a.js')]: '',
    [p('/root/node_modules/nested-map/dist/b.js')]: '',
    // A redirection before "exports" may leave the root package.
    [p('/root/node_modules/leaves-root/package.json')]: JSON.stringify({
      browser: {
        './sub.js': '../other/main.js',
        './inner.js': './lib/inner.js',
        './nested.js': './node_modules/dep/index.js',
      },
      exports: {'./lib/inner.js': './dist/inner.js'},
    }),
    [p('/root/node_modules/leaves-root/sub.js')]: '',
    [p('/root/node_modules/leaves-root/inner.js')]: '',
    [p('/root/node_modules/leaves-root/dist/inner.js')]: '',
    [p('/root/node_modules/other/package.json')]: JSON.stringify({
      exports: {'./main.js': './dist/main.js'},
    }),
    [p('/root/node_modules/other/main.js')]: '',
    [p('/root/node_modules/other/dist/main.js')]: '',
    [p('/root/node_modules/leaves-root/nested.js')]: '',
    [p('/root/node_modules/leaves-root/node_modules/dep/package.json')]:
      JSON.stringify({exports: {'./index.js': './dist/main.js'}}),
    [p('/root/node_modules/leaves-root/node_modules/dep/index.js')]: '',
    [p('/root/node_modules/leaves-root/node_modules/dep/dist/main.js')]: '',
    // Subpath patterns that may match invalid segments.
    [p('/root/node_modules/patterns/package.json')]: JSON.stringify({
      name: 'patterns',
      exports: {'./*': './dist/*'},
    }),
    [p('/root/node_modules/patterns/secret.js')]: '',
    [p('/root/node_modules/patterns/sub.js')]: '',
    [p('/root/node_modules/patterns/dist/sub.js')]: '',
    [p('/root/node_modules/patterns/dist/nested/sub.js')]: '',
    [p('/root/node_modules/patterns/dist/node_modules/dep/index.js')]: '',
    [p('/root/node_modules/patterns/node_modules/dep/index.js')]: '',
    [p('/root/node_modules/other-patterns/main.js')]: '',
    // A "browser" redirection from the root into a nested manifest.
    [p('/root/node_modules/redirect-nested/package.json')]: JSON.stringify({
      browser: {'./a.js': './lib/b.js'},
      exports: {'./lib/b.js': './dist/b.js', './a.js': './a.js'},
    }),
    [p('/root/node_modules/redirect-nested/lib/package.json')]: JSON.stringify({
      exports: {'./b.js': './from-nested.js'},
    }),
    [p('/root/node_modules/redirect-nested/a.js')]: '',
    [p('/root/node_modules/redirect-nested/lib/b.js')]: '',
    [p('/root/node_modules/redirect-nested/lib/from-nested.js')]: '',
    [p('/root/node_modules/redirect-nested/dist/b.js')]: '',
    // A "browser" redirection below a package with no manifest at its root.
    [p('/root/node_modules/no-root-map/sub/package.json')]: JSON.stringify({
      browser: {
        './a.js': './b.js',
        './dep.js': '../node_modules/dep/index.js',
        './outside.js': '../../other/main.js',
      },
      exports: {
        './b.js': './from-exports.js',
        './dep.js': './from-exports.js',
        './outside.js': './from-exports.js',
      },
    }),
    [p('/root/node_modules/no-root-map/sub/a.js')]: '',
    [p('/root/node_modules/no-root-map/sub/b.js')]: '',
    [p('/root/node_modules/no-root-map/sub/dep.js')]: '',
    [p('/root/node_modules/no-root-map/sub/outside.js')]: '',
    [p('/root/node_modules/no-root-map/sub/from-exports.js')]: '',
    [p('/root/node_modules/no-root-map/node_modules/dep/package.json')]:
      JSON.stringify({exports: {'./index.js': './dist/main.js'}}),
    [p('/root/node_modules/no-root-map/node_modules/dep/index.js')]: '',
    [p('/root/node_modules/no-root-map/node_modules/dep/dist/main.js')]: '',
  };
  const baseContext = {
    ...createResolutionContext(files),
    mainFields: ['browser', 'main'],
    originModulePath: p('/root/src/main.js'),
    unstable_applyBrowserSpecAfterExports: true,
    unstable_enablePackageExports: true,
    unstable_resolveExportsFromPackageRoot: true,
  };

  test.each([
    ['root-entry', '/root/node_modules/root-entry/dist/index.js'],
    ['test-pkg/shim', '/root/node_modules/test-pkg/dist/shim.js'],
    ['test-pkg/typed', '/root/node_modules/test-pkg/dist/typed.js'],
    ['@scope/pkg/shim', '/root/node_modules/@scope/pkg/dist/shim.js'],
    ['nested-map/lib/a.js', '/root/node_modules/nested-map/dist/a.js'],
    ['no-exports/sub', '/root/node_modules/no-exports/sub/main.js'],
    ['no-root/sub', '/root/node_modules/no-root/sub/main.js'],
    [
      'no-root-browser/sub',
      '/root/node_modules/no-root-browser/sub/browser.js',
    ],
    ['nested-browser/lib', '/root/node_modules/nested-browser/lib/browser.js'],
  ])('resolves %s', (specifier, expected) => {
    expect(Resolver.resolve(baseContext, specifier, null)).toEqual({
      type: 'sourceFile',
      filePath: p(expected),
    });
  });

  test('[nonstrict] warns and uses the nested manifest for a subpath not exported', () => {
    const logWarning = jest.fn();
    const context = {...baseContext, unstable_logWarning: logWarning};
    expect(Resolver.resolve(context, 'test-pkg/internal', null)).toEqual({
      type: 'sourceFile',
      filePath: p(pkg + '/internal/main.js'),
    });
    expect(logWarning).toHaveBeenCalledTimes(1);
    expect(logWarning.mock.calls[0][0]).toContain('"./internal"');
  });

  test.each([
    ['test-pkg/./shim', pkg + '/shim/legacy.js', '"././shim"'],
    [
      'test-pkg/internal/../shim',
      pkg + '/shim/legacy.js',
      '"./internal/../shim"',
    ],
    ['test-pkg/shim/', pkg + '/shim/legacy.js', '"./shim/"'],
    ['test-pkg//shim', pkg + '/shim/legacy.js', '".//shim"'],
    [
      'test-pkg/../other/main.js',
      '/root/node_modules/other/main.js',
      '"./../other/main.js"',
    ],
    [
      'leaves-root/node_modules/dep/index.js',
      '/root/node_modules/leaves-root/node_modules/dep/index.js',
      '"./node_modules/dep/index.js"',
    ],
  ])(
    '[nonstrict] treats %s as not exported, without normalizing it',
    (specifier, expected, subpath) => {
      const logWarning = jest.fn();
      const context = {...baseContext, unstable_logWarning: logWarning};
      expect(Resolver.resolve(context, specifier, null)).toEqual({
        type: 'sourceFile',
        filePath: p(expected),
      });
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toContain(subpath);
    },
  );

  test.each([
    ['patterns/../secret.js', null, '"./../secret.js"'],
    [
      'patterns/../other-patterns/main.js',
      '/root/node_modules/other-patterns/main.js',
      '"./../other-patterns/main.js"',
    ],
    ['patterns/./sub.js', '/root/node_modules/patterns/sub.js', '"././sub.js"'],
    [
      'patterns/nested/../sub.js',
      '/root/node_modules/patterns/sub.js',
      '"./nested/../sub.js"',
    ],
    [
      'patterns/node_modules/dep/index.js',
      '/root/node_modules/patterns/node_modules/dep/index.js',
      '"./node_modules/dep/index.js"',
    ],
    [
      'patterns/NODE_MODULES/dep/index.js',
      null,
      '"./NODE_MODULES/dep/index.js"',
    ],
  ])(
    '[nonstrict] treats %s as not exported by a subpath pattern',
    (specifier, expected, subpath) => {
      const logWarning = jest.fn();
      const context = {...baseContext, unstable_logWarning: logWarning};
      if (expected == null) {
        expect(() => Resolver.resolve(context, specifier, null)).toThrow();
      } else {
        expect(Resolver.resolve(context, specifier, null)).toEqual({
          type: 'sourceFile',
          filePath: p(expected),
        });
      }
      expect(logWarning).toHaveBeenCalledTimes(1);
      expect(logWarning.mock.calls[0][0]).toContain(subpath);
    },
  );

  test.each([
    ['patterns/sub.js', '/root/node_modules/patterns/dist/sub.js'],
    ['patterns//sub.js', '/root/node_modules/patterns/dist/sub.js'],
    [
      'patterns/nested//sub.js',
      '/root/node_modules/patterns/dist/nested/sub.js',
    ],
  ])('matches %s against a subpath pattern', (specifier, expected) => {
    const logWarning = jest.fn();
    const context = {...baseContext, unstable_logWarning: logWarning};
    expect(Resolver.resolve(context, specifier, null)).toEqual({
      type: 'sourceFile',
      filePath: p(expected),
    });
    expect(logWarning).not.toHaveBeenCalled();
  });

  test('rejects a backslash-separated invalid segment in a subpath pattern match', () => {
    expect(() =>
      resolvePackageTargetFromExports(
        baseContext,
        p('/root/node_modules/patterns'),
        p('/root/node_modules/patterns/nested/../sub.js'),
        'nested\\..\\sub.js',
        {'./*': './dist/*'},
        null,
      ),
    ).toThrow(PackagePathNotExportedError);
  });

  test('[nonstrict] treats a self-reference with an invalid segment as not exported by a subpath pattern', () => {
    const logWarning = jest.fn();
    const context = {
      ...baseContext,
      originModulePath: p('/root/node_modules/patterns/sub.js'),
      unstable_logWarning: logWarning,
    };
    expect(() =>
      Resolver.resolve(context, 'patterns/nested/../sub.js', null),
    ).not.toThrow();
    expect(logWarning.mock.calls[0][0]).toContain('invalid path segment');
  });

  test('matches a `node_modules` segment of a self-reference against a subpath pattern when disabled', () => {
    const logWarning = jest.fn();
    const context = {
      ...baseContext,
      originModulePath: p('/root/node_modules/patterns/sub.js'),
      unstable_logWarning: logWarning,
      unstable_resolveExportsFromPackageRoot: false,
    };
    expect(
      Resolver.resolve(context, 'patterns/node_modules/dep/index.js', null),
    ).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/patterns/dist/node_modules/dep/index.js'),
    });
    expect(logWarning).not.toHaveBeenCalled();
  });

  test.each([
    ['no-root-map/sub/a.js', '/root/node_modules/no-root-map/sub/b.js'],
    [
      'no-root-map/sub/dep.js',
      '/root/node_modules/no-root-map/node_modules/dep/dist/main.js',
    ],
    ['no-root-map/sub/outside.js', '/root/node_modules/other/dist/main.js'],
  ])(
    'applies "browser" spec redirections of %s with no manifest at the root',
    (specifier, expected) => {
      const context = {
        ...baseContext,
        unstable_applyBrowserSpecAfterExports: false,
      };
      expect(Resolver.resolve(context, specifier, null)).toEqual({
        type: 'sourceFile',
        filePath: p(expected),
      });
    },
  );

  test.each([
    [true, '/root/node_modules/redirect-nested/dist/b.js'],
    [false, '/root/node_modules/redirect-nested/lib/from-nested.js'],
  ])(
    'resolves a "browser" spec redirection into a nested manifest, with unstable_resolveExportsFromPackageRoot: %s',
    (unstable_resolveExportsFromPackageRoot, expected) => {
      const context = {
        ...baseContext,
        unstable_applyBrowserSpecAfterExports: false,
        unstable_resolveExportsFromPackageRoot,
      };
      expect(Resolver.resolve(context, 'redirect-nested/a.js', null)).toEqual({
        type: 'sourceFile',
        filePath: p(expected),
      });
    },
  );

  test('uses the root package of an `extraNodeModules` mapping', () => {
    const context = {...baseContext, extraNodeModules: {alias: pkg + path.sep}};
    expect(Resolver.resolve(context, 'alias/shim', null)).toEqual({
      type: 'sourceFile',
      filePath: p(pkg + '/dist/shim.js'),
    });
  });

  test('uses the closest package of an `extraNodeModules` mapping into a package', () => {
    const logWarning = jest.fn();
    const context = {
      ...baseContext,
      extraNodeModules: {alias: pkg + path.sep + 'dist'},
      unstable_logWarning: logWarning,
    };
    expect(Resolver.resolve(context, 'alias/shim', null)).toEqual({
      type: 'sourceFile',
      filePath: p(pkg + '/dist/shim.js'),
    });
    expect(logWarning).toHaveBeenCalledTimes(1);
    expect(logWarning.mock.calls[0][0]).toContain('"./dist/shim"');
  });

  test('uses the closest package of an `extraNodeModules` path outside the mapping', () => {
    const context = {...baseContext, extraNodeModules: {alias: pkg}};
    expect(Resolver.resolve(context, 'alias/../other/main.js', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/other/dist/main.js'),
    });
  });

  test('uses the root package of a Haste package', () => {
    const context = {
      ...baseContext,
      allowHaste: true,
      resolveHastePackage: (name: string) =>
        name === 'haste-pkg' ? p(pkg + '/package.json') : null,
    };
    expect(Resolver.resolve(context, 'haste-pkg/shim', null)).toEqual({
      type: 'sourceFile',
      filePath: p(pkg + '/dist/shim.js'),
    });
  });

  test.each([
    ['leaves-root/inner.js', '/root/node_modules/leaves-root/dist/inner.js'],
    ['nested-map/lib/a.js', '/root/node_modules/nested-map/dist/b.js'],
    ['leaves-root/sub.js', '/root/node_modules/other/dist/main.js'],
    [
      'leaves-root/nested.js',
      '/root/node_modules/leaves-root/node_modules/dep/dist/main.js',
    ],
  ])(
    'applies "exports" to the target of a redirection for %s',
    (specifier, expected) => {
      const logWarning = jest.fn();
      const context = {
        ...baseContext,
        unstable_applyBrowserSpecAfterExports: false,
        unstable_logWarning: logWarning,
      };
      expect(Resolver.resolve(context, specifier, null)).toEqual({
        type: 'sourceFile',
        filePath: p(expected),
      });
      expect(logWarning).not.toHaveBeenCalled();
    },
  );

  test('uses the closest package when disabled', () => {
    const context = {
      ...baseContext,
      unstable_resolveExportsFromPackageRoot: false,
    };
    expect(Resolver.resolve(context, 'test-pkg/shim', null)).toEqual({
      type: 'sourceFile',
      filePath: p(pkg + '/shim/legacy.js'),
    });
    expect(Resolver.resolve(context, 'no-exports/sub', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/no-exports/sub/from-exports.js'),
    });
    expect(Resolver.resolve(context, 'no-root/sub', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/no-root/sub/from-exports.js'),
    });
  });
});
