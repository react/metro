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

import type {ReadOnlyGraph} from '../../types';

import {isResolvedDependency} from '../../../lib/isResolvedDependency';

export default function getTransitiveDependencies<T>(
  path: string,
  graph: ReadOnlyGraph<T>,
): Set<string> {
  const dependencies = _getDeps(path, graph, new Set());

  // Remove the main entry point, since this method only returns the
  // dependencies.
  dependencies.delete(path);

  return dependencies;
}

function _getDeps<T>(
  path: string,
  graph: ReadOnlyGraph<T>,
  deps: Set<string>,
): Set<string> {
  if (deps.has(path)) {
    return deps;
  }

  const module = graph.dependencies.get(path);

  if (!module) {
    return deps;
  }

  deps.add(path);

  for (const dependency of module.dependencies.values()) {
    if (isResolvedDependency(dependency)) {
      _getDeps(dependency.absolutePath, graph, deps);
    }
  }

  return deps;
}
