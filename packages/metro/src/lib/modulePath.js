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

import {normalizePathSeparatorsToPosix} from './pathUtils';
import path from 'node:path';

/**
 * The namespace of virtual module paths in the graph. A virtual module's path
 * is this prefix followed by its absolute virtual path, so it can never equal
 * the absolute path of a real file, and anything that mistakes it for one
 * fails rather than reading the wrong file.
 */
const VIRTUAL_MODULE_NAMESPACE = 'virtual:';

/**
 * The URL search parameter that marks a virtual module. A virtual module's URL
 * is the one a file at its virtual path would have, plus this parameter.
 */
export const VIRTUAL_MODULE_URL_PARAM = 'virtual';

/**
 * The graph path of the virtual module at `virtualPath`. A virtual path names
 * exactly one module: the same virtual path with different source is a
 * modification of that module, as an edit to a file is.
 */
export function deriveVirtualModulePath(virtualPath: string): string {
  return VIRTUAL_MODULE_NAMESPACE + virtualPath;
}

export function isVirtualModulePath(modulePath: string): boolean {
  return modulePath.startsWith(VIRTUAL_MODULE_NAMESPACE);
}

/**
 * The path a module is resolved from, transformed as, and addressed by in
 * URLs. For a virtual module this is its virtual path, so imports inside it
 * resolve from that path's directory and path-based transform configuration,
 * extension checks included, behaves as for a file at that path. Otherwise it
 * is the module path itself.
 */
export function getModuleSourcePath(modulePath: string): string {
  return isVirtualModulePath(modulePath)
    ? modulePath.slice(VIRTUAL_MODULE_NAMESPACE.length)
    : modulePath;
}

/**
 * A module path for display, as in development module names: relative to
 * `rootDir` with POSIX separators, and namespaced if the module is virtual.
 */
export function getModuleDisplayPath(
  modulePath: string,
  rootDir: string,
): string {
  const relativePath = normalizePathSeparatorsToPosix(
    path.relative(rootDir, getModuleSourcePath(modulePath)),
  );
  return isVirtualModulePath(modulePath)
    ? VIRTUAL_MODULE_NAMESPACE + relativePath
    : relativePath;
}

/**
 * Whether a URL addresses a virtual module. Its path is the module's virtual
 * path, which may also be a real file's, so such a URL must never be served as
 * that file.
 */
export function isVirtualModuleUrl(searchParams: URLSearchParams): boolean {
  return searchParams.has(VIRTUAL_MODULE_URL_PARAM);
}
