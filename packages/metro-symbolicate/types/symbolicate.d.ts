/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<cf5eb72b236393b4e08cc4b1814f4e49>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-symbolicate/src/symbolicate.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {Readable, Writable} from 'node:stream';
import type {ReadStream} from 'node:tty';

declare function main(
  argvInput?: Array<string>,
  $$PARAM_1$$?: Readonly<{
    stdin: Readable | ReadStream;
    stderr: Writable;
    stdout: Writable;
  }>,
): Promise<number>;
export default main;
