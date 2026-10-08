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

const ORIGIN = '/root/project/foo.js';

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

test('decodes a base64 payload into a virtual module at the importing module path', () => {
  const source = 'export default 1;';
  expect(
    resolve('metro:inline;base64,' + Buffer.from(source).toString('base64')),
  ).toEqual({
    type: 'virtualModule',
    virtualPath: ORIGIN,
    source,
  });
});

test('decodes a percent-encoded payload', () => {
  expect(resolve('metro:inline,export%20default%20%22a%2Cb%22%3B')).toEqual({
    type: 'virtualModule',
    virtualPath: ORIGIN,
    source: 'export default "a,b";',
  });
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
