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

const Metro = require('../../..');
const path = require('node:path');

jest.setTimeout(30 * 1000);
const BUILD_ERRORS_SRC_DIR =
  path.resolve(__dirname, '..', 'basic_bundle', 'build-errors') + path.sep;

expect.addSnapshotSerializer({
  test: val => val instanceof Error,
  print: (val: Error) =>
    val.message
      .replaceAll(BUILD_ERRORS_SRC_DIR, '<dir>/')
      .replaceAll(path.win32.sep, path.posix.sep),
});

describe('APIs/semantics', () => {
  test('reports resolution errors with inline requires + ESM', async () => {
    const config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

    const buildPromise = Metro.runBuild(config, {
      entry: 'build-errors/inline-requires-cannot-resolve-import.js',
    });

    await expect(buildPromise).rejects.toMatchSnapshot();
  });

  test('reports resolution errors with ESM + non-inlined requires', async () => {
    const config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

    const buildPromise = Metro.runBuild(config, {
      entry: 'build-errors/cannot-resolve-import.js',
    });

    await expect(buildPromise).rejects.toMatchSnapshot();
  });

  test('reports resolution errors with inline requires + CJS', async () => {
    const config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

    const buildPromise = Metro.runBuild(config, {
      entry: 'build-errors/inline-requires-cannot-resolve-require.js',
    });

    await expect(buildPromise).rejects.toMatchSnapshot();
  });

  test('reports resolution errors with CJS + non-inlined requires', async () => {
    const config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

    const buildPromise = Metro.runBuild(config, {
      entry: 'build-errors/cannot-resolve-require.js',
    });

    await expect(buildPromise).rejects.toMatchSnapshot();
  });
});

describe('formatting edge cases', () => {
  test('reports resolution errors with multi-line locs', async () => {
    const config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

    const buildPromise = Metro.runBuild(config, {
      entry: 'build-errors/cannot-resolve-multi-line-import.js',
    });

    await expect(buildPromise).rejects.toMatchSnapshot();
  });

  test('reports resolution errors with a specifier containing an escape sequence', async () => {
    const config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

    const buildPromise = Metro.runBuild(config, {
      entry: 'build-errors/cannot-resolve-specifier-with-escapes.js',
    });

    await expect(buildPromise).rejects.toMatchSnapshot();
  });

  test('reports resolution errors with a multi-line loc + specifier containing an escape sequence', async () => {
    const config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

    const buildPromise = Metro.runBuild(config, {
      entry: 'build-errors/cannot-resolve-multi-line-import-with-escapes.js',
    });

    await expect(buildPromise).rejects.toMatchSnapshot();
  });

  test('reports resolution errors with embedded comment after the specifier', async () => {
    const config = await Metro.loadConfig({
      config: require.resolve('../metro.config.js'),
    });

    const buildPromise = Metro.runBuild(config, {
      entry: 'build-errors/cannot-resolve-require-with-embedded-comment.js',
    });

    await expect(buildPromise).rejects.toMatchSnapshot();
  });
});
