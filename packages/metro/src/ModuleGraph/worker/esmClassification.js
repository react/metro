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

import type {
  CallExpression as BabelNodeCallExpression,
  File as BabelNodeFile,
  Identifier as BabelNodeIdentifier,
  Node as BabelNode,
} from '@babel/types';

import * as types from '@babel/types';

/**
 * Classifies a module's relationship to ESM/CJS interop from two directions:
 *
 *   `definesESModuleInterop`   - does this module set `exports.__esModule`?
 *   `canDefineESModuleInterop` - could it, anywhere we cannot see?
 *
 * The two are not complements. The first only inspects top-level statements,
 * so a false result means "no marker here", not "no marker" - the marker can
 * be installed from anywhere the exports object is reachable. The second
 * closes that gap, so it takes both to assert that a module has no ESM
 * interop at all.
 */

function isExportsObject(node: BabelNode): boolean {
  // `exports`
  if (types.isIdentifier(node, {name: 'exports'})) {
    return true;
  }
  // `module.exports`
  return (
    types.isMemberExpression(node, {computed: false}) &&
    types.isIdentifier(node.object, {name: 'module'}) &&
    types.isIdentifier(node.property, {name: 'exports'})
  );
}

function isTruthyConstant(node: BabelNode): boolean {
  if (types.isBooleanLiteral(node)) {
    return node.value === true;
  }
  if (types.isNumericLiteral(node)) {
    return node.value !== 0;
  }
  // `!0` (minified `true`)
  if (types.isUnaryExpression(node, {operator: '!', prefix: true})) {
    return types.isNumericLiteral(node.argument, {value: 0});
  }
  return false;
}

// `Object.defineProperty(exports, "__esModule", { value: <truthy> })`
function isDefinePropertyESModule(call: BabelNodeCallExpression): boolean {
  const callee = call.callee;
  if (
    !types.isMemberExpression(callee, {computed: false}) ||
    !types.isIdentifier(callee.object, {name: 'Object'}) ||
    !types.isIdentifier(callee.property, {name: 'defineProperty'})
  ) {
    return false;
  }
  const args = call.arguments;
  if (
    args.length < 3 ||
    !isExportsObject(args[0]) ||
    !types.isStringLiteral(args[1], {value: '__esModule'}) ||
    !types.isObjectExpression(args[2])
  ) {
    return false;
  }
  return args[2].properties.some(
    prop =>
      types.isObjectProperty(prop, {computed: false}) &&
      (types.isIdentifier(prop.key, {name: 'value'}) ||
        types.isStringLiteral(prop.key, {value: 'value'})) &&
      isTruthyConstant(prop.value),
  );
}

function expressionSetsESModule(expr: BabelNode): boolean {
  if (types.isSequenceExpression(expr)) {
    // `a, b, c` at the top level - each subexpression is independently
    // observable. Recognise the marker in any position, so patterns like
    // `module.exports = fn, module.exports.__esModule = true, ...` from
    // `@babel/runtime/helpers/*` are detected.
    return expr.expressions.some(expressionSetsESModule);
  }
  if (types.isCallExpression(expr)) {
    return isDefinePropertyESModule(expr);
  }
  if (!types.isAssignmentExpression(expr) || expr.operator !== '=') {
    return false;
  }
  const left = expr.left;
  return (
    types.isMemberExpression(left) &&
    left.computed !== true &&
    types.isIdentifier(left.property, {name: '__esModule'}) &&
    isExportsObject(left.object) &&
    isTruthyConstant(expr.right)
  );
}

/**
 * Returns whether the given (post-transform) module AST declares ESM/CJS
 * interop by setting `exports.__esModule` truthy at the top level. Recognises
 * four shapes seen in the wild:
 *
 *   Object.defineProperty(exports, '__esModule', {value: true})
 *     - Metro's own ESM transform (`import-export-plugin`)
 *     - `@babel/plugin-transform-modules-commonjs` (default output)
 *     - typescript compiler `--module commonjs`
 *     - rollup with `esModule: true` (default)
 *   Object.defineProperty(module.exports, '__esModule', {value: true})
 *     - handwritten interop wrappers
 *   exports.__esModule = true                       // also value 1 or !0
 *     - `@babel/plugin-transform-modules-commonjs` with `loose: true`
 *     - some older tsc output
 *     - rollup with `esModule: 'if-default-prop'`
 *   module.exports = fn, module.exports.__esModule = true, ...
 *     - every helper under `@babel/runtime/helpers/` (sequence expression)
 *
 * AST-based (not a scan of generated code) so the check is robust to
 * whitespace, quoting, and attribute ordering. Intentionally independent of
 * whether the import-export-plugin ran: a module already lowered to CJS with
 * the marker must still be recognised as an ES module, so this cannot be
 * replaced by the plugin's `out.isESModule`.
 */
export function definesESModuleInterop(ast: BabelNodeFile): boolean {
  for (const stmt of ast.program.body) {
    if (
      types.isExpressionStatement(stmt) &&
      expressionSetsESModule(stmt.expression)
    ) {
      return true;
    }
  }
  return false;
}

// Collects the `exports`/`module` identifier nodes that belong to an export
// write we can fully account for: `module.exports = <value>`,
// `exports.<name> = <value>` and `module.exports.<name> = <value>`. Any
// occurrence left uncollected is treated as an escape by the caller.
function collectAccountedExportsRefs(
  ast: BabelNodeFile,
): Set<BabelNodeIdentifier> {
  const accounted = new Set<BabelNodeIdentifier>();

  const accountForExportsObject = (node: BabelNode): boolean => {
    // `exports`
    if (types.isIdentifier(node, {name: 'exports'})) {
      accounted.add(node);
      return true;
    }
    // `module.exports` - both identifiers are occurrences of the names we
    // track, so both have to be accounted for. Bound to locals so the
    // refinements survive the calls that establish them.
    if (types.isMemberExpression(node, {computed: false})) {
      const object = node.object;
      const property = node.property;
      if (
        types.isIdentifier(object, {name: 'module'}) &&
        types.isIdentifier(property, {name: 'exports'})
      ) {
        accounted.add(object);
        accounted.add(property);
        return true;
      }
    }
    return false;
  };

  for (const stmt of ast.program.body) {
    if (!types.isExpressionStatement(stmt)) {
      continue;
    }
    const expr = stmt.expression;
    if (!types.isAssignmentExpression(expr) || expr.operator !== '=') {
      continue;
    }
    const left = expr.left;
    // `module.exports = <value>`
    if (accountForExportsObject(left)) {
      continue;
    }
    // `exports.<name> = <value>` / `module.exports.<name> = <value>`. A
    // computed key is rejected by `hasDynamicPropertyDefinition`.
    if (types.isMemberExpression(left, {computed: false})) {
      accountForExportsObject(left.object);
    }
  }

  return accounted;
}

// Any construct that can define a property whose key is not visible in the
// source text. With the `__esModule` token absent, these are the only
// remaining ways to produce the key (e.g. `exports['__' + 'esModule']`).
function hasDynamicPropertyDefinition(ast: BabelNodeFile): boolean {
  let found = false;
  types.traverseFast(ast, node => {
    if (found) {
      return;
    }
    if (
      // `x[k] = v`
      (types.isAssignmentExpression(node) &&
        types.isMemberExpression(node.left, {computed: true})) ||
      // `{[k]: v}`
      (types.isObjectProperty(node) && node.computed === true) ||
      // `{...x}` - `x` may carry the key
      types.isSpreadElement(node) ||
      // `Object.assign(target, ...)`, `Object.defineProperties(...)`
      (types.isCallExpression(node) &&
        types.isMemberExpression(node.callee, {computed: false}) &&
        types.isIdentifier(node.callee.object, {name: 'Object'}) &&
        (types.isIdentifier(node.callee.property, {name: 'assign'}) ||
          types.isIdentifier(node.callee.property, {
            name: 'defineProperties',
          })))
    ) {
      found = true;
    }
  });
  return found;
}

/**
 * Returns whether the module *might* define `exports.__esModule`, i.e. whether
 * `definesESModuleInterop` returning false could be a false negative.
 *
 * `definesESModuleInterop` only inspects top-level statements, so on its own it
 * cannot distinguish "no marker" from "marker installed somewhere it can't
 * see". A self-contained bundle, for instance, may hand its exports object to a
 * helper that sets the key (webpack's `__webpack_require__.r`), which is
 * invisible to a statement scan and needs no dependencies to do it.
 *
 * Returning false is an assertion that no expression in the module can produce
 * the key, established by checking that all three hold:
 *
 *   1. `__esModule` does not occur anywhere, as an identifier or string.
 *   2. `exports`/`module` are only ever read as the target of an export write
 *      we can enumerate - never aliased, passed to a function, or accessed
 *      with a computed key, any of which would let the key be set out of view.
 *   3. No construct can define a property under a key that is not literally
 *      present in the source (see `hasDynamicPropertyDefinition`), which is
 *      what closes the gap left by (1).
 *
 * Deliberately conservative: anything unrecognised returns true. This is not a
 * claim that the module is CommonJS - a script or an empty module also
 * qualifies - only that it does not opt into ESM interop.
 */
export function canDefineESModuleInterop(ast: BabelNodeFile): boolean {
  if (hasDynamicPropertyDefinition(ast)) {
    return true;
  }
  const accounted = collectAccountedExportsRefs(ast);
  let unsafe = false;
  types.traverseFast(ast, node => {
    if (unsafe) {
      return;
    }
    if (
      types.isIdentifier(node, {name: '__esModule'}) ||
      types.isStringLiteral(node, {value: '__esModule'})
    ) {
      unsafe = true;
      return;
    }
    if (
      (types.isIdentifier(node, {name: 'exports'}) ||
        types.isIdentifier(node, {name: 'module'})) &&
      !accounted.has(node)
    ) {
      unsafe = true;
    }
  });
  return unsafe;
}
