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

import type {IterationOrder, LookupBias} from './constants';
import type {Number0, Number1} from 'ob1';

export type {IterationOrder, LookupBias};
export type GeneratedOffset = {
  readonly lines: Number0,
  readonly columns: Number0,
};
export type SourcePosition = {
  source: ?string,
  line: ?Number1,
  column: ?Number0,
  name: ?string,
  ...
};
export type GeneratedPosition = {
  readonly line: Number1,
  readonly column: Number0,
  ...
};
export type GeneratedPositionLookup = {
  readonly line: ?Number1,
  readonly column: ?Number0,
  readonly bias?: LookupBias,
  ...
};

export type Mapping = Readonly<{
  source: ?string,
  generatedLine: Number1,
  generatedColumn: Number0,
  originalLine: ?Number1,
  originalColumn: ?Number0,
  name: ?string,
  ...
}>;

export interface IConsumer {
  originalPositionFor(
    generatedPosition: GeneratedPositionLookup,
  ): SourcePosition;

  generatedMappings(): Iterable<Mapping>;

  eachMapping(
    callback: (mapping: Mapping) => unknown,
    context?: unknown,
    order?: IterationOrder,
  ): void;

  // flowlint-next-line unsafe-getters-setters:off
  get file(): ?string;

  sourceContentFor(
    source: string,
    /* nullOnMissing = false behaves inconsistently upstream, so we don't support it */
    nullOnMissing: true,
  ): ?string;
}
