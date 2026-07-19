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

import type {Scope} from '@babel/traverse';
import type {CallExpression, MemberExpression} from '@babel/types';
// Type only import. No runtime dependency
// eslint-disable-next-line import/no-extraneous-dependencies
import typeof * as Types from '@babel/types';

const importMap = new Map([['ReactNative', 'react-native']]);

type PlatformChecks = {
  isPlatformNode: (
    node: MemberExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ) => boolean,
  isPlatformSelectNode: (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ) => boolean,
};

export default function createInlinePlatformChecks(
  t: Types,
  requireName: string = 'require',
): PlatformChecks {
  const {
    isIdentifier,
    isStringLiteral,
    isNumericLiteral,
    isMemberExpression,
    isCallExpression,
  } = t;
  const isPlatformNode = (
    node: MemberExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ): boolean =>
    isPlatformOS(node, scope, isWrappedModule) ||
    isReactPlatformOS(node, scope, isWrappedModule);

  const isPlatformSelectNode = (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ): boolean =>
    isPlatformSelect(node, scope, isWrappedModule) ||
    isReactPlatformSelect(node, scope, isWrappedModule);

  const isPlatformOS = (
    node: MemberExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ): boolean =>
    isIdentifier(node.property, {name: 'OS'}) &&
    isImportOrGlobal(node.object, scope, [{name: 'Platform'}], isWrappedModule);

  const isReactPlatformOS = (
    node: MemberExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ): boolean =>
    isIdentifier(node.property, {name: 'OS'}) &&
    isMemberExpression(node.object) &&
    isIdentifier(node.object.property, {name: 'Platform'}) &&
    isImportOrGlobal(
      // $FlowFixMe[incompatible-type]
      node.object.object,
      scope,
      [{name: 'React'}, {name: 'ReactNative'}],
      isWrappedModule,
    );

  const isPlatformSelect = (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ): boolean =>
    isMemberExpression(node.callee) &&
    isIdentifier(node.callee.property, {name: 'select'}) &&
    isImportOrGlobal(
      // $FlowFixMe[incompatible-type]
      node.callee.object,
      scope,
      [{name: 'Platform'}],
      isWrappedModule,
    );

  const isReactPlatformSelect = (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ): boolean =>
    isMemberExpression(node.callee) &&
    isIdentifier(node.callee.property, {name: 'select'}) &&
    isMemberExpression(node.callee.object) &&
    isIdentifier(node.callee.object.property, {name: 'Platform'}) &&
    isImportOrGlobal(
      // $FlowFixMe[incompatible-type]
      // $FlowFixMe[incompatible-use]
      node.callee.object.object,
      scope,
      [{name: 'React'}, {name: 'ReactNative'}],
      isWrappedModule,
    );

  const isRequireCall = (
    node: BabelNodeExpression,
    dependencyId: string,
    scope: Scope,
  ): boolean =>
    isCallExpression(node) &&
    isIdentifier(node.callee, {name: requireName}) &&
    checkRequireArgs(node.arguments, dependencyId);

  const isImport = (
    node: BabelNodeExpression,
    scope: Scope,
    patterns: Array<{name: string}>,
  ): boolean => {
    if (isMemberExpression(node) && 'name' in node.object) {
      const binding = scope.getBinding(node.object.name);
      if (
        binding &&
        binding.path.isVariableDeclarator() &&
        isCallExpression(binding.path.node.init) &&
        isIdentifier(binding.path.node.init.callee, {name: requireName}) &&
        binding.path.node.init?.arguments &&
        checkRequireArgs(binding.path.node.init.arguments, 'react-native')
      ) {
        return true;
      }
    }

    return patterns.some((pattern: {name: string}) => {
      const importName = importMap.get(pattern.name) || pattern.name;
      return isRequireCall(node, importName, scope);
    });
  };

  const isImportOrGlobal = (
    node: BabelNodeExpression,
    scope: Scope,
    patterns: Array<{name: string}>,
    isWrappedModule: boolean,
  ): boolean => {
    const identifier = patterns.find((pattern: {name: string}) =>
      isIdentifier(node, pattern),
    );
    if (
      !!identifier &&
      isToplevelBinding(scope.getBinding(identifier.name), isWrappedModule)
    ) {
      return true;
    }
    if (isImport(node, scope, patterns)) {
      return true;
    }
    if (isIdentifier(node)) {
      const binding = scope.getBinding(node.name);
      if (
        binding != null &&
        isToplevelBinding(binding, isWrappedModule) &&
        binding.path.isVariableDeclarator()
      ) {
        const init = binding.path.node.init;
        // $FlowFixMe[incompatible-type] Flow doesn't narrow binding.path.node through isVariableDeclarator()
        if (init != null && isImport(init, scope, patterns)) {
          return true;
        }
      }
    }
    return false;
  };

  const checkRequireArgs = (
    args: Array<
      | BabelNodeExpression
      | BabelNodeSpreadElement
      | BabelNodeArgumentPlaceholder,
    >,
    dependencyId: string,
  ): boolean => {
    const pattern = t.stringLiteral(dependencyId);
    return (
      isStringLiteral(args[0], pattern) ||
      (isMemberExpression(args[0]) &&
        isNumericLiteral(args[0].property) &&
        isStringLiteral(args[1], pattern))
    );
  };

  const isToplevelBinding = (
    binding: void | $FlowFixMe,
    isWrappedModule: boolean,
  ): boolean =>
    !binding ||
    !binding.scope.parent ||
    (isWrappedModule && !binding.scope.parent.parent);

  return {
    isPlatformNode,
    isPlatformSelectNode,
  };
}
