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
    filename?: string,
  ) => boolean,
  isPlatformSelectNode: (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
    filename?: string,
  ) => boolean,
};

const REACT_NATIVE_MODULES_REGEX = /[\/\\]node_modules[\/\\]react-native[\/\\]/;

const isReactNativeFile = (filename?: string): boolean =>
  filename != null && REACT_NATIVE_MODULES_REGEX.test(filename);

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
    filename?: string,
  ): boolean =>
    isPlatformOS(node, scope, isWrappedModule, filename) ||
    isReactPlatformOS(node, scope, isWrappedModule, filename);

  const isPlatformSelectNode = (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
    filename?: string,
  ): boolean =>
    isPlatformSelect(node, scope, isWrappedModule, filename) ||
    isReactPlatformSelect(node, scope, isWrappedModule, filename);

  const isPlatformOS = (
    node: MemberExpression,
    scope: Scope,
    isWrappedModule: boolean,
    filename?: string,
  ): boolean =>
    isIdentifier(node.property, {name: 'OS'}) &&
    isImportOrGlobal(
      node.object,
      scope,
      [{name: 'Platform'}],
      isWrappedModule,
      filename,
    );

  const isReactPlatformOS = (
    node: MemberExpression,
    scope: Scope,
    isWrappedModule: boolean,
    filename?: string,
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
      filename,
    );

  const isPlatformSelect = (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
    filename?: string,
  ): boolean =>
    isMemberExpression(node.callee) &&
    isIdentifier(node.callee.property, {name: 'select'}) &&
    isImportOrGlobal(
      // $FlowFixMe[incompatible-type]
      node.callee.object,
      scope,
      [{name: 'Platform'}],
      isWrappedModule,
      filename,
    );

  const isReactPlatformSelect = (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
    filename?: string,
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
      filename,
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
  ): boolean =>
    patterns.some((pattern: {name: string}) => {
      const importName = importMap.get(pattern.name) || pattern.name;
      return isRequireCall(node, importName, scope);
    });

  const isImportOrGlobal = (
    node: BabelNodeExpression,
    scope: Scope,
    patterns: Array<{name: string}>,
    isWrappedModule: boolean,
    filename?: string,
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
    // Special case for handling transformed relative ES imports:
    // Works only for RN files: `*/node_modules/react-native/**/*`
    //
    // ```tsx
    // 1. Source code
    // import Platform from '../../Utilities/Platform';
    // const test = Platform.OS === 'ios' ? 1 : 2;
    //
    // 2. After `@react-native/babel-preset`
    // var _Platform = _interopRequireDefault(require("../../Utilities/Platform"));
    // var test = _Platform.default.OS === 'ios' ? 1 : 2;
    // ```
    if (
      isReactNativeFile(filename) &&
      !identifier &&
      isMemberExpression(node)
    ) {
      const objIdentifier = patterns.find((pattern: {name: string}) =>
        isIdentifier(node.object, {name: `_${pattern.name}`}),
      );

      if (
        objIdentifier &&
        isToplevelBinding(
          scope.getBinding(`_${objIdentifier.name}`),
          isWrappedModule,
        ) &&
        isIdentifier(node.property, {name: 'default'})
      ) {
        return true;
      }
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
