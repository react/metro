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

import type {MixedSourceMap} from '../source-map';
import type {LookupBias} from './constants.js';
import type {
  GeneratedPositionLookup,
  IConsumer,
  IterationOrder,
  Mapping,
  SourcePosition,
} from './types';

import {
  GENERATED_ORDER,
  GREATEST_LOWER_BOUND,
  LEAST_UPPER_BOUND,
  ORIGINAL_ORDER,
} from './constants';
import createConsumer from './createConsumer';

/**
 * A source map consumer that supports both "basic" and "indexed" source maps.
 * Uses `MappingsConsumer` and `SectionsConsumer` under the hood (via
 * `createConsumer`).
 */
export default class DelegatingConsumer implements IConsumer {
  static readonly GENERATED_ORDER: IterationOrder = GENERATED_ORDER;
  static readonly ORIGINAL_ORDER: IterationOrder = ORIGINAL_ORDER;
  static readonly GREATEST_LOWER_BOUND: LookupBias = GREATEST_LOWER_BOUND;
  static readonly LEAST_UPPER_BOUND: LookupBias = LEAST_UPPER_BOUND;

  _rootConsumer: IConsumer;

  // $FlowFixMe[incompatible-type]
  constructor(sourceMap: MixedSourceMap): IConsumer {
    this._rootConsumer = createConsumer(sourceMap);
    return this._rootConsumer;
  }

  originalPositionFor(
    generatedPosition: GeneratedPositionLookup,
  ): SourcePosition {
    return this._rootConsumer.originalPositionFor(generatedPosition);
  }

  generatedMappings(): Iterable<Mapping> {
    return this._rootConsumer.generatedMappings();
  }

  eachMapping(
    callback: (mapping: Mapping) => unknown,
    context?: unknown,
    order?: IterationOrder,
  ): void {
    return this._rootConsumer.eachMapping(callback, context, order);
  }

  // flowlint-next-line unsafe-getters-setters:off
  get file(): ?string {
    return this._rootConsumer.file;
  }

  sourceContentFor(source: string, nullOnMissing: true): ?string {
    return this._rootConsumer.sourceContentFor(source, nullOnMissing);
  }
}
