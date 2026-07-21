/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<1c9e77c89ab61bbb8fea403a63e33ab2>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/JsonReporter.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Writable} from 'node:stream';

export type SerializedError = {
  message: string;
  stack: string;
  errors?: ReadonlyArray<SerializedError>;
  cause?: SerializedError;
};
export type SerializedEvent<TEvent extends {readonly [$$Key$$: string]: unknown}> = TEvent extends {error: Error} ? Omit<Omit<TEvent, 'error'>, 'error'> & {error: SerializedError} : TEvent;
declare class JsonReporter<TEvent extends {readonly [$$Key$$: string]: unknown}> {
  constructor(stream: Writable);
  /**
   * There is a special case for errors because they have non-enumerable fields.
   * (Perhaps we should switch in favor of plain object?)
   */
  update(event: TEvent): void;
}
export default JsonReporter;
