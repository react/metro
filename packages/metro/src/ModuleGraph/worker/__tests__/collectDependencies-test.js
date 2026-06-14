/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

import type {Dependency} from '../collectDependencies';
import type {
  DependencyTransformer,
  InternalDependency,
  Options,
  State,
} from '../collectDependencies';
import type {NodePath} from '@babel/traverse';
import type {MetroBabelFileMetadata} from 'metro-babel-transformer';

import collectDependencies from '../collectDependencies';

const {importLocationsPlugin, locToKey} = require('../importLocationsPlugin');
const {codeFromAst, comparableCode} = require('./test-helpers');
const {codeFrameColumns} = require('@babel/code-frame');
const {transformFromAstSync} = require('@babel/core');
const babylon = require('@babel/parser');
const t = require('@babel/types');
const dedent = require('dedent');
const nullthrows = require('nullthrows');

const {any, objectContaining} = expect;

const {InvalidRequireCallError} = collectDependencies;
const opts: Options = {
  asyncRequireModulePath: 'asyncRequire',
  dynamicRequires: 'reject',
  inlineableCalls: [],
  keepRequireNames: true,
  allowOptionalDependencies: false,
  dependencyMapName: null,
  unstable_allowRequireContext: false,
};

describe(`require.context`, () => {
  const optsWithoutContext = {...opts, unstable_allowRequireContext: false};
  const optsWithContext = {...opts, unstable_allowRequireContext: true};

  test('does not extract/transform if feature is disabled', () => {
    // TODO: Should this error/warn?
    const ast = astFromCode(`
      require.context('./', false, /foobar/m, 'eager');
    `);
    const {dependencies} = collectDependencies(ast, optsWithoutContext);
    expect(dependencies).toEqual([]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        require.context('./', false, /foobar/m, 'eager');
      `),
    );
  });

  test('can omit 2nd-4th arguments', () => {
    const ast = astFromCode(`
      const a = require.context('./');
      const b = require.context('./', false);
      const c = require.context('./', true, /custom/i);
      const d = require.context('./', true, /.*/, 'eager')
    `);
    const {dependencies, dependencyMapName} = collectDependencies(
      ast,
      optsWithContext,
    );
    expect(dependencies).toEqual([
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'sync',
            recursive: false,
          },
        }),
      },
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: 'custom',
              flags: 'i',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'eager',
            recursive: true,
          },
        }),
      },
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        const a = require(${dependencyMapName}[0], "./");
        const b = require(${dependencyMapName}[1], "./");
        const c = require(${dependencyMapName}[2], "./");
        const d = require(${dependencyMapName}[3], "./");
      `),
    );
  });

  test('can pass undefined for 2nd-4th arguments', () => {
    const ast = astFromCode(`
      const a = require.context('./', undefined, undefined, undefined);
      const b = require.context('./', false, undefined, undefined);
      const c = require.context('./', undefined, /custom/i, undefined);
      const d = require.context('./', undefined, undefined, 'eager');
    `);
    const {dependencies, dependencyMapName} = collectDependencies(
      ast,
      optsWithContext,
    );
    expect(dependencies).toEqual([
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'sync',
            recursive: false,
          },
        }),
      },
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: 'custom',
              flags: 'i',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'eager',
            recursive: true,
          },
        }),
      },
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        const a = require(${dependencyMapName}[0], "./");
        const b = require(${dependencyMapName}[1], "./");
        const c = require(${dependencyMapName}[2], "./");
        const d = require(${dependencyMapName}[3], "./");
      `),
    );
  });

  test('can understand constant assignments', () => {
    const ast = astFromCode(`
      const DOT_SLASH_FOO = './foo';
      const FALSE = false;
      const EAGER = 'eager';
      const a = require.context(DOT_SLASH_FOO, FALSE, /pattern/, EAGER);
    `);
    const {dependencies, dependencyMapName} = collectDependencies(
      ast,
      optsWithContext,
    );
    expect(dependencies).toEqual([
      {
        name: './foo',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: 'pattern',
              flags: '',
            },
            mode: 'eager',
            recursive: false,
          },
        }),
      },
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        const DOT_SLASH_FOO = './foo';
        const FALSE = false;
        const EAGER = 'eager';
        const a = require(${dependencyMapName}[0], "./foo");
      `),
    );
  });

  test.skip('can understand regex constant assignments', () => {
    // TODO: augment Babel's path.evaluate() with regex support
    const ast = astFromCode(`
      const DOT_SLASH_FOO = './foo';
      const FALSE = false;
      const EAGER = 'eager';
      const PATTERN = /pattern/;
      const a = require.context(DOT_SLASH_FOO, FALSE, PATTERN, EAGER);
    `);
    const {dependencies, dependencyMapName} = collectDependencies(
      ast,
      optsWithContext,
    );
    expect(dependencies).toEqual([
      {
        name: './foo',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: 'pattern',
              flags: '',
            },
            mode: 'eager',
            recursive: false,
          },
        }),
      },
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        const DOT_SLASH_FOO = "./foo";
        const FALSE = false;
        const EAGER = "eager";
        const PATTERN = /pattern/;
        const a = require(${dependencyMapName}[0], "./foo");
      `),
    );
  });

  test('distinguishes require from require.context', () => {
    const ast = astFromCode(`
      const a = require.context('./');
      const anotherA = require.context('./');
      const b = require('./');
      const anotherB = require('./');
    `);
    const {dependencies, dependencyMapName} = collectDependencies(
      ast,
      optsWithContext,
    );
    expect(dependencies).toEqual([
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
      {
        name: './',
        data: expect.not.objectContaining({
          contextParams: expect.anything(),
        }),
      },
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        const a = require(${dependencyMapName}[0], "./");
        const anotherA = require(${dependencyMapName}[0], "./");
        const b = require(${dependencyMapName}[1], "./");
        const anotherB = require(${dependencyMapName}[1], "./");
      `),
    );
  });

  test('distinguishes require.context based on path', () => {
    const ast = astFromCode(`
      const a = require.context('./a/');
      const anotherA = require.context('./a/');
      const b = require.context('./b/');
      const anotherB = require.context('./b/');
    `);
    const {dependencies, dependencyMapName} = collectDependencies(
      ast,
      optsWithContext,
    );
    expect(dependencies).toEqual([
      {
        name: './a/',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
      {
        name: './b/',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        const a = require(${dependencyMapName}[0], "./a/");
        const anotherA = require(${dependencyMapName}[0], "./a/");
        const b = require(${dependencyMapName}[1], "./b/");
        const anotherB = require(${dependencyMapName}[1], "./b/");
      `),
    );
  });

  test('distinguishes require.context based on trailing slash in path', () => {
    // TODO: Can/should we merge these two?
    const ast = astFromCode(`
      const a = require.context('.');
      const anotherA = require.context('.');
      const b = require.context('./');
      const anotherB = require.context('./');
    `);
    const {dependencies, dependencyMapName} = collectDependencies(
      ast,
      optsWithContext,
    );
    expect(dependencies).toEqual([
      {
        name: '.',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        const a = require(${dependencyMapName}[0], ".");
        const anotherA = require(${dependencyMapName}[0], ".");
        const b = require(${dependencyMapName}[1], "./");
        const anotherB = require(${dependencyMapName}[1], "./");
      `),
    );
  });

  test('distinguishes between backslash and slash in path', () => {
    // TODO: Can/should we merge these two?
    const ast = astFromCode(`
      const a = require.context('.\\\\');
      const anotherA = require.context('.\\\\');
      const b = require.context('./');
      const anotherB = require.context('./');
    `);
    const {dependencies, dependencyMapName} = collectDependencies(
      ast,
      optsWithContext,
    );
    expect(dependencies).toEqual([
      {
        name: '.\\',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        const a = require(${dependencyMapName}[0], ".\\\\");
        const anotherA = require(${dependencyMapName}[0], ".\\\\");
        const b = require(${dependencyMapName}[1], "./");
        const anotherB = require(${dependencyMapName}[1], "./");
      `),
    );
  });

  test('distinguishes require.context based on `recursive`', () => {
    const ast = astFromCode(`
      const a = require.context('./', true);
      const anotherA = require.context('./');
      const b = require.context('./', false);
      const anotherB = require.context('./', false);
    `);
    const {dependencies, dependencyMapName} = collectDependencies(
      ast,
      optsWithContext,
    );
    expect(dependencies).toEqual([
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'sync',
            recursive: false,
          },
        }),
      },
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        const a = require(${dependencyMapName}[0], "./");
        const anotherA = require(${dependencyMapName}[0], "./");
        const b = require(${dependencyMapName}[1], "./");
        const anotherB = require(${dependencyMapName}[1], "./");
      `),
    );
  });

  test('distinguishes require.context based on filter pattern', () => {
    const ast = astFromCode(`
      const a = require.context('./', true, /foo/);
      const anotherA = require.context('./', true, /foo/);
      const b = require.context('./', true, /.*/);
      const anotherB = require.context('./', true);
    `);
    const {dependencies, dependencyMapName} = collectDependencies(
      ast,
      optsWithContext,
    );
    expect(dependencies).toEqual([
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: 'foo',
              flags: '',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        const a = require(${dependencyMapName}[0], "./");
        const anotherA = require(${dependencyMapName}[0], "./");
        const b = require(${dependencyMapName}[1], "./");
        const anotherB = require(${dependencyMapName}[1], "./");
      `),
    );
  });

  test('distinguishes require.context based on filter flags', () => {
    const ast = astFromCode(`
      const a = require.context('./', true, /foo/m);
      const anotherA = require.context('./', true, /foo/m);
      const b = require.context('./', true, /foo/);
      const anotherB = require.context('./', true, /foo/);
    `);
    const {dependencies, dependencyMapName} = collectDependencies(
      ast,
      optsWithContext,
    );
    expect(dependencies).toEqual([
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: 'foo',
              flags: 'm',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: 'foo',
              flags: '',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        const a = require(${dependencyMapName}[0], "./");
        const anotherA = require(${dependencyMapName}[0], "./");
        const b = require(${dependencyMapName}[1], "./");
        const anotherB = require(${dependencyMapName}[1], "./");
      `),
    );
  });

  test('distinguishes require.context based on mode', () => {
    const ast = astFromCode(`
      const a = require.context('./', true, /.*/, 'sync');
      const anotherA = require.context('./', true, /.*/);
      const b = require.context('./', true, /.*/, 'eager');
      const anotherB = require.context('./', true, /.*/, 'eager');
    `);
    const {dependencies, dependencyMapName} = collectDependencies(
      ast,
      optsWithContext,
    );
    expect(dependencies).toEqual([
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'sync',
            recursive: true,
          },
        }),
      },
      {
        name: './',
        data: objectContaining({
          contextParams: {
            filter: {
              pattern: '.*',
              flags: '',
            },
            mode: 'eager',
            recursive: true,
          },
        }),
      },
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        const a = require(${dependencyMapName}[0], "./");
        const anotherA = require(${dependencyMapName}[0], "./");
        const b = require(${dependencyMapName}[1], "./");
        const anotherB = require(${dependencyMapName}[1], "./");
      `),
    );
  });

  test(`asserts invalid first argument`, () => {
    const ast = astFromCode(`
  const a = require.context(42);
`);
    expect(() => collectDependencies(ast, optsWithContext))
      .toThrowErrorMatchingInlineSnapshot(`
      "Invalid call at line 2: 42
      First argument of \`require.context\` should be a string denoting the directory to require."
    `);
  });
  test(`asserts invalid second argument`, () => {
    const ast = astFromCode(`
  const a = require.context('./dir', 'hey');
`);
    expect(() => collectDependencies(ast, optsWithContext))
      .toThrowErrorMatchingInlineSnapshot(`
      "Invalid call at line 2: 'hey'
      Second argument of \`require.context\` should be an optional boolean indicating if files should be imported recursively or not."
    `);
  });
  test(`asserts invalid third argument`, () => {
    const ast = astFromCode(`
  const a = require.context('./dir', false, new RegExp('foobar'));
`);
    expect(() => collectDependencies(ast, optsWithContext))
      .toThrowErrorMatchingInlineSnapshot(`
      "Invalid call at line 2: new RegExp('foobar')
      Third argument of \`require.context\` should be an optional RegExp pattern matching all of the files to import, instead found node of type: NewExpression."
    `);
  });
  test(`asserts invalid fourth argument`, () => {
    const ast = astFromCode(`
  const a = require.context('./dir', false, /foobar/, 34);
`);
    expect(() => collectDependencies(ast, optsWithContext))
      .toThrowErrorMatchingInlineSnapshot(`
      "Invalid call at line 2: 34
      Fourth argument of \`require.context\` should be an optional string \\"mode\\" denoting how the modules will be resolved."
    `);
  });
  test(`asserts invalid fourth argument enum value`, () => {
    const ast = astFromCode(`
  const a = require.context('./dir', false, /foobar/, 'hello');
`);
    expect(() => collectDependencies(ast, optsWithContext))
      .toThrowErrorMatchingInlineSnapshot(`
      "Invalid call at line 2: 'hello'
      require.context \\"hello\\" mode is not supported. Expected one of: sync, eager, lazy, lazy-once"
    `);
  });
  test(`asserts too many arguments`, () => {
    const ast = astFromCode(`
  const a = require.context('./dir', false, /foobar/, 'sync', 'hey');
`);
    expect(() => collectDependencies(ast, optsWithContext))
      .toThrowErrorMatchingInlineSnapshot(`
      "Invalid call at line 2: require.context('./dir', false, /foobar/, 'sync', 'hey')
      Too many arguments provided to \`require.context\` call. Expected 4, got: 5"
    `);
  });
  test(`asserts no arguments`, () => {
    const ast = astFromCode(`
  const a = require.context();
`);
    expect(() =>
      collectDependencies(ast, optsWithContext),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Invalid call at line 2: require.context()"`,
    );
  });
});

test('collects unique dependency identifiers and transforms the AST', () => {
  const ast = astFromCode(`
    const a = require('b/lib/a');
    exports.do = () => require("do");
    if (!something) {
      require("setup/something");
    }
    require('do');
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
  expect(dependencies).toEqual([
    {name: 'b/lib/a', data: objectContaining({asyncType: null})},
    {name: 'do', data: objectContaining({asyncType: null})},
    {name: 'setup/something', data: objectContaining({asyncType: null})},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      const a = require(${dependencyMapName}[0], "b/lib/a");
      exports.do = () => require(${dependencyMapName}[1], "do");
      if (!something) {
        require(${dependencyMapName}[2], "setup/something");
      }
      require(${dependencyMapName}[1], "do");
    `),
  );
});

test('uses dependencyMapName parameter as-is if provided', () => {
  const ast = astFromCode(`
    const a = require('b/lib/a');
    exports.do = () => require("do");
    if (!something) {
      require("setup/something");
    }
    require('do');
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast, {
    ...opts,
    dependencyMapName: '_$$_TEST_DEP_MAP',
  });
  expect(dependencyMapName).toBe('_$$_TEST_DEP_MAP');
  expect(dependencies).toEqual([
    {name: 'b/lib/a', data: objectContaining({asyncType: null})},
    {name: 'do', data: objectContaining({asyncType: null})},
    {name: 'setup/something', data: objectContaining({asyncType: null})},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      const a = require(_$$_TEST_DEP_MAP[0], "b/lib/a");
      exports.do = () => require(_$$_TEST_DEP_MAP[1], "do");
      if (!something) {
        require(_$$_TEST_DEP_MAP[2], "setup/something");
      }
      require(_$$_TEST_DEP_MAP[1], "do");
    `),
  );
});

test('collects asynchronous dependencies', () => {
  const ast = astFromCode(`
    import("some/async/module").then(foo => {});
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
  expect(dependencies).toEqual([
    {name: 'some/async/module', data: objectContaining({asyncType: 'async'})},
    {name: 'asyncRequire', data: objectContaining({asyncType: null})},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      require(${dependencyMapName}[1], "asyncRequire")(${dependencyMapName}[0], _dependencyMap.paths, "some/async/module").then(foo => {});
    `),
  );
});

test('collects asynchronous dependencies with keepRequireNames: false', () => {
  const ast = astFromCode(`
    import("some/async/module").then(foo => {});
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast, {
    ...opts,
    keepRequireNames: false,
  });
  expect(dependencies).toEqual([
    {name: 'some/async/module', data: objectContaining({asyncType: 'async'})},
    {name: 'asyncRequire', data: objectContaining({asyncType: null})},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      require(${dependencyMapName}[1])(${dependencyMapName}[0], _dependencyMap.paths).then(foo => {});
    `),
  );
});

test('distinguishes sync and async dependencies on the same module', () => {
  const ast = astFromCode(`
    const a = require("some/async/module");
    import("some/async/module").then(foo => {});
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
  expect(dependencies).toEqual([
    {name: 'some/async/module', data: objectContaining({asyncType: null})},
    {name: 'some/async/module', data: objectContaining({asyncType: 'async'})},
    {name: 'asyncRequire', data: objectContaining({asyncType: null})},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      const a = require(${dependencyMapName}[0], "some/async/module");
      require(${dependencyMapName}[2], "asyncRequire")(${dependencyMapName}[1], _dependencyMap.paths, "some/async/module").then(foo => {});
    `),
  );
});

test('distinguishes sync and async dependencies on the same module; reverse order', () => {
  const ast = astFromCode(`
    import("some/async/module").then(foo => {});
    const a = require("some/async/module");
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
  expect(dependencies).toEqual([
    {name: 'some/async/module', data: objectContaining({asyncType: 'async'})},
    {name: 'asyncRequire', data: objectContaining({asyncType: null})},
    {name: 'some/async/module', data: objectContaining({asyncType: null})},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      require(${dependencyMapName}[1], "asyncRequire")(${dependencyMapName}[0], _dependencyMap.paths, "some/async/module").then(foo => {});
      const a = require(${dependencyMapName}[2], "some/async/module");
    `),
  );
});

describe('import() prefetching', () => {
  test('collects prefetch calls', () => {
    const ast = astFromCode(`
      __prefetchImport("some/async/module");
    `);
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {
        name: 'some/async/module',
        data: objectContaining({asyncType: 'prefetch'}),
      },
      {name: 'asyncRequire', data: objectContaining({asyncType: null})},
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        require(${dependencyMapName}[1], "asyncRequire").prefetch(${dependencyMapName}[0], _dependencyMap.paths, "some/async/module");
      `),
    );
  });

  test('keepRequireNames: false', () => {
    const ast = astFromCode(`
      __prefetchImport("some/async/module");
    `);
    const {dependencies, dependencyMapName} = collectDependencies(ast, {
      ...opts,
      keepRequireNames: false,
    });
    expect(dependencies).toEqual([
      {
        name: 'some/async/module',
        data: objectContaining({asyncType: 'prefetch'}),
      },
      {name: 'asyncRequire', data: objectContaining({asyncType: null})},
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        require(${dependencyMapName}[1]).prefetch(${dependencyMapName}[0], _dependencyMap.paths);
      `),
    );
  });

  test('distinguishes between import and prefetch dependncies on the same module', () => {
    const ast = astFromCode(`
      __prefetchImport("some/async/module");
      import("some/async/module").then(() => {});
    `);
    const {dependencies} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {
        name: 'some/async/module',
        data: objectContaining({asyncType: 'prefetch'}),
      },
      {name: 'asyncRequire', data: objectContaining({asyncType: null})},
      {name: 'some/async/module', data: objectContaining({asyncType: 'async'})},
    ]);
  });
});

describe('require.unstable_importMaybeSync()', () => {
  test('collects require.unstable_importMaybeSync calls', () => {
    const ast = astFromCode(`
      require.unstable_importMaybeSync("some/async/module");
    `);
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {
        name: 'some/async/module',
        data: objectContaining({asyncType: 'maybeSync'}),
      },
      {name: 'asyncRequire', data: objectContaining({asyncType: null})},
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        require(${dependencyMapName}[1], "asyncRequire").unstable_importMaybeSync(${dependencyMapName}[0], _dependencyMap.paths, "some/async/module");
      `),
    );
  });

  test('keepRequireNames: false', () => {
    const ast = astFromCode(`
      require.unstable_importMaybeSync("some/async/module");
    `);
    const {dependencies, dependencyMapName} = collectDependencies(ast, {
      ...opts,
      keepRequireNames: false,
    });
    expect(dependencies).toEqual([
      {
        name: 'some/async/module',
        data: objectContaining({asyncType: 'maybeSync'}),
      },
      {name: 'asyncRequire', data: objectContaining({asyncType: null})},
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        require(${dependencyMapName}[1]).unstable_importMaybeSync(${dependencyMapName}[0], _dependencyMap.paths);
      `),
    );
  });

  test('distinguishes between require.unstable_importMaybeSync and prefetch dependencies on the same module', () => {
    const ast = astFromCode(`
      __prefetchImport("some/async/module");
      require.unstable_importMaybeSync("some/async/module").then(() => {});
    `);
    const {dependencies} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {
        name: 'some/async/module',
        data: objectContaining({asyncType: 'prefetch'}),
      },
      {name: 'asyncRequire', data: objectContaining({asyncType: null})},
      {
        name: 'some/async/module',
        data: objectContaining({asyncType: 'maybeSync'}),
      },
    ]);
  });
});

describe('Evaluating static arguments', () => {
  test('supports template literals as arguments', () => {
    const ast = astFromCode('require(`left-pad`)');
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {name: 'left-pad', data: objectContaining({asyncType: null})},
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`require(${dependencyMapName}[0], "left-pad");`),
    );
  });

  test('supports template literals with static interpolations', () => {
    const ast = astFromCode('require(`left${"-"}pad`)');
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {name: 'left-pad', data: objectContaining({asyncType: null})},
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`require(${dependencyMapName}[0], "left-pad");`),
    );
  });

  test('throws template literals with dyncamic interpolations', () => {
    const ast = astFromCode('let foo;require(`left${foo}pad`)');
    try {
      collectDependencies(ast, opts);
      throw new Error('should not reach');
    } catch (error) {
      if (!(error instanceof InvalidRequireCallError)) {
        throw error;
      }
      expect(error.message).toMatchSnapshot();
    }
  });

  test('throws on tagged template literals', () => {
    const ast = astFromCode('require(tag`left-pad`)');
    try {
      collectDependencies(ast, opts);
      throw new Error('should not reach');
    } catch (error) {
      if (!(error instanceof InvalidRequireCallError)) {
        throw error;
      }
      expect(error.message).toMatchSnapshot();
    }
  });

  test('supports multiple static strings concatenated', () => {
    const ast = astFromCode('require("foo_" + "bar")');
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {name: 'foo_bar', data: objectContaining({asyncType: null})},
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`require(${dependencyMapName}[0], "foo_bar");`),
    );
  });

  test('supports concatenating strings and template literasl', () => {
    const ast = astFromCode('require("foo_" + "bar" + `_baz`)');
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {name: 'foo_bar_baz', data: objectContaining({asyncType: null})},
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`require(${dependencyMapName}[0], "foo_bar_baz");`),
    );
  });

  test('supports using static variables in require statements', () => {
    const ast = astFromCode('const myVar="my"; require("foo_" + myVar)');
    const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {name: 'foo_my', data: objectContaining({asyncType: null})},
    ]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(
        `const myVar = "my"; require(${dependencyMapName}[0], "foo_my");`,
      ),
    );
  });

  test('throws when requiring non-strings', () => {
    const ast = astFromCode('require(1)');
    try {
      collectDependencies(ast, opts);
      throw new Error('should not reach');
    } catch (error) {
      if (!(error instanceof InvalidRequireCallError)) {
        throw error;
      }
      expect(error.message).toMatchSnapshot();
    }
  });

  test('throws at runtime when requiring non-strings with special option', () => {
    const ast = astFromCode('require(1)');
    const opts: Options = {
      asyncRequireModulePath: 'asyncRequire',
      dynamicRequires: 'throwAtRuntime',
      inlineableCalls: [],
      keepRequireNames: true,
      allowOptionalDependencies: false,
      dependencyMapName: null,
      unstable_allowRequireContext: false,
    };
    const {dependencies} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([]);
    expect(codeFromAst(ast)).toEqual(
      comparableCode(`
        (function (line) {
          throw new Error('Dynamic require defined at line ' + line + '; not supported by Metro');
        })(1);
      `),
    );
  });
});

test('exposes a string as `dependencyMapName` even without collecting dependencies', () => {
  const ast = astFromCode('');
  expect(collectDependencies(ast, opts).dependencyMapName).toEqual(any(String));
});

test('ignores require functions defined defined by lower scopes', () => {
  const ast = astFromCode(`
    const a = require('b/lib/a');
    exports.do = () => require("do");
    if (!something) {
      require("setup/something");
    }
    require('do');
    function testA(require) {
      const b = require('nonExistantModule');
    }
    {
      const require = function(foo) {
        return;
      }
      require('nonExistantModule');
    }
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
  expect(dependencies).toEqual([
    {name: 'b/lib/a', data: objectContaining({asyncType: null})},
    {name: 'do', data: objectContaining({asyncType: null})},
    {name: 'setup/something', data: objectContaining({asyncType: null})},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      const a = require(${dependencyMapName}[0], "b/lib/a");
      exports.do = () => require(${dependencyMapName}[1], "do");
      if (!something) {
        require(${dependencyMapName}[2], "setup/something");
      }
      require(${dependencyMapName}[1], "do");
      function testA(require) {
        const b = require('nonExistantModule');
      }
      {
        const require = function (foo) { return; };
        require('nonExistantModule');
      }
    `),
  );
});

test('collects dependencies from createRequire-bound require calls', () => {
  const ast = astFromCode(`
    import { createRequire } from 'node:module';
    const require = createRequire(import.meta.url);
    const version = require('../package.json').version;
    const otherDep = require('some-module');
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast, {
    ...opts,
    dynamicRequires: 'warn',
  });
  expect(dependencies).toEqual([
    {name: 'node:module', data: objectContaining({asyncType: null})},
    {name: '../package.json', data: objectContaining({asyncType: null})},
    {name: 'some-module', data: objectContaining({asyncType: null})},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      import { createRequire } from 'node:module';
      const require = createRequire(import.meta.url);
      const version = require(${dependencyMapName}[1], "../package.json").version;
      const otherDep = require(${dependencyMapName}[2], "some-module");
    `),
  );
});

test('collects dependencies from module.createRequire factory pattern', () => {
  const ast = astFromCode(`
    import module from 'node:module';
    const require = module.createRequire(import.meta.url);
    const data = require('./data.json');
  `);
  const {dependencies} = collectDependencies(ast, {
    ...opts,
    dynamicRequires: 'warn',
  });
  expect(dependencies).toEqual([
    {name: 'node:module', data: objectContaining({asyncType: null})},
    {name: './data.json', data: objectContaining({asyncType: null})},
  ]);
});

test('still ignores require shadowed by function expression or parameter', () => {
  const ast = astFromCode(`
    const require = function(name) { return {}; };
    require('should-be-ignored');
  `);
  const {dependencies} = collectDependencies(ast, opts);
  expect(dependencies).toEqual([]);
});

test('collects imports', () => {
  const ast = astFromCode(`
    import b from 'b/lib/a';
    import * as d from 'do';
    import type {s} from 'setup/something';
  `);

  const {dependencies} = collectDependencies(ast, opts);

  expect(dependencies).toEqual([
    {name: 'b/lib/a', data: objectContaining({asyncType: null})},
    {name: 'do', data: objectContaining({asyncType: null})},
    {name: 'setup/something', data: objectContaining({asyncType: null})},
  ]);
});

test('collects export from', () => {
  const ast = astFromCode(`
    export type {Apple} from 'Apple';
    export {Banana} from 'Banana';
    export * from 'Kiwi';
  `);

  const {dependencies} = collectDependencies(ast, opts);
  expect(dependencies).toEqual([
    {name: 'Apple', data: objectContaining({asyncType: null})},
    {name: 'Banana', data: objectContaining({asyncType: null})},
    {name: 'Kiwi', data: objectContaining({asyncType: null})},
  ]);
});

test('records locations of dependencies', () => {
  const code = dedent`
    import b from 'b/lib/a';
    import * as d from 'do';
    import type {s} from 'setup/something';
    import('some/async/module').then(foo => {});



    require('foo'); __prefetchImport('baz');
    interopRequireDefault(require('quux')); // Simulated Babel output
  `;
  const ast = astFromCode(code);

  // Babel does not guarantee a loc on generated `require()`s.
  // $FlowFixMe[incompatible-use] Discovered when typing @babel/parser
  delete ast.program.body[ast.program.body.length - 1].expression.arguments[0]
    .loc;

  const {dependencies} = collectDependencies(ast, opts);

  for (const dep of dependencies) {
    expect(dep).toEqual(
      objectContaining({data: objectContaining({locs: any(Array)})}),
    );
  }
  expect(formatDependencyLocs(dependencies, code)).toMatchInlineSnapshot(`
    "
    > 1 | import b from 'b/lib/a';
        | ^^^^^^^^^^^^^^^^^^^^^^^^ dep #0 (b/lib/a)
    > 2 | import * as d from 'do';
        | ^^^^^^^^^^^^^^^^^^^^^^^^ dep #1 (do)
    > 3 | import type {s} from 'setup/something';
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #2 (setup/something)
    > 4 | import('some/async/module').then(foo => {});
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #3 (some/async/module)
    > 4 | import('some/async/module').then(foo => {});
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #4 (asyncRequire)
    > 8 | require('foo'); __prefetchImport('baz');
        |                 ^^^^^^^^^^^^^^^^^^^^^^^^ dep #4 (asyncRequire)
    > 8 | require('foo'); __prefetchImport('baz');
        | ^^^^^^^^^^^^^^ dep #5 (foo)
    > 8 | require('foo'); __prefetchImport('baz');
        |                 ^^^^^^^^^^^^^^^^^^^^^^^ dep #6 (baz)
    > 9 | interopRequireDefault(require('quux')); // Simulated Babel output
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #7 (quux)"
  `);
});

test('integration: records locations of inlined dependencies (Metro ESM)', () => {
  const code = dedent`
    import a from 'a';
    import {b as b1} from 'b';
    import * as c from 'c';
    const d = require('d');

    console.log([a, b1, c, d]);
  `;
  const ast = astFromCode(code);

  const importDefault = 'importDefault';
  const importAll = 'importAll';

  const inlineableCalls = [importDefault, importAll];

  const {ast: transformedAst} = transformFromAstSync(ast, code, {
    ast: true,
    plugins: [
      [
        require('metro-transform-plugins').importExportPlugin,
        {
          importDefault,
          importAll,
        },
      ],
      [
        require('metro-transform-plugins').inlineRequiresPlugin,
        {inlineableCalls},
      ],
    ],
    babelrc: false,
    configFile: false,
  });

  const {dependencies} = collectDependencies(nullthrows(transformedAst), {
    ...opts,
    inlineableCalls,
  });
  expect(formatDependencyLocs(dependencies, code)).toMatchInlineSnapshot(`
    "
    > 1 | import a from 'a';
        | ^^^^^^^^^^^^^^^^^^ dep #0 (a)
    > 2 | import {b as b1} from 'b';
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #1 (b)
    > 3 | import * as c from 'c';
        | ^^^^^^^^^^^^^^^^^^^^^^^ dep #2 (c)
    > 4 | const d = require('d');
        |           ^^^^^^^^^^^^ dep #3 (d)"
  `);

  // Verify that dependencies have been inlined into the console.log call.
  expect(codeFromAst(nullthrows(transformedAst))).toMatch(/^console\.log/);
});

test('integration: records locations of inlined dependencies (Babel ESM)', () => {
  const code = dedent`
    import a from 'a';
    import {b as b1} from 'b';
    import * as c from 'c';

    console.log([a, b1, c]);
  `;
  const ast = astFromCode(code);

  const {ast: transformedAst} = transformFromAstSync(ast, code, {
    ast: true,
    plugins: [
      [
        require('@babel/plugin-transform-modules-commonjs'),
        {
          lazy: true,
        },
      ],
    ],
    babelrc: false,
    configFile: false,
  });

  const {dependencies} = collectDependencies(nullthrows(transformedAst), opts);
  expect(formatDependencyLocs(dependencies, code)).toMatchInlineSnapshot(`
    "
    > 1 | import a from 'a';
        | ^^^^^^^^^^^^^^^^^^ dep #0 (a)
    > 2 | import {b as b1} from 'b';
        | ^^^^^^^^^^^^^^^^^^^^^^^^^^ dep #1 (b)
    > 3 | import * as c from 'c';
        | ^^^^^^^^^^^^^^^^^^^^^^^ dep #2 (c)"
  `);
});

describe('optional dependencies', () => {
  const opts: Options = {
    asyncRequireModulePath: 'asyncRequire',
    dynamicRequires: 'reject',
    inlineableCalls: [],
    keepRequireNames: true,
    allowOptionalDependencies: true,
    dependencyMapName: null,
    unstable_allowRequireContext: false,
  };
  const validateDependencies = (
    dependencies: ReadonlyArray<Dependency>,
    expectedCount: number,
  ) => {
    let hasAsync = false;
    let checked = 0;
    dependencies.forEach(d => {
      if (d.name.includes('-async')) {
        expect(d.data.asyncType).toBe('async');
        hasAsync = true;
      } else {
        expect(d.data.asyncType).toBe(null);
      }
      if (
        d.name.startsWith('optional') ||
        d.name.startsWith('@somescope/optional')
      ) {
        checked += 1;
        expect(d.data.isOptional).toBeTruthy();
      } else if (
        d.name.startsWith('not-optional') ||
        d.name.startsWith('@somescope/not-optional')
      ) {
        checked += 1;
        expect(d.data.isOptional).toBeFalsy();
      }
    });
    expect(dependencies).toHaveLength(checked + (hasAsync ? 1 : 0));
    expect(dependencies).toHaveLength(expectedCount);
  };
  test('dependency in try-block within 1-level will be optional', () => {
    const ast = astFromCode(`
      function fFunc() {
        import('not-optional-async-f').then();
      }
      try {
        const a = require('optional-a');
        if(true) {
          const b = require('not-optional-b');
        }
        const cFunc = () => {
          const c = require('not-optional-c');
        }
        fFunc();
        cFunc();

        import('optional-async-d');
      } catch(e) {
        require('not-optional-e');
      } finally {
        require('not-optional-g');
      }
      `);

    const {dependencies} = collectDependencies(ast, opts);
    validateDependencies(dependencies, 8);
  });
  test('nested try-block follows the inner-most scope', () => {
    const ast = astFromCode(`
    try {
      const a = require('optional-a');
      try{
        const b = import('optional-async-b');
      } finally {}
      const c = require('optional-c');
    } catch(e) {}
    `);

    const {dependencies} = collectDependencies(ast, opts);
    validateDependencies(dependencies, 4);
  });

  describe('isESMImport', () => {
    test('distinguishes require calls, static imports and async imports', () => {
      const ast = astFromCode(`
        import anImport from '.';
        const aRequire = require('.');
        const asyncImport = await import('.');
      `);
      const {dependencies} = collectDependencies(ast, opts);
      expect(dependencies).toEqual([
        {
          // Static import
          name: '.',
          data: objectContaining({
            asyncType: null,
            isESMImport: true,
          }),
        },
        {
          // require call
          name: '.',
          data: objectContaining({
            asyncType: null,
            isESMImport: false,
          }),
        },
        {
          // await import call
          name: '.',
          data: objectContaining({
            asyncType: 'async',
            isESMImport: true,
          }),
        },
        objectContaining({
          // asyncRequire helper
          name: 'asyncRequire',
        }),
      ]);
    });
    test('distinguishes ESM imports in single-line files from generated CJS babel runtime helpers', () => {
      const code = `export { default } from './test'`;

      // Transform the code to make sure `@babel/runtime` helpers are added,
      // and import locations are collected
      const {ast, metadata} = transformFromAstSync<MetroBabelFileMetadata>(
        astFromCode(code),
        code,
        {
          ast: true,
          plugins: [
            importLocationsPlugin,
            // $FlowFixMe[cannot-resolve-module] Untyped Babel plugin
            require('@babel/plugin-transform-runtime'),
            // $FlowFixMe[cannot-resolve-module] Untyped Babel plugin in OSS
            require('@babel/plugin-transform-modules-commonjs'),
          ],
        },
      );
      if (!ast) {
        throw new Error(
          `Transformed AST missing, can't test location-based ESM import detection`,
        );
      }

      const importDeclarations = metadata.metro?.unstable_importDeclarationLocs;
      expect(importDeclarations).toBeTruthy();

      // Collect the dependencies of the generated code
      const {dependencies} = collectDependencies(ast, {
        ...opts,
        unstable_isESMImportAtSource: loc =>
          !!importDeclarations?.has(locToKey(loc)),
      });
      expect(dependencies).toEqual([
        {
          // Generated Babel runtime helper
          name: '@babel/runtime/helpers/interopRequireDefault',
          data: objectContaining({
            isESMImport: false,
          }),
        },
        {
          // Original ESM import
          name: './test',
          data: objectContaining({
            isESMImport: true,
          }),
        },
      ]);
    });
  });

  test('can handle single-line statement', () => {
    const ast = astFromCode(
      "try { const a = require('optional-a') } catch (e) {}",
    );
    const {dependencies} = collectDependencies(ast, opts);
    validateDependencies(dependencies, 1);
  });
  test('independent of sibling context', () => {
    const ast = astFromCode(`
      try {
        const x = whatever;
        const a = x ? require('optional-a') : require('optional-b');
      } catch (e) {}
    `);
    const {dependencies} = collectDependencies(ast, opts);
    validateDependencies(dependencies, 2);
  });
  test('ignores require functions defined by lower scopes', () => {
    const ast = astFromCode(`
      const f = (require) => {
        try {
          const c = require('not-dependency');
        } catch (e) {}
      };
    `);
    const {dependencies} = collectDependencies(ast, opts);
    expect(dependencies).toHaveLength(0);
  });
  test('supports using static variables in require statements', () => {
    const ast = astFromCode(`
      const myVar="my";
      try {
        require("foo_" + myVar);
        require(\`bar_\${5 + 2}\`);
      } catch (e) {}
      `);
    const {dependencies} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {
        name: 'foo_my',
        data: objectContaining({asyncType: null, isOptional: true}),
      },
      {
        name: 'bar_7',
        data: objectContaining({asyncType: null, isOptional: true}),
      },
    ]);
  });
  test('can exclude optional dependency', () => {
    const ast = () =>
      astFromCode(`
      const n = 2;
      try {
        const a = require(\`A-\${1 + n}\`);
        const b = require(\`A-\${3 + n}\`);
      } catch (e) {}
    `);
    const {dependencies: deps1} = collectDependencies(ast(), opts);
    expect(deps1).toEqual([
      {name: 'A-3', data: objectContaining({isOptional: true})},
      {name: 'A-5', data: objectContaining({isOptional: true})},
    ]);

    const {dependencies: deps2} = collectDependencies(ast(), {
      ...opts,
      allowOptionalDependencies: false,
    });
    expect(deps2).toEqual([
      {name: 'A-3', data: expect.not.objectContaining({isOptional: true})},
      {name: 'A-5', data: expect.not.objectContaining({isOptional: true})},
    ]);

    const {dependencies: deps3} = collectDependencies(ast(), {
      ...opts,
      allowOptionalDependencies: {exclude: ['A-5']},
    });
    expect(deps3).toEqual([
      {name: 'A-3', data: objectContaining({isOptional: true})},
      {name: 'A-5', data: expect.not.objectContaining({isOptional: true})},
    ]);
  });
  test('collapses optional and non-optional requires of the same module', () => {
    const ast = astFromCode(`
      const nonOptional = require('foo');
      try {
        const optional = require('foo');
      } catch {}
    `);
    const {dependencies} = collectDependencies(ast, opts);
    expect(dependencies).toEqual([
      {name: 'foo', data: expect.not.objectContaining({isOptional: true})},
    ]);
  });

  describe('dynamic import with rejection handler', () => {
    test('import().catch(handler) is optional', () => {
      const ast = astFromCode(`
        import('optional-async-a').catch(() => {});
      `);
      const {dependencies} = collectDependencies(ast, opts);
      validateDependencies(dependencies, 2);
    });

    test('import().then(handler, onReject) is optional', () => {
      const ast = astFromCode(`
        import('optional-async-a').then(() => {}, () => {});
      `);
      const {dependencies} = collectDependencies(ast, opts);
      validateDependencies(dependencies, 2);
    });

    test('import().then(...).then(...).catch(handler) is optional', () => {
      const ast = astFromCode(`
        import('optional-async-a')
          .then(x => x)
          .then(x => x)
          .catch(() => {});
      `);
      const {dependencies} = collectDependencies(ast, opts);
      validateDependencies(dependencies, 2);
    });

    test('await import().catch(handler) is optional', () => {
      const ast = astFromCode(`
        async function f() {
          await import('optional-async-a').catch(() => {});
        }
      `);
      const {dependencies} = collectDependencies(ast, opts);
      validateDependencies(dependencies, 2);
    });

    test('try { await import() } catch {} is optional', () => {
      const ast = astFromCode(`
        async function f() {
          try {
            await import('optional-async-a');
          } catch (e) {}
        }
      `);
      const {dependencies} = collectDependencies(ast, opts);
      validateDependencies(dependencies, 2);
    });

    test('import().then(handler) without onReject is not optional', () => {
      const ast = astFromCode(`
        import('not-optional-async-a').then(() => {});
      `);
      const {dependencies} = collectDependencies(ast, opts);
      validateDependencies(dependencies, 2);
    });

    test('import().catch() with no handler argument is not optional', () => {
      const ast = astFromCode(`
        import('not-optional-async-a').catch();
      `);
      const {dependencies} = collectDependencies(ast, opts);
      validateDependencies(dependencies, 2);
    });

    test('import().then(handler, null) is not optional (null/undefined onReject)', () => {
      const ast = astFromCode(`
        import('not-optional-async-a').then(() => {}, null);
        import('not-optional-async-b').then(() => {}, undefined);
      `);
      const {dependencies} = collectDependencies(ast, opts);
      validateDependencies(dependencies, 3);
    });

    test('import() detached from chain is not optional', () => {
      const ast = astFromCode(`
        const p = import('not-optional-async-a');
        p.catch(() => {});
      `);
      const {dependencies} = collectDependencies(ast, opts);
      validateDependencies(dependencies, 2);
    });
  });
});

test('uses the dependency transformer specified in the options to transform the dependency calls', () => {
  const ast = astFromCode(`
    const a = require('b/lib/a');
    require(1)
    import b from 'b/lib/b';
    export {Banana} from 'Banana';

    import("some/async/module").then(foo => {});
    __prefetchImport("some/async/module");
  `);

  const {ast: transformedAst} = collectDependencies(ast, {
    ...opts,
    dynamicRequires: 'throwAtRuntime',
    dependencyTransformer: MockDependencyTransformer,
  });

  expect(codeFromAst(transformedAst)).toEqual(
    comparableCode(`
      const a = require(_dependencyMap[0], "b/lib/a");
      requireIllegalDynamicRequire();
      import b from 'b/lib/b';
      export { Banana } from 'Banana';
      require("asyncRequire").async(_dependencyMap[3], "some/async/module").then(foo => {});
      require("asyncRequire").prefetch(_dependencyMap[4], "some/async/module");
      `),
  );
});

test('collects require.resolveWeak calls', () => {
  const ast = astFromCode(`
    require.resolveWeak("some/async/module");
  `);
  const {dependencies, dependencyMapName} = collectDependencies(ast, opts);
  expect(dependencies).toEqual([
    {name: 'some/async/module', data: objectContaining({asyncType: 'weak'})},
  ]);
  expect(codeFromAst(ast)).toEqual(
    comparableCode(`
      ${dependencyMapName}[0];
    `),
  );
});

function formatDependencyLocs(
  dependencies: ReadonlyArray<Dependency>,
  code: any,
) {
  return (
    '\n' +
    dependencies
      .map((dep, depIndex) =>
        dep.data.locs.length
          ? dep.data.locs
              .map(loc => formatLoc(loc, depIndex, dep, code))
              .join('\n')
          : `dep #${depIndex} (${dep.name}): no location recorded`,
      )
      .join('\n')
  );
}

function adjustPosForCodeFrame(pos: {
  readonly column: number,
  readonly line: number,
}) {
  return pos ? {...pos, column: pos.column + 1} : pos;
}

function adjustLocForCodeFrame(loc: BabelSourceLocation) {
  return {
    start: adjustPosForCodeFrame(loc.start),
    end: adjustPosForCodeFrame(loc.end),
  };
}

function formatLoc(
  loc: BabelSourceLocation,
  depIndex: number,
  dep: Dependency,
  code: any,
) {
  return codeFrameColumns(code, adjustLocForCodeFrame(loc), {
    message: `dep #${depIndex} (${dep.name})`,
    linesAbove: 0,
    linesBelow: 0,
  });
}

function astFromCode(code: string): BabelNodeFile {
  return babylon.parse(code, {
    plugins: ['dynamicImport', 'flow'],
    sourceType: 'module',
  });
}

// Mock transformer for dependencies. Uses a "readable" format
// require() -> require(id, module name)
// import() -> require(async moudle name).async(id, module name)
// prefetch -> require(async moudle name).prefetch(id, module name)
const MockDependencyTransformer: DependencyTransformer = {
  transformSyncRequire(
    path: NodePath<>,
    dependency: InternalDependency,
    state: State,
  ): void {
    path.replaceWith(
      t.callExpression(t.identifier('require'), [
        createModuleIDExpression(dependency, state),
        t.stringLiteral(dependency.name),
      ]),
    );
  },

  transformImportCall(
    path: NodePath<>,
    dependency: InternalDependency,
    state: State,
  ): void {
    transformAsyncRequire(path, dependency, state, 'async');
  },

  transformImportMaybeSyncCall(
    path: NodePath<>,
    dependency: InternalDependency,
    state: State,
  ): void {
    transformAsyncRequire(path, dependency, state, 'unstable_importMaybeSync');
  },

  transformPrefetch(
    path: NodePath<>,
    dependency: InternalDependency,
    state: State,
  ): void {
    transformAsyncRequire(path, dependency, state, 'prefetch');
  },

  transformIllegalDynamicRequire(path: NodePath<>, state: State): void {
    path.replaceWith(
      t.callExpression(t.identifier('requireIllegalDynamicRequire'), []),
    );
  },
};

function createModuleIDExpression(
  dependency: InternalDependency,
  state: State,
) {
  return t.memberExpression(
    nullthrows(state.dependencyMapIdentifier),
    t.numericLiteral(dependency.index),
    true,
  );
}

function transformAsyncRequire(
  path: NodePath<>,
  dependency: InternalDependency,
  state: State,
  methodName: string,
): void {
  const moduleID = createModuleIDExpression(dependency, state);

  const asyncRequireCall = t.callExpression(t.identifier('require'), [
    nullthrows(state.asyncRequireModulePathStringLiteral),
  ]);

  path.replaceWith(
    t.callExpression(
      t.memberExpression(asyncRequireCall, t.identifier(methodName)),
      [moduleID, t.stringLiteral(dependency.name)],
    ),
  );

  // Don't transform e.g. the require('asyncRequire') calls. Requiring the transformation of the
  // `require(asyncrRequireModule) is an implementation detail of the requires transformer and should
  // be tested with the concrete implementations.
  path.skip();
}
