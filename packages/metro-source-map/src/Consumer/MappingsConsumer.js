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

import type {BasicSourceMap} from '../source-map';
import type {
  GeneratedPositionLookup,
  IConsumer,
  Mapping,
  SourcePosition,
} from './types';
import type {Number0} from 'ob1';

import AbstractConsumer from './AbstractConsumer';
import {
  EMPTY_POSITION,
  FIRST_COLUMN,
  FIRST_LINE,
  GREATEST_LOWER_BOUND,
  lookupBiasToString,
} from './constants';
import normalizeSourcePath from './normalizeSourcePath';
import invariant from 'invariant';
import {add, add0, get0, get1, inc} from 'ob1';

/* eslint-disable no-bitwise */

const COMMA = 44; // ','
const SEMICOLON = 59; // ';'
const VLQ_BASE_SHIFT = 5;
const VLQ_BASE_MASK = (1 << VLQ_BASE_SHIFT) - 1;
const VLQ_CONTINUATION_BIT = 1 << VLQ_BASE_SHIFT;
const BASE64_DECODE: Int8Array = (() => {
  const table = new Int8Array(128).fill(-1);
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < chars.length; i++) {
    table[chars.charCodeAt(i)] = i;
  }
  return table;
})();

/**
 * A source map consumer that supports "basic" source maps (that have a
 * `mappings` field and no sections).
 */
export default class MappingsConsumer
  extends AbstractConsumer
  implements IConsumer
{
  _sourceMap: BasicSourceMap;
  _decodedMappings: ?ReadonlyArray<Mapping>;
  // The index in `_decodedMappings` of the first mapping on each generated
  // line (0-based), so a lookup only searches the mappings on its line.
  _lineStarts: ?ReadonlyArray<number>;
  _normalizedSources: ?ReadonlyArray<string>;

  constructor(sourceMap: BasicSourceMap) {
    super(sourceMap);
    this._sourceMap = sourceMap;
    this._decodedMappings = null;
    this._lineStarts = null;
    this._normalizedSources = null;
  }

  originalPositionFor(
    generatedPosition: GeneratedPositionLookup,
  ): SourcePosition {
    const {line, column} = generatedPosition;
    if (line == null || column == null) {
      return {...EMPTY_POSITION};
    }
    if (generatedPosition.bias != null) {
      invariant(
        generatedPosition.bias === GREATEST_LOWER_BOUND,
        `Unimplemented lookup bias: ${lookupBiasToString(
          // $FlowFixMe[incompatible-type]
          generatedPosition.bias,
        )}`,
      );
    }
    const mappings = this._decodeAndCacheMappings();
    const lineStarts = this._lineStarts;
    invariant(lineStarts != null, 'Expected line starts to be decoded');
    const line0 = get1(line) - 1;
    if (line0 < 0 || line0 >= lineStarts.length) {
      return {...EMPTY_POSITION};
    }
    // The last mapping on the line at or before `column`.
    let low = lineStarts[line0];
    let high =
      line0 + 1 < lineStarts.length ? lineStarts[line0 + 1] : mappings.length;
    const lineStart = low;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (get0(mappings[mid].generatedColumn) <= get0(column)) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    if (low > lineStart) {
      const mapping = mappings[low - 1];
      return {
        source: mapping.source,
        name: mapping.name,
        line: mapping.originalLine,
        column: mapping.originalColumn,
      };
    }
    return {...EMPTY_POSITION};
  }

  _decodeMappings(): Array<Mapping> {
    const normalizedSources = this._normalizeAndCacheSources();
    const {mappings: mappingsRaw, names} = this._sourceMap;
    const result: Array<Mapping> = [];
    const lineStarts = [0];

    let generatedLine = FIRST_LINE;
    let generatedColumn = FIRST_COLUMN;
    let originalLine = FIRST_LINE;
    let originalColumn = FIRST_COLUMN;
    let nameIndex = add0(0);
    let sourceIndex = add0(0);

    // The VLQ fields of the segment being decoded, decoded in place from
    // character codes rather than by slicing out each segment.
    const fields = [0, 0, 0, 0, 0];
    let fieldCount = 0;
    let value = 0;
    let shift = 0;

    const length = mappingsRaw.length;
    for (let i = 0; i <= length; i++) {
      const charCode = i < length ? mappingsRaw.charCodeAt(i) : SEMICOLON;
      if (charCode === COMMA || charCode === SEMICOLON) {
        // A trailing field cut off mid-VLQ is dropped, as `vlq` does.
        invariant(
          fieldCount > 0 || shift === 0,
          'Invalid generated column delta',
        );
        value = 0;
        shift = 0;
        if (fieldCount > 0) {
          invariant(fieldCount !== 2, 'Invalid original line delta');
          invariant(fieldCount !== 3, 'Invalid original column delta');
          generatedColumn = add(generatedColumn, fields[0]);
          let source = null;
          let name = null;
          let mappingOriginalLine = null;
          let mappingOriginalColumn = null;
          if (fieldCount >= 4) {
            sourceIndex = add(sourceIndex, fields[1]);
            source = normalizedSources[get0(sourceIndex)];
            originalLine = add(originalLine, fields[2]);
            originalColumn = add(originalColumn, fields[3]);
            mappingOriginalLine = originalLine;
            mappingOriginalColumn = originalColumn;
            if (fieldCount >= 5) {
              nameIndex = add(nameIndex, fields[4]);
              name = names[get0(nameIndex)];
            }
          }
          result.push({
            generatedLine,
            generatedColumn,
            source,
            name,
            originalLine: mappingOriginalLine,
            originalColumn: mappingOriginalColumn,
          });
          fieldCount = 0;
        }
        if (charCode === SEMICOLON && i < length) {
          lineStarts.push(result.length);
          generatedLine = inc(generatedLine);
          generatedColumn = FIRST_COLUMN;
        }
        continue;
      }
      const digit = charCode < 128 ? BASE64_DECODE[charCode] : -1;
      invariant(digit !== -1, 'Invalid character in source map mappings');
      value = value + ((digit & VLQ_BASE_MASK) << shift);
      if (digit & VLQ_CONTINUATION_BIT) {
        shift = shift + VLQ_BASE_SHIFT;
      } else {
        const negate = value & 1;
        value = value >> 1;
        if (fieldCount < 5) {
          fields[fieldCount] = negate ? -value : value;
        }
        fieldCount++;
        value = 0;
        shift = 0;
      }
    }
    this._lineStarts = lineStarts;
    return result;
  }

  _normalizeAndCacheSources(): ReadonlyArray<string> {
    if (!this._normalizedSources) {
      this._normalizedSources = this._sourceMap.sources.map(source =>
        normalizeSourcePath(source, this._sourceMap),
      );
    }
    return this._normalizedSources;
  }

  _decodeAndCacheMappings(): ReadonlyArray<Mapping> {
    if (!this._decodedMappings) {
      this._decodedMappings = this._decodeMappings();
    }
    return this._decodedMappings;
  }

  generatedMappings(): Iterable<Mapping> {
    return this._decodeAndCacheMappings();
  }

  _indexOfSource(source: string): ?Number0 {
    const idx = this._normalizeAndCacheSources().indexOf(
      normalizeSourcePath(source, this._sourceMap),
    );
    if (idx === -1) {
      return null;
    }
    return add0(idx);
  }

  sourceContentFor(source: string, nullOnMissing: true): ?string {
    const {sourcesContent} = this._sourceMap;
    if (!sourcesContent) {
      return null;
    }
    const idx = this._indexOfSource(source);
    if (idx == null) {
      return null;
    }
    return sourcesContent[get0(idx)] ?? null;
  }
}
