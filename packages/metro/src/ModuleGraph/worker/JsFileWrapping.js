/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {
  File as BabelNodeFile,
  FunctionExpression,
  Identifier,
  Program,
} from '@babel/types';

import {RESERVED_STRING} from '../../lib/reservedString';
import template from '@babel/template';
import * as t from '@babel/types';

const MODULE_ID_PLACEHOLDER = `${RESERVED_STRING}MODULE_ID`;

// Check first the `global` variable as the global object. This way serializers
// can create a local variable called global to fake it as a global object
// without having to pollute the window object on web.
const IIFE_PARAM = template.expression(
  "typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this",
);

function wrapModule(
  fileAst: BabelNodeFile,
  importDefaultName: string,
  importAllName: string,
  dependencyMapName: string,
  globalPrefix: string,
  {
    unstable_useStaticHermesModuleFactory = false,
  }: Readonly<{unstable_useStaticHermesModuleFactory?: boolean}> = {},
): {
  ast: BabelNodeFile,
  requireName: string,
} {
  const params = buildParameters(
    importDefaultName,
    importAllName,
    dependencyMapName,
  );
  const factory = functionFromProgram(fileAst.program, params);

  const def = t.callExpression(t.identifier(`${globalPrefix}__d`), [
    unstable_useStaticHermesModuleFactory
      ? t.callExpression(
          t.memberExpression(
            t.identifier('$SHBuiltin'),
            t.identifier('moduleFactory'),
          ),
          [t.identifier(MODULE_ID_PLACEHOLDER), factory],
        )
      : factory,
  ]);

  const ast = t.file(t.program([t.expressionStatement(def)]));

  // `require` is never scoped/renamed: the local `require` function parameter is
  // used instead of the global one when Metro serializes to the IIFE module
  // factory.
  return {ast, requireName: 'require'};
}

function wrapPolyfill(fileAst: BabelNodeFile): BabelNodeFile {
  const factory = functionFromProgram(fileAst.program, ['global']);

  const iife = t.callExpression(factory, [IIFE_PARAM()]);
  return t.file(t.program([t.expressionStatement(iife)]));
}

function jsonToCommonJS(source: string): string {
  return `module.exports = ${source};`;
}

function wrapJson(
  source: string,
  globalPrefix: string,
  unstable_useStaticHermesModuleFactory?: boolean = false,
): string {
  // The factory-parameter defaults (`_importDefaultUnused` etc.) are safe
  // for JSON, whose body only references `module` / `module.exports`.
  return wrapModuleString(jsonToCommonJS(source), globalPrefix, {
    unstable_useStaticHermesModuleFactory,
  });
}

/**
 * Wraps an arbitrary JS `body` source string as a `__d(function(...) { <body> })`
 * module definition, with pure string manipulation.
 *
 * This is the lower-level primitive that `wrapJson` builds on - it is also
 * exposed for callers that need to synthesize `__d`-wrapped modules from
 * strings cheaply (e.g. codegen of synthetic segment/metadata modules).
 *
 * Factory parameter names default to the `_*Unused` names `wrapJson` emits.
 * Callers whose body references one of these slots by name (typically the
 * dependency-map parameter) must pass the corresponding option so the emitted
 * factory signature exposes that name. Callers are responsible for ensuring
 * that the body does not unintentionally shadow or redeclare parameters.
 */
function wrapModuleString(
  body: string,
  globalPrefix: string,
  {
    importDefaultName = '_importDefaultUnused',
    importAllName = '_importAllUnused',
    dependencyMapName = '_dependencyMapUnused',
    unstable_useStaticHermesModuleFactory = false,
  }: Readonly<{
    importDefaultName?: string,
    importAllName?: string,
    dependencyMapName?: string,
    unstable_useStaticHermesModuleFactory?: boolean,
  }> = {},
): string {
  const moduleFactoryParameters = buildParameters(
    importDefaultName,
    importAllName,
    dependencyMapName,
  );

  const factory = [
    `function(${moduleFactoryParameters.join(', ')}) {`,
    `  ${body}`,
    '}',
  ].join('\n');

  return (
    `${globalPrefix}__d(` +
    (unstable_useStaticHermesModuleFactory
      ? '$SHBuiltin.moduleFactory(' +
        MODULE_ID_PLACEHOLDER +
        ', ' +
        factory +
        ')'
      : factory) +
    ');'
  );
}

function functionFromProgram(
  program: Program,
  parameters: ReadonlyArray<string>,
): FunctionExpression {
  return t.functionExpression(
    undefined,
    parameters.map(makeIdentifier),
    t.blockStatement(program.body, program.directives),
  );
}

function makeIdentifier(name: string): Identifier {
  return t.identifier(name);
}

function buildParameters(
  importDefaultName: string,
  importAllName: string,
  dependencyMapName: string,
): ReadonlyArray<string> {
  return [
    'global',
    'require',
    importDefaultName,
    importAllName,
    'module',
    'exports',
    dependencyMapName,
  ];
}

export {wrapJson, jsonToCommonJS, wrapModule, wrapModuleString, wrapPolyfill};
