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

export interface CacheStore<T> {
  name?: string;
  get(key: Buffer): ?T | Promise<?T>;
  set(key: Buffer, value: T): void | Promise<void>;
  clear(): void | Promise<void>;
}
