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

import type {Dependency, ResolvedDependency} from '../DeltaBundler/types';

export function isResolvedDependency(
  dep: Dependency,
): dep is ResolvedDependency {
  return dep.absolutePath != null;
}
