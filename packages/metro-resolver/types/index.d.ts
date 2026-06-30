/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<ff5d24a27b09aefdeb721ffcce936372>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/index.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
