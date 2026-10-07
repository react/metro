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

import crypto from 'node:crypto';

const VIRTUAL_MODULE_SUFFIX = '?virtual=';
const VIRTUAL_MODULE_SUFFIX_RE = /\?virtual=[0-9a-f]{40}$/;

/**
 * The graph identity of a virtual module: its virtual path, followed by a
 * suffix derived from a hash of the module's source.
 *
 * The suffix is identity only. Resolution and transformation see the bare
 * virtual path (see `getVirtualPath`), so imports inside the virtual module
 * resolve from that path's directory and path-based transform configuration,
 * extension checks included, behaves as for a file at that path. Folding the
 * source hash into the id means a change to the source is a new module, with
 * no separate staleness signal.
 */
export function deriveVirtualModulePath(
  virtualPath: string,
  source: string | Buffer,
): string {
  return (
    virtualPath +
    VIRTUAL_MODULE_SUFFIX +
    crypto.createHash('sha1').update(source).digest('hex')
  );
}

export function isVirtualModulePath(modulePath: string): boolean {
  return VIRTUAL_MODULE_SUFFIX_RE.test(modulePath);
}

/**
 * The path a module is resolved from and transformed as: for a virtual module,
 * its virtual path with the identity suffix removed, and otherwise the module
 * path itself.
 */
export function getVirtualPath(modulePath: string): string {
  return modulePath.replace(VIRTUAL_MODULE_SUFFIX_RE, '');
}
