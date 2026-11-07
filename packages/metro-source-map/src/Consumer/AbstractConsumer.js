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
  GeneratedPositionLookup,
  IConsumer,
  IterationOrder,
  Mapping,
  SourcePosition,
} from './types';

import {GENERATED_ORDER, iterationOrderToString} from './constants';
import invariant from 'invariant';

// Implementation details shared between MappingsConsumer and SectionsConsumer
export default class AbstractConsumer implements IConsumer {
  _sourceMap: {readonly file?: string, ...};

  constructor(sourceMap: {readonly file?: string, ...}) {
    this._sourceMap = sourceMap;
  }

  originalPositionFor(
    generatedPosition: GeneratedPositionLookup,
  ): SourcePosition {
    invariant(false, 'Not implemented');
  }

  generatedMappings(): Iterable<Mapping> {
    invariant(false, 'Not implemented');
  }

  eachMapping(
    callback: (mapping: Mapping) => unknown,
    context?: unknown = null,
    order?: IterationOrder = GENERATED_ORDER,
  ): void {
    invariant(
      order === GENERATED_ORDER,
      `Iteration order not implemented: ${iterationOrderToString(order)}`,
    );
    for (const mapping of this.generatedMappings()) {
      callback.call(context, mapping);
    }
  }

  // flowlint-next-line unsafe-getters-setters:off
  get file(): ?string {
    return this._sourceMap.file;
  }

  sourceContentFor(source: string, nullOnMissing: true): ?string {
    invariant(false, 'Not implemented');
  }
}
