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

// A URL parser moves or removes these, which leaves different but often still
// valid source, so they are rejected rather than read from a parsed URL.
const UNENCODED_CHARACTERS = /[?#\s]/;
const BASE64_CHARACTERS = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Resolves the `inline` pathname of Metro's own URI scheme, so that a transform
 * may emit a module inline in its importer:
 *
 *   require('metro:inline;base64,ZXhwb3J0IGRlZmF1bHQgMQ==')
 *
 * The payload is the module's source, percent-encoded or base64-encoded as in
 * a `data:` URL. Unlike a `data:` URL, an inline module belongs to its importer:
 * the same payload in two modules is two modules, and imports inside it resolve
 * exactly as they would from the importer. That is what makes it usable for
 * modules a transform derives from the importing file, which is not what
 * `data:` promises, so it is deliberately not spelled `data:`.
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
  specifier: string,
): VirtualResolution {
  const commaIndex = specifier.indexOf(',');
  if (commaIndex === -1 || UNENCODED_CHARACTERS.test(specifier)) {
    throw malformedSpecifierError(specifier);
  }
  const parameters = specifier
    .slice(
      specifier.indexOf(':') + 1 + INLINE_MODULE_SPECIFIER.length,
      commaIndex,
    )
    .split(';')
    .map(part => part.toLowerCase())
    .filter(part => part !== '');
  let payload;
  try {
    payload = decodeURIComponent(specifier.slice(commaIndex + 1));
  } catch {
    throw malformedSpecifierError(specifier);
  }

  for (const parameter of parameters) {
    if (parameter !== 'base64') {
      throw new Error(
        `Unsupported parameter '${parameter}' in inline module specifier: ${specifier}`,
      );
    }
  }

  let source = payload;
  if (parameters.includes('base64')) {
    if (!isBase64(payload)) {
      throw malformedSpecifierError(specifier);
    }
    source = Buffer.from(payload, 'base64').toString('utf8');
  }

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

// `Buffer.from` ignores invalid characters and an impossible trailing character,
// so a payload must be well formed before it is decoded. Padding is optional,
// but must be complete if present.
function isBase64(payload: string): boolean {
  return (
    BASE64_CHARACTERS.test(payload) &&
    payload.length % 4 !== 1 &&
    (!payload.endsWith('=') || payload.length % 4 === 0)
  );
}

function malformedSpecifierError(specifier: string): Error {
  return new Error(
    `Malformed inline module specifier, expected metro:inline,<percent-encoded source> or metro:inline;base64,<base64 source>: ${specifier}`,
  );
}
