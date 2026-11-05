/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

const path = require('node:path');

require('eslint-plugin-lint').load(path.join(__dirname, 'rules'));

/**
 * ESLint config for TypeScript definition files (.d.ts).
 *
 * @type {import('eslint').Linter.Config}
 */
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  plugins: ['@typescript-eslint'],
  parser: '@typescript-eslint/parser',
  rules: {
    // These files are generated from Flow sources, which Flow itself checks -
    // an `any` here reflects one in the Flow source, or a construct the
    // translator can't express.
    '@typescript-eslint/no-explicit-any': 'off',
    // Noise in generated definitions: a declaration a CommonJS module exports
    // via `typeof` is reported as unused. The generator runs this rule itself,
    // with `--fix`, to drop declarations that really are unused.
    '@typescript-eslint/no-unused-vars': 'off',
    // Flow's inexact `{...}` translates to `{}`, which this rule flags. The
    // Flow sources that produce one are worth fixing rather than silencing, so
    // this is off only until they are.
    '@typescript-eslint/no-empty-object-type': 'off',
  },
};
