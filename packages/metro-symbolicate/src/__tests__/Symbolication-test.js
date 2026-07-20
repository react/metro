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

const Symbolication = require('../Symbolication.js');
const fs = require('node:fs');
const path = require('node:path');
const {SourceMapConsumer} = require('source-map');

const resolve = fileName => path.resolve(__dirname, '__fixtures__', fileName);
const read = fileName => fs.readFileSync(resolve(fileName), 'utf8');

const TESTFILE_MAP = resolve('testfile.js.map');
const WITH_IGNORE_LIST_MAP = resolve('with-ignore-list.js.map');

const UNKNOWN_MODULE_IDS = {
  segmentId: 0,
  localId: undefined,
};

test('symbolicating with context created from source map object', async () => {
  const map = JSON.parse(read(TESTFILE_MAP));
  const context = Symbolication.createContext(SourceMapConsumer, map);
  expect(
    Symbolication.getOriginalPositionFor(1, 161, UNKNOWN_MODULE_IDS, context),
  ).toMatchInlineSnapshot(`
    Object {
      "column": 20,
      "line": 18,
      "name": null,
      "source": "thrower.js",
    }
  `);
});

test('symbolicating with context created from source map string', async () => {
  const map = read(TESTFILE_MAP);
  const context = Symbolication.createContext(SourceMapConsumer, map);
  expect(
    Symbolication.getOriginalPositionFor(1, 161, UNKNOWN_MODULE_IDS, context),
  ).toMatchInlineSnapshot(`
    Object {
      "column": 20,
      "line": 18,
      "name": null,
      "source": "thrower.js",
    }
  `);
});

test('symbolicating without specifying module IDs', async () => {
  const map = read(TESTFILE_MAP);
  const context = Symbolication.createContext(SourceMapConsumer, map);
  expect(Symbolication.getOriginalPositionFor(1, 161, null, context))
    .toMatchInlineSnapshot(`
    Object {
      "column": 20,
      "line": 18,
      "name": null,
      "source": "thrower.js",
    }
  `);
});

test('constructs consumer instances lazily and caches them afterwards', () => {
  const map = {
    version: 3,
    mappings: 'A',
    names: [],
    sources: [],
    x_facebook_segments: {
      1: {version: 3, mappings: 'A', names: [], sources: []},
    },
  };
  let consumerCount = 0;
  class MockConsumer extends SourceMapConsumer {
    constructor(...args) {
      super(...args);
      ++consumerCount;
    }
  }
  const context = Symbolication.createContext(MockConsumer, map);
  expect(consumerCount).toBe(0);
  context.getOriginalPositionFor(1, 0, context.parseFileName('main.js'));
  expect(consumerCount).toBe(1);
  context.getOriginalPositionFor(11, 0, context.parseFileName('seg-1.js'));
  expect(consumerCount).toBe(2);
  context.getOriginalPositionFor(21, 0, context.parseFileName('main.js'));
  expect(consumerCount).toBe(2);
  context.getOriginalPositionFor(31, 0, context.parseFileName('seg-1.js'));
  expect(consumerCount).toBe(2);
});

test('returns ignore status of sources through getOriginalPositionDetailsFor', async () => {
  const map = JSON.parse(read(WITH_IGNORE_LIST_MAP));
  const context = Symbolication.createContext(SourceMapConsumer, map);
  expect(context.getOriginalPositionDetailsFor(3, 0)).toMatchInlineSnapshot(`
    Object {
      "column": 0,
      "functionName": null,
      "isIgnored": true,
      "line": 12,
      "name": null,
      "source": "/node_modules/metro/src/lib/polyfills/require.js",
    }
  `);
  expect(context.getOriginalPositionDetailsFor(427, 124))
    .toMatchInlineSnapshot(`
    Object {
      "column": 0,
      "functionName": null,
      "isIgnored": false,
      "line": 3,
      "name": "module",
      "source": "/js/RKJSModules/segmented/biz.js",
    }
  `);
});
