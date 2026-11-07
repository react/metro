/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

import type {PluginObj} from '@babel/core';
import type {Binding, NodePath, Scope} from '@babel/traverse';
import type {MemberExpression, Node} from '@babel/types';
// type only import. No runtime dependency
// eslint-disable-next-line import/no-extraneous-dependencies
import typeof * as Types from '@babel/types';

export type Options = Readonly<{
  dev: boolean,
}>;

type State = {opts: Options};

const env = {name: 'env'};
const nodeEnv = {name: 'NODE_ENV'};
const processId = {name: 'process'};

const dev = {name: '__DEV__'};

export default function inlinePlugin(
  {types: t}: {types: Types},
  options: Options,
): PluginObj<State> {
  const {isIdentifier, isMemberExpression} = t;

  function isGlobal(binding: ?Binding): boolean {
    return !binding;
  }

  const isFlowDeclared = (binding: Binding) =>
    t.isDeclareVariable(binding.path);

  function isGlobalOrFlowDeclared(binding: ?Binding): boolean {
    return !binding || isFlowDeclared(binding);
  }

  function isWriteTarget(path: NodePath<MemberExpression>): boolean {
    let child: Node = path.node;
    let parentPath = path.parentPath;

    while (parentPath != null) {
      const parent = parentPath.node;
      if (
        (parent.type === 'AssignmentExpression' ||
          parent.type === 'ForInStatement' ||
          parent.type === 'ForOfStatement') &&
        parent.left === child
      ) {
        return true;
      }
      if (parent.type === 'UpdateExpression' && parent.argument === child) {
        return true;
      }
      if (
        parent.type === 'UnaryExpression' &&
        parent.operator === 'delete' &&
        parent.argument === child
      ) {
        return true;
      }

      const nestedWriteTarget =
        parent.type === 'ArrayPattern' ||
        parent.type === 'ObjectPattern' ||
        (parent.type === 'ObjectProperty' && parent.value === child) ||
        (parent.type === 'RestElement' && parent.argument === child) ||
        (parent.type === 'AssignmentPattern' && parent.left === child);
      if (!nestedWriteTarget) {
        return false;
      }

      child = parent;
      parentPath = parentPath.parentPath;
    }
    return false;
  }

  const isProcessEnvNodeEnv = (node: MemberExpression, scope: Scope): boolean =>
    isIdentifier(node.property, nodeEnv) &&
    isMemberExpression(node.object) &&
    isIdentifier(node.object.property, env) &&
    isIdentifier(node.object.object, processId) &&
    isGlobal(scope.getBinding(processId.name));

  const isDev = (node: Node, parent: Node, scope: Scope): boolean =>
    isIdentifier(node, dev) &&
    isGlobalOrFlowDeclared(scope.getBinding(dev.name));

  return {
    visitor: {
      ReferencedIdentifier(path: NodePath<Node>, state: State): void {
        if (!state.opts.dev && isDev(path.node, path.parent, path.scope)) {
          path.replaceWith(t.booleanLiteral(state.opts.dev));
        }
      },
      MemberExpression(path: NodePath<MemberExpression>, state: State): void {
        const node = path.node;
        const scope = path.scope;
        const opts = state.opts;

        if (
          !opts.dev &&
          !isWriteTarget(path) &&
          isProcessEnvNodeEnv(node, scope)
        ) {
          path.replaceWith(t.stringLiteral('production'));
        }
      },
    },
  };
}
