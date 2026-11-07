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

/**
 * Raised when package imports do not define or permit a target subpath in the
 * package for the given import specifier.
 */
export default class PackageImportNotResolvedError extends Error {
  /**
   * Either the import specifier read, or the absolute path of the module being
   * resolved (used when import specifier is externally remapped).
   */
  readonly importSpecifier: string;

  /**
   * The description of the error cause.
   */
  readonly reason: string;

  constructor(
    opts: Readonly<{
      importSpecifier: string,
      reason: string,
    }>,
  ) {
    super(
      `The path for ${opts.importSpecifier} could not be resolved.\nReason: ` +
        opts.reason,
    );
    this.importSpecifier = opts.importSpecifier;
    this.reason = opts.reason;
  }
}
