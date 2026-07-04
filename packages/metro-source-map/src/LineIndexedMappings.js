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

/* eslint-disable no-bitwise */

// Base64 digit lookup for the VLQ decoder below. Indexed by char code; -1
// marks a non-base64 character (never hit inside a well-formed segment).
const BASE64_VALUES: Int16Array = (() => {
  const table = new Int16Array(128).fill(-1);
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < chars.length; i++) {
    table[chars.charCodeAt(i)] = i;
  }
  return table;
})();

const VLQ_SEMICOLON = 59; // ';' generated-line separator
const VLQ_COMMA = 44; // ',' segment separator

// Consume one base64-VLQ value from `mappings` starting at `cursor[0]`,
// advancing `cursor[0]` past it. A one-element array is used as a mutable
// cursor so the scan can share this helper without per-call closures.
function readVlq(mappings: string, cursor: [number]): number {
  let shift = 0;
  let value = 0;
  let continuation;
  let i = cursor[0];
  do {
    const digit = BASE64_VALUES[mappings.charCodeAt(i++)];
    continuation = digit & 32;
    value = value + ((digit & 31) << shift);
    shift = shift + 5;
  } while (continuation);
  cursor[0] = i;
  const shouldNegate = value & 1;
  value = value >>> 1;
  return shouldNegate ? -value : value;
}

// True if another segment field (not a ';'/',' separator) begins at `index`.
function isFieldAhead(
  mappings: string,
  index: number,
  length: number,
): boolean {
  return (
    index < length &&
    mappings.charCodeAt(index) !== VLQ_SEMICOLON &&
    mappings.charCodeAt(index) !== VLQ_COMMA
  );
}

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
export default class LineIndexedMappings {
  #mappings: string;
  // One entry per generated line, indexed by (generatedLine1Based - 1).
  #lineByteOffset: Int32Array; // start of the line's segments in `#mappings`
  #srcLineAtLineStart: Int32Array; // originalLine accumulator (1-based) entering the line
  #srcColAtLineStart: Int32Array; // originalColumn accumulator (0-based) entering the line
  #lineCount: number;

  constructor(mappings: string) {
    const length = mappings.length;

    // One generated line per ';' separator, plus one; an empty string is a
    // single empty line.
    let lineCount = 1;
    for (let i = 0; i < length; i++) {
      if (mappings.charCodeAt(i) === VLQ_SEMICOLON) {
        lineCount++;
      }
    }

    const lineByteOffset = new Int32Array(lineCount);
    const srcLineAtLineStart = new Int32Array(lineCount);
    const srcColAtLineStart = new Int32Array(lineCount);

    // Record the offset and source-line/source-column accumulators at each
    // line's start. Source lines are 1-based, columns 0-based. Segment fields
    // are decoded only far enough to advance the accumulators; generated
    // columns and source/name indices are dropped.
    let originalLine = 1;
    let originalColumn = 0;
    let line = 0;
    const cursor: [number] = [0];

    lineByteOffset[0] = 0;
    srcLineAtLineStart[0] = originalLine;
    srcColAtLineStart[0] = originalColumn;

    while (cursor[0] < length) {
      const c = mappings.charCodeAt(cursor[0]);
      if (c === VLQ_SEMICOLON) {
        cursor[0]++;
        line++;
        lineByteOffset[line] = cursor[0];
        srcLineAtLineStart[line] = originalLine;
        srcColAtLineStart[line] = originalColumn;
        continue;
      }
      if (c === VLQ_COMMA) {
        cursor[0]++;
        continue;
      }

      // Segment: [genCol, srcIndex, srcLine, srcCol(, name)]. genCol resets per
      // line and doesn't feed the accumulators, so skip its digits.
      readVlq(mappings, cursor); // generated column delta (unused)
      if (isFieldAhead(mappings, cursor[0], length)) {
        readVlq(mappings, cursor); // sourceIndex delta (unused)
        originalLine = originalLine + readVlq(mappings, cursor);
        originalColumn = originalColumn + readVlq(mappings, cursor);
        if (isFieldAhead(mappings, cursor[0], length)) {
          readVlq(mappings, cursor); // nameIndex delta (unused)
        }
      }
    }

    this.#mappings = mappings;
    this.#lineByteOffset = lineByteOffset;
    this.#srcLineAtLineStart = srcLineAtLineStart;
    this.#srcColAtLineStart = srcColAtLineStart;
    this.#lineCount = lineCount;
  }

  originalPositionFor(
    generatedLine1Based: number,
    generatedColumn0Based: number,
  ): ?{line1Based: number, column0Based: number} {
    if (generatedLine1Based < 1 || generatedLine1Based > this.#lineCount) {
      return null;
    }
    const lineIndex = generatedLine1Based - 1;
    const mappings = this.#mappings;
    const length = mappings.length;

    const cursor: [number] = [this.#lineByteOffset[lineIndex]];
    let originalLine = this.#srcLineAtLineStart[lineIndex];
    let originalColumn = this.#srcColAtLineStart[lineIndex];
    let generatedColumn = 0;

    // Segments are sorted by generated column, so the last one with column <=
    // the target is the match; stop as soon as one overshoots. A generated-only
    // match carries no source position and resolves to null.
    let found = false;
    let foundHasSource = false;
    let foundLine = 0;
    let foundColumn = 0;

    while (cursor[0] < length) {
      const c = mappings.charCodeAt(cursor[0]);
      if (c === VLQ_SEMICOLON) {
        break; // end of this generated line
      }
      if (c === VLQ_COMMA) {
        cursor[0]++;
        continue;
      }

      generatedColumn = generatedColumn + readVlq(mappings, cursor);
      if (generatedColumn > generatedColumn0Based) {
        break; // this and all later segments on the line exceed the target
      }

      if (isFieldAhead(mappings, cursor[0], length)) {
        readVlq(mappings, cursor); // sourceIndex delta (unused)
        originalLine = originalLine + readVlq(mappings, cursor);
        originalColumn = originalColumn + readVlq(mappings, cursor);
        if (isFieldAhead(mappings, cursor[0], length)) {
          readVlq(mappings, cursor); // nameIndex delta (unused)
        }
        found = true;
        foundHasSource = true;
        foundLine = originalLine;
        foundColumn = originalColumn;
      } else {
        // Generated-only mapping: no original position.
        found = true;
        foundHasSource = false;
      }
    }

    if (!found || !foundHasSource) {
      return null;
    }
    return {line1Based: foundLine, column0Based: foundColumn};
  }
}
