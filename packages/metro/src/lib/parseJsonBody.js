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

const CONTENT_TYPE = 'application/json';
const SIZE_LIMIT = 100 * 1024 * 1024; // 100MB

export type JsonData =
  | {
      [string]: JsonData,
    }
  | Array<JsonData>
  | string
  | number
  | boolean
  | null;

/**
 * Attempt to parse a request body as JSON.
 */
export default function parseJsonBody(
  req: IncomingMessage,
  options: {strict?: boolean} = {},
): Promise<JsonData> {
  const {strict = true} = options;

  return new Promise((resolve, reject) => {
    if (strict) {
      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes(CONTENT_TYPE)) {
        reject(new Error(`Invalid content type, expected ${CONTENT_TYPE}`));
        return;
      }
    }

    let size = 0;
    let data = '';

    req.on('data', (chunk: string) => {
      size += Buffer.byteLength(chunk);

      if (size > SIZE_LIMIT) {
        req.destroy();
        reject(new Error('Request body size exceeds size limit (100MB)'));
        return;
      }

      data += chunk;
    });

    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
  });
}
