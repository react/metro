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
 * Raised when a package contains an invalid `package.json` configuration.
 */
export default class InvalidPackageConfigurationError extends Error {
  /**
   * The description of the error cause.
   */
  reason: string;

  /**
   * Absolute path of the package being resolved.
   */
  packagePath: string;

  constructor(
    opts: Readonly<{
      reason: string,
      packagePath: string,
    }>,
  ) {
    super(
      `The package ${opts.packagePath} contains an invalid package.json ` +
        'configuration. Consider raising this issue with the package ' +
        'maintainer(s).\nReason: ' +
        opts.reason,
    );
    // $FlowFixMe[unsafe-object-assign]
    Object.assign(this, opts);
  }
}
