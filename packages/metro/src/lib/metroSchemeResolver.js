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
import {getMetroRuntimePackageJsonPath} from './metroRuntime';
import {
  INLINE_MODULE_SPECIFIER,
  resolveInlineModule,
} from './resolveInlineModule';

const BABEL_RUNTIME_SPECIFIER = 'babel-runtime';
const BABEL_RUNTIME_PACKAGE = '@babel/runtime';
const RUNTIME_SPECIFIER = 'runtime';
const RUNTIME_PACKAGE = 'metro-runtime';

/**
 * Resolver used for Metro's own `metro:` URI scheme, handling
 * metro:babel-runtime, metro:runtime (and their subpaths) and metro:inline
 * modules.
 */
export default ((context, specifier, platform) => {
  const {protocol, pathname} = new URL(specifier);

  if (
    pathname === INLINE_MODULE_SPECIFIER ||
    pathname.startsWith(INLINE_MODULE_SPECIFIER + ';') ||
    pathname.startsWith(INLINE_MODULE_SPECIFIER + ',')
  ) {
    return resolveInlineModule(context, specifier);
  }

  // Maps `metro:babel-runtime` (and subpaths, e.g.
  // `metro:babel-runtime/helpers/interopRequireDefault`) to metro-runtime's
  // `@babel/runtime` dependency, so injected Babel helpers resolve
  // deterministically regardless of where `@babel/runtime` is hoisted. The
  // `@babel/runtime` root is resolved via Node (see `metroBabelRuntime`), the
  // subpath is then resolved by Metro as a package self-reference, with the
  // origin inside `@babel/runtime` so its `exports` map is applied.
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

  // Maps `metro:runtime/<subpath>` (e.g. `metro:runtime/modules/asyncRequire`)
  // to the metro-runtime that Metro depends on, so that modules Metro injects
  // into transformed code resolve from any importer, including library code
  // that cannot see metro-runtime under an isolated `node_modules` layout.
  // The subpath is resolved as a package self-reference, like
  // `metro:babel-runtime`. Subpaths such as `modules/asyncRequire` exist only
  // in metro-runtime's `exports`, so package exports are enabled here
  // regardless of the project's `unstable_enablePackageExports` setting.
  if (
    pathname === RUNTIME_SPECIFIER ||
    pathname.startsWith(RUNTIME_SPECIFIER + '/')
  ) {
    const subpath = pathname.slice(RUNTIME_SPECIFIER.length);
    return context.resolveRequest(
      {
        ...context,
        originModulePath: getMetroRuntimePackageJsonPath(),
        unstable_enablePackageExports: true,
      },
      RUNTIME_PACKAGE + subpath,
      platform,
    );
  }

  throw new Error(`Unsupported '${protocol}' pathname: ${pathname}`);
}) as CustomResolver;
