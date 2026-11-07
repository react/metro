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

import type {InvalidPackageError} from 'metro-resolver';

import {formatFileCandidates} from 'metro-resolver';

export default class PackageResolutionError extends Error {
  originModulePath: string;
  packageError: InvalidPackageError;
  targetModuleName: string;

  constructor(opts: {
    readonly originModulePath: string,
    readonly packageError: InvalidPackageError,
    readonly targetModuleName: string,
  }) {
    const perr = opts.packageError;
    super(
      `While trying to resolve module \`${opts.targetModuleName}\` from file ` +
        `\`${opts.originModulePath}\`, the package ` +
        `\`${perr.packageJsonPath}\` was successfully found. However, ` +
        'this package itself specifies ' +
        'a `main` module field that could not be resolved (' +
        `\`${perr.mainModulePath}\`. Indeed, none of these files exist:\n\n` +
        `  * ${formatFileCandidates(perr.fileCandidates)}\n` +
        `  * ${formatFileCandidates(perr.indexCandidates)}`,
    );
    // $FlowFixMe[unsafe-object-assign]
    Object.assign(this, opts);
  }
}
