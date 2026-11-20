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

test.each([
  ['an unencoded ?', 'metro:inline,module.exports = true ? 1 : 2;'],
  ['an encodeURI payload', 'metro:inline,' + encodeURI('true ? 1 : 2')],
  ['an unencoded #', 'metro:inline,a#b'],
  ['an unencoded newline', 'metro:inline,// c\nmodule.exports = 5;'],
  ['an unencoded tab', 'metro:inline,a\tb'],
  ['an unencoded space', 'metro:inline,a b'],
  ['a trailing space', 'metro:inline,a '],
  ['whitespace in a base64 payload', 'metro:inline;base64,MQ==\n'],
  ['whitespace in the parameters', 'metro:inline; base64,MQ=='],
  ['a character outside the base64 alphabet', 'metro:inline;base64,M*=='],
  ['the URL-safe base64 alphabet', 'metro:inline;base64,_-=='],
  ['misplaced base64 padding', 'metro:inline;base64,M=Q='],
  ['a base64 payload of an impossible length', 'metro:inline;base64,QUJDR'],
  ['a single base64 character', 'metro:inline;base64,Q'],
  ['incomplete base64 padding', 'metro:inline;base64,MQ='],
  ['a stray %', 'metro:inline,100%'],
  ['a stray % in a base64 payload', 'metro:inline;base64,MQ%'],
])('rejects %s', (_description, specifier) => {
  expect(() => resolve(specifier)).toThrow('Malformed inline module specifier');
});

test('accepts a large base64 payload', () => {
  const source = '// ' + 'x'.repeat(5 * 1024 * 1024);
  expect(
    resolve('metro:inline;base64,' + Buffer.from(source).toString('base64')),
  ).toMatchObject({source});
});

test('accepts unpadded base64', () => {
  expect(resolve('metro:inline;base64,MQ')).toMatchObject({source: '1'});
});

test('percent-decodes a base64 payload', () => {
  expect(resolve('metro:inline;base64,MQ%3D%3D')).toMatchObject({source: '1'});
});

test('accepts any source once it is percent-encoded', () => {
  const source = '// c\nmodule.exports = true ? "#" : "100%"; ';
  expect(resolve('metro:inline,' + encodeURIComponent(source))).toMatchObject({
    source,
  });
});
