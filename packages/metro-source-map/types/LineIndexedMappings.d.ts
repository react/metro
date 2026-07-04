/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<b3f5bf11c317fcd72b08780359fb893c>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-source-map/src/LineIndexedMappings.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

/**
 * A compact, lazily-decoded view of one module's VLQ `mappings` for the
 * generated -> original position lookup that `/symbolicate` performs.
 *
 * Construction builds a per-line index: one entry per generated line holding the
 * byte offset into `mappings` where that line's segments begin and the
 * source-line/source-column delta accumulators as they stand entering the line.
 * A lookup jumps to the target line and decodes only that line's segments in
 * place over the retained `mappings` string, allocating nothing.
 *
 * VLQ deltas are cumulative across the whole string, so the index snapshots the
 * accumulator state at each line start to make any line independently
 * decodable. The index holds O(lines) integers; generated columns reset per
 * line and are not stored.
 */
declare class LineIndexedMappings {
  constructor(mappings: string);
  originalPositionFor(
    generatedLine1Based: number,
    generatedColumn0Based: number,
  ): null | undefined | {line1Based: number; column0Based: number};
}
export default LineIndexedMappings;
