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

import type {IncomingMessage} from 'node:http';

import parseJsonBody from '../parseJsonBody';
import {Readable} from 'node:stream';

function createRequest(body: string): IncomingMessage {
  // $FlowFixMe[incompatible-type] Only the stream properties are read, with `strict: false`.
  return Readable.from([body]);
}

test('parses the request body as JSON', async () => {
  await expect(
    parseJsonBody(createRequest('{"a": 1}'), {strict: false}),
  ).resolves.toEqual({a: 1});
});

test('rejects a request body that has already been read', async () => {
  const req = createRequest('{"a": 1}');
  await new Promise(resolve => {
    req.on('end', resolve);
    req.resume();
  });

  await expect(parseJsonBody(req, {strict: false})).rejects.toThrow(
    'Request body was already read by a middleware',
  );
});
