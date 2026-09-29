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

import type {IndexMap} from '../source-map';
import type {
  GeneratedOffset,
  GeneratedPositionLookup,
  IConsumer,
  Mapping,
  SourcePosition,
} from './types';

import AbstractConsumer from './AbstractConsumer';
import {EMPTY_POSITION, FIRST_COLUMN, FIRST_LINE} from './constants';
import createConsumer from './createConsumer';
import {subtractOffsetFromPosition} from './positionMath';
import {greatestLowerBound} from './search';
import {add, add0, get0, get1, sub, sub1} from 'ob1';

/**
 * A source map consumer that supports "indexed" source maps (that have a
 * `sections` field and no top-level mappings).
 */
export default class SectionsConsumer
  extends AbstractConsumer
  implements IConsumer
{
  _consumers: ReadonlyArray<[GeneratedOffset, IConsumer]>;

  constructor(sourceMap: IndexMap) {
    super(sourceMap);
    this._consumers = sourceMap.sections.map((section, index) => {
      const generatedOffset = {
        lines: add0(section.offset.line),
        columns: add0(section.offset.column),
      };
      const consumer = createConsumer(section.map);
      return [generatedOffset, consumer];
    });
  }

  originalPositionFor(
    generatedPosition: GeneratedPositionLookup,
  ): SourcePosition {
    const [generatedOffset, consumer] =
      this._consumerForPosition(generatedPosition) || [];
    if (!consumer) {
      return {...EMPTY_POSITION};
    }
    return consumer.originalPositionFor(
      subtractOffsetFromPosition(generatedPosition, generatedOffset),
    );
  }

  *generatedMappings(): Iterable<Mapping> {
    for (const [generatedOffset, consumer] of this._consumers) {
      let first = true;
      for (const mapping of consumer.generatedMappings()) {
        if (
          first &&
          (get1(mapping.generatedLine) > 1 || get0(mapping.generatedColumn) > 0)
        ) {
          yield {
            generatedLine: add(FIRST_LINE, generatedOffset.lines),
            generatedColumn: add(FIRST_COLUMN, generatedOffset.columns),
            source: null,
            name: null,
            originalLine: null,
            originalColumn: null,
          };
        }
        first = false;
        yield {
          ...mapping,
          generatedLine: add(mapping.generatedLine, generatedOffset.lines),
          generatedColumn:
            mapping.generatedLine === FIRST_LINE
              ? add(mapping.generatedColumn, generatedOffset.columns)
              : mapping.generatedColumn,
        };
      }
    }
  }

  _consumerForPosition(
    generatedPosition: GeneratedPositionLookup,
  ): ?[GeneratedOffset, IConsumer] {
    const {line, column} = generatedPosition;
    if (line == null || column == null) {
      return null;
    }
    const index = greatestLowerBound(
      this._consumers,
      generatedPosition,
      (position, [offset]) => {
        const line0 = sub1(line);
        const column0 = column;
        if (line0 === offset.lines) {
          return get0(sub(column0, offset.columns));
        }
        return get0(sub(line0, offset.lines));
      },
    );
    return index != null ? this._consumers[index] : null;
  }

  sourceContentFor(source: string, nullOnMissing: true): ?string {
    for (const [_, consumer] of this._consumers) {
      const content = consumer.sourceContentFor(source, nullOnMissing);
      if (content != null) {
        return content;
      }
    }
    return null;
  }
}
