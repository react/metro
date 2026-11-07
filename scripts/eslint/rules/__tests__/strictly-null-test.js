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

const rule = require('../strictly-null.js');
const ESLintTester = require('eslint').RuleTester;

ESLintTester.setDefaultConfig({
  parser: require.resolve('flow-eslint'),
  parserOptions: {
    ecmaVersion: 6,
    sourceType: 'module',
  },
});

const eslintTester = new ESLintTester();

function strictCase(code: string, output: string) {
  expect(typeof rule.meta.messages.WEAK_NULL).toBe('string');
  return {
    code,
    errors: [{messageId: 'WEAK_NULL'}],
    output,
  };
}

function weakCase(code: string, output: string) {
  expect(typeof rule.meta.messages.CHECK_NULL).toBe('string');
  return {
    code,
    errors: [{messageId: 'CHECK_NULL'}],
    output,
  };
}

eslintTester.run('../strictly-null', rule, {
  valid: ['a == null', 'null == a', 'a != null', 'null != a'],
  invalid: [
    strictCase('a === undefined', 'a == null'),
    strictCase('a === null', 'a == null'),
    strictCase('a === void 0', 'a == null'),
    strictCase('undefined === a', 'null == a'),
    strictCase('null === a', 'null == a'),
    strictCase('void 0 === a', 'null == a'),

    strictCase('a !== undefined', 'a != null'),
    strictCase('a !== null', 'a != null'),
    strictCase('a !== void 0', 'a != null'),
    strictCase('undefined !== a', 'null != a'),
    strictCase('null !== a', 'null != a'),
    strictCase('void 0 !== a', 'null != a'),

    weakCase('a == undefined', 'a == null'),
    weakCase('a == void 0', 'a == null'),
    weakCase('undefined == a', 'null == a'),
    weakCase('void 0 == a', 'null == a'),

    weakCase('a != undefined', 'a != null'),
    weakCase('a != void 0', 'a != null'),
    weakCase('undefined != a', 'null != a'),
    weakCase('void 0 != a', 'null != a'),

    // This must not change to `a || b == null` since that's NOT the same
    strictCase('a || b === undefined', 'a || b == null'),
    strictCase('(a || b) === undefined', '(a || b) == null'),
    // Keep complex nodes in tact
    strictCase('(a?.b?.c || d?.e) === undefined', '(a?.b?.c || d?.e) == null'),
  ],
});
