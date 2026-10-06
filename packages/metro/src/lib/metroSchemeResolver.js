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

import type {CustomResolver} from 'metro-resolver';

import {getMetroBabelRuntimePackageJsonPath} from './metroBabelRuntime';

const BABEL_RUNTIME_SPECIFIER = 'babel-runtime';
const BABEL_RUNTIME_PACKAGE = '@babel/runtime';

/**
 * Resolver used for Metro's own `metro:` URI scheme, currently handling only
 * metro:babel-runtime and subpaths.
 */
export default ((context, specifier, platform) => {
  const {protocol, pathname} = new URL(specifier);

  // Maps `metro:babel-runtime` (and subpaths, e.g.
  // `metro:babel-runtime/helpers/interopRequireDefault`) to metro-runtime's
  // `@babel/runtime` dependency, so injected Babel helpers resolve
  // deterministically regardless of where `@babel/runtime` is hoisted. The
  // `@babel/runtime` root is resolved via Node (see `metroBabelRuntime`), the subpath is then
  // resolved by Metro as a package self-reference, with the origin inside
  // `@babel/runtime` so its `exports` map is applied.
  if (
    pathname === BABEL_RUNTIME_SPECIFIER ||
    pathname.startsWith(BABEL_RUNTIME_SPECIFIER + '/')
  ) {
    const subpath = pathname.slice(BABEL_RUNTIME_SPECIFIER.length);
    return context.resolveRequest(
      {...context, originModulePath: getMetroBabelRuntimePackageJsonPath()},
      BABEL_RUNTIME_PACKAGE + subpath,
      platform,
    );
  }

  throw new Error(`Unsupported '${protocol}' pathname: ${pathname}`);
}) as CustomResolver;
