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
import type {
  CallExpression,
  MemberExpression,
  Node,
  ObjectExpression,
} from '@babel/types';
// type only import. No runtime dependency
// eslint-disable-next-line import/no-extraneous-dependencies
import typeof * as Types from '@babel/types';

import createInlinePlatformChecks from './utils/createInlinePlatformChecks';

export type Options = Readonly<{
  dev: boolean,
  inlinePlatform: boolean,
  isWrapped: boolean,
  requireName?: string,
  platform: string,
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
  const {
    isIdentifier,
    isMemberExpression,
    isObjectExpression,
    isObjectMethod,
    isObjectProperty,
    isSpreadElement,
    isStringLiteral,
  } = t;
  const {isPlatformNode, isPlatformSelectNode} = createInlinePlatformChecks(
    t,
    options.requireName ?? 'require',
  );

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

  function findProperty(
    objectExpression: ObjectExpression,
    key: string,
    fallback: () => Node,
  ): Node {
    // Object literal evaluation keeps the last definition of a duplicate key.
    for (let i = objectExpression.properties.length - 1; i >= 0; i--) {
      const p = objectExpression.properties[i];
      if (!isObjectProperty(p) && !isObjectMethod(p)) {
        continue;
      }
      if (
        (isIdentifier(p.key) && p.key.name === key) ||
        (isStringLiteral(p.key) && p.key.value === key)
      ) {
        if (isObjectProperty(p)) {
          return p.value;
        } else if (isObjectMethod(p)) {
          return t.toExpression(p);
        }
      }
    }

    return fallback();
  }

  function hasStaticProperties(objectExpression: ObjectExpression): boolean {
    return objectExpression.properties.every(p => {
      if (p.computed === true || isSpreadElement(p)) {
        return false;
      }
      if (isObjectMethod(p) && p.kind !== 'method') {
        return false;
      }

      return isIdentifier(p.key) || isStringLiteral(p.key);
    });
  }

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

        if (!isWriteTarget(path)) {
          if (
            opts.inlinePlatform &&
            isPlatformNode(node, scope, !!opts.isWrapped)
          ) {
            path.replaceWith(t.stringLiteral(opts.platform));
          } else if (!opts.dev && isProcessEnvNodeEnv(node, scope)) {
            path.replaceWith(
              t.stringLiteral(opts.dev ? 'development' : 'production'),
            );
          }
        }
      },
      CallExpression(path: NodePath<CallExpression>, state: State): void {
        const node = path.node;
        const scope = path.scope;
        const arg = node.arguments[0];
        const opts = state.opts;

        if (
          opts.inlinePlatform &&
          isPlatformSelectNode(node, scope, !!opts.isWrapped) &&
          isObjectExpression(arg)
        ) {
          if (hasStaticProperties(arg)) {
            const fallback = () =>
              findProperty(arg, 'native', () =>
                findProperty(arg, 'default', () => t.identifier('undefined')),
              );
            const selected = findProperty(arg, opts.platform, fallback);

            if (
              arg.properties.every(
                property =>
                  (isObjectProperty(property) && property.value === selected) ||
                  scope.isPure(property),
              )
            ) {
              path.replaceWith(selected);
            }
          }
        }
      },
    },
  };
}
