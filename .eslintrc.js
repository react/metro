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

module.exports = {
  extends: './scripts/eslint/base',
  overrides: [
    {
      files: ['flow-typed/**/*.js'],
      rules: {
        'babel/quotes': 'off',
        'lint/flow-function-shape': 'off',
        'no-unused-vars': 'off',
      },
    },
    {
      files: ['package.json'],
      parser: 'jsonc-eslint-parser',
    },
    {
      files: ['packages/*/types/**/*.d.ts'],
      extends: './scripts/eslint/typescript',
    },
    {
      files: ['packages/metro-source-map/**/*.js'],
      rules: {
        'operator-assignment': ['error', 'never'],
      },
    },
    {
      files: ['scripts/**/*.js'],
      rules: {
        'babel/func-params-comma-dangle': 'off',
        'import/no-extraneous-dependencies': 'off',
      },
    },
    {
      files: ['packages/**/*.js'],
      rules: {
        'import/no-commonjs': 'error',
      },
    },
    {
      files: [
        'packages/metro/src/integration_tests/**/*.js',
        'packages/metro-runtime/**/*.js',
        '**/__tests__/**/*.js',
        '**/__mocks__/**/*.js',
        '**/__fixtures__/**/*.js',
      ],
      rules: {
        'import/no-commonjs': 'off',
      },
    },
  ],
};
