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

export type {
  AssetFileResolution,
  CustomResolutionContext,
  CustomResolver,
  CustomResolverOptions,
  DoesFileExist,
  FileAndDirCandidates,
  FileCandidates,
  FileResolution,
  FileSystemLookup,
  ResolutionContext,
  Resolution,
  ResolveAsset,
  Result,
} from './types';

import FailedToResolveNameError from './errors/FailedToResolveNameError';
import FailedToResolvePathError from './errors/FailedToResolvePathError';
import FailedToResolveUnsupportedError from './errors/FailedToResolveUnsupportedError';
import formatFileCandidates from './errors/formatFileCandidates';
import InvalidPackageError from './errors/InvalidPackageError';
import resolve from './resolve';

export {
  FailedToResolveNameError,
  FailedToResolvePathError,
  FailedToResolveUnsupportedError,
  formatFileCandidates,
  InvalidPackageError,
  resolve,
};
