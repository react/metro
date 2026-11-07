/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

const path = require('node:path');

// react-dom may be hoisted away from metro-runtime's react; share one instance.
const reactDir = path.dirname(
  require.resolve('react/package.json', {
    paths: [path.join(__dirname, 'packages/metro-runtime')],
  }),
);

/** @type {import('jest').Config} **/
module.exports = {
  filter: '<rootDir>/scripts/jestFilter.js',
  modulePathIgnorePatterns: [
    '/node_modules/',
    'packages/[^/]+/build/',
    '<rootDir>/\\.claude/',
  ],
  snapshotFormat: {
    escapeString: true,
    printBasicPrototype: true,
  },
  moduleNameMapper: {
    '^prettier$': '<rootDir>/scripts/nativePrettier.js',
    '^react$': reactDir,
    '^react/(.*)$': `${reactDir}/$1`,
  },
  testEnvironment: 'node',
  testRegex: '/__tests__/.*-test\\.js$',
  fakeTimers: {
    enableGlobally: true,
    legacyFakeTimers: false,
  },
  transform: {
    '\\.js$': '<rootDir>/scripts/babelJestTransformer.js',
  },
  setupFiles: ['<rootDir>/scripts/setupJest.js'],
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname',
  ],
};
