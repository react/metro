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

const newline = /\r\n?|\n|\u2028|\u2029/g;

export default function countLines(string: string): number {
  return (string.match(newline) || []).length + 1;
}
