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

import {
  canDefineESModuleInterop,
  definesESModuleInterop,
} from '../esmClassification';
import {parse} from '@babel/parser';

const ast = (code: string) => parse(code, {sourceType: 'script'});

const defines = (code: string) => definesESModuleInterop(ast(code));
const canDefine = (code: string) => canDefineESModuleInterop(ast(code));

describe('definesESModuleInterop', () => {
  test.each([
    ["Object.defineProperty(exports, '__esModule', {value: true});", 'babel'],
    ['Object.defineProperty(exports, "__esModule", {value: !0});', 'minified'],
    [
      "Object.defineProperty(module.exports, '__esModule', {value: 1});",
      'handwritten wrapper',
    ],
    ['exports.__esModule = true;', 'loose'],
    [
      'module.exports = f, module.exports.__esModule = true, module.exports["default"] = module.exports;',
      '@babel/runtime helper',
    ],
  ])('detects the marker: %s (%s)', code => {
    expect(defines(code)).toBe(true);
  });

  test('does not fire on an unrelated export', () => {
    expect(defines('exports.foo = 1;')).toBe(false);
  });

  test('does not fire on a marker nested inside a function', () => {
    // Not top-level, so out of scope for this check - which is precisely the
    // gap `canDefineESModuleInterop` exists to close.
    expect(
      defines('function r(e) {Object.defineProperty(e, "__esModule", {});}'),
    ).toBe(false);
  });
});

describe('canDefineESModuleInterop', () => {
  describe('rules a module out', () => {
    test('the generated Relay artifact shape', () => {
      // Shape emitted by relay-compiler for a fragment, after the Flow types
      // (which are comments) are stripped: a single module-scope binding
      // initialised from an IIFE returning an object literal, one static
      // property write, and a whole-object export.
      expect(
        canDefine(`
          'use strict';
          var node = (function(){
            var v0 = {"kind": "Literal", "name": "id", "value": 42};
            return {
              "argumentDefinitions": [v0],
              "kind": "Fragment",
              "metadata": null,
              "name": "SomeFragment",
              "selections": [v0],
              "type": "SomeType",
              "abstractKey": "__isSomeType"
            };
          })();
          if (__DEV__) {
            node.hash = "4e3995aa3aa0eb9886c4cfa56381b521";
          }
          module.exports = node;
        `),
      ).toBe(false);
    });

    test('a module with only static named exports', () => {
      expect(canDefine('exports.a = 1; exports.b = "two";')).toBe(false);
    });

    test('a module exporting an object literal directly', () => {
      expect(canDefine('module.exports = {a: 1, b: 2};')).toBe(false);
    });

    test('an empty module', () => {
      expect(canDefine("'use strict';")).toBe(false);
    });

    test('static writes via module.exports.<name>', () => {
      expect(canDefine('module.exports.a = 1;')).toBe(false);
    });
  });

  describe('bails out', () => {
    test('when the marker is present at the top level', () => {
      expect(canDefine('exports.__esModule = true;')).toBe(true);
    });

    test('when the token appears anywhere at all, however nested', () => {
      expect(
        canDefine(
          'function r(e) {Object.defineProperty(e, "__esModule", {value: 1});}',
        ),
      ).toBe(true);
    });

    test('when the token appears only as an object key', () => {
      expect(
        canDefine('module.exports = {__esModule: true, default: 1};'),
      ).toBe(true);
    });

    test('on the webpack UMD bundle shape', () => {
      // The marker is installed by a helper on a dynamically passed object and
      // the exported value is opaque - invisible to a top-level scan, and
      // reachable with zero dependencies. This is the real-world case that
      // motivates the check (e.g. vendored `*.min.js` bundles).
      expect(
        canDefine(`
          !function(e, t) {
            "object" == typeof exports && "object" == typeof module
              ? module.exports = t()
              : e.math = t();
          }(this, function() {
            function i(e) { var t = {exports: {}}; return t.exports; }
            i.r = function(e) {
              Object.defineProperty(e, "__esModule", {value: !0});
            };
            return i(0);
          });
        `),
      ).toBe(true);
    });

    test('when exports is passed to a function', () => {
      expect(canDefine('makeItESM(exports);')).toBe(true);
    });

    test('when exports is aliased to a local', () => {
      expect(canDefine('var e = exports; e.foo = 1;')).toBe(true);
    });

    test('when a property is written under a computed key', () => {
      expect(canDefine("exports['__' + 'esModule'] = true;")).toBe(true);
    });

    test('when an object literal uses a computed key', () => {
      expect(canDefine("module.exports = {['__' + 'esModule']: true};")).toBe(
        true,
      );
    });

    test('when the exported object spreads another value', () => {
      expect(canDefine('module.exports = {...someOtherModule};')).toBe(true);
    });

    test('on Object.assign into exports', () => {
      expect(canDefine('Object.assign(exports, someOtherModule);')).toBe(true);
    });

    test('on Object.defineProperties', () => {
      expect(canDefine('Object.defineProperties(exports, descriptors);')).toBe(
        true,
      );
    });

    test('when module is read for something other than exports', () => {
      expect(canDefine('module.hot.accept();')).toBe(true);
    });

    test('when the exports object is returned from the module scope', () => {
      expect(canDefine('someRegistry.register(module.exports);')).toBe(true);
    });
  });
});
