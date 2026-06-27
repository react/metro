/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

const {PassThrough} = require('stream');
const zlib = require('zlib');

describe('HttpStore', () => {
  let HttpStore;
  let httpPassThrough;

  function responseHttpOk(data, statusCode = 200) {
    const res = Object.assign(new PassThrough(), {
      statusCode,
    });

    process.nextTick(() => {
      res.write(zlib.gzipSync(data));
      res.end();
    });

    return res;
  }

  function responseHttpError(statusCode) {
    const res = Object.assign(new PassThrough(), {
      statusCode,
    });

    process.nextTick(() => {
      res.write('HTTP error body');
      res.end();
    });

    return res;
  }

  function responseError(err) {
    const res = Object.assign(new PassThrough(), {
      statusCode: 200,
    });

    process.nextTick(() => {
      res.emit('error', err);
    });

    return res;
  }

  beforeEach(() => {
    jest
      .resetModules()
      .resetAllMocks()
      .useFakeTimers({legacyFakeTimers: true}) // Legacy fake timers are reset by `resetAllMocks()`
      .mock('http')
      .mock('https');

    httpPassThrough = new PassThrough();
    require('http').request.mockReturnValue(httpPassThrough);
    require('https').request.mockReturnValue(httpPassThrough);

    HttpStore = require('../HttpStore').default;
  });

  test('works with HTTP and HTTPS', () => {
    const httpStore = new HttpStore({endpoint: 'http://example.com'});
    const httpsStore = new HttpStore({endpoint: 'https://example.com'});

    httpStore.get(Buffer.from('foo'));
    expect(require('http').request).toHaveBeenCalledTimes(1);
    expect(require('https').request).not.toHaveBeenCalled();

    jest.clearAllMocks();

    httpsStore.get(Buffer.from('foo'));
    expect(require('http').request).not.toHaveBeenCalled();
    expect(require('https').request).toHaveBeenCalledTimes(1);
  });

  test('gets using the network via GET method', async () => {
    const store = new HttpStore({endpoint: 'http://www.example.com/endpoint'});
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');
    expect(opts.host).toEqual('www.example.com');
    expect(opts.path).toEqual('/endpoint/6b6579');
    expect(opts.timeout).toEqual(5000);

    callback(responseHttpOk(JSON.stringify({foo: 42})));
    jest.runAllTimers();

    expect(await promise).toEqual({foo: 42});
  });

  test('rejects when an HTTP different from 200 is returned', done => {
    const store = new HttpStore({endpoint: 'http://example.com'});
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');

    callback(responseHttpError(503));
    jest.runAllTimers();

    promise.catch(err => {
      expect(err).toBeInstanceOf(HttpStore.HttpError);
      expect(err.message).toMatch(/HTTP error: 503 Service Unavailable/);
      expect(err.code).toBe(503);
      done();
    });
  });

  test('does not retry when maxAttempts==1', async () => {
    const store = new HttpStore({
      endpoint: 'http://example.com',
      maxAttempts: 1,
      retryStatuses: [429],
    });
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');

    callback(responseHttpError(429));
    jest.runAllTimers();

    let err = null;
    try {
      await promise;
    } catch (e) {
      err = e;
    }

    expect(err).toBeInstanceOf(HttpStore.HttpError);
    expect(err.message).toMatch(/HTTP error: 429 Too Many Requests/);
    expect(err.code).toBe(429);
    expect(require('http').request).toHaveBeenCalledTimes(1);
  });

  test('retries http errors when maxAttempts>1 and status in retryStatuses', async () => {
    jest.useRealTimers();
    const store = new HttpStore({
      endpoint: 'http://example.com',
      maxAttempts: 2,
      retryStatuses: [429],
    });
    const {request} = require('http');

    request.mockImplementation((opts, callback) => {
      if (request.mock.calls.length === 1) {
        callback(responseHttpError(429));
      } else {
        callback(responseHttpOk(JSON.stringify({foo: 42}), 200));
      }
      return httpPassThrough;
    });

    expect(await store.get(Buffer.from('key'))).toEqual({foo: 42});
    expect(request).toHaveBeenCalledTimes(2);
  });

  test('throws when retries exceed maxAttempts', async () => {
    jest.useRealTimers();
    const store = new HttpStore({
      endpoint: 'http://example.com',
      maxAttempts: 3,
      retryStatuses: [429],
    });
    const {request} = require('http');

    request.mockImplementation((opts, callback) => {
      callback(responseHttpError(429));
      return httpPassThrough;
    });

    let err;
    try {
      await store.get(Buffer.from('key'));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(HttpStore.HttpError);
    expect(err.message).toMatch(/HTTP error: 429 Too Many Requests/);
    expect(err.code).toBe(429);
    expect(request).toHaveBeenCalledTimes(3);
  });

  test('retries timeouts when maxAttempts>1 and retryNetworkErrors=true', async () => {
    jest.useRealTimers();
    const store = new HttpStore({
      endpoint: 'http://example.com',
      maxAttempts: 2,
      retryNetworkErrors: true,
    });
    const {request} = require('http');

    request.mockImplementation((opts, callback) => {
      if (request.mock.calls.length === 1) {
        process.nextTick(() => {
          httpPassThrough.emit('timeout');
        });
      } else {
        callback(responseHttpOk(JSON.stringify({foo: 42}), 200));
      }
      return httpPassThrough;
    });

    expect(await store.get(Buffer.from('key'))).toEqual({foo: 42});
    expect(request).toHaveBeenCalledTimes(2);
  });

  test('get() includes HTTP error body in rejection with debug: true', done => {
    const store = new HttpStore({endpoint: 'http://example.com', debug: true});
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');

    callback(responseHttpError(503));
    jest.runAllTimers();

    promise.catch(err => {
      expect(err).toBeInstanceOf(HttpStore.HttpError);
      expect(err.message).toMatch(
        /HTTP error: 503 Service Unavailable.*HTTP error body/s,
      );
      expect(err.code).toBe(503);
      done();
    });
  });

  test('get() resolves when the HTTP code is in additionalSuccessStatuses', async () => {
    const store = new HttpStore({
      endpoint: 'http://www.example.com/endpoint',
      additionalSuccessStatuses: [419],
    });
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');
    expect(opts.host).toEqual('www.example.com');
    expect(opts.path).toEqual('/endpoint/6b6579');
    expect(opts.timeout).toEqual(5000);

    callback(responseHttpOk(JSON.stringify({foo: 42}), 419));
    jest.runAllTimers();

    expect(await promise).toEqual({foo: 42});
  });

  test('rejects when it gets an invalid JSON response', done => {
    const store = new HttpStore({endpoint: 'http://example.com'});
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');

    callback(responseHttpOk('{"foo": 4')); // Intentionally unterminated JSON.
    jest.runAllTimers();

    promise.catch(err => {
      expect(err).toBeInstanceOf(SyntaxError);
      done();
    });
  });

  test('rejects when the HTTP layer throws', done => {
    const store = new HttpStore({endpoint: 'http://example.com'});
    const promise = store.get(Buffer.from('key'));
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('GET');

    callback(responseError(new Error('ENOTFOUND')));
    jest.runAllTimers();

    promise.catch(err => {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('ENOTFOUND');
      done();
    });
  });

  test('set() retries use the set endpoint config, not the get endpoint', async () => {
    jest.useRealTimers();
    // Distinct read/write retry config: reads do not retry, writes retry 503s.
    const store = new HttpStore({
      getOptions: {endpoint: 'http://example.com', maxAttempts: 1},
      setOptions: {
        endpoint: 'http://example.com',
        maxAttempts: 2,
        retryStatuses: [503],
      },
    });
    const {request} = require('http');

    request.mockImplementation((opts, callback) => {
      if (request.mock.calls.length === 1) {
        callback(responseHttpError(503));
      } else {
        callback(responseHttpOk(''));
      }
      return new PassThrough();
    });

    let error;
    try {
      await store.set(Buffer.from('key-set'), {foo: 42});
    } catch (e) {
      error = e;
    }

    expect(error).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
  });

  test('sets using the network via PUT method', done => {
    const store = new HttpStore({endpoint: 'http://www.example.com/endpoint'});
    const promise = store.set(Buffer.from('key-set'), {foo: 42});
    const [opts, callback] = require('http').request.mock.calls[0];
    const buf = [];

    expect(opts.method).toEqual('PUT');
    expect(opts.host).toEqual('www.example.com');
    expect(opts.path).toEqual('/endpoint/6b65792d736574');
    expect(opts.timeout).toEqual(5000);

    callback(responseHttpOk(''));

    httpPassThrough.on('data', chunk => {
      buf.push(chunk);
    });

    httpPassThrough.on('end', async () => {
      expect(zlib.gunzipSync(Buffer.concat(buf)).toString()).toBe('{"foo":42}');
      await promise; // Ensure that the setting promise successfully finishes.

      done();
    });
  });

  test('rejects when setting and HTTP fails', done => {
    const store = new HttpStore({endpoint: 'http://example.com'});
    const promise = store.set(Buffer.from('key-set'), {foo: 42});
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('PUT');

    callback(responseError(new Error('ENOTFOUND')));
    jest.runAllTimers();

    promise.catch(err => {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('ENOTFOUND');
      done();
    });
  });

  test('set() resolves when the HTTP code is in additionalSuccessStatuses', done => {
    const store = new HttpStore({
      endpoint: 'http://www.example.com/endpoint',
      additionalSuccessStatuses: [403],
    });
    const promise = store.set(Buffer.from('key-set'), {foo: 42});
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('PUT');
    expect(opts.host).toEqual('www.example.com');
    expect(opts.path).toEqual('/endpoint/6b65792d736574');
    expect(opts.timeout).toEqual(5000);

    callback(responseHttpError(403));

    httpPassThrough.on('data', () => {});

    httpPassThrough.on('end', async () => {
      await promise; // Ensure that the setting promise successfully finishes.

      done();
    });
  });

  test('rejects when setting and HTTP returns an error response', done => {
    const store = new HttpStore({endpoint: 'http://example.com'});
    const promise = store.set(Buffer.from('key-set'), {foo: 42});
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('PUT');

    callback(responseHttpError(403));
    jest.runAllTimers();

    promise.catch(err => {
      expect(err).toBeInstanceOf(HttpStore.HttpError);
      expect(err.message).toMatch(/HTTP error: 403 Forbidden/);
      expect(err.code).toBe(403);
      done();
    });
  });

  test('set() includes HTTP error body in rejection with debug: true', done => {
    const store = new HttpStore({endpoint: 'http://example.com', debug: true});
    const promise = store.set(Buffer.from('key-set'), {foo: 42});
    const [opts, callback] = require('http').request.mock.calls[0];

    expect(opts.method).toEqual('PUT');

    callback(responseHttpError(403));
    jest.runAllTimers();

    promise.catch(err => {
      expect(err).toBeInstanceOf(HttpStore.HttpError);
      expect(err.message).toMatch(
        /HTTP error: 403 Forbidden.*HTTP error body/s,
      );
      expect(err.code).toBe(403);
      done();
    });
  });

  test('gets the same value that was set', async () => {
    const store = new HttpStore({endpoint: 'http://www.example.com/endpoint'});
    const chunks = [];
    let storedValue;

    httpPassThrough.on('data', chunk => {
      chunks.push(chunk);
    });

    httpPassThrough.on('end', () => {
      storedValue = zlib.gunzipSync(Buffer.concat(chunks));

      const callbackSet = require('http').request.mock.calls[0][1];

      callbackSet(responseHttpOk(''));
    });

    await store.set(Buffer.from('key-set'), {foo: 42});

    const promiseGet = store.get(Buffer.from('key-set'));
    const callbackGet = require('http').request.mock.calls[1][1];

    callbackGet(responseHttpOk(storedValue));

    expect(await promiseGet).toEqual({foo: 42});
  });

  test('gets the same value that was set when storing buffers', async () => {
    const store = new HttpStore({endpoint: 'http://www.example.com/endpoint'});
    const chunks = [];
    let storedValue;

    httpPassThrough.on('data', chunk => {
      chunks.push(chunk);
    });

    httpPassThrough.on('end', () => {
      storedValue = zlib.gunzipSync(Buffer.concat(chunks));

      const callbackSet = require('http').request.mock.calls[0][1];

      callbackSet(responseHttpOk(''));
    });

    const bufferValue = Buffer.from([0xfb, 0xca, 0xc4]);

    await store.set(Buffer.from('key-set'), bufferValue);

    const promiseGet = store.get(Buffer.from('key-set'));
    const callbackGet = require('http').request.mock.calls[1][1];

    callbackGet(responseHttpOk(storedValue));

    expect(await promiseGet).toEqual(bufferValue);
  });
});
