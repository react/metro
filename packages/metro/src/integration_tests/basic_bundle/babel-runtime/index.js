/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

// `import * as` uses Babel's `interopRequireWildcard` helper, which
// `@babel/runtime` only provides from 7.14.0. It is imported from the runtime
// only when the preset is told a recent enough version, and inlined otherwise.
import * as values from './values';

export const answer = values.answer;
