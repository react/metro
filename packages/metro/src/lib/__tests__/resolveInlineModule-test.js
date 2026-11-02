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

'use strict';

import metroSchemeResolver from '../metroSchemeResolver';
import {createResolutionContext} from 'metro-resolver/private/__tests__/utils';
import crypto from 'node:crypto';
import path from 'node:path';

const ORIGIN = '/root/project/foo.js';

// The virtual path an inline module with `source` gets when imported from
// ORIGIN.
function inlinePath(source: string) {
  const hash = crypto
    .createHash('sha1')
    .update(source)
    .digest('hex')
    .slice(0, 16);
  return path.join(path.dirname(ORIGIN), `foo.inline-${hash}.js`);
}

function resolve(specifier: string) {
  return metroSchemeResolver(
    {
      ...createResolutionContext({}),
      originModulePath: ORIGIN,
      resolveRequest: () => {
        throw new Error('inline module resolution must not delegate');
      },
    },
    specifier,
    null,
  );
}

test('decodes a base64 payload into a virtual module beside the importer', () => {
  const source = 'export default 1;';
  expect(
    resolve('metro:inline;base64,' + Buffer.from(source).toString('base64')),
  ).toEqual({
    type: 'virtualModule',
    virtualPath: inlinePath(source),
    source,
  });
});

test('decodes a percent-encoded payload', () => {
  expect(resolve('metro:inline,export%20default%20%22a%2Cb%22%3B')).toEqual({
    type: 'virtualModule',
    virtualPath: inlinePath('export default "a,b";'),
    source: 'export default "a,b";',
  });
});

function virtualPathOf(specifier: string): ?string {
  const resolution = resolve(specifier);
  if (resolution.type !== 'virtualModule') {
    throw new Error('Expected a virtual module');
  }
  return resolution.virtualPath;
}

test('the same source in either encoding has one virtual path', () => {
  expect(virtualPathOf('metro:inline;base64,MQ==')).toBe(
    virtualPathOf('metro:inline,1'),
  );
});

test('different sources have different virtual paths', () => {
  expect(virtualPathOf('metro:inline,1')).not.toBe(
    virtualPathOf('metro:inline,2'),
  );
});

test('ignores the case of the parameters', () => {
  expect(resolve('metro:inline;BASE64,MQ==')).toMatchObject({source: '1'});
});

test('rejects an unknown parameter', () => {
  expect(() => resolve('metro:inline;gzip,hello')).toThrow(
    "Unsupported parameter 'gzip'",
  );
});

test('rejects a specifier with no payload separator', () => {
  expect(() => resolve('metro:inline')).toThrow(
    'Malformed inline module specifier',
  );
});
