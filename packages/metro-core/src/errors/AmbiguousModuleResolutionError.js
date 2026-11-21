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

interface HasteCandidatesError {
  readonly message: string;
  readonly hasteName: string;
  readonly platform: string | null;
  readonly supportsNativePlatform: boolean;
  readonly duplicatesSet: ReadonlyMap<string, number>;
}

export default class AmbiguousModuleResolutionError extends Error {
  fromModulePath: string;
  hasteError: HasteCandidatesError;

  constructor(fromModulePath: string, hasteError: HasteCandidatesError) {
    super(
      `Ambiguous module resolution from \`${fromModulePath}\`: ` +
        hasteError.message,
    );
    this.fromModulePath = fromModulePath;
    this.hasteError = hasteError;
  }
}
