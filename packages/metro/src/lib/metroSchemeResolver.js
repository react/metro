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

import {
  INLINE_MODULE_SPECIFIER,
  resolveInlineModule,
} from './resolveInlineModule';
import * as path from 'node:path';

const BABEL_RUNTIME_SPECIFIER = 'babel-runtime';
const BABEL_RUNTIME_PACKAGE = '@babel/runtime';

// Resolved on first use rather than at module load, so that importing this
// module (e.g. transitively from a resolution context) cannot fail in projects
// that never emit a `metro:` specifier.
let babelRuntimePackageJsonPath: ?string = null;

function getBabelRuntimePackageJsonPath(): string {
  if (babelRuntimePackageJsonPath == null) {
    const metroRuntimeDir = path.dirname(
      require.resolve('metro-runtime/package.json'),
    );
    babelRuntimePackageJsonPath = require.resolve(
      '@babel/runtime/package.json',
      {paths: [metroRuntimeDir]},
    );
  }
  return babelRuntimePackageJsonPath;
}

/**
 * Resolver used for Metro's own `metro:` URI scheme, handling
 * metro:babel-runtime (and subpaths) and metro:inline modules.
 */
export default ((context, specifier, platform) => {
  const {protocol, pathname} = new URL(specifier);

  if (
    pathname === INLINE_MODULE_SPECIFIER ||
    pathname.startsWith(INLINE_MODULE_SPECIFIER + ';') ||
    pathname.startsWith(INLINE_MODULE_SPECIFIER + ',')
  ) {
    return resolveInlineModule(context, pathname);
  }

  // Maps `metro:babel-runtime` (and subpaths, e.g.
  // `metro:babel-runtime/helpers/interopRequireDefault`) to metro-runtime's
  // `@babel/runtime` dependency, so injected Babel helpers resolve
  // deterministically regardless of where `@babel/runtime` is hoisted. The
  // `@babel/runtime` root is resolved via Node (above), the subpath is then
  // resolved by Metro as a package self-reference, with the origin inside
  // `@babel/runtime` so its `exports` map is applied.
  if (
    pathname === BABEL_RUNTIME_SPECIFIER ||
    pathname.startsWith(BABEL_RUNTIME_SPECIFIER + '/')
  ) {
    const subpath = pathname.slice(BABEL_RUNTIME_SPECIFIER.length);
    return context.resolveRequest(
      {...context, originModulePath: getBabelRuntimePackageJsonPath()},
      BABEL_RUNTIME_PACKAGE + subpath,
      platform,
    );
  }

  throw new Error(`Unsupported '${protocol}' pathname: ${pathname}`);
}) as CustomResolver;
