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

import traverse from '@babel/traverse';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type {JsTransformOptions as TransformOptions} from 'metro-transform-worker';

type TransformerInterface = {
  transform(
    JsTransformerConfig,
    string,
    string,
    Buffer,
    JsTransformOptions,
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
  );
};

export type Worker = {
  readonly transform: typeof transform,
};

async function transformFile(
  filename: string,
  data: Buffer,
  transformOptions: JsTransformOptions,
  projectRoot: string,
  transformerConfig: TransformerConfig,
): Promise<Data> {
  // eslint-disable-next-line no-useless-call
  const Transformer: TransformerInterface = require.call(
    null,
    transformerConfig.transformerPath,
  );

  const transformFileStartLogEntry: LogEntry = {
    action_name: 'Transforming file',
    action_phase: 'start',
    file_name: filename,
    log_entry_label: 'Transforming file',
    start_timestamp: process.hrtime(),
  };

  const sha1 = crypto.createHash('sha1').update(data).digest('hex');

  const result = await Transformer.transform(
    transformerConfig.transformerConfig,
    projectRoot,
    filename,
    data,
    transformOptions,
  );

  // The babel cache caches scopes and pathes for already traversed AST nodes.
  // Clearing the cache here since the nodes of the transformed file are no longer referenced.
  // This isn't stritcly necessary since the cache uses a WeakMap. However, WeakMap only permit
  // that unreferenced keys are collected but the values still hold references to the Scope and NodePaths.
  // Manually clearing the cache allows the GC to collect the Scope and NodePaths without checking if there
  // exist any other references to the keys.
  traverse.cache.clear();

  const transformFileEndLogEntry = getEndLogEntry(
    transformFileStartLogEntry,
    filename,
  );

  return {
    result,
    sha1,
    transformFileStartLogEntry,
    transformFileEndLogEntry,
  };
}

function getEndLogEntry(startLogEntry: LogEntry, filename: string): LogEntry {
  const timeDelta = process.hrtime(startLogEntry.start_timestamp);
  const duration_ms = Math.round((timeDelta[0] * 1e9 + timeDelta[1]) / 1e6);

  return {
    action_name: 'Transforming file',
    action_phase: 'end',
    file_name: filename,
    duration_ms,
    log_entry_label: 'Transforming file',
  };
}
