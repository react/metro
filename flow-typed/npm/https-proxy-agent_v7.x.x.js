/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

declare module 'https-proxy-agent' {
  type HttpHeaders = {[key: string]: string | Array<string>};

  declare export type HttpsProxyAgentOptions = tls$connectOptions &
    http$agentOptions & {
      readonly headers?: HttpHeaders | (() => HttpHeaders),
      ...
    };

  declare export class HttpsProxyAgent extends http$Agent<net$Socket> {
    static protocols: ['http', 'https'];
    readonly proxy: URL;
    proxyHeaders: HttpHeaders | (() => HttpHeaders);
    connectOpts: tls$connectOptions;
    constructor(proxy: string | URL, opts?: HttpsProxyAgentOptions): this;
    connect(
      req: http$requestOptions,
      opts: http$agentOptions,
    ): Promise<net$Socket>;
  }
}
