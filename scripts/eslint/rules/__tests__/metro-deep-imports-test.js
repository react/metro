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

const rule = require('../metro-deep-imports.js');
const ESLintTester = require('eslint').RuleTester;

ESLintTester.setDefaultConfig({
  parser: require.resolve('flow-eslint'),
  parserOptions: {
    ecmaVersion: 6,
    sourceType: 'module',
  },
});

const eslintTester = new ESLintTester();

eslintTester.run('../metro-deep-imports', rule, {
  valid: [
    'require("metro")',
    'const Foo = require("metro-subpkg")',
    'require("metro/private/Bar")',
    'import Baz from "metro-baz/private/Baz"',
    'import NotMetro from "foo/src/bar"',

    // metro-runtime allows subpath imports. We can't rely on package#exports
    // redirections as they may be disabled under Metro, and we must be able
    // to import single modules as polyfills are side-effectful.
    'import Polyfill from "metro-runtime/src/polyfills/foo"',
    'const Polyfill = require("metro-runtime/src/polyfills/foo")',
  ],
  invalid: [
    {
      code: 'const myLib = require("metro/src/lib")',
      output: "const myLib = require('metro/private/lib')",
    },
    {
      code: "import MetroInternal from 'metro-pkg/src/internal'",
      output: "import MetroInternal from 'metro-pkg/private/internal'",
    },
    {
      code: "import type {Bar} from 'metro-types/src/bar'",
      output: "import type {Bar} from 'metro-types/private/bar'",
    },
  ].map(obj => ({...obj, errors: [{messageId: 'METRO_DEEP_IMPORT'}]})),
});
