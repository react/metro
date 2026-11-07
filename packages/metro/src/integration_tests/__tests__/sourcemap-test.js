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

const Metro = require('../../..');
const execBundle = require('../execBundle');
const fs = require('node:fs');
const sourceMap = require('source-map');
const stackTrace = require('stack-trace');

jest.setTimeout(30 * 1000);

const INLINE_SOURCE_MAP_STR =
  '//# sourceMappingURL=data:application/json;charset=utf-8;base64,';
const ERROR_STR = "new Error('SOURCEMAP:";

test('creates correct sourcemaps in dev mode', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const {code, map} = await Metro.runBuild(config, {
    entry: 'ErrorBundle.js',
  });

  const {line, column, source} = symbolicate(getErrorFromCode(code), map);

  const fileName = source.replace(/^metro:\/\//, '');

  expect(
    substrFromFile(fileName, line, column).startsWith(ERROR_STR),
  ).toBeTruthy();
});

test('creates correct sourcemaps in prod mode', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const {code, map} = await Metro.runBuild(config, {
    entry: 'ErrorBundle.js',
    dev: false,
    minify: true,
  });

  const {line, column, source} = symbolicate(getErrorFromCode(code), map);

  const fileName = source.replace(/^metro:\/\//, '');

  expect(
    substrFromFile(fileName, line, column).startsWith(ERROR_STR),
  ).toBeTruthy();
});

test('creates correct inline sourcemaps', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const {code} = await Metro.runBuild(config, {
    entry: 'ErrorBundle.js',
    dev: false,
    minify: true,
    sourceMap: true,
  });
  const map = extractInlineSourceMap(code);

  const {line, column, source} = symbolicate(getErrorFromCode(code), map);

  const fileName = source.replace(/^metro:\/\//, '');

  expect(
    substrFromFile(fileName, line, column).startsWith(ERROR_STR),
  ).toBeTruthy();
});

function extractInlineSourceMap(code: string) {
  const idx = code.lastIndexOf(INLINE_SOURCE_MAP_STR);

  return Buffer.from(
    code.substr(idx + INLINE_SOURCE_MAP_STR.length),
    'base64',
  ).toString();
}

function getErrorFromCode(code) {
  // Create a vm context to execute the bundle and get back the Error object.
  const error = execBundle(code);

  // Override the Error stacktrace serializer to be able to get the raw stack.
  const oldStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = (err, structuredStackTrace) => structuredStackTrace;

  const stack =
    typeof error.stack === 'string' ? stackTrace.parse(error) : error.stack;

  try {
    return {
      line: stack[0].getLineNumber(),
      // Column numbers coming from v8 are 1-based
      // https://chromium.googlesource.com/v8/v8.git/+/master/src/inspector/js_protocol.json#69
      // But mozilla sourcemap library expects 0-based columns
      // https://github.com/mozilla/source-map#sourcemapconsumerprototypeoriginalpositionforgeneratedposition
      column: stack[0].getColumnNumber() - 1,
    };
  } finally {
    Error.prepareStackTrace = oldStackTrace;
  }
}

function symbolicate({line, column}, map) {
  const consumer = new sourceMap.SourceMapConsumer(map);
  const originalTrace = consumer.originalPositionFor({
    line,
    column,
  });

  // Check that unsymbolicating the error back gives us the initial column/line.
  expect(consumer.generatedPositionFor(originalTrace)).toEqual(
    expect.objectContaining({
      column,
      line,
    }),
  );

  return originalTrace;
}

function substrFromFile(filePath, line, column) {
  return fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    [line - 1].substr(column);
}
