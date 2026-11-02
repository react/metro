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

import type {ResolutionContext, VirtualResolution} from 'metro-resolver';

import crypto from 'node:crypto';
import path from 'node:path';

export const INLINE_MODULE_SPECIFIER = 'inline';

// 64 bits, enough that distinct sources beside one importer never share a
// path. A collision would be two sources at one virtual path, which Metro
// reports as an error rather than bundling either.
const INLINE_MODULE_HASH_LENGTH = 16;

/**
 * Resolves the `inline` pathname of Metro's own URI scheme, so that a transform
 * may emit a module inline in its importer:
 *
 *   require('metro:inline;base64,ZXhwb3J0IGRlZmF1bHQgMQ==')
 *
 * The payload is the module's source, encoded as in a `data:` URL. Unlike a
 * `data:` URL, an inline module belongs to its importer: the same payload in
 * two modules is two modules, and imports inside it resolve exactly as they
 * would from the importer. That is what makes it usable for modules a
 * transform derives from the importing file, which is not what `data:`
 * promises, so it is deliberately not spelled `data:`.
 *
 * Its virtual path sits beside the importer, with the importer's extension and
 * a hash of the source in its name: `App.tsx` imports `App.inline-<hash>.tsx`.
 * So each distinct inline module gets its own path, the same source spelled
 * two ways is one module, and the transform treats it as the importer's kind
 * of file.
 *
 * The result is a pure function of (origin module, specifier). Nothing on disk
 * can invalidate it.
 */
export function resolveInlineModule(
  context: ResolutionContext,
  pathname: string,
): VirtualResolution {
  const commaIndex = pathname.indexOf(',');
  if (commaIndex === -1) {
    throw new Error(`Malformed inline module specifier: metro:${pathname}`);
  }
  const parameters = pathname
    .slice(INLINE_MODULE_SPECIFIER.length, commaIndex)
    .split(';')
    .map(part => part.trim().toLowerCase())
    .filter(part => part !== '');
  const payload = pathname.slice(commaIndex + 1);

  for (const parameter of parameters) {
    if (parameter !== 'base64') {
      throw new Error(
        `Unsupported parameter '${parameter}' in inline module specifier: metro:${pathname}`,
      );
    }
  }

  const source = parameters.includes('base64')
    ? Buffer.from(payload, 'base64').toString('utf8')
    : decodeURIComponent(payload);

  const {dir, name, ext} = path.parse(context.originModulePath);
  const hash = crypto
    .createHash('sha1')
    .update(source)
    .digest('hex')
    .slice(0, INLINE_MODULE_HASH_LENGTH);
  return {
    type: 'virtualModule',
    virtualPath: path.join(dir, `${name}.inline-${hash}${ext}`),
    source,
  };
}
