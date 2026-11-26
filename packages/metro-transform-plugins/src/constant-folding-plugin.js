/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

import type {PluginObj} from '@babel/core';
import type {NodePath, VisitNode, Visitor} from '@babel/traverse';
import typeof Traverse from '@babel/traverse';
import type {
  ArrowFunctionExpression as BabelNodeArrowFunctionExpression,
  BinaryExpression as BabelNodeBinaryExpression,
  ConditionalExpression as BabelNodeConditionalExpression,
  FunctionDeclaration as BabelNodeFunctionDeclaration,
  FunctionExpression as BabelNodeFunctionExpression,
  IfStatement as BabelNodeIfStatement,
  LogicalExpression as BabelNodeLogicalExpression,
  Node as BabelNode,
  Program as BabelNodeProgram,
  UnaryExpression as BabelNodeUnaryExpression,
} from '@babel/types';
// This is only a typeof import, no runtime dependency exists
// eslint-disable-next-line import/no-extraneous-dependencies
import typeof * as Types from '@babel/types';

type State = {stripped: boolean, droppedNodes: Set<BabelNode>};

export default function constantFoldingPlugin(context: {
  types: Types,
  traverse: Traverse,
  ...
}): PluginObj<State> {
  const t = context.types;
  const {isLiteral, isVariableDeclarator, isUnaryExpression} = t;

  const traverse = context.traverse;

  const evaluate = function (path: NodePath<>): {
    confident: boolean,
    value: unknown,
  } {
    const state = {safe: true};
    const unsafe = (path: NodePath<>, state: {safe: boolean}) => {
      state.safe = false;
    };

    if (isUnaryExpression(path.node) && path.node.operator === 'void') {
      // Void expressions always evaluate to undefined but would rarely be used
      // to express a constant (with the exception of `void 0`). More often,
      // they are used to discard the value of a side-effectful expression, so
      // are unsafe to fold. Conservatively, evaluate to undefined only if the
      // argument is a literal.
      if (isLiteral(path.node.argument)) {
        return {confident: true, value: undefined};
      }
      return {confident: false, value: null};
    }

    path.traverse(
      {
        AssignmentExpression: unsafe,
        CallExpression: unsafe,
        /**
         * This will mark `foo?.()` as unsafe, so it is not replaced with `undefined` down the line.
         *
         * We saw this case in the wild, where the unary expression `void foo?.()` was replaced with `undefined`
         * resulting in the expression call being skipped.
         */
        OptionalCallExpression: unsafe,
        // Babel evaluates a sequence to its last operand, so side effects in
        // the leading operands (e.g. `(i++, false)`) would otherwise be lost.
        AwaitExpression: unsafe,
        NewExpression: unsafe,
        TaggedTemplateExpression: unsafe,
        UpdateExpression: unsafe,
        YieldExpression: unsafe,
        UnaryExpression(path, state) {
          if (path.node.operator === 'delete') {
            state.safe = false;
          }
        },
      },
      state,
    );

    try {
      if (!state.safe) {
        return {confident: false, value: null};
      }
      const evaluated = path.evaluate();
      return {confident: evaluated.confident, value: evaluated.value};
    } catch {
      return {confident: false, value: null};
    }
  };

  const FunctionDeclaration = {
    exit(path: NodePath<BabelNodeFunctionDeclaration>, state: State): void {
      const binding =
        path.node.id != null && path.scope.parent.getBinding(path.node.id.name);

      if (
        binding &&
        !binding.referenced &&
        binding.constantViolations.every(violation =>
          violation.isDescendant(path),
        )
      ) {
        state.stripped = true;
        path.remove();
      }
    },
  };

  const FunctionExpression: VisitNode<
    BabelNodeFunctionExpression | BabelNodeArrowFunctionExpression,
    State,
  > =
    // $FlowFixMe[incompatible-type]
    {
      exit(path, state) {
        const parentPath = path.parentPath;
        const parentNode = parentPath?.node;

        if (isVariableDeclarator(parentNode) && parentNode.id.name != null) {
          const binding = parentPath?.scope.getBinding(parentNode.id.name);

          if (
            binding &&
            !binding.referenced &&
            binding.constantViolations.every(violation =>
              violation.isDescendant(path),
            )
          ) {
            state.stripped = true;
            parentPath?.remove();
          }
        }
      },
    };

  const Conditional: VisitNode<
    BabelNodeIfStatement | BabelNodeConditionalExpression,
    State,
  > =
    // $FlowFixMe[incompatible-type]
    {
      exit(path, state): void {
        const node = path.node;
        const result = evaluate(path.get('test'));

        if (result.confident) {
          state.stripped = true;

          // `var`s are hoisted out of the branch that is dropped. Keep a bare
          // declaration for those still used outside it, so they read as
          // `undefined` instead of throwing a ReferenceError.
          // $FlowFixMe[incompatible-type] get() with a union key is typed as possibly an array.
          const dropped: NodePath<> = path.get(
            result.value ? 'alternate' : 'consequent',
          );
          const hoisted = new Set<string>();
          // Bindings are only recomputed once the whole pass ends, so they
          // still list paths in branches dropped earlier in this pass.
          const outside = (p: NodePath<>) =>
            p.findParent(a => state.droppedNodes.has(a.node)) == null;
          const collect = (declaration: NodePath<>) => {
            if (!declaration.isVariableDeclaration({kind: 'var'})) {
              return;
            }
            // Look the name up where the var is hoisted to, which is not
            // necessarily the declaration's own scope (e.g. in a catch clause
            // whose param has the same name).
            const varScope =
              declaration.scope.getFunctionParent() ??
              declaration.scope.getProgramParent();
            for (const name of Object.keys(
              declaration.getBindingIdentifiers(),
            )) {
              const binding = varScope.getBinding(name);
              // A param, or a function declared before the branch, binds the
              // name already. The var shadows a function or class expression's
              // own name ('local'), so it must be kept.
              if (
                binding?.kind !== 'var' &&
                // $FlowFixMe[invalid-compare] Babel's BindingKind libdef is missing 'local'.
                binding?.kind !== 'local'
              ) {
                continue;
              }
              const writes = [binding.path, ...binding.constantViolations];
              if (
                !writes.some(p => p.isVariableDeclarator() && outside(p)) &&
                (binding.referencePaths.some(outside) ||
                  binding.constantViolations.some(outside))
              ) {
                hoisted.add(name);
              }
            }
          };
          if (dropped.node != null) {
            state.droppedNodes.add(dropped.node);
            collect(dropped);
            dropped.traverse({
              // Vars in nested functions and static blocks are scoped to
              // them, so there is nothing to collect there.
              FunctionParent(p: NodePath<>) {
                p.skip();
              },
              VariableDeclaration: collect,
            });
          }
          const scope =
            path.scope.getFunctionParent() ?? path.scope.getProgramParent();
          for (const name of hoisted) {
            scope.push({id: t.identifier(name)});
          }

          if (result.value || node.alternate) {
            const valueIsTruthy = Boolean(result.value);
            // $FlowFixMe[incompatible-type]
            path.replaceWith(valueIsTruthy ? node.consequent : node.alternate);
          } else if (!result.value) {
            path.remove();
          }
        }
      },
    };

  const Expression: VisitNode<
    BabelNodeUnaryExpression | BabelNodeBinaryExpression,
    State,
  > =
    // $FlowFixMe[incompatible-type]
    {
      exit(path) {
        const result = evaluate(path);

        if (result.confident) {
          path.replaceWith(t.valueToNode(result.value));
          path.skip();
        }
      },
    };

  const LogicalExpression = {
    exit(path: NodePath<BabelNodeLogicalExpression>) {
      const node = path.node;
      const result = evaluate(path.get('left'));

      if (result.confident) {
        const value = result.value;

        switch (node.operator) {
          case '||':
            path.replaceWith(value ? node.left : node.right);
            break;

          case '&&':
            path.replaceWith(value ? node.right : node.left);
            break;

          case '??':
            path.replaceWith(value == null ? node.right : node.left);
            break;
        }
      }
    },
  };

  const Program = {
    enter(path: NodePath<BabelNodeProgram>, state: State): void {
      state.stripped = false;
      state.droppedNodes = new Set();
    },

    exit(path: NodePath<BabelNodeProgram>, state: State): void {
      path.traverse(
        {
          ArrowFunctionExpression: FunctionExpression,
          ConditionalExpression: Conditional,
          // $FlowFixMe[incompatible-type]
          FunctionDeclaration,
          FunctionExpression,
          IfStatement: Conditional,
        },
        state,
      );

      if (state.stripped) {
        traverse.cache.clearScope();
        path.scope.crawl();

        // Re-traverse all program, if we removed any blocks. Manually re-call
        // enter and exit, because traversing a Program node won't call them.
        Program.enter(path, state);
        path.traverse(visitor, {stripped: false, droppedNodes: new Set()});
        Program.exit(path, state);
      }
    },
  };

  const visitor: Visitor<State> = {
    BinaryExpression: Expression,
    // $FlowFixMe[incompatible-type]
    LogicalExpression,
    Program: {...Program}, // Babel mutates objects passed.
    UnaryExpression: Expression,
  };

  return {visitor};
}
