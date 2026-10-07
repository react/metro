/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {RequireContext} from '../lib/contextModule';
import type {
  Dependency,
  ModuleData,
  ResolvedDependency,
  ResolveFn,
  TransformFn,
  TransformResultDependency,
  VirtualSource,
} from './types';

import {deriveAbsolutePathFromContext} from '../lib/contextModule';
import {isResolvedDependency} from '../lib/isResolvedDependency';
import path from 'node:path';

type Parameters<T> = Readonly<{
  resolve: ResolveFn,
  transform: TransformFn<T>,
  shouldTraverse: (ResolvedDependency, ?VirtualSource) => boolean,
}>;

// The content each virtual module was resolved with so far in one traversal,
// so that two edges disagreeing about a module's source is an error rather
// than an order-dependent bundle.
type VirtualContents = Map<string, {sha1: string, parentPath: string}>;

function resolveDependencies(
  parentPath: string,
  dependencies: ReadonlyArray<TransformResultDependency>,
  resolve: ResolveFn,
  virtualContents: VirtualContents,
): {
  dependencies: Map<string, Dependency>,
  virtualSources: Map<string, VirtualSource>,
} {
  const maybeResolvedDeps = new Map<string, Dependency>();
  const virtualSources = new Map<string, VirtualSource>();

  for (const dep of dependencies) {
    let maybeResolvedDep: Dependency;
    const key = dep.data.key;

    // `require.context`
    const {contextParams} = dep.data;
    if (contextParams) {
      // Ensure the filepath has uniqueness applied to ensure multiple `require.context`
      // statements can be used to target the same file with different properties.
      const from = path.join(parentPath, '..', dep.name);
      const absolutePath = deriveAbsolutePathFromContext(from, contextParams);

      const resolvedContext: RequireContext = {
        filter: new RegExp(
          contextParams.filter.pattern,
          contextParams.filter.flags,
        ),
        from,
        mode: contextParams.mode,
        recursive: contextParams.recursive,
      };

      virtualSources.set(key, {
        type: 'requireContext',
        requireContext: resolvedContext,
      });

      maybeResolvedDep = {
        absolutePath,
        data: dep,
      };
    } else {
      let resolution;
      try {
        resolution = resolve(parentPath, dep);
      } catch (error) {
        // Ignore unavailable optional dependencies. They are guarded
        // with a try-catch block and will be handled during runtime.
        if (dep.data.isOptional !== true) {
          throw error;
        }
      }
      if (resolution == null) {
        maybeResolvedDep = {data: dep};
      } else {
        if (resolution.type === 'virtualModule') {
          const {filePath, source, sha1, virtualPath} = resolution;
          const previous = virtualContents.get(filePath);
          if (previous != null && previous.sha1 !== sha1) {
            throw new Error(
              `Virtual module '${filePath}' was resolved with different ` +
                `contents from '${previous.parentPath}' and '${parentPath}'. ` +
                'A resolver must produce the same source for the same ' +
                'virtual path and specifier.',
            );
          }
          virtualContents.set(filePath, {sha1, parentPath});
          // The source travels with the edge that produced it, so it lives
          // exactly as long as the module is reachable.
          virtualSources.set(key, {type: 'buffer', source, sha1, virtualPath});
        }
        maybeResolvedDep = {absolutePath: resolution.filePath, data: dep};
      }
    }

    if (maybeResolvedDeps.has(key)) {
      throw new Error(
        `resolveDependencies: Found duplicate dependency key '${key}' in ${parentPath}`,
      );
    }
    maybeResolvedDeps.set(key, maybeResolvedDep);
  }

  return {
    dependencies: maybeResolvedDeps,
    virtualSources,
  };
}

export async function buildSubgraph<T>(
  entryPaths: ReadonlySet<string>,
  virtualSources: ReadonlyMap<string, ?VirtualSource>,
  {resolve, transform, shouldTraverse}: Parameters<T>,
): Promise<{
  moduleData: Map<string, ModuleData<T>>,
  errors: Map<string, Error>,
}> {
  const moduleData: Map<string, ModuleData<T>> = new Map();
  const errors: Map<string, Error> = new Map();
  const visitedPaths: Set<string> = new Set();
  const virtualContents: VirtualContents = new Map();

  async function visit(
    absolutePath: string,
    virtualSource: ?VirtualSource,
  ): Promise<void> {
    if (visitedPaths.has(absolutePath)) {
      return;
    }
    visitedPaths.add(absolutePath);
    // A virtual module is transformed as, and resolves its dependencies from,
    // its virtual path. The identity suffix exists only in the graph.
    const sourcePath =
      virtualSource?.type === 'buffer'
        ? virtualSource.virtualPath
        : absolutePath;
    const transformResult = await transform(sourcePath, virtualSource);

    // Get the absolute path of all sub-dependencies (some of them could have been
    // moved but maintain the same relative path).
    const resolutionResult = resolveDependencies(
      sourcePath,
      transformResult.dependencies,
      resolve,
      virtualContents,
    );

    moduleData.set(absolutePath, {
      ...transformResult,
      ...resolutionResult,
    });

    const toVisit = [];
    for (const dependency of resolutionResult.dependencies.values()) {
      if (!isResolvedDependency(dependency)) {
        continue;
      }
      const dependencyVirtualSource = resolutionResult.virtualSources.get(
        dependency.data.data.key,
      );
      if (shouldTraverse(dependency, dependencyVirtualSource)) {
        toVisit.push(
          visit(dependency.absolutePath, dependencyVirtualSource).catch(error =>
            errors.set(dependency.absolutePath, error),
          ),
        );
      }
    }
    await Promise.all(toVisit);
  }

  await Promise.all(
    [...entryPaths].map(absolutePath =>
      visit(absolutePath, virtualSources.get(absolutePath)).catch(error =>
        errors.set(absolutePath, error),
      ),
    ),
  );

  return {errors, moduleData};
}
