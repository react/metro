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

import type {TransformInputOptions} from '../DeltaBundler/types';
import type {ResolverInputOptions} from '../shared/types';

import canonicalize from 'metro-core/private/canonicalize';

export opaque type GraphId: string = string;

export default function getGraphId(
  entryFile: string,
  options: TransformInputOptions,
  {
    shallow,
    lazy,
    unstable_allowRequireContext,
    resolverOptions,
  }: Readonly<{
    shallow: boolean,
    lazy: boolean,
    unstable_allowRequireContext: boolean,
    resolverOptions: ResolverInputOptions,
  }>,
): GraphId {
  return JSON.stringify(
    {
      entryFile,
      options: {
        customResolverOptions: resolverOptions.customResolverOptions ?? {},
        customTransformOptions: options.customTransformOptions ?? null,
        dev: options.dev,
        experimentalImportSupport: options.experimentalImportSupport || false,
        minify: options.minify,
        platform: options.platform != null ? options.platform : null,
        type: options.type,
        lazy,
        unstable_allowRequireContext,
        shallow,
        unstable_transformProfile:
          options.unstable_transformProfile || 'default',
      },
    },
    canonicalize,
  );
}
