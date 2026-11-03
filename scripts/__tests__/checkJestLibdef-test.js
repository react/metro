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

import {promises as fsPromises} from 'node:fs';
import path from 'node:path';

// jest-mock internals, intentionally not typed in flow-typed/jest.js.
const IGNORED_MOCK_INSTANCE_MEMBERS = new Set([
  '_isMockFunction',
  '_protoImpl',
]);

function extractBlock(source, startPattern) {
  const start = source.search(startPattern);
  if (start === -1) {
    throw new Error('Block not found: ' + startPattern);
  }
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') {
      depth++;
    } else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(open + 1, i);
      }
    }
  }
  throw new Error('Unbalanced braces in block: ' + startPattern);
}

function extractMemberNames(block) {
  const names = new Set();
  for (const line of block.split('\n')) {
    const match = /^\s*(\w+)\s*[(:]/.exec(line);
    if (match != null) {
      names.add(match[1]);
    }
  }
  return names;
}

test('flow-typed/jest.js covers the jest-mock MockInstance API', async () => {
  const jestMockTypes = await fsPromises.readFile(
    path.join(__dirname, '../../node_modules/jest-mock/build/index.d.ts'),
    'utf8',
  );
  const jestLibdef = await fsPromises.readFile(
    path.join(__dirname, '../../flow-typed/jest.js'),
    'utf8',
  );

  const mockInstanceBlock = extractBlock(
    jestMockTypes,
    /export declare interface MockInstance/,
  );
  const jestMockFnBlock = extractBlock(jestLibdef, /type JestMockFn</);

  const missing = [];
  for (const member of extractMemberNames(mockInstanceBlock)) {
    if (IGNORED_MOCK_INSTANCE_MEMBERS.has(member)) {
      continue;
    }
    // Methods are declared as `name(` and function-typed properties as `name:`.
    if (
      !new RegExp('(^|[^A-Za-z0-9_])' + member + '\\s*[(:]').test(
        jestMockFnBlock,
      )
    ) {
      missing.push(member);
    }
  }
  expect(missing).toEqual([]);
});
