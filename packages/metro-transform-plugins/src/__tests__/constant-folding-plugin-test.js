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

const {compare} = require('../__mocks__/test-helpers');
const constantFoldingPlugin = require('../constant-folding-plugin');
const nullishCoalescingOperatorPlugin =
  // $FlowFixMe[untyped-import] @babel/plugin-syntax-nullish-coalescing-operator (in OSS only)
  require('@babel/plugin-syntax-nullish-coalescing-operator').default;

describe('constant expressions', () => {
  test('can optimize conditional expressions with constant conditions', () => {
    const code = `
      a(
        'production' == "production",
        'production' !== 'development',
        false && 1 || 0 || 2,
        true || 3,
        'android' === 'ios' ? null : {},
        'android' === 'android' ? {a: 1} : {a: 0},
        'foo' === 'bar' ? b : c,
        f() ? g() : h(),
      );
    `;

    const expected = `
      a(true, true, 2, true, {}, {a: 1}, c, f() ? g() : h());
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  test('can optimize ternary expressions with constant conditions', () => {
    const code = `
       var a = true ? 1 : 2;
       var b = 'android' == 'android'
         ? ('production' != 'production' ? 'a' : 'A')
         : 'i';
    `;

    const expected = `
      var a = 1;
      var b = 'A';
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  test('can optimize logical operator expressions with constant conditions', () => {
    const code = `
      var a = true || 1;
      var b = 'android' == 'android' &&
        'production' != 'production' || null || "A";
    `;

    const expected = `
      var a = true;
      var b = "A";
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  test('can optimize logical operators with partly constant operands', () => {
    const code = `
      var a = "truthy" || z();
      var b = "truthy" && z();
      var c = null && z();
      var d = null || z();
      var e = !1 && z();
      var f = z() && undefined || undefined;
    `;

    const expected = `
      var a = "truthy";
      var b = z();
      var c = null;
      var d = z();
      var e = false;
      var f = z() && undefined || undefined;
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  test('folds null coalescing operator', () => {
    const code = `
      var a = undefined ?? u();
      var b = null ?? v();
      var c = false ?? w();
      var d = 0 ?? x();
      var e = NaN ?? x();
      var f = "truthy" ?? z();
    `;

    const expected = `
      var a = u();
      var b = v();
      var c = false;
      var d = 0;
      var e = NaN;
      var f = "truthy";
    `;

    compare(
      [constantFoldingPlugin, nullishCoalescingOperatorPlugin],
      code,
      expected,
    );
  });

  test('can remode an if statement with a falsy constant test', () => {
    const code = `
      if ('production' === 'development' || false) {
        var a = 1;
      }
    `;

    compare([constantFoldingPlugin], code, '');
  });

  test('does not fold non-literal void expressions', () => {
    const code = `
      void obj.prop;
    `;

    compare([constantFoldingPlugin], code, code);
  });

  test('folds literal void expressions', () => {
    const code = `
      if (void 0) {
        foo();
      }
    `;

    compare([constantFoldingPlugin], code, '');
  });

  test('can optimize if-else-branches with constant conditions', () => {
    const code = `
      if ('production' == 'development') {
        var a = 1;
        var b = a + 2;
      } else if ('development' == 'development') {
        var a = 3;
        var b = a + 4;
      } else {
        var a = 'b';
      }
    `;

    const expected = `
      {
        var a = 3;
        var b = 7;
      }
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  test('can optimize nested if-else constructs', () => {
    const code = `
      if ('ios' === "android") {
        if (true) {
          require('a');
        } else {
          require('b');
        }
      } else if ('android' === 'android') {
        if (true) {
          require('c');
        } else {
          require('d');
        }
      }
    `;

    const expected = `
      {
        {
          require('c');
        }
      }
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  test('folds if expressions with variables', () => {
    const code = `
      var x = 3;

      if (x - 3) {
        require('a');
      }
    `;

    const expected = `
      var x = 3;
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  test('folds logical expressions with variables', () => {
    const code = `
      var x = 3;
      var y = (x - 3) || 4;
      var z = (y - 4) && 4;
    `;

    const expected = `
      var x = 3;
      var y = 4;
      var z = 0;
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  test('wipes unused functions', () => {
    const code = `
      var xUnused = function () {
        console.log(100);
      };

      var yUnused = () => {
        console.log(200);
      };

      function zUnused() {
        console.log(300);
      }

      var xUsed = () => {
        console.log(400);
      };

      var yUsed = function () {
        console.log(500);
      };

      function zUsed() {
        console.log(600);
      }

      (() => {
        console.log(700);
      })();

      xUsed();
      yUsed();
      zUsed();
    `;

    const expected = `
      var xUsed = () => {
        console.log(400);
      };

      var yUsed = function() {
        console.log(500);
      };

      function zUsed() {
        console.log(600);
      }

      (() => {
        console.log(700);
      })();

      xUsed();
      yUsed();
      zUsed();
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  test('recursively strips off functions', () => {
    const code = `
      function x() {}

      if (false) {
        x();
      }
    `;

    compare([constantFoldingPlugin], code, '');
  });

  test('verifies that mixes of variables and functions properly minifies', () => {
    const code = `
      var x = 2;
      var y = () => x - 2;

      if (x) {
        z();
      }
    `;

    const expected = `
      var x = 2;

      {
        z();
      }
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  test('does not mess up with negative numbers', () => {
    const code = `
      var plusZero = +0;
      var zero = 0;
      var minusZero = -0;
      var plusOne = +1;
      var one = 1;
      var minusOne = -1;
    `;

    const expected = `
      var plusZero = 0;
      var zero = 0;
      var minusZero = -0;
      var plusOne = 1;
      var one = 1;
      var minusOne =- 1;
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  test('does not mess up default exports', () => {
    const nonChanged = [
      'export default function () {}',
      'export default () => {}',
      'export default class {}',
      'export default 1',
    ];

    nonChanged.forEach((test: string) =>
      compare([constantFoldingPlugin], test, test),
    );
  });

  test('will not throw on evaluate exception', () => {
    const nonChanged = `
      Object({ 'toString': 0 } + '');
    `;

    compare([constantFoldingPlugin], nonChanged, nonChanged);
  });

  test('does not confuse function identifiers with variables in inner scope', () => {
    const code = `
      export function foo() {
        let foo;
      }
    `;

    const expected = `
      export function foo() {
        let foo;
      }
    `;

    compare([constantFoldingPlugin], code, expected);
  });

  test('does not transform optional chained call into `undefined`', () => {
    const code = `foo?.();`;

    const expected = `foo?.();`;

    compare([constantFoldingPlugin], code, expected);
  });

  test('does not transform `void` prefixed optional chained call into `undefined`', () => {
    const code = `void foo?.();`;

    const expected = `void foo?.();`;

    compare([constantFoldingPlugin], code, expected);
  });

  test('does not fold arithmetic on destructured object bindings', () => {
    const code = `
      const O = {e: 80};
      export function f() {
        const {e} = O;
        return e + 1;
      }
    `;

    compare([constantFoldingPlugin], code, code);
  });

  test('does not fold to non-finite numbers from destructured bindings', () => {
    const code = `
      const SHAPE = {lo: 80, hi: 85, scale: 2.8};
      export function f() {
        const {lo, hi, scale} = SHAPE;
        return (hi - lo) * scale;
      }
    `;

    compare([constantFoldingPlugin], code, code);
  });

  test('does not fold conditionals on destructured object bindings', () => {
    const code = `
      const O = {flag: false};
      export function f() {
        const {flag} = O;
        return flag ? 1 : 2;
      }
    `;

    compare([constantFoldingPlugin], code, code);
  });

  test('does not fold logical expressions on destructured object bindings', () => {
    const code = `
      const O = {flag: false};
      export function f() {
        const {flag} = O;
        return flag || 3;
      }
    `;

    compare([constantFoldingPlugin], code, code);
  });
});
