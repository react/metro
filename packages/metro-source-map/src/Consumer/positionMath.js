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

import type {GeneratedOffset} from './types';
import type {Number0, Number1} from 'ob1';

import {add, add0, add1, neg} from 'ob1';

export function shiftPositionByOffset<
  T extends {
    readonly line: ?Number1,
    readonly column: ?Number0,
    ...
  },
>(pos: T, offset: GeneratedOffset): T {
  return {
    ...pos,
    line: pos.line != null ? add(pos.line, offset.lines) : null,
    column: pos.column != null ? add(pos.column, offset.columns) : null,
  };
}

export function subtractOffsetFromPosition<
  T extends {
    readonly line: ?Number1,
    readonly column: ?Number0,
    ...
  },
>(pos: T, offset: GeneratedOffset): T {
  if (pos.line === add1(offset.lines)) {
    return shiftPositionByOffset(pos, {
      lines: neg(offset.lines),
      columns: neg(offset.columns),
    });
  }
  return shiftPositionByOffset(pos, {
    lines: neg(offset.lines),
    columns: add0(0),
  });
}
