/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<1ea61133bb1f20cfa2e82c2ba414d139>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/Server/MultipartResponse.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {IncomingMessage, ServerResponse} from 'node:http';

type Data = string | Buffer | Uint8Array;
type Headers = {[$$Key$$: string]: string | number};
declare class MultipartResponse {
  static wrapIfSupported(req: IncomingMessage, res: ServerResponse): MultipartResponse | ServerResponse;
  static serializeHeaders(headers: Headers): string;
  res: ServerResponse;
  headers: Headers;
  constructor(res: ServerResponse);
  writeChunk(headers: Headers | null, data?: Data, isLast?: boolean): void;
  writeHead(status: number, headers?: Headers): void;
  setHeader(name: string, value: string | number): void;
  end(data?: Data): void;
  once(name: string, fn: () => unknown): this;
}
export default MultipartResponse;
