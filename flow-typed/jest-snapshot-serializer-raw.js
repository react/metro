/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 */

declare module 'jest-snapshot-serializer-raw' {
  declare opaque type Wrapper;
  declare export function wrap(value: string): Wrapper;
  declare export function test(value: unknown): boolean;
  declare export function print(value: Wrapper): string;
}
