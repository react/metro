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
const inlinePlugin = require('../inline-plugin');
// $FlowFixMe[untyped-import] @babel/plugin-transform-flow-strip-types (in OSS only)
const stripFlow = require('@babel/plugin-transform-flow-strip-types');

describe('inline constants', () => {
  describe('__DEV__', () => {
    test('replaces __DEV__ in the code', () => {
      const code = `
        function a() {
          var a = __DEV__ ? 1 : 2;
          var b = a.__DEV__;
          var c = function __DEV__(__DEV__) {};
        }
      `;

      compare([inlinePlugin], code, code.replace(/__DEV__/, 'false'), {
        dev: false,
      });
    });

    test("doesn't replace a local __DEV__ variable", () => {
      const code = `
        function a() {
          var __DEV__ = false;
          var a = __DEV__ ? 1 : 2;
        }
      `;

      compare([inlinePlugin], code, code, {dev: false});
    });

    test("doesn't replace __DEV__ in an object property key", () => {
      const code = `
        const x = { __DEV__: __DEV__ };
      `;

      const expected = `
        const x = { __DEV__: false };
      `;

      compare([inlinePlugin], code, expected, {dev: false});
    });

    test("doesn't replace __DEV__ in an object shorthand method name", () => {
      const code = `
        const x = {
          __DEV__() { return __DEV__; },
        };
      `;

      const expected = `
        const x = {
          __DEV__() { return false; },
        };
      `;

      compare([inlinePlugin], code, expected, {dev: false});
    });

    test("doesn't replace __DEV__ as a label of a block statement", () => {
      const code = `
        __DEV__: {
          break __DEV__;
        };
      `;

      compare([inlinePlugin], code, code, {dev: false});
    });

    test("doesn't replace __DEV__ as the name of a function declaration or call", () => {
      const code = `
        function __DEV__() { return false; }
        const isDev = __DEV__();
      `;

      compare([inlinePlugin], code, code, {dev: false});
    });

    test("doesn't replace __DEV__ as the name of a class method", () => {
      const code = `
        class Test {
          __DEV__() {}
        }
      `;

      compare([inlinePlugin], code, code, {dev: false});
    });

    test("doesn't replace __DEV__ as the name of an export alias", () => {
      const code = `
        const dev = true;
        export { dev as __DEV__ };
      `;

      compare([inlinePlugin], code, code, {dev: false});
    });

    test("doesn't replace __DEV__ as the name of an optional property access", () => {
      const code = `
        x?.__DEV__;
        x?.__DEV__();
      `;

      compare([inlinePlugin], code, code, {dev: false});
    });
  });

  test('replaces process.env.NODE_ENV in the code', () => {
    const code = `
      function a() {
        if (process.env.NODE_ENV === 'production') {
          return require('Prod');
        }

        return require('Dev');
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/process\.env\.NODE_ENV/, '"production"'),
      {dev: false},
    );
  });

  test("doesn't replace process.env.NODE_ENV in the code if NODE_ENV is the right hand side of an assignment expression", () => {
    const code = `
      function a() {
        process.env.NODE_ENV = 'production';
      }
    `;

    compare([inlinePlugin], code, code, {dev: false});
  });

  test('replaces process.env.NODE_ENV in the code if NODE_ENV is the right hand side of an assignment expression', () => {
    const code = `
      function a() {
        var env;
        env = process.env.NODE_ENV;
      }
    `;

    compare(
      [inlinePlugin],
      code,
      code.replace(/process\.env\.NODE_ENV/, '"production"'),
      {dev: false},
    );
  });

  test("doesn't replace process.env.NODE_ENV in other write targets", () => {
    const code = `
      process.env.NODE_ENV++;
      delete process.env.NODE_ENV;
      [process.env.NODE_ENV] = values;
      ({env: process.env.NODE_ENV} = value);
      for (process.env.NODE_ENV in object) {}
      for ([process.env.NODE_ENV] in nestedObject) {}
      for (process.env.NODE_ENV of values) {}
      for ([process.env.NODE_ENV] of nestedValues) {}
    `;

    compare([inlinePlugin], code, code, {dev: false});
  });

  test('replaces process.env.NODE_ENV when it is read inside a write target', () => {
    const code = `
      target[process.env.NODE_ENV] = value;
      [target[process.env.NODE_ENV]] = values;
      ({[process.env.NODE_ENV]: target} = value);
    `;

    compare(
      [inlinePlugin],
      code,
      code.replaceAll('process.env.NODE_ENV', '"production"'),
      {dev: false},
    );
  });

  test("doesn't replace process.env.NODE_ENV in development", () => {
    const code = `
      var a = process.env.NODE_ENV;
    `;

    compare([inlinePlugin], code, code, {dev: true});
  });

  test("doesn't replace Platform.OS or Platform.select", () => {
    const code = `
      var Platform = require('react-native').Platform;
      var a = Platform.OS;
      var b = Platform.select({ios: 1, android: 2});
      var c = require('react-native').Platform.OS;
    `;

    compare([inlinePlugin], code, code, {dev: false});
  });

  test('works with flow-declared variables', () => {
    const code = `
      declare var __DEV__;

      const a: boolean = __DEV__;
    `;

    const expected = `
      const a = false;
    `;

    compare([stripFlow, inlinePlugin], code, expected, {dev: false});
  });

  test('works with flow-declared variables in wrapped modules', () => {
    const code = `
      __d(() => {
        declare var __DEV__;

        const a: boolean = __DEV__;
      });
    `;

    const expected = `
      __d(() => {
        const a = false;
      });
    `;

    compare([stripFlow, inlinePlugin], code, expected, {dev: false});
  });
});
