/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 * @oncall react_native
 */

import type {Options} from '../normalizePseudoGlobals';

import normalizePseudoglobals from '../normalizePseudoGlobals';

const {transformFromAstSync, transformSync} = require('@babel/core');
const nullthrows = require('nullthrows');

function normalizePseudoglobalsCall(source: string, options?: Options) {
  const ast = nullthrows(
    transformSync(source, {
      ast: true,
      babelrc: false,
      browserslistConfigFile: false,
      code: false,
      compact: false,
      configFile: false,
      sourceType: 'module',
    }).ast,
  );

  const reserved = normalizePseudoglobals(ast, options);

  const {code} = transformFromAstSync(ast, source, {
    ast: false,
    babelrc: false,
    browserslistConfigFile: false,
    code: true,
    compact: false,
    configFile: false,
    sourceType: 'module',
  });

  return {code, reserved};
}

test('minimizes arguments given', () => {
  const result = normalizePseudoglobalsCall(`
    __d(function (global, _$$_REQUIRE, module, exports, _dependencyMap) {
      _$$_REQUIRE(27).foo();

      (function() {
        {
          const r = 1; // _$$_REQUIRE will be renamed to "_r".
          return r++;
        }
      })();

      (function() {
        var global = 'potato';
        return global + 'tomato';
      })();
    })
  `);

  expect(result.reserved).toEqual(['g', '_r', 'm', 'e', 'd']);
  expect(result.code).toMatchInlineSnapshot(`
    "__d(function (g, _r, m, e, d) {
      _r(27).foo();
      (function () {
        {
          const r = 1; // _$$_REQUIRE will be renamed to \\"_r\\".
          return r++;
        }
      })();
      (function () {
        var global = 'potato';
        return global + 'tomato';
      })();
    });"
  `);
});

test('throws if two variables collapse to the same name', () => {
  expect(() =>
    normalizePseudoglobalsCall('__d(function (global, golf) {})'),
  ).toThrow(ReferenceError);
});

test('avoids renaming parameters appearing in reservedNames', () => {
  const result = normalizePseudoglobalsCall(
    `
      __d(function (renameMe, doNotRenameMe) {
        renameMe();
        doNotRenameMe();
      })
    `,
    {reservedNames: ['doNotRenameMe']},
  );

  expect(result.reserved).toMatchInlineSnapshot(`
    Array [
      "r",
    ]
  `);
  expect(result.code).toMatchInlineSnapshot(`
    "__d(function (r, doNotRenameMe) {
      r();
      doNotRenameMe();
    });"
  `);
});

test('throws if a reserved name collides with a short name', () => {
  expect(() =>
    normalizePseudoglobalsCall(
      `
        __d(function (require, r) {
          require();
          r();
        })
      `,
      {reservedNames: ['r']},
    ),
  ).toThrowErrorMatchingInlineSnapshot(
    `"Could not reserve the identifier r because it is the short name for require"`,
  );
});
