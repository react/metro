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
} from './types';

import {deriveAbsolutePathFromContext} from '../lib/contextModule';
import {isResolvedDependency} from '../lib/isResolvedDependency';
import path from 'node:path';

type Parameters<T> = Readonly<{
  resolve: ResolveFn,
  transform: TransformFn<T>,
  shouldTraverse: ResolvedDependency => boolean,
}>;

function resolveDependencies(
  parentPath: string,
  dependencies: ReadonlyArray<TransformResultDependency>,
  resolve: ResolveFn,
): {
  dependencies: Map<string, Dependency>,
  resolvedContexts: Map<string, RequireContext>,
} {
  const maybeResolvedDeps = new Map<string, Dependency>();
  const resolvedContexts = new Map<string, RequireContext>();

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

      resolvedContexts.set(key, resolvedContext);

      maybeResolvedDep = {
        absolutePath,
        data: dep,
      };
    } else {
      try {
        maybeResolvedDep = {
          absolutePath: resolve(parentPath, dep).filePath,
          data: dep,
        };
      } catch (error) {
        // Ignore unavailable optional dependencies. They are guarded
        // with a try-catch block and will be handled during runtime.
        if (dep.data.isOptional !== true) {
          throw error;
        }
        maybeResolvedDep = {
          data: dep,
        };
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
    resolvedContexts,
  };
}

export async function buildSubgraph<T>(
  entryPaths: ReadonlySet<string>,
  resolvedContexts: ReadonlyMap<string, ?RequireContext>,
  {resolve, transform, shouldTraverse}: Parameters<T>,
): Promise<{
  moduleData: Map<string, ModuleData<T>>,
  errors: Map<string, Error>,
}> {
  const moduleData: Map<string, ModuleData<T>> = new Map();
  const errors: Map<string, Error> = new Map();
  const visitedPaths: Set<string> = new Set();

  async function visit(
    absolutePath: string,
    requireContext: ?RequireContext,
  ): Promise<void> {
    if (visitedPaths.has(absolutePath)) {
      return;
    }
    visitedPaths.add(absolutePath);
    const transformResult = await transform(absolutePath, requireContext);

    // Get the absolute path of all sub-dependencies (some of them could have been
    // moved but maintain the same relative path).
    const resolutionResult = resolveDependencies(
      absolutePath,
      transformResult.dependencies,
      resolve,
    );

    moduleData.set(absolutePath, {
      ...transformResult,
      ...resolutionResult,
    });

    await Promise.all(
      [...resolutionResult.dependencies.values()]
        .filter(
          dependency =>
            isResolvedDependency(dependency) && shouldTraverse(dependency),
        )
        .map(dependency =>
          visit(
            dependency.absolutePath,
            resolutionResult.resolvedContexts.get(dependency.data.data.key),
          ).catch(error => errors.set(dependency.absolutePath, error)),
        ),
    );
  }

  await Promise.all(
    [...entryPaths].map(absolutePath =>
      visit(absolutePath, resolvedContexts.get(absolutePath)).catch(error =>
        errors.set(absolutePath, error),
      ),
    ),
  );

  return {errors, moduleData};
}
