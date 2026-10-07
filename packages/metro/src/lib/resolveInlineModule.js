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

export const INLINE_MODULE_SPECIFIER = 'inline';

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

  return {
    type: 'virtualModule',
    originModulePath: context.originModulePath,
    source,
  };
}
