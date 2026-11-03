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

import {parse as flowParse} from 'flow-parser';
import {promises as fsPromises} from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';

// jest-mock internals, intentionally not typed in flow-typed/jest.js.
const IGNORED_MOCK_INSTANCE_MEMBERS = new Set([
  '_isMockFunction',
  '_protoImpl',
]);

function getMockInstanceMembers(source) {
  const sourceFile = ts.createSourceFile(
    'index.d.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );
  for (const statement of sourceFile.statements) {
    if (
      ts.isInterfaceDeclaration(statement) &&
      statement.name.text === 'MockInstance'
    ) {
      return statement.members.map(member => member.name.getText());
    }
  }
  throw new Error('MockInstance interface not found in jest-mock types');
}

function getJestMockFnMembers(source) {
  const {errors, body} = flowParse(source, {all: true});
  if (errors.length > 0) {
    throw new Error(
      'Failed to parse flow-typed/jest.js: ' + JSON.stringify(errors),
    );
  }
  for (const statement of body) {
    if (statement.type === 'TypeAlias' && statement.id.name === 'JestMockFn') {
      const names = [];
      for (const property of statement.right.properties) {
        if (property.type === 'ObjectTypeProperty' && property.key != null) {
          names.push(property.key.name);
        }
      }
      return names;
    }
  }
  throw new Error('JestMockFn type not found in flow-typed/jest.js');
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

  const declared = new Set(getJestMockFnMembers(jestLibdef));
  const missing = getMockInstanceMembers(jestMockTypes).filter(
    member =>
      !IGNORED_MOCK_INSTANCE_MEMBERS.has(member) && !declared.has(member),
  );
  expect(missing).toEqual([]);
});
