/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

'use strict';

import type {PluginOptions, State} from '../inline-requires-plugin';
import type {Plugins} from '@babel/core';
import type {Node as BabelNode} from '@babel/types';
import type {PluginTesterOptions} from 'babel-plugin-tester';

import importExportPlugin from '../import-export-plugin';
import inlineRequiresPlugin from '../inline-requires-plugin';
import validateOutputAst from './validateOutputAst';
import * as babel from '@babel/core';
import pluginTester from 'babel-plugin-tester';
import vm from 'node:vm';
import nullthrows from 'nullthrows';

type TestCases = PluginTesterOptions<PluginOptions, State>['tests'];

const TEST_CASES: TestCases = {
  'inlines single usage': {
    code: ['var foo = require("foo");', 'foo.bar()'].join('\n'),
    snapshot: true,
  },

  'inlines multiple usages': {
    code: ['var foo = require("foo");', 'foo.bar()', 'foo.baz()'].join('\n'),
    snapshot: true,
  },

  'inlines any number of variable declarations': {
    code: [
      'var foo = require("foo"), bar = require("bar"), baz = 4;',
      'foo.method()',
    ].join('\n'),
    snapshot: true,
  },

  'ignores requires that are not assigned': {
    code: ['require("foo");'].join('\n'),
    snapshot: false,
  },

  'delete unused requires': {
    code: ['var foo = require("foo");'].join('\n'),
    snapshot: true,
  },

  'ignores requires that are re-assigned': {
    code: ['var foo = require("foo");', 'foo = "bar";'].join('\n'),
    snapshot: false,
  },

  'ensures that the inlined require still points to the global require function':
    {
      code: `
          const foo = require('foo');

          function test() {
            function require(condition) {
              if (!condition) {
                throw new Error('Condition is falsy');
              }
            }

            require(foo.isOnline());
          }
        `,
      snapshot: true,
    },

  'ensures that the inlined require still points to the global require function with inlineableCalls options':
    {
      code: `
          const foo = customStuff('foo');

          function test() {
            function customStuff(condition) {
              if (!condition) {
                throw new Error('Condition is falsy');
              }
            }

            customStuff(foo.isOnline());
          }
        `,
      snapshot: true,
    },

  'ensures that the inlined require still points to the global require function even if local require is not called':
    {
      code: `
          const foo = require('foo');

          function test() {
            function require(condition) {
              if (!condition) {
                throw new Error('Condition is falsy');
              }
            }

            foo.isOnline();
          }
        `,
      snapshot: true,
    },

  'does not transform require calls if require is redeclared in the same declaration scope':
    {
      code: `
          function require(condition) {
            if (!condition) {
              throw new Error('Condition is falsy');
            }
          }
          const foo = require('foo');
          console.log(foo.test);
        `,
      snapshot: false,
    },

  'does not transform require calls if require is redeclared in the global scope':
    {
      code: `
          function require(condition) {
            if (!condition) {
              throw new Error('Condition is falsy');
            }
          }
          function test() {
            const foo = require('foo');
            console.log(foo.test);
          }
        `,
      snapshot: false,
    },

  'does not transform require calls that are already inline': {
    code: `
        function test() {
          function require(condition) {
            if (!condition) {
              throw new Error('The condition is false');
            }
          }
          require('test');
        }
      `,
    snapshot: false,
  },

  'inlines requires that are referenced before the require statement': {
    code: [
      'function foo() {',
      '  bar();',
      '}',
      'var bar = require("baz");',
      'foo();',
      'bar();',
    ].join('\n'),
    snapshot: true,
  },

  'inlines require properties': {
    code: [
      'var tmp = require("./a");',
      'var a = tmp.a',
      'var D = {',
      '  b: function(c) { c ? a(c.toString()) : a("No c!"); },',
      '};',
    ].join('\n'),
    snapshot: true,
  },

  'ignores require properties (as identifiers) that are re-assigned': {
    code: [
      'var X = require("X");',
      'var origA = X.a',
      'X.a = function() {',
      '  origA();',
      '};',
    ].join('\n'),
    snapshot: true,
  },

  'ignores require properties (as strings) that are re-assigned': {
    code: [
      'var X = require("X");',
      'var origA = X["a"]',
      'X["a"] = function() {',
      '  origA();',
      '};',
    ].join('\n'),
    snapshot: true,
  },

  'inlines functions provided via `inlineableCalls`': {
    code: [
      'const inlinedCustom = customStuff("foo");',
      'const inlinedRequire = require("bar");',
      '',
      'inlinedCustom();',
      'inlinedRequire();',
    ].join('\n'),
    snapshot: true,
  },

  'ignores requires in `ignoredRequires`': {
    code: ['const CommonFoo = require("CommonFoo");', 'CommonFoo();'].join(
      '\n',
    ),
    snapshot: false,
  },

  'ignores destructured properties of requires in `ignoredRequires`': {
    code: [
      'const tmp = require("CommonFoo");',
      'const a = require("CommonFoo").a;',
      'a();',
    ].join('\n'),
    snapshot: false,
  },

  'inlines require.resolve calls': {
    code: ['const a = require(require.resolve("Foo")).bar;', '', 'a();'].join(
      '\n',
    ),
    snapshot: true,
  },

  'inlines with multiple arguments': {
    code: ['const a = require("Foo", "Bar", 47);', '', 'a();'].join('\n'),
    snapshot: true,
  },

  'inlines destructured requires': {
    code: [
      'const {a, b: c, "d-e": de} = require("foo");',
      'a();',
      'c.x();',
      'de();',
    ].join('\n'),
    snapshot: true,
  },

  'inlines destructured requires referenced across scopes': {
    code: [
      'const {a, b} = require("foo");',
      'function f() {',
      '  return a() + b();',
      '}',
      'function g() {',
      '  if (b()) {',
      '    a();',
      '  }',
      '}',
    ].join('\n'),
    snapshot: true,
  },

  'deletes unused destructured requires': {
    code: ['const {a} = require("foo");'].join('\n'),
    snapshot: true,
  },

  'ignores empty destructured requires': {
    code: ['const {} = require("foo");'].join('\n'),
    snapshot: false,
  },

  'ignores destructured requires with defaults': {
    code: ['const {', '  a = 1', '} = require("foo");', 'a();'].join('\n'),
    snapshot: false,
  },

  'ignores destructured requires with rest elements': {
    code: [
      'const {',
      '  a,',
      '  ...rest',
      '} = require("foo");',
      'a(rest);',
    ].join('\n'),
    snapshot: false,
  },

  'ignores nested destructured requires': {
    code: [
      'const {',
      '  a: {',
      '    b',
      '  }',
      '} = require("foo");',
      'b();',
    ].join('\n'),
    snapshot: false,
  },

  'ignores destructured requires with computed keys': {
    code: ['const {', '  [key]: a', '} = require("foo");', 'a();'].join('\n'),
    snapshot: false,
  },

  'ignores destructured requires that are re-assigned': {
    code: [
      'let {',
      '  a,',
      '  b',
      '} = require("foo");',
      'b = 1;',
      'a(b);',
    ].join('\n'),
    snapshot: false,
  },

  'ignores destructured properties that are re-assigned': {
    code: [
      'var X = require("X");',
      'const {a} = require("X");',
      'X.a = function() {',
      '  a();',
      '};',
    ].join('\n'),
    snapshot: true,
  },

  'ignores requires exported by name': {
    code: ['var foo = require("foo");', 'foo();', 'export { foo };'].join('\n'),
    snapshot: false,
  },

  'ignores destructured requires exported by name': {
    code: [
      'const {',
      '  a',
      '} = require("foo");',
      'a();',
      'export { a };',
    ].join('\n'),
    snapshot: false,
  },

  'ignores destructured requires in `ignoredRequires`': {
    code: ['const {', '  a', '} = require("CommonFoo");', 'a();'].join('\n'),
    snapshot: false,
  },
};

describe.each([true, false])('memoizeCalls=%s:', memoizeCalls => {
  pluginTester<PluginOptions, State>({
    babelOptions: {
      babelrc: false,
      configFile: false,
    },
    plugin: inlineRequiresPlugin,
    pluginOptions: {
      ignoredRequires: ['CommonFoo'],
      inlineableCalls: ['customStuff'],
      memoizeCalls,
    },
    tests: TEST_CASES,
  });
});

describe('inline-requires', () => {
  test.each([[false], [true]])(
    'ignores requires referenced in type annotations (memoizeCalls=%s)',
    memoizeCalls => {
      const source = [
        'const foo = require("foo");',
        'const {a} = require("bar");',
        'type T = typeof foo | typeof a;',
        'foo(a);',
      ].join('\n');
      const transformFlow = (plugins: Plugins) =>
        babel.transformSync(source, {
          babelrc: false,
          configFile: false,
          parserOpts: {plugins: ['flow']},
          plugins,
        })?.code;
      expect(transformFlow([[inlineRequiresPlugin, {memoizeCalls}]])).toBe(
        transformFlow([]),
      );
    },
  );

  test.each([[false], [true]])(
    'inlines destructured requires exported by the import-export plugin (memoizeCalls=%s)',
    memoizeCalls => {
      // The import-export plugin runs first in the same pass and inserts
      // `exports.a = a` after `a()`, with no source location.
      const code = nullthrows(
        babel.transformSync(
          ['const {a} = require("foo");', 'a();', 'export {a};'].join('\n'),
          {
            babelrc: false,
            configFile: false,
            sourceType: 'module',
            plugins: [
              [
                importExportPlugin,
                {
                  importAll: '_$$_IMPORT_ALL',
                  importDefault: '_$$_IMPORT_DEFAULT',
                  resolve: false,
                },
              ],
              [inlineRequiresPlugin, {memoizeCalls}],
            ],
          },
        )?.code,
      );
      expect(code).not.toMatch(/const \{/);
      const foo = {a: jest.fn()};
      const exports: {a?: unknown} = {};
      vm.runInNewContext(code, {require: () => foo, exports});
      expect(foo.a).toHaveBeenCalledTimes(1);
      expect(exports.a).toBe(foo.a);
    },
  );

  const transform = (
    source: ReadonlyArray<string>,
    plugins?: Plugins = [[inlineRequiresPlugin, {}]],
  ) =>
    babel.transformSync(source.join('\n'), {
      ast: true,
      compact: true,
      plugins,
    });

  const compare = (
    input: ReadonlyArray<string>,
    output: ReadonlyArray<string>,
    plugins?: Plugins = [[inlineRequiresPlugin, {}]],
  ) => {
    expect(transform(input, plugins).code).toBe(
      transform(output, plugins).code,
    );
  };

  test('should be compatible with other transforms like transform-modules-commonjs', function () {
    compare(
      ['import Imported from "foo";', 'console.log(Imported);'],
      [
        'var _foo = _interopRequireDefault(require("foo"));',
        'function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }',
        'console.log(_foo.default);',
      ],
      [
        // $FlowFixMe[untyped-import] @babel/plugin-transform-modules-commonjs
        [require('@babel/plugin-transform-modules-commonjs'), {strict: false}],
        [inlineRequiresPlugin, {}],
      ],
    );
  });

  test('should be compatible with `transform-modules-commonjs` when using named imports', function () {
    compare(
      [
        'import {a} from "./a";',
        'var D = {',
        '  b: function(c) { c ? a(c.toString()) : a("No c!"); },',
        '};',
      ],
      [
        'var D = {',
        '  b: function (c) {',
        '    c ? (0, require("./a").a)(c.toString()) : (0, require("./a").a)("No c!");',
        '  }',
        '};',
      ],
      [
        // $FlowFixMe[untyped-import] @babel/plugin-transform-modules-commonjs
        [require('@babel/plugin-transform-modules-commonjs'), {strict: false}],
        [inlineRequiresPlugin, {}],
      ],
    );
  });

  test('should remove loc information from nodes', function () {
    const ast = transform(['var x = require("x"); x']).ast;
    expect(ast).not.toBeNull();
    const expression = nullthrows(ast).program.body[0].expression;

    function expectNodeWithNoLocation(maybeNode: ?BabelNode) {
      expect(maybeNode).not.toBeNull();
      const node = nullthrows(maybeNode);
      expect(node.start).toBeUndefined();
      expect(node.end).toBeUndefined();
      expect(node.loc).toBeUndefined();
    }

    expectNodeWithNoLocation(expression);
    expectNodeWithNoLocation(nullthrows(expression?.arguments)[0]);
  });

  test('should not emit duplicate nodes', function () {
    const ast = transform([
      'var foo = require("foo");',
      'foo.bar()',
      'foo.baz()',
    ]).ast;
    validateOutputAst(nullthrows(ast));
  });

  test('respects nonMemoizedModules', function () {
    expect(
      transform(
        [
          'const foo = require("foo");',
          'const noMemo = require("noMemo");',
          'module.exports = function() {',
          '  foo();',
          '  noMemo();',
          '};',
        ],
        [
          [
            inlineRequiresPlugin,
            {
              memoizeCalls: true,
              nonMemoizedModules: ['noMemo'],
            },
          ],
        ],
      ).code.replace('"use strict";', ''),
    ).toEqual(
      [
        'var foo;',
        'module.exports=function(){',
        '(foo||(foo=require("foo")))();',
        'require("noMemo")();',
        '};',
      ].join(''),
    );
  });
});
