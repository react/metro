/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<be37108c9a159230fdcfc2e7df6867e0>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/parseBundleOptionsFromBundleRequestUrl.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {BundleOptions} from '../shared/types';

declare function parseBundleOptionsFromBundleRequestUrl(rawNonJscSafeUrlEncodedUrl: string, platforms: Set<string>): Omit<BundleOptions, 'bundleType'> & {bundleType: string};
export default parseBundleOptionsFromBundleRequestUrl;
