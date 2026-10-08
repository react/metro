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

/**
 * The graph identity of a virtual module: its virtual path, followed by a
 * suffix derived from a hash of the specifier that resolved to it.
 *
 * Identity is deliberately independent of the module's source, so that a
 * change in what the resolver produces for the same specifier is a
 * modification of the same module, as an edit to a file is, rather than a new
 * module. The transform cache key is content-addressed separately, and the
 * graph re-transforms a virtual module when the source its edge supplies
 * changes (see `buildSubgraph`).
 *
 * The suffix is identity only and is never parsed back. Resolution and
 * transformation see the bare virtual path, carried beside the source on the
 * dependency edge, so imports inside the virtual module resolve from that
 * path's directory and path-based transform configuration, extension checks
 * included, behaves as for a file at that path.
 */
export function deriveVirtualModulePath(
  virtualPath: string,
  specifier: string,
): string {
  return (
    virtualPath +
    VIRTUAL_MODULE_SUFFIX +
    crypto.createHash('sha1').update(specifier).digest('hex')
  );
}
