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
 * The graph identity of a virtual module: the origin path, followed by a
 * suffix derived from a hash of the module's source.
 *
 * Anchoring the id at the origin path keeps `path.dirname` and
 * `path.relative` meaningful, so imports inside the virtual module resolve
 * from the origin's directory and the transform cache key is portable across
 * machines. Folding the source hash into the id means the id fully determines
 * the transform input, so a change to the source is a new module and a new
 * transform cache key, with no separate staleness signal.
 */
export function deriveVirtualModulePath(
  originModulePath: string,
  source: string,
): string {
  return (
    originModulePath +
    VIRTUAL_MODULE_SUFFIX +
    crypto.createHash('sha1').update(source).digest('hex')
  );
}

export function isVirtualModulePath(modulePath: string): boolean {
  return modulePath.includes(VIRTUAL_MODULE_SUFFIX);
}
