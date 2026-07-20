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
 * Base ESLint config for JavaScript and Flow source code.
 */
module.exports = {
  env: {
    node: true,
  },
  root: true,
  extends: ['eslint-config-fb-strict', 'prettier'],
  plugins: ['babel', 'ft-flow', 'import', 'lint'],
  parser: 'hermes-eslint',
  rules: {
    'babel/quotes': ['error', 'single', 'avoid-escape'],
    'consistent-return': 'error',
    'import/enforce-node-protocol-usage': ['warn', 'always'],
    'import/no-extraneous-dependencies': 'error',
    'fb-www/extra-arrow-initializer': 'off',
    'lint/metro-deep-imports': 'warn',
    'lint/sort-imports': 'warn',
    'lint/strictly-null': 'warn',
    'max-len': 'off',
    'no-alert': 'error',
    'no-console': 'error',
    'no-unused-vars': 'error',
    'no-var': 'off',
    'prefer-const': ['warn', {destructuring: 'all'}],
    quotes: 'off',
    'sort-keys': 'off',

    'no-restricted-imports': [
      'error',
      {
        name: 'url',
        message:
          'Deprecated. Please use URL instead. https://nodejs.org/docs/latest/api/url.html#legacy-url-api',
      },
    ],
    'no-restricted-modules': [
      'error',
      {
        name: 'url',
        message:
          'Deprecated. Please use URL instead. https://nodejs.org/docs/latest/api/url.html#legacy-url-api',
      },
    ],

    // TODO: This was added after migrating from `eslint-plugin-prettier` to
    // `eslint-config-prettier`. The former used to disable this rule, so this
    // was added to avoid introducing lint errors during the migration. Either
    // this needs to be properly configured or lint errors need to be fixed so
    // this override can be removed.
    'prefer-arrow-callback': 'off',

    // prettier handles this
    'flowtype/object-type-delimiter': 'off',
    'ft-flow/object-type-delimiter': 'off',

    // These rules are not required with hermes-eslint
    'ft-flow/define-flow-type': 0,
    'ft-flow/use-flow-type': 0,
    'flowtype/define-flow-type': 0,
    'flowtype/use-flow-type': 0,
    // flow handles this check for us, so it's not required
    'no-undef': 0,
  },
  overrides: [
    {
      files: ['**/__tests__/**/*.js'],
      env: {
        jest: true,
      },
      plugins: ['jest'],
      rules: {
        'babel/quotes': [
          'error',
          'single',
          {avoidEscape: true, allowTemplateLiterals: true},
        ],
        'jest/consistent-test-it': [
          'warn',
          {fn: 'test', withinDescribe: 'test'},
        ],
        quotes: 'off',
      },
    },
  ],
};
