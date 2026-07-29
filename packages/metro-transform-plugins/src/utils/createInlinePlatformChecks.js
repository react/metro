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

const PLATFORM_MODULE_RELATIVE_IMPORTS = /^(\.\.?\/).*Platform(\.js)?$/;

const allowedPlatformImports = [
  // 1. ES imports: `import {Platform} from 'react-native'`
  (importSource: string): boolean => importSource === 'react-native',
  // 2. Relative imports inside react-native package: `import Platform from '../../Utilities/Platform'`
  (importSource: string): boolean =>
    PLATFORM_MODULE_RELATIVE_IMPORTS.test(importSource),
  // 3. Haste modules `require('Platform')`
  (importSource: string): boolean => importSource === 'Platform',
  // 4. Exotic imports `require('React').Platform`
  (importSource: string): boolean => importSource === 'React',
];

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
    isIdentifier(node.property, {name: 'OS'}) &&
    (isPlatformOS(node, scope, isWrappedModule) ||
      isReactPlatformOS(node, scope, isWrappedModule) ||
      isPlatformDefaultOS(node, scope, isWrappedModule, filename));

  const isPlatformSelectNode = (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
    filename?: string,
  ): boolean =>
    isMemberExpression(node.callee) &&
    isIdentifier(node.callee.property, {name: 'select'}) &&
    (isPlatformSelect(node, scope, isWrappedModule) ||
      isReactPlatformSelect(node, scope, isWrappedModule) ||
      isPlatformDefaultSelect(node, scope, isWrappedModule, filename));

  /**
   * Platform.OS
   */
  const isPlatformOS = (
    node: MemberExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ): boolean =>
    isImportOrGlobal(node.object, scope, [{name: 'Platform'}], isWrappedModule);

  /**
   * React.Platform.OS
   */
  const isReactPlatformOS = (
    node: MemberExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ): boolean =>
    isMemberExpression(node.object) &&
    isIdentifier(node.object.property, {name: 'Platform'}) &&
    isImportOrGlobal(
      // $FlowFixMe[incompatible-type]
      node.object.object,
      scope,
      [{name: 'React'}, {name: 'ReactNative'}],
      isWrappedModule,
    );

  /**
   * `_Platform.default.OS`
   */
  const isPlatformDefaultOS = (
    node: MemberExpression,
    scope: Scope,
    isWrappedModule: boolean,
    filename?: string,
  ): boolean =>
    isReactNativeFile(filename) &&
    isMemberExpression(node.object) &&
    isIdentifier(node.object.property, {name: 'default'}) &&
    isIdentifier(node.object.object, {name: '_Platform'}) &&
    isImportOrGlobal(
      // $FlowFixMe[incompatible-type]
      node.object.object,
      scope,
      [],
      isWrappedModule,
    );

  /**
   * Platform.select(...)
   */
  const isPlatformSelect = (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ): boolean =>
    isImportOrGlobal(
      // $FlowFixMe[incompatible-type]
      node.callee.object,
      scope,
      [{name: 'Platform'}],
      isWrappedModule,
    );

  /**
   * React.Platform.select(...)
   */
  const isReactPlatformSelect = (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ): boolean =>
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

  /**
   * _Platform.default.select(...)
   */
  const isPlatformDefaultSelect = (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
    filename?: string,
  ): boolean =>
    isReactNativeFile(filename) &&
    isMemberExpression(node.callee.object) &&
    isIdentifier(node.callee.object.property, {name: 'default'}) &&
    // $FlowFixMe[incompatible-type]
    // $FlowFixMe[incompatible-use]
    isIdentifier(node.callee.object.object, {name: '_Platform'}) &&
    isImportOrGlobal(
      // $FlowFixMe[incompatible-type]
      // $FlowFixMe[incompatible-use]
      node.callee.object.object,
      scope,
      [],
      isWrappedModule,
    );

  const isRequireCall = (node: BabelNodeExpression): boolean =>
    // 1. Simple case: `require('react-native')`
    (isCallExpression(node) &&
      isIdentifier(node.callee, {name: requireName}) &&
      checkRequireArgs(node.arguments)) ||
    // 2. Require a babel helpers
    // ```
    // // Before
    // import Platform from '../Platform';
    // import * as RN from 'react-native';
    // // After
    // var _Platform = _interopRequireDefault(require('../Platform'));
    // var RN = _interopRequireWildcard(require('react-native'));
    // ```
    ((isIdentifier(node.callee, {name: '_interopRequireDefault'}) ||
      isIdentifier(node.callee, {name: '_interopRequireWildcard'})) &&
      // $FlowFixMe[incompatible-type]
      // $FlowFixMe[incompatible-use]
      isRequireCall(node.arguments[0]));

  const isImport = (node: BabelNodeExpression): boolean => isRequireCall(node);

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
      identifier != null &&
      isToplevelBinding(scope.getBinding(identifier.name), isWrappedModule)
    ) {
      return true;
    }
    if (isImport(node)) {
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
        if (init != null && isImport(init)) {
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
  ): boolean => {
    return (
      // Basic case: `require('<module name>')`
      (isStringLiteral(args[0]) &&
        allowedPlatformImports.some(
          check => typeof args[0].value === 'string' && check(args[0].value),
        )) ||
      // Transformed require calls: `require(arbitraryMapName[321], '<module name>')`
      (isMemberExpression(args[0]) &&
        isNumericLiteral(args[0].property) &&
        isStringLiteral(args[1]) &&
        allowedPlatformImports.some(
          check => typeof args[1].value === 'string' && check(args[1].value),
        ))
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
