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

import type {TransformResult} from '../DeltaBundler';
import type {TransformerConfig, TransformOptions, Worker} from './Worker';
import type {ConfigT} from 'metro-config';
import type {Readable} from 'node:stream';

import {Worker as JestWorker} from 'jest-worker';
import {Logger} from 'metro-core';

type WorkerInterface = Readonly<{
  ...Worker,
  end(): void | Promise<void>,
  getStdout(): Readable,
  getStderr(): Readable,
}>;

type TransformerResult = Readonly<{
  result: TransformResult<>,
  sha1: string,
}>;

export default class WorkerFarm {
  _config: ConfigT;
  _transformerConfig: TransformerConfig;
  _worker: WorkerInterface | Worker;

  constructor(config: ConfigT, transformerConfig: TransformerConfig) {
    this._config = config;
    this._transformerConfig = transformerConfig;
    const absoluteWorkerPath = require.resolve('./Worker.js');

    if (this._config.maxWorkers > 1) {
      const worker = this._makeFarm(
        absoluteWorkerPath,
        ['transform'],
        this._config.maxWorkers,
      );

      worker.getStdout().on('data', chunk => {
        this._config.reporter.update({
          type: 'worker_stdout_chunk',
          chunk: chunk.toString('utf8'),
        });
      });
      worker.getStderr().on('data', chunk => {
        this._config.reporter.update({
          type: 'worker_stderr_chunk',
          chunk: chunk.toString('utf8'),
        });
      });

      this._worker = worker;
    } else {
      // eslint-disable-next-line import/no-commonjs
      this._worker = require('./Worker') as Worker;
    }
  }

  async kill(): Promise<void> {
    if (this._worker && typeof this._worker.end === 'function') {
      await this._worker.end();
    }
  }

  async transform(
    filename: string,
    options: TransformOptions,
    fileBuffer?: Buffer,
  ): Promise<TransformerResult> {
    try {
      const data = await this._worker.transform(
        filename,
        options,
        this._config.projectRoot,
        this._transformerConfig,
        fileBuffer,
      );

      Logger.log(data.transformFileStartLogEntry);
      Logger.log(data.transformFileEndLogEntry);

      return {
        result: data.result,
        sha1: data.sha1,
      };
    } catch (err) {
      if (err.loc) {
        throw this._formatBabelError(err, filename);
      } else {
        throw this._formatGenericError(err, filename);
      }
    }
  }

  _makeFarm(
    absoluteWorkerPath: string,
    exposedMethods: ReadonlyArray<string>,
    numWorkers: number,
  ): WorkerInterface {
    const env = {
      ...process.env,
      // Force color to print syntax highlighted code frames.
      FORCE_COLOR: 1,
    };

    return new JestWorker<Worker>(absoluteWorkerPath, {
      computeWorkerKey: this._config.stickyWorkers
        ? // $FlowFixMe[method-unbinding] added when improving typing for this parameters
          // $FlowFixMe[incompatible-type]
          this._computeWorkerKey
        : undefined,
      exposedMethods,
      enableWorkerThreads: this._config.transformer.unstable_workerThreads,
      forkOptions: {env},
      numWorkers,
      // Prefer using lower numbered available workers repeatedly rather than
      // spreading jobs over the whole pool evenly (round-robin). This is more
      // likely to use faster, hot workers earlier in graph traversal, when
      // we want to be able to fan out as quickly as possible, and therefore
      // gets us to full speed faster.
      workerSchedulingPolicy: 'in-order',
    });
  }

  _computeWorkerKey(method: string, filename: string): ?string {
    // Only when transforming a file we want to stick to the same worker; and
    // we'll shard by file path. If not; we return null, which tells the worker
    // to pick the first available one.
    if (method === 'transform') {
      return filename;
    }

    return null;
  }

  _formatGenericError(
    err: Readonly<{message: string, stack?: string, ...}>,
    filename: string,
  ): TransformError {
    const error = new TransformError(`${filename}: ${err.message}`);

    // $FlowFixMe[unsafe-object-assign]
    return Object.assign(error, {
      stack: (err.stack || '').split('\n').slice(0, -1).join('\n'),
      lineNumber: 0,
    });
  }

  _formatBabelError(
    err: Readonly<{
      message: string,
      stack?: string,
      type?: string,
      codeFrame?: unknown,
      loc: {line?: number, column?: number, ...},
      ...
    }>,
    filename: string,
  ): TransformError {
    const error = new TransformError(
      `${err.type ?? 'Error'}${
        err.message.includes(filename) ? '' : ' in ' + filename
      }: ${err.message}`,
    );

    // $FlowFixMe[prop-missing]
    // $FlowExpectedError[unsafe-object-assign] : TODO(t67543470): Change this to properly extend the error.
    return Object.assign(error, {
      stack: err.stack,
      snippet: err.codeFrame,
      lineNumber: err.loc.line,
      column: err.loc.column,
      filename,
    });
  }
}

class TransformError extends SyntaxError {
  type: string = 'TransformError';

  constructor(message: string) {
    super(message);
    Error.captureStackTrace && Error.captureStackTrace(this, TransformError);
  }
}
