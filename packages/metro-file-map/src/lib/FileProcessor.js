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

import type {
  FileMapPluginWorker,
  FileMetadata,
  PerfLogger,
  WorkerMessage,
  WorkerMetadata,
  WorkerSetupArgs,
} from '../flow-types';

import H from '../constants';
import {Worker} from '../worker';
import {RootPathUtils} from './RootPathUtils';
import debugModule from 'debug';
import {Worker as JestWorker} from 'jest-worker';
import {sep} from 'node:path';

const debug = debugModule('Metro:FileMap');

type ProcessFileRequest = Readonly<{
  /**
   * Populate metadata[H.SHA1] with the SHA1 of the file's contents.
   */
  computeSha1: boolean,
  /**
   * Only if processing has already required reading the file's contents, return
   * the contents as a Buffer - null otherwise. Not supported for batches.
   */
  maybeReturnContent: boolean,
}>;

interface AsyncWorker {
  readonly processFile: WorkerMessage => Promise<WorkerMetadata>;
  readonly end: () => Promise<void>;
}

interface MaybeCodedError extends Error {
  code?: string;
}

const NODE_MODULES_SEP = 'node_modules' + sep;
const MAX_FILES_PER_WORKER = 100;

export class FileProcessor {
  #maxFilesPerWorker: number;
  #maxWorkers: number;
  #perfLogger: ?PerfLogger;
  #pluginWorkers: ReadonlyArray<FileMapPluginWorker>;
  #inBandWorker: Worker;
  #rootPathUtils: RootPathUtils;

  constructor(
    opts: Readonly<{
      maxFilesPerWorker?: ?number,
      maxWorkers: number,
      pluginWorkers: ?ReadonlyArray<FileMapPluginWorker>,
      perfLogger: ?PerfLogger,
      rootDir: string,
    }>,
  ) {
    this.#maxFilesPerWorker = opts.maxFilesPerWorker ?? MAX_FILES_PER_WORKER;
    this.#maxWorkers = opts.maxWorkers;
    this.#pluginWorkers = opts.pluginWorkers ?? [];
    this.#inBandWorker = new Worker({
      plugins: this.#pluginWorkers.map(plugin => plugin.worker),
    });
    this.#perfLogger = opts.perfLogger;
    this.#rootPathUtils = new RootPathUtils(opts.rootDir);
  }

  async processBatch(
    files: ReadonlyArray<[string /*relativePath*/, FileMetadata]>,
    req: ProcessFileRequest,
  ): Promise<{
    errors: Array<{
      normalFilePath: string,
      error: MaybeCodedError,
    }>,
  }> {
    const errors = [];

    const workerJobs = files
      .map(([normalFilePath, fileMetadata]) => {
        const maybeWorkerInput = this.#getWorkerInput(
          normalFilePath,
          fileMetadata,
          req,
        );
        if (!maybeWorkerInput) {
          return null;
        }
        return [maybeWorkerInput, fileMetadata];
      })
      .filter(Boolean);

    const numWorkers = Math.min(
      this.#maxWorkers,
      Math.ceil(workerJobs.length / this.#maxFilesPerWorker),
    );
    const batchWorker = this.#getBatchWorker(numWorkers);

    if (req.maybeReturnContent) {
      throw new Error(
        'Batch processing does not support returning file contents',
      );
    }

    await Promise.all(
      workerJobs.map(([workerInput, fileMetadata]) => {
        return batchWorker
          .processFile(workerInput)
          .then(reply =>
            processWorkerReply(reply, workerInput.pluginsToRun, fileMetadata),
          )
          .catch(error =>
            errors.push({
              normalFilePath: this.#rootPathUtils.absoluteToNormal(
                workerInput.filePath,
              ),
              error: normalizeWorkerError(error),
            }),
          );
      }),
    );
    await batchWorker.end();
    return {errors};
  }

  processRegularFile(
    normalPath: string,
    fileMetadata: FileMetadata,
    req: ProcessFileRequest,
  ): ?{content: ?Buffer} {
    const workerInput = this.#getWorkerInput(normalPath, fileMetadata, req);
    return workerInput
      ? {
          content: processWorkerReply(
            this.#inBandWorker.processFile(workerInput),
            workerInput.pluginsToRun,
            fileMetadata,
          ),
        }
      : null;
  }

  #getWorkerInput(
    normalPath: string,
    fileMetadata: FileMetadata,
    req: ProcessFileRequest,
  ): ?WorkerMessage {
    if (fileMetadata[H.SYMLINK] !== 0) {
      // Only process regular files
      return null;
    }

    const computeSha1 = req.computeSha1 && fileMetadata[H.SHA1] == null;
    const {maybeReturnContent} = req;

    const nodeModulesIdx = normalPath.indexOf(NODE_MODULES_SEP);
    // Path may begin 'node_modules/' or contain '/node_modules/'.
    const isNodeModules =
      nodeModulesIdx === 0 ||
      (nodeModulesIdx > 0 && normalPath[nodeModulesIdx - 1] === sep);

    // Indices of plugins with a passing filter
    const pluginsToRun =
      this.#pluginWorkers?.reduce((prev, plugin, idx) => {
        if (plugin.filter({isNodeModules, normalPath})) {
          prev.push(idx);
        }
        return prev;
      }, [] as Array<number>) ?? [];

    if (!computeSha1 && pluginsToRun.length === 0) {
      // Nothing to process
      return null;
    }

    // Use a cheaper worker configuration for node_modules files, because
    // they may never be Haste modules or packages.
    //
    // Note that we'd only expect node_modules files to reach this point if
    // retainAllFiles is true, or they're touched during watch mode.
    if (isNodeModules) {
      if (computeSha1) {
        return {
          computeSha1: true,
          filePath: this.#rootPathUtils.normalToAbsolute(normalPath),
          maybeReturnContent,
          pluginsToRun,
        };
      }
      return null;
    }

    return {
      computeSha1,
      filePath: this.#rootPathUtils.normalToAbsolute(normalPath),
      maybeReturnContent,
      pluginsToRun,
    };
  }

  /**
   * Creates workers or parses files and extracts metadata in-process.
   */
  #getBatchWorker(numWorkers: number): AsyncWorker {
    if (numWorkers <= 1) {
      // In-band worker with the same interface as a Jest worker farm
      return {
        processFile: async message => this.#inBandWorker.processFile(message),
        end: async () => {},
      };
    }
    const workerPath = require.resolve('../worker');
    debug('Creating worker farm of %d worker threads', numWorkers);
    this.#perfLogger?.point('initWorkers_start');
    const jestWorker = new JestWorker<{
      processFile: WorkerMessage => Promise<WorkerMetadata>,
    }>(workerPath, {
      exposedMethods: ['processFile'],
      maxRetries: 3,
      numWorkers,
      enableWorkerThreads: true,
      forkOptions: {
        // Don't pass Node arguments down to workers. In particular, avoid
        // unnecessarily registering Babel when we're running Metro from
        // source (our worker is plain CommonJS).
        execArgv: [],
      },
      setupArgs: [
        {
          plugins: this.#pluginWorkers.map(plugin => plugin.worker),
        } as WorkerSetupArgs,
      ],
    });
    this.#perfLogger?.point('initWorkers_end');
    // Only log worker init once
    this.#perfLogger = null;
    return jestWorker;
  }

  async end(): Promise<void> {}
}

function processWorkerReply(
  metadata: WorkerMetadata,
  pluginsRun: ReadonlyArray<number>,
  fileMetadata: FileMetadata,
) {
  fileMetadata[H.VISITED] = 1;
  const pluginData = metadata.pluginData;
  if (pluginData) {
    for (const [i, pluginIdx] of pluginsRun.entries()) {
      // $FlowFixMe[invalid-tuple-index]
      fileMetadata[H.PLUGINDATA + pluginIdx] = pluginData[i];
    }
  }

  if (metadata.sha1 != null) {
    fileMetadata[H.SHA1] = metadata.sha1;
  }

  return metadata.content;
}

function normalizeWorkerError(mixedError: ?Error | string): MaybeCodedError {
  if (
    mixedError == null ||
    typeof mixedError !== 'object' ||
    mixedError.message == null ||
    mixedError.stack == null
  ) {
    const error = new Error(mixedError);
    error.stack = ''; // Remove stack for stack-less errors.
    return error;
  }
  return mixedError;
}
