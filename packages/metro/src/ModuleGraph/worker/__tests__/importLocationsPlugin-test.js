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

import type {File as BabelNodeFile} from '@babel/types';
import type {MetroBabelFileMetadata} from 'metro-babel-transformer';

import collectDependencies from '../collectDependencies';
import nullthrows from 'nullthrows';

const {importLocationsPlugin, locToKey} = require('../importLocationsPlugin');
const {transformFromAstSync} = require('@babel/core');
const {parse: flowParse} = require('flow-parser');

function parse(code: string) {
  // $FlowExpectedError[incompatible-exact] - we don't care about the AST structure
  return flowParse(code, {
    babel: true,
    sourceType: 'module',
    reactRuntimeTarget: '19',
  }) as BabelNodeFile;
}

function transformString(code: string) {
  return transformFromAstSync<MetroBabelFileMetadata>(parse(code), code, {
    filename: 'file.js',
    cwd: '/my/root',
    plugins: [importLocationsPlugin],
  });
}

test('gathers source locs of static ESM imports and re-exports', () => {
  const code = `
  // ESM imports that will be transformed by any ESM->CJS transform, we must
  // track them.
  import foo from "./foo";
  import {bar} from "./bar";
  export {baz} from "./baz";

  // Not runtime imports
  export default 47;
  export const qux = 'qux';
  export type {TBar} from "./Bar";
  import type TFoo from "./Foo";

  // CommonJS dependencies
  const cjs = require("./cjs");

  // This imports ESM but is valid in CommonJS, so preserved by ESM->CJS
  // transforms - we don't need to track it.
  export async function importAsync() {
    await import("./async");
  }
  `;

  const result = transformString(code);
  expect(result.metadata.metro?.unstable_importDeclarationLocs).toEqual(
    new Set(['4,2:4,26', '5,2:5,28', '6,2:6,28']),
  );
});

test('multiple uses of the plugin do not conflate', () => {
  expect(
    transformString('import foo from "./foo";').metadata.metro
      ?.unstable_importDeclarationLocs,
  ).toEqual(new Set(['1,0:1,24']));

  expect(
    transformString('require("foo")').metadata.metro
      ?.unstable_importDeclarationLocs,
  ).toEqual(new Set([]));
});

test('works end-to-end with collectDependencies to distinguish source ESM imports despite ESM->CJS', () => {
  const code = `
  import foo from "./foo";
  import {bar} from "./bar";
  export {baz} from "./baz";
  const {qux} = require("./qux");
  export default async function() {
    await import("./async");
  };
  `;
  const {metadata} = transformString(code);
  const importDeclarationLocs = metadata.metro?.unstable_importDeclarationLocs;

  const cjsAst = nullthrows(
    transformFromAstSync(parse(code), code, {
      code: false,
      ast: true,
      filename: 'file.js',
      cwd: '/my/root',
      // $FlowFixMe[untyped-import] Untyped in OSS only
      plugins: [require('@babel/plugin-transform-modules-commonjs')],
    }).ast,
  );

  // Transform with collectDependencies
  const result = collectDependencies(cjsAst, {
    asyncRequireModulePath: 'asyncRequire',
    dependencyMapName: null,
    dynamicRequires: 'reject',
    inlineableCalls: ['require'],
    keepRequireNames: true,
    allowOptionalDependencies: true,
    unstable_allowRequireContext: false,
    unstable_isESMImportAtSource: importDeclarationLocs
      ? loc => importDeclarationLocs.has(locToKey(loc))
      : null,
  });
  expect(result.dependencies).toEqual([
    {
      name: './foo',
      data: expect.objectContaining({
        isESMImport: true,
      }),
    },
    {
      name: './bar',
      data: expect.objectContaining({
        isESMImport: true,
      }),
    },
    {
      name: './baz',
      data: expect.objectContaining({
        isESMImport: true,
      }),
    },
    {
      name: './qux',
      data: expect.objectContaining({
        isESMImport: false,
      }),
    },
    {
      name: './async',
      data: expect.objectContaining({
        asyncType: 'async',
        isESMImport: true,
      }),
    },
    {
      name: 'asyncRequire',
      data: expect.objectContaining({
        isESMImport: false,
      }),
    },
  ]);
});
