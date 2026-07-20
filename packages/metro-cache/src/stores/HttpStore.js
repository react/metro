/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

import type {HttpsProxyAgentOptions} from 'https-proxy-agent';

import HttpError from './HttpError';
import NetworkError from './NetworkError';
import {backOff} from 'exponential-backoff';
import {HttpsProxyAgent} from 'https-proxy-agent';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';

export type Options =
  | EndpointOptions // Uses the same options for both reads and writes
  | {getOptions: EndpointOptions, setOptions: EndpointOptions}; // Uses different options for reads and writes

type EndpointOptions = {
  endpoint: string,
  family?: 4 | 6,
  timeout?: number,
  key?: string | ReadonlyArray<string> | Buffer | ReadonlyArray<Buffer>,
  cert?: string | ReadonlyArray<string> | Buffer | ReadonlyArray<Buffer>,
  ca?: string | ReadonlyArray<string> | Buffer | ReadonlyArray<Buffer>,
  params?: URLSearchParams,
  headers?: {[string]: string},
  additionalSuccessStatuses?: ReadonlyArray<number>,
  /**
   * Whether to include additional debug information in error messages.
   */
  debug?: boolean,

  /**
   * Retry configuration
   */
  maxAttempts?: number,
  retryNetworkErrors?: boolean,
  retryStatuses?: ReadonlySet<number>,
  socketPath?: string,
  proxy?: string,
};

type Endpoint = {
  module: typeof http | typeof https,
  host: string,
  path: string,
  port: number,
  agent: http$Agent<tls$TLSSocket> | http$Agent<net$Socket>,
  params: URLSearchParams,
  headers?: {[string]: string},
  timeout: number,
  additionalSuccessStatuses: ReadonlySet<number>,
  debug: boolean,

  /**
   * Retry configuration
   */
  maxAttempts: number,
  retryNetworkErrors: boolean,
  retryStatuses: ReadonlySet<number>,
};

const ZLIB_OPTIONS: zlib$options = {
  level: 9,
};

const NULL_BYTE = 0x00;
const NULL_BYTE_BUFFER = Buffer.from([NULL_BYTE]);

export default class HttpStore<T> {
  static HttpError: typeof HttpError = HttpError;
  static NetworkError: typeof NetworkError = NetworkError;

  #getEndpoint: Endpoint;
  #setEndpoint: Endpoint;

  constructor(options: Options) {
    this.#getEndpoint = this.#createEndpointConfig(
      options.getOptions != null ? options.getOptions : options,
    );
    this.#setEndpoint = this.#createEndpointConfig(
      options.setOptions != null ? options.setOptions : options,
    );
  }

  #createEndpointConfig(options: EndpointOptions): Endpoint {
    const agentConfig: http$agentOptions & HttpsProxyAgentOptions = {
      family: options.family,
      keepAlive: true,
      keepAliveMsecs: options.timeout || 5000,
      maxFreeSockets: 64,
      maxSockets: 64,
    };

    if (options.key != null) {
      // $FlowFixMe[incompatible-use] `key` is missing in the Flow definition
      agentConfig.key = options.key;
    }

    if (options.cert != null) {
      // $FlowFixMe[incompatible-use] `cert` is missing in the Flow definition
      agentConfig.cert = options.cert;
    }

    if (options.ca != null) {
      // $FlowFixMe[incompatible-use] `ca` is missing in the Flow definition
      agentConfig.ca = options.ca;
    }

    if (options.socketPath != null) {
      // $FlowFixMe[incompatible-use] `socketPath` is missing in the Flow definition
      agentConfig.socketPath = options.socketPath;
    }

    const uri = new URL(options.endpoint);
    const module = uri.protocol === 'http:' ? http : https;

    const agent =
      options.proxy != null
        ? new HttpsProxyAgent(options.proxy, agentConfig)
        : new module.Agent(agentConfig);

    if (!uri.hostname || !uri.pathname) {
      throw new TypeError('Invalid endpoint: ' + options.endpoint);
    }

    return {
      additionalSuccessStatuses: new Set(
        options.additionalSuccessStatuses ?? [],
      ),
      agent,
      debug: options.debug ?? false,
      headers: options.headers,
      host: uri.hostname,
      maxAttempts: options.maxAttempts ?? 1,
      module: uri.protocol === 'http:' ? http : https,
      params: new URLSearchParams(options.params),
      path: uri.pathname,
      port: +uri.port,
      retryNetworkErrors: options.retryNetworkErrors ?? false,
      retryStatuses: new Set(options.retryStatuses ?? []),
      timeout: options.timeout || 5000,
    };
  }

  get(key: Buffer): Promise<?T> {
    return this.#withRetries(() => this.#getOnce(key), this.#getEndpoint);
  }

  #getOnce(key: Buffer): Promise<?T> {
    return new Promise((resolve, reject) => {
      let searchParamsString = this.#getEndpoint.params.toString();
      if (searchParamsString != '') {
        searchParamsString = '?' + searchParamsString;
      }
      const options = {
        agent: this.#getEndpoint.agent,
        headers: this.#getEndpoint.headers,
        host: this.#getEndpoint.host,
        method: 'GET',
        path: `${this.#getEndpoint.path}/${key.toString(
          'hex',
        )}${searchParamsString}`,
        port: this.#getEndpoint.port,
        timeout: this.#getEndpoint.timeout,
      };

      // $FlowFixMe[incompatible-type]
      /* $FlowFixMe[missing-local-annot](>=0.101.0 site=react_native_fb) This comment suppresses an
       * error found when Flow v0.101 was deployed. To see the error, delete
       * this comment and run Flow. */
      const req = this.#getEndpoint.module.request(options, res => {
        const code = res.statusCode;
        const data = [];

        if (code === 404) {
          res.resume();
          resolve(null);

          return;
        } else if (
          code !== 200 &&
          !this.#getEndpoint.additionalSuccessStatuses.has(code)
        ) {
          if (this.#getEndpoint.debug) {
            res.on('data', chunk => {
              data.push(chunk);
            });
            res.on('error', err => {
              reject(
                new HttpError(
                  'Encountered network error (' +
                    err.message +
                    ') while handling HTTP error: ' +
                    code +
                    ' ' +
                    http.STATUS_CODES[code],
                  code,
                ),
              );
            });
            res.on('end', () => {
              const buffer = Buffer.concat(data);
              reject(
                new HttpError(
                  'HTTP error: ' +
                    code +
                    ' ' +
                    http.STATUS_CODES[code] +
                    '\n\n' +
                    buffer.toString(),
                  code,
                ),
              );
            });
          } else {
            res.resume();
            reject(
              new HttpError(
                'HTTP error: ' + code + ' ' + http.STATUS_CODES[code],
                code,
              ),
            );
          }

          return;
        }

        const gunzipped = res.pipe(zlib.createGunzip());

        gunzipped.on('data', chunk => {
          data.push(chunk);
        });

        gunzipped.on('error', err => {
          reject(err);
        });

        gunzipped.on('end', () => {
          try {
            const buffer = Buffer.concat(data);

            if (buffer.length > 0 && buffer[0] === NULL_BYTE) {
              resolve(buffer.slice(1) as any);
            } else {
              resolve(JSON.parse(buffer.toString('utf8')));
            }
          } catch (err) {
            reject(err);
          }
        });

        res.on('error', err => gunzipped.emit('error', err));
      });

      req.on('error', err => {
        reject(new NetworkError(err.message, err.code));
      });

      req.on('timeout', () => {
        req.destroy(new Error('Request timed out'));
      });

      req.end();
    });
  }

  set(key: Buffer, value: T): Promise<void> {
    return this.#withRetries(
      () => this.#setOnce(key, value),
      this.#setEndpoint,
    );
  }

  #setOnce(key: Buffer, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const gzip = zlib.createGzip(ZLIB_OPTIONS);

      let searchParamsString = this.#setEndpoint.params.toString();
      if (searchParamsString != '') {
        searchParamsString = '?' + searchParamsString;
      }

      const options = {
        agent: this.#setEndpoint.agent,
        headers: this.#setEndpoint.headers,
        host: this.#setEndpoint.host,
        method: 'PUT',
        path: `${this.#setEndpoint.path}/${key.toString(
          'hex',
        )}${searchParamsString}`,
        port: this.#setEndpoint.port,
        timeout: this.#setEndpoint.timeout,
      };

      // $FlowFixMe[incompatible-type]
      /* $FlowFixMe[missing-local-annot](>=0.101.0 site=react_native_fb) This comment suppresses an
       * error found when Flow v0.101 was deployed. To see the error, delete
       * this comment and run Flow. */
      const req = this.#setEndpoint.module.request(options, res => {
        const code = res.statusCode;

        if (
          (code < 200 || code > 299) &&
          !this.#setEndpoint.additionalSuccessStatuses.has(code)
        ) {
          if (this.#setEndpoint.debug) {
            const data = [];
            res.on('data', chunk => {
              data.push(chunk);
            });
            res.on('error', err => {
              reject(
                new HttpError(
                  'Encountered network error (' +
                    err.message +
                    ') while handling HTTP error: ' +
                    code +
                    ' ' +
                    http.STATUS_CODES[code],
                  code,
                ),
              );
            });
            res.on('end', () => {
              const buffer = Buffer.concat(data);
              reject(
                new HttpError(
                  'HTTP error: ' +
                    code +
                    ' ' +
                    http.STATUS_CODES[code] +
                    '\n\n' +
                    buffer.toString(),
                  code,
                ),
              );
            });
          } else {
            res.resume();
            reject(
              new HttpError(
                'HTTP error: ' + code + ' ' + http.STATUS_CODES[code],
                code,
              ),
            );
          }

          return;
        }

        res.on('error', err => {
          reject(err);
        });

        res.on('end', () => {
          resolve();
        });

        // Consume all the data from the response without processing it.
        res.resume();
      });

      req.on('timeout', () => {
        req.destroy(new Error('Request timed out'));
      });

      gzip.pipe(req);

      if (value instanceof Buffer) {
        gzip.write(NULL_BYTE_BUFFER);
        gzip.end(value);
      } else {
        gzip.end(JSON.stringify(value) || 'null');
      }
    });
  }

  clear() {
    // Not implemented.
  }

  #withRetries<R>(fn: () => Promise<R>, endpoint: Endpoint): Promise<R> {
    if (endpoint.maxAttempts === 1) {
      return fn();
    }

    return backOff(fn, {
      jitter: 'full',
      maxDelay: 30000,
      numOfAttempts: endpoint.maxAttempts || Number.POSITIVE_INFINITY,
      retry: (e: Error) => {
        if (e instanceof HttpError) {
          return endpoint.retryStatuses.has(e.code);
        }
        return e instanceof NetworkError && endpoint.retryNetworkErrors;
      },
    });
  }
}
