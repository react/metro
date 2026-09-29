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

import {createResolutionContext, posixToSystemPath as p} from './utils';

const Resolver = require('../index');

const fileMap = {
  [p('/root/project/foo.js')]: '',
  [p('/root/project/foo/index.js')]: '',
  [p('/root/project/bar.js')]: '',
  [p('/root/smth/beep.js')]: '',
  [p('/root/node_modules/apple/package.json')]: JSON.stringify({
    name: 'apple',
    main: 'main',
  }),
  [p('/root/node_modules/apple/main.js')]: '',
  [p('/root/node_modules/invalid/package.json')]: JSON.stringify({
    name: 'invalid',
    main: 'main',
  }),
  [p('/root/node_modules/flat-file-in-node-modules.js')]: '',
  [p('/node_modules/root-module/main.js')]: '',
  [p('/node_modules/root-module/package.json')]: JSON.stringify({
    name: 'root-module',
    main: 'main',
  }),
  [p('/other-root/node_modules/banana-module/main.js')]: '',
  [p('/other-root/node_modules/banana-module/package.json')]: JSON.stringify({
    name: 'banana-module',
    main: 'main',
  }),
  [p('/other-root/node_modules/banana/main.js')]: '',
  [p('/other-root/node_modules/banana/package.json')]: JSON.stringify({
    name: 'banana',
    main: 'main',
  }),
  [p('/other-root/node_modules/banana/node_modules/banana-module/main.js')]: '',
  [p(
    '/other-root/node_modules/banana/node_modules/banana-module/package.json',
  )]: JSON.stringify({
    name: 'banana-module',
    main: 'main',
  }),
  [p('/haste/Foo.js')]: '',
  [p('/haste/Bar.js')]: '',
  [p('/haste/Override.js')]: '',
  [p('/haste/some-package/package.json')]: JSON.stringify({
    name: 'some-package',
    main: 'main',
  }),
  [p('/haste/some-package/subdir/other-file.js')]: '',
  [p('/haste/some-package/main.js')]: '',
};

const CONTEXT: ResolutionContext = {
  ...createResolutionContext(fileMap),
  originModulePath: p('/root/project/foo.js'),
  resolveHasteModule: (name: string) => {
    const candidate = p(`/haste/${name}.js`);
    if (candidate in fileMap) {
      return candidate;
    }
    return null;
  },
  resolveHastePackage: (name: string) => {
    const candidate = p(`/haste/${name}/package.json`);
    if (candidate in fileMap) {
      return candidate;
    }
    return null;
  },
};

test('resolves a relative path', () => {
  expect(Resolver.resolve(CONTEXT, './bar', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/root/project/bar.js'),
  });
});

test('resolves a relative path ending in a slash as a directory', () => {
  expect(Resolver.resolve(CONTEXT, './foo/', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/root/project/foo/index.js'),
  });
});

test('resolves a relative path in another folder', () => {
  expect(Resolver.resolve(CONTEXT, '../smth/beep', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/root/smth/beep.js'),
  });
});

test('does not resolve a relative path ending in a slash as a file', () => {
  expect(() => Resolver.resolve(CONTEXT, './bar/', null)).toThrow(
    new Resolver.FailedToResolvePathError({
      file: null,
      dir: {
        type: 'sourceFile',
        filePathPrefix: p('/root/project/bar/'),
        candidateExts: [],
      },
    }),
  );
});

test('resolves a package in `node_modules`', () => {
  expect(Resolver.resolve(CONTEXT, 'apple', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/root/node_modules/apple/main.js'),
  });
});

test('resolves a standalone file in `node_modules`', () => {
  expect(Resolver.resolve(CONTEXT, 'flat-file-in-node-modules', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/root/node_modules/flat-file-in-node-modules.js'),
  });
});

test('fails to resolve a relative path', () => {
  try {
    Resolver.resolve(CONTEXT, './apple', null);
    throw new Error('should not reach');
  } catch (error) {
    if (!(error instanceof Resolver.FailedToResolvePathError)) {
      throw error;
    }
    expect(error.candidates).toEqual({
      dir: {
        candidateExts: [],
        filePathPrefix: p('/root/project/apple'),
        type: 'sourceFile',
      },
      file: {
        candidateExts: ['', '.js', '.jsx', '.json', '.ts', '.tsx'],
        filePathPrefix: p('/root/project/apple'),
        type: 'sourceFile',
      },
    });
  }
});

test('throws on invalid package name', () => {
  try {
    Resolver.resolve(CONTEXT, 'invalid', null);
    throw new Error('should have thrown');
  } catch (error) {
    if (!(error instanceof Resolver.InvalidPackageError)) {
      throw error;
    }
    expect(error.message).toBe(
      `The package \`${p('/root/node_modules/invalid/package.json')}\` is invalid because it specifies a \`main\` module field that could not be resolved (\`${p('/root/node_modules/invalid/main')}\`. None of these files exist:\n\n` +
        `  * ${p('/root/node_modules/invalid/main')}(.js|.jsx|.json|.ts|.tsx)\n` +
        `  * ${p('/root/node_modules/invalid/main/index')}(.js|.jsx|.json|.ts|.tsx)`,
    );
    expect(error.fileCandidates).toEqual({
      candidateExts: ['', '.js', '.jsx', '.json', '.ts', '.tsx'],
      filePathPrefix: p('/root/node_modules/invalid/main'),
      type: 'sourceFile',
    });
    expect(error.indexCandidates).toEqual({
      candidateExts: ['', '.js', '.jsx', '.json', '.ts', '.tsx'],
      filePathPrefix: p('/root/node_modules/invalid/main/index'),
      type: 'sourceFile',
    });
    expect(error.mainModulePath).toBe(p('/root/node_modules/invalid/main'));
    expect(error.packageJsonPath).toBe(
      p('/root/node_modules/invalid/package.json'),
    );
  }
});

test('resolves `node_modules` up to the root', () => {
  expect(Resolver.resolve(CONTEXT, 'root-module', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/node_modules/root-module/main.js'),
  });

  expect(() => Resolver.resolve(CONTEXT, 'non-existent-module', null)).toThrow(
    new Error(
      'Module does not exist in the Haste module map or in these directories:\n' +
        `  ${p('/root/project/node_modules')}\n` +
        `  ${p('/root/node_modules')}\n` +
        `  ${p('/node_modules')}\n`,
    ),
  );
});

test('does not resolve to additional `node_modules` if `nodeModulesPaths` is not specified', () => {
  expect(() => Resolver.resolve(CONTEXT, 'banana', null)).toThrow(
    new Error(
      'Module does not exist in the Haste module map or in these directories:\n' +
        `  ${p('/root/project/node_modules')}\n` +
        `  ${p('/root/node_modules')}\n` +
        `  ${p('/node_modules')}\n`,
    ),
  );
});

test('uses `nodeModulesPaths` to find additional node_modules not in the direct path', () => {
  const context = {
    ...CONTEXT,
    nodeModulesPaths: [p('/other-root/node_modules')],
  };
  expect(Resolver.resolve(context, 'banana', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/other-root/node_modules/banana/main.js'),
  });

  expect(() => Resolver.resolve(context, 'kiwi', null)).toThrow(
    new Error(
      'Module does not exist in the Haste module map or in these directories:\n' +
        `  ${p('/root/project/node_modules')}\n` +
        `  ${p('/root/node_modules')}\n` +
        `  ${p('/node_modules')}\n` +
        `  ${p('/other-root/node_modules')}\n`,
    ),
  );
});

test('resolves transitive dependencies when using `nodeModulesPaths`', () => {
  const context = {
    ...CONTEXT,
    originModulePath: p('/other-root/node_modules/banana/main.js'),
    nodeModulesPaths: [p('/other-root/node_modules')],
  };

  expect(Resolver.resolve(context, 'banana-module', null)).toEqual({
    type: 'sourceFile',
    filePath: p(
      '/other-root/node_modules/banana/node_modules/banana-module/main.js',
    ),
  });

  expect(Resolver.resolve(context, 'banana-module', null)).not.toEqual({
    type: 'sourceFile',
    filePath: p('/other-root/node_modules/banana-module/main.js'),
  });
});

describe('disableHierarchicalLookup', () => {
  const context = {...CONTEXT, disableHierarchicalLookup: true};

  test('disables node_modules lookup', () => {
    expect(() => Resolver.resolve(context, 'apple', null))
      .toThrowErrorMatchingInlineSnapshot(`
      "Module does not exist in the Haste module map

      "
    `);
  });

  test('respects nodeModulesPaths', () => {
    const contextWithOtherRoot = {
      ...context,
      nodeModulesPaths: [p('/other-root/node_modules')],
    };

    // apple exists in /root/node_modules
    expect(() => Resolver.resolve(contextWithOtherRoot, 'apple', null)).toThrow(
      new Error(
        'Module does not exist in the Haste module map or in these directories:\n' +
          `  ${p('/other-root/node_modules')}\n`,
      ),
    );

    expect(Resolver.resolve(contextWithOtherRoot, 'banana', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/other-root/node_modules/banana/main.js'),
    });

    // kiwi doesn't exist anywhere
    expect(() => Resolver.resolve(contextWithOtherRoot, 'kiwi', null)).toThrow(
      new Error(
        'Module does not exist in the Haste module map or in these directories:\n' +
          `  ${p('/other-root/node_modules')}\n`,
      ),
    );
  });

  test('respects extraNodeModules', () => {
    const contextWithExtra = {
      ...context,
      extraNodeModules: {
        'renamed-apple': p('/root/node_modules/apple'),
      },
    };

    expect(Resolver.resolve(contextWithExtra, 'renamed-apple', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/root/node_modules/apple/main.js'),
    });
  });
});

test('resolves Haste modules', () => {
  expect(Resolver.resolve(CONTEXT, 'Foo', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/haste/Foo.js'),
  });
  expect(Resolver.resolve(CONTEXT, 'Bar', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/haste/Bar.js'),
  });
});

test('does not call resolveHasteModule for a specifier with separators', () => {
  const resolveHasteModule = jest.fn();
  expect(() =>
    Resolver.resolve(
      {
        ...CONTEXT,
        resolveHasteModule,
      },
      'Foo/bar',
      null,
    ),
  ).toThrow();
  expect(resolveHasteModule).not.toHaveBeenCalled();
});

test('resolves a Haste package', () => {
  expect(Resolver.resolve(CONTEXT, 'some-package', null)).toEqual({
    type: 'sourceFile',
    filePath: p('/haste/some-package/main.js'),
  });
});

test.each([
  ['simple', 'simple'],
  ['simple/with/subpath', 'simple'],
  ['@scoped/package', '@scoped/package'],
  ['@scoped/with/subpath', '@scoped/with'],
])(
  'calls resolveHastePackage for specifier %s with %s',
  (specifier, expectedHastePackageCandidate) => {
    const resolveHastePackage = jest.fn();
    expect(() =>
      Resolver.resolve(
        {
          ...CONTEXT,
          resolveHastePackage,
        },
        specifier,
        null,
      ),
    ).toThrow();
    expect(resolveHastePackage).toHaveBeenCalledWith(
      expectedHastePackageCandidate,
    );
    expect(resolveHastePackage).toHaveBeenCalledTimes(1);
  },
);

test('does not call resolveHastePackage for invalid specifier @notvalid', () => {
  const resolveHastePackage = jest.fn();
  expect(() =>
    Resolver.resolve(
      {
        ...CONTEXT,
        resolveHastePackage,
      },
      '@notvalid',
      null,
    ),
  ).toThrow();
  expect(resolveHastePackage).not.toHaveBeenCalled();
});

test('resolves a file inside a Haste package', () => {
  expect(
    Resolver.resolve(CONTEXT, 'some-package/subdir/other-file', null),
  ).toEqual({
    type: 'sourceFile',
    filePath: p('/haste/some-package/subdir/other-file.js'),
  });
});

test('throws a descriptive error when a file inside a Haste package cannot be resolved', () => {
  expect(() => {
    Resolver.resolve(CONTEXT, 'some-package/subdir/does-not-exist', null);
  }).toThrow(
    new Error(
      'While resolving module `some-package/subdir/does-not-exist`, the Haste package `some-package` was found. However the subpath `./subdir/does-not-exist` could not be found within the package. Indeed, none of these files exist:\n\n' +
        `  * \`${p('/haste/some-package/subdir/does-not-exist')}(.js|.jsx|.json|.ts|.tsx)\`\n` +
        `  * \`${p('/haste/some-package/subdir/does-not-exist')}\``,
    ),
  );
});

describe('browser spec redirection', () => {
  test('is used for relative path requests', () => {
    const testFileMap = {
      ...fileMap,
      [p('/root/project/package.json')]: JSON.stringify({
        name: 'project',
        browser: {
          './bar': false,
        },
      }),
    };
    const context = {
      ...createResolutionContext(testFileMap),
      originModulePath: p('/root/project/foo.js'),
    };
    expect(Resolver.resolve(context, './bar', null)).toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
  });

  test('is used for absolute path requests', () => {
    // browser field redirects the specifier to false
    const testFileMap = {
      [p('/root/bar.js')]: '',
      [p('/root/package.json')]: JSON.stringify({
        browser: {
          './bar': false,
        },
      }),
    };
    const context = {
      ...createResolutionContext(testFileMap),
      originModulePath: p('/other/project/foo.js'),
    };
    expect(Resolver.resolve(context, p('/root/bar'), null))
      .toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
  });

  test('is used for non-Haste package requests', () => {
    const testFileMap = {
      ...fileMap,
      [p('/root/project/package.json')]: JSON.stringify({
        name: 'project',
        browser: {
          'does-not-exist': false,
        },
      }),
    };
    const context = {
      ...createResolutionContext(testFileMap),
      originModulePath: p('/root/project/foo.js'),
    };
    expect(Resolver.resolve(context, 'does-not-exist', null))
      .toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
  });

  test('can redirect to an arbitrary relative module', () => {
    const testFileMap = {
      ...fileMap,
      [p('/root/project/package.json')]: JSON.stringify({
        browser: {
          'does-not-exist': '../smth/beep',
        },
      }),
    };
    const context = {
      ...createResolutionContext(testFileMap),
      originModulePath: p('/root/project/foo.js'),
    };
    expect(Resolver.resolve(context, 'does-not-exist', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/root/smth/beep.js'),
    });
  });

  test('rejects redirection of a bare specifier to an absolute path', () => {
    const testFileMap = {
      ...fileMap,
      [p('/root/project/package.json')]: JSON.stringify({
        name: 'project',
        browser: {
          'foo-pkg': '/otherroot/foo',
        },
      }),
      [p('/otherroot/foo.js')]: '',
    };
    const context = {
      ...createResolutionContext(testFileMap),
      originModulePath: p('/root/project/bar.js'),
    };
    expect(() => Resolver.resolve(context, 'foo-pkg', null)).toThrow(
      new Error(
        `The package ${p('/root/project')} contains an invalid package.json configuration. Consider raising this issue with the package maintainer(s).\n` +
          'Reason: Attempted to redirect import to an absolute path. This is not allowed by the "browser" spec.\n' +
          `  From: ${p('/root/project/bar.js')}\n` +
          '  Import: foo-pkg\n' +
          '  Attempted redirect: /otherroot/foo',
      ),
    );
  });

  test('resolves source extension candidates to relative paths', () => {
    const testFileMap = {
      ...fileMap,
      [p('/root/project/package.json')]: JSON.stringify({
        name: 'project',
        browser: {
          './beep.another-fake-ext': '../smth/beep.js',
        },
      }),
      [p('/root/project/beep.js')]: '',
    };
    const context = {
      ...createResolutionContext(testFileMap),
      originModulePath: p('/root/project/foo.js'),
      sourceExts: ['fake-ext', 'another-fake-ext'],
    };
    expect(Resolver.resolve(context, './beep', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/root/smth/beep.js'),
    });
  });

  test('can resolve to empty from a candidate with an added source extension', () => {
    const testFileMap = {
      ...fileMap,
      [p('/root/project/package.json')]: JSON.stringify({
        name: 'project',
        browser: {
          './beep.fake-ext': false,
        },
      }),
    };
    const context = {
      ...createResolutionContext(testFileMap),
      originModulePath: p('/root/project/foo.js'),
      sourceExts: ['fake-ext', 'js'],
    };
    expect(Resolver.resolve(context, './beep', null)).toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
  });
});

describe('resolveRequest', () => {
  // $FlowFixMe[unclear-type]: `resolveRequest` is used too dynamically.
  const resolveRequest = jest.fn<any, any>();
  const context = {...CONTEXT, resolveRequest};

  beforeEach(() => {
    resolveRequest.mockReset();
    resolveRequest.mockImplementation(() => ({type: 'empty'}));
  });

  test('is called for non-Haste package requests', () => {
    expect(Resolver.resolve(context, 'does-not-exist', null))
      .toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      'does-not-exist',
      null,
    );
  });

  test('is called for relative path requests', () => {
    expect(Resolver.resolve(context, './does-not-exist', null))
      .toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      './does-not-exist',
      null,
    );
  });

  test('is called for absolute path requests', () => {
    expect(Resolver.resolve(context, p('/does-not-exist'), null))
      .toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      p('/does-not-exist'),
      null,
    );
  });

  test('is called for Haste packages', () => {
    expect(Resolver.resolve(context, 'some-package', null))
      .toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      'some-package',
      null,
    );
  });

  test('is called for Haste modules', () => {
    expect(Resolver.resolve(context, 'Foo', null)).toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      'Foo',
      null,
    );
  });

  test('is called with the platform and non-redirected module path', () => {
    const testFileMap = {
      ...fileMap,
      [p('/root/project/package.json')]: JSON.stringify({
        browser: {
          'does-not-exist': './redirected',
        },
      }),
    };
    const contextWithRedirect = {
      ...context,
      ...createResolutionContext(testFileMap),
    };
    expect(Resolver.resolve(contextWithRedirect, 'does-not-exist', 'android'))
      .toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...contextWithRedirect, resolveRequest: Resolver.resolve},
      'does-not-exist',
      'android',
    );
  });

  test('is called if redirectModulePath returns false', () => {
    resolveRequest.mockImplementation(() => ({
      type: 'sourceFile',
      filePath: '/some/fake/path',
    }));
    const testFileMap = {
      ...fileMap,
      [p('/root/project/package.json')]: JSON.stringify({
        browser: {
          'does-not-exist': false,
        },
      }),
    };
    const contextWithRedirect = {
      ...context,
      ...createResolutionContext(testFileMap),
    };
    expect(Resolver.resolve(contextWithRedirect, 'does-not-exist', 'android'))
      .toMatchInlineSnapshot(`
      Object {
        "filePath": "/some/fake/path",
        "type": "sourceFile",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...contextWithRedirect, resolveRequest: Resolver.resolve},
      'does-not-exist',
      'android',
    );
  });

  test('can forward requests to the standard resolver', () => {
    // This test shows a common pattern for wrapping the standard resolver.
    resolveRequest.mockImplementation((ctx, moduleName, platform) => {
      return Resolver.resolve(
        {...ctx, resolveRequest: null},
        moduleName,
        platform,
      );
    });
    expect(() => {
      Resolver.resolve(context, 'does-not-exist', 'android');
    }).toThrow(
      new Error(
        'Module does not exist in the Haste module map or in these directories:\n' +
          `  ${p('/root/project/node_modules')}\n` +
          `  ${p('/root/node_modules')}\n` +
          `  ${p('/node_modules')}\n`,
      ),
    );
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      'does-not-exist',
      'android',
    );
  });

  test('can forward Haste requests to the standard resolver', () => {
    resolveRequest.mockImplementation((ctx, moduleName, platform) => {
      return Resolver.resolve(
        {...ctx, resolveRequest: null},
        moduleName,
        platform,
      );
    });
    expect(Resolver.resolve(context, 'Foo', null)).toEqual({
      type: 'sourceFile',
      filePath: p('/haste/Foo.js'),
    });
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      'Foo',
      null,
    );
  });

  test('can forward requests to the standard resolver via resolveRequest', () => {
    resolveRequest.mockImplementation((ctx, moduleName, platform) => {
      return ctx.resolveRequest(ctx, moduleName, platform);
    });
    expect(() => {
      Resolver.resolve(context, 'does-not-exist', 'android');
    }).toThrow(
      new Error(
        'Module does not exist in the Haste module map or in these directories:\n' +
          `  ${p('/root/project/node_modules')}\n` +
          `  ${p('/root/node_modules')}\n` +
          `  ${p('/node_modules')}\n`,
      ),
    );
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      'does-not-exist',
      'android',
    );
  });

  test('throwing an error stops the standard resolution', () => {
    resolveRequest.mockImplementation((ctx, moduleName, platform) => {
      throw new Error('Custom resolver hit an error');
    });
    const {resolveRequest: _, ...contextWithoutCustomResolver} = context;
    // Ensure that the request has a standard resolution.
    expect(
      Resolver.resolve(
        contextWithoutCustomResolver,
        p('/root/project/foo.js'),
        'android',
      ),
    ).toEqual({type: 'sourceFile', filePath: p('/root/project/foo.js')});
    // Ensure that we don't get this standard resolution if we throw.
    expect(() => {
      Resolver.resolve(context, p('/root/project/foo.js'), 'android');
    }).toThrowErrorMatchingInlineSnapshot(`"Custom resolver hit an error"`);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {...context, resolveRequest: Resolver.resolve},
      p('/root/project/foo.js'),
      'android',
    );
  });

  test('receives customResolverOptions', () => {
    expect(
      Resolver.resolve(
        {...context, customResolverOptions: {key: 'value'}},
        p('/root/project/foo.js'),
        'android',
      ),
    ).toMatchInlineSnapshot(`
      Object {
        "type": "empty",
      }
    `);
    expect(resolveRequest).toBeCalledTimes(1);
    expect(resolveRequest).toBeCalledWith(
      {
        ...context,
        resolveRequest: Resolver.resolve,
        customResolverOptions: {key: 'value'},
      },
      p('/root/project/foo.js'),
      'android',
    );
  });
});
