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

import type {BundleOptions, SplitBundleOptions} from '../shared/types';

/**
 * Splits a BundleOptions object into smaller, more manageable parts.
 */
export default function splitBundleOptions(
  options: BundleOptions,
): SplitBundleOptions {
  // Omitted rather than null when unset, because resolver and transform
  // options are serialised into cache keys and graph IDs.
  const environment =
    options.unstable_environment != null
      ? {unstable_environment: options.unstable_environment}
      : null;
  return {
    entryFile: options.entryFile,
    resolverOptions: {
      customResolverOptions: options.customResolverOptions,
      dev: options.dev,
      ...environment,
    },
    transformOptions: {
      customTransformOptions: options.customTransformOptions,
      dev: options.dev,
      minify: options.minify,
      platform: options.platform,
      type: 'module',
      unstable_transformProfile: options.unstable_transformProfile,
      ...environment,
    },
    serializerOptions: {
      excludeSource: options.excludeSource,
      inlineSourceMap: options.inlineSourceMap,
      modulesOnly: options.modulesOnly,
      runModule: options.runModule,
      sourceMapUrl: options.sourceMapUrl,
      sourceUrl: options.sourceUrl,
      sourcePaths: options.sourcePaths,
    },
    graphOptions: {
      shallow: options.shallow,
      lazy: options.lazy,
    },
    onProgress: options.onProgress,
  };
}
