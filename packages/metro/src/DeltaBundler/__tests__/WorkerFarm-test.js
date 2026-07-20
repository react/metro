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

const {getDefaultConfig} = require('metro-config');
const {Readable} = require('node:stream');

describe('Worker Farm', function () {
  let api;
  let WorkerFarm;
  const fileName = 'arbitrary/file.js';
  const rootFolder = '/root';
  let config;

  beforeEach(async function () {
    jest
      .resetModules()
      .mock('node:fs', () => ({writeFileSync: jest.fn()}))
      .mock('jest-worker', () => ({__esModule: true, Worker: jest.fn()}));

    const fs = jest.requireMock('node:fs');
    const jestWorker = require('jest-worker');
    config = await getDefaultConfig();

    fs.writeFileSync.mockClear();
    jestWorker.Worker.mockClear();
    jestWorker.Worker.mockImplementation(function (workerPath, opts) {
      api = {
        end: jest.fn(),
        getStdout: () => new Readable({read() {}}),
        getStderr: () => new Readable({read() {}}),
      };

      opts.exposedMethods.forEach(method => {
        api[method] = jest.fn();
      });

      api.transform.mockImplementation(() => {
        return {
          result: 'transformed(code)',
          sha1: '4ea962697c876e2674d107f0fec6798414f5bf45',
          transformFileStartLogEntry: {},
          transformFileEndLogEntry: {},
        };
      });

      return api;
    });

    WorkerFarm = require('../WorkerFarm').default;
  });

  test('passes transform data to the worker farm when transforming', async () => {
    const transformOptions = {arbitrary: 'options'};
    const transformerConfig = {
      transformerPath: config.transformerPath,
      transformerConfig: config.transformer,
    };

    await new WorkerFarm(config, transformerConfig).transform(
      fileName,
      transformOptions,
    );

    expect(api.transform).toBeCalledWith(
      fileName,
      transformOptions,
      config.projectRoot,
      transformerConfig,
      undefined,
    );
  });

  test('Passes the correct config to separate farm instances', async () => {
    const transformerConfig = {
      transformerPath: config.transformerPath,
      transformerConfig: config.transformer,
    };

    const farm = new WorkerFarm(
      {...config, projectRoot: '/foo'},
      transformerConfig,
    );
    await farm.transform(fileName, {});

    expect(api.transform).toBeCalledWith(
      fileName,
      {},
      '/foo',
      transformerConfig,
      undefined,
    );

    await farm.kill();

    const anotherFarm = new WorkerFarm(
      {...config, projectRoot: '/bar'},
      transformerConfig,
    );
    await anotherFarm.transform(fileName, {});

    expect(api.transform).toBeCalledWith(
      fileName,
      {},
      '/bar',
      transformerConfig,
      undefined,
    );
  });

  test('should add file info to parse errors', () => {
    const workerFarm = new WorkerFarm(config, {
      transformerPath: config.transformerPath,
      transformerConfig: config.transformer,
    });
    const message = 'message';
    const snippet = 'snippet';

    api.transform.mockImplementation((filename, opts) => {
      const babelError = new SyntaxError(message);

      babelError.type = 'SyntaxError';
      babelError.loc = {line: 2, column: 15};
      babelError.codeFrame = snippet;

      return Promise.reject(babelError);
    });

    expect.assertions(6);

    return workerFarm
      .transform(fileName, rootFolder, '', {})
      .catch(function (error) {
        expect(error.type).toEqual('TransformError');
        expect(error.message).toBe(
          'SyntaxError in arbitrary/file.js: ' + message,
        );
        expect(error.lineNumber).toBe(2);
        expect(error.column).toBe(15);
        expect(error.filename).toBe(fileName);
        expect(error.snippet).toBe(snippet);
      });
  });
});
