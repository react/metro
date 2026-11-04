/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

declare module '@jridgewell/sourcemap-codec' {
  declare export type SourceMapSegment =
    | [number]
    | [number, number, number, number]
    | [number, number, number, number, number];

  declare export function decode(
    mappings: string,
  ): Array<Array<SourceMapSegment>>;
}
