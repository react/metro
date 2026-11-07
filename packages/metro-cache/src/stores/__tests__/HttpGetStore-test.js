/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const {PassThrough} = require('node:stream');
const zlib = require('node:zlib');

jest.useRealTimers();

describe('HttpGetStore', () => {
  let HttpGetStore;
  let httpPassThrough;
  let warningMessages;

  function responseHttpError(code) {
    return Object.assign(new PassThrough(), {
      statusCode: code,
    });
  }

  function responseHttpOk(data) {
    const res = Object.assign(new PassThrough(), {
      statusCode: 200,
    });

    process.nextTick(() => {
      res.write(zlib.gzipSync(data));
      res.end();
    });

    return res;
  }

  beforeEach(() => {
    jest.resetModules().resetAllMocks().mock('node:http');

    httpPassThrough = new PassThrough();
    jest.requireMock('node:http').request.mockReturnValue(httpPassThrough);

    HttpGetStore = require('../HttpGetStore').default;

    warningMessages = [];

    process.emitWarning = jest.fn(warn => {
      warningMessages.push(warn);
    });
  });

  test("doesn't throw any error for http 200 status code", async () => {
    const store = new HttpGetStore({
      endpoint: 'http://www.example.com/endpoint',
    });
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = jest.requireMock('node:http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');
    expect(opts.host).toEqual('www.example.com');
    expect(opts.path).toEqual('/endpoint/6b6579');
    expect(opts.timeout).toEqual(5000);

    callback(responseHttpOk(JSON.stringify({foo: 42})));

    expect(await promise).toEqual({foo: 42});
    expect(warningMessages.length).toBe(0);
  });

  test("doesn't throw any error and doesn't warn on http status 404 errors", async () => {
    const store = new HttpGetStore({endpoint: 'http://example.com'});
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = jest.requireMock('node:http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');

    callback(responseHttpError(404));

    await promise.then(result => {
      expect(result).toBe(null);

      expect(warningMessages.length).toBe(0);
    });
  });

  test("doesn't throw any error and warns on http status 502 errors", async () => {
    const store = new HttpGetStore({endpoint: 'http://example.com'});
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = jest.requireMock('node:http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');

    callback(responseHttpError(502));

    await promise.then(result => {
      expect(result).toBe(null);

      expect(warningMessages.length).toBe(1);
      expect(warningMessages[0]).toMatchInlineSnapshot(
        `"Could not connect to the HTTP cache. Original error: HTTP error: 502 Bad Gateway"`,
      );
    });
  });
});
