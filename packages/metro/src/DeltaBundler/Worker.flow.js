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

import type {TransformResult} from './types';
import type {LogEntry} from 'metro-core/private/Logger';
import type {
  JsTransformerConfig,
  JsTransformOptions,
} from 'metro-transform-worker';

import {traverse} from '@babel/core';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {isMainThread} from 'node:worker_threads';

export type {JsTransformOptions as TransformOptions} from 'metro-transform-worker';

type TransformerInterface = {
  transform(
    config: JsTransformerConfig,
    projectRoot: string,
    projectRelativePath: string,
    data: Buffer,
    options: JsTransformOptions,
    assetUrlPath: ?string,
  ): Promise<TransformResult<>>,
};

export type TransformerConfig = {
  transformerPath: string,
  transformerConfig: JsTransformerConfig,
  ...
};

type Data = Readonly<{
  result: TransformResult<>,
  sha1: string,
  transformFileStartLogEntry: LogEntry,
  transformFileEndLogEntry: LogEntry,
}>;

// jest-worker assigns the ID of the worker to JEST_WORKER_ID in a worker thread,
// regardless of the `env` it is given. Transform output must not depend on the
// worker that produced it, and a Babel plugin may inline any environment
// variable.
delete process.env.JEST_WORKER_ID;

// Whether this module runs in a worker of its own. jest-worker calls `setup`
// in each worker process or thread it starts; with `maxWorkers` of 1,
// WorkerFarm loads this module into Metro's own process and never calls it.
let isInOwnWorker = false;

export function setup(): void {
  isInOwnWorker = true;
}

/**
 * When the `Buffer` is sent over the worker thread it gets serialized into a JSON object.
 * This helper method will deserialize it if needed.
 *
 * @returns `Buffer` representation of the JSON object.
 * @returns `null` if the given object is nullish or not a serialized `Buffer` object.
 */
function asDeserializedBuffer(value: any): Buffer | null {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value && value.type === 'Buffer') {
    return Buffer.from(value.data);
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

export const transform = (
  filename: string,
  transformOptions: JsTransformOptions,
  projectRoot: string,
  transformerConfig: TransformerConfig,
  fileBuffer?: Buffer,
  assetUrlPath?: string,
): Promise<Data> => {
  let data;

  const fileBufferObject = asDeserializedBuffer(fileBuffer);
  if (fileBufferObject) {
    data = fileBufferObject;
  } else {
    data = fs.readFileSync(path.resolve(projectRoot, filename));
  }
  return transformFile(
    filename,
    data,
    transformOptions,
    projectRoot,
    transformerConfig,
    assetUrlPath,
  );
};

export type Worker = {
  readonly transform: typeof transform,
};

async function transformFile(
  projectRelativePath: string,
  data: Buffer,
  transformOptions: JsTransformOptions,
  projectRoot: string,
  transformerConfig: TransformerConfig,
  assetUrlPath?: string,
): Promise<Data> {
  // eslint-disable-next-line no-useless-call
  const Transformer: TransformerInterface = require.call(
    null,
    transformerConfig.transformerPath,
  );

  const transformFileStartLogEntry: LogEntry = {
    action_name: 'Transforming file',
    action_phase: 'start',
    file_name: projectRelativePath,
    log_entry_label: 'Transforming file',
    start_timestamp: process.hrtime(),
  };

  const cpuUsageAtStart = getCpuUsage();

  const sha1 = crypto.createHash('sha1').update(data).digest('hex');

  const result = await Transformer.transform(
    transformerConfig.transformerConfig,
    projectRoot,
    projectRelativePath,
    data,
    transformOptions,
    assetUrlPath,
  );

  // The babel cache caches scopes and paths for already traversed AST nodes.
  // Clearing the cache here since the nodes of the transformed file are no longer referenced.
  // This isn't strictly necessary since the cache uses a WeakMap. However, WeakMaps only permit
  // that unreferenced keys are collected but the values still hold references to the Scope and NodePaths.
  // Manually clearing the cache allows the GC to collect the Scope and NodePaths without checking if there
  // exist any other references to the keys.
  traverse.cache.clear();

  const transformFileEndLogEntry = getEndLogEntry(
    transformFileStartLogEntry,
    projectRelativePath,
    cpuUsageAtStart,
  );

  return {
    result,
    sha1,
    transformFileStartLogEntry,
    transformFileEndLogEntry,
  };
}

type CpuUsage = Readonly<{user: number, system: number}>;

// The CPU time of this worker, in microseconds. A child process worker runs one
// transform at a time, so its whole process is counted. Worker threads share a
// process, so a thread reads only its own time, where Node supports it
// (`process.threadCpuUsage`, added in Node 23.9). In Metro's own process,
// transforms interleave with each other and with the server's work, so none
// is measured there.
function getCpuUsage(): ?CpuUsage {
  if (!isInOwnWorker) {
    return null;
  }
  if (isMainThread) {
    const {user, system} = process.cpuUsage();
    return {user, system};
  }
  // Not in the Node library definitions yet.
  const threadCpuUsage = Reflect.get(process, 'threadCpuUsage');
  if (typeof threadCpuUsage !== 'function') {
    return null;
  }
  const usage: unknown = threadCpuUsage();
  if (
    usage != null &&
    typeof usage === 'object' &&
    typeof usage.user === 'number' &&
    typeof usage.system === 'number'
  ) {
    return {user: usage.user, system: usage.system};
  }
  return null;
}

function getEndLogEntry(
  startLogEntry: LogEntry,
  filename: string,
  cpuUsageAtStart: ?CpuUsage,
): LogEntry {
  const timeDelta = process.hrtime(startLogEntry.start_timestamp);
  const duration_ms = Math.round((timeDelta[0] * 1e9 + timeDelta[1]) / 1e6);
  const cpuUsageAtEnd = cpuUsageAtStart != null ? getCpuUsage() : null;

  return {
    action_name: 'Transforming file',
    action_phase: 'end',
    file_name: filename,
    duration_ms,
    ...(cpuUsageAtStart != null && cpuUsageAtEnd != null
      ? {
          cpu_time_us:
            cpuUsageAtEnd.user -
            cpuUsageAtStart.user +
            (cpuUsageAtEnd.system - cpuUsageAtStart.system),
        }
      : null),
    log_entry_label: 'Transforming file',
  };
}
