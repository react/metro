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

import type {DuplicateHasteCandidatesError} from 'metro-file-map';

export default class AmbiguousModuleResolutionError extends Error {
  fromModulePath: string;
  hasteError: DuplicateHasteCandidatesError;

  constructor(
    fromModulePath: string,
    hasteError: DuplicateHasteCandidatesError,
  ) {
    super(
      `Ambiguous module resolution from \`${fromModulePath}\`: ` +
        hasteError.message,
    );
    this.fromModulePath = fromModulePath;
    this.hasteError = hasteError;
  }
}
