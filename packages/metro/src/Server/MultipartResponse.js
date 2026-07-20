/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

import type {IncomingMessage, ServerResponse} from 'node:http';

import accepts from 'accepts';

const CRLF = '\r\n';
const BOUNDARY = '3beqjf3apnqeu3h5jqorms4i';
type Data = string | Buffer | Uint8Array;
type Headers = {[string]: string | number};

export default class MultipartResponse {
  static wrapIfSupported(
    req: IncomingMessage,
    res: ServerResponse,
  ): MultipartResponse | ServerResponse {
    if (accepts(req).types().includes('multipart/mixed')) {
      return new MultipartResponse(res);
    }

    return res;
  }

  static serializeHeaders(headers: Headers): string {
    return Object.keys(headers)
      .map(key => `${key}: ${headers[key]}`)
      .join(CRLF);
  }

  res: ServerResponse;
  headers: Headers;

  constructor(res: ServerResponse) {
    this.res = res;
    this.headers = {};
    res.writeHead(200, {
      'Content-Type': `multipart/mixed; boundary="${BOUNDARY}"`,
    });
    res.write(
      'If you are seeing this, your client does not support multipart response',
    );
  }

  writeChunk(
    headers: Headers | null,
    data?: Data,
    isLast?: boolean = false,
  ): void {
    if (this.res.finished) {
      return;
    }

    this.res.write(`${CRLF}--${BOUNDARY}${CRLF}`);
    if (headers) {
      this.res.write(MultipartResponse.serializeHeaders(headers) + CRLF + CRLF);
    }

    if (data != null) {
      this.res.write(data);
    }

    if (isLast) {
      this.res.write(`${CRLF}--${BOUNDARY}--${CRLF}`);
    }
  }

  writeHead(status: number, headers?: Headers): void {
    // We can't actually change the response HTTP status code
    // because the headers have already been sent
    this.setHeader('X-Http-Status', status);
    if (!headers) {
      return;
    }
    for (const key in headers) {
      this.setHeader(key, headers[key]);
    }
  }

  setHeader(name: string, value: string | number): void {
    this.headers[name] = value;
  }

  end(data?: Data): void {
    this.writeChunk(this.headers, data, true);
    this.res.end();
  }

  once(name: string, fn: () => unknown): this {
    this.res.once(name, fn);
    return this;
  }
}
