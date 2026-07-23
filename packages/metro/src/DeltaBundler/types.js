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

import type {RequireContext} from '../lib/contextModule';
import type {RequireContextParams} from '../ModuleGraph/worker/collectDependencies';
import type {ReadonlySourceLocation} from '../shared/types';
import type {Graph} from './Graph';
import type {JsTransformOptions} from 'metro-transform-worker';

import CountingSet from '../lib/CountingSet';

export type MixedOutput = {
  readonly data: unknown,
  readonly type: string,
};

export type AsyncDependencyType = 'async' | 'maybeSync' | 'prefetch' | 'weak';

export type TransformResultDependency = Readonly<{
  /**
   * The literal name provided to a require or import call. For example 'foo' in
   * case of `require('foo')`.
   */
  name: string,

  /**
   * Extra data returned by the dependency extractor.
   */
  data: Readonly<{
    /**
     * A locally unique key for this dependency within the current module.
     */
    key: string,
    /**
     * If not null, this dependency is due to a dynamic `import()` or `__prefetchImport()` call.
     */
    asyncType: AsyncDependencyType | null,
    /**
     * True if the dependency is declared with a static "import x from 'y'" or
     * an import() call.
     */
    isESMImport: boolean,
    /**
     * The dependency is enclosed in a try/catch block.
     */
    isOptional?: boolean,

    locs: ReadonlyArray<ReadonlySourceLocation>,

    /** Context for requiring a collection of modules. */
    contextParams?: RequireContextParams,
  }>,
}>;

export type ResolvedDependency = Readonly<{
  absolutePath: string,
  data: TransformResultDependency,
}>;

export type Dependency =
  | ResolvedDependency
  | Readonly<{
      data: TransformResultDependency,
    }>;

export type Module<T = MixedOutput> = Readonly<{
  dependencies: Map<string, Dependency>,
  inverseDependencies: CountingSet<string>,
  output: ReadonlyArray<T>,
  path: string,
  getSource: () => Buffer,
  unstable_transformResultKey?: ?string,
}>;

export type ModuleData<T = MixedOutput> = Readonly<{
  dependencies: ReadonlyMap<string, Dependency>,
  resolvedContexts: ReadonlyMap<string, RequireContext>,
  output: ReadonlyArray<T>,
  getSource: () => Buffer,
  unstable_transformResultKey?: ?string,
}>;

export type Dependencies<T = MixedOutput> = Map<string, Module<T>>;
export type ReadOnlyDependencies<T = MixedOutput> = ReadonlyMap<
  string,
  Module<T>,
>;

export type TransformInputOptions = Omit<
  JsTransformOptions,
  'inlinePlatform' | 'inlineRequires',
>;

export type GraphInputOptions = Readonly<{
  entryPoints: ReadonlySet<string>,
  // Unused in core but useful for custom serializers / experimentalSerializerHook
  transformOptions: TransformInputOptions,
}>;

export interface ReadOnlyGraph<T = MixedOutput> {
  readonly entryPoints: ReadonlySet<string>;
  // Unused in core but useful for custom serializers / experimentalSerializerHook
  readonly transformOptions: Readonly<TransformInputOptions>;
  readonly dependencies: ReadOnlyDependencies<T>;
}

export type {Graph};

export type TransformResult<T = MixedOutput> = Readonly<{
  dependencies: ReadonlyArray<TransformResultDependency>,
  output: ReadonlyArray<T>,
  unstable_transformResultKey?: ?string,
}>;

export type TransformResultWithSource<T = MixedOutput> = Readonly<{
  ...TransformResult<T>,
  getSource: () => Buffer,
}>;

export type TransformFn<T = MixedOutput> = (
  string,
  ?RequireContext,
) => Promise<TransformResultWithSource<T>>;

export type ResolveFn = (
  from: string,
  dependency: TransformResultDependency,
) => BundlerResolution;

export type AllowOptionalDependenciesWithOptions = {
  readonly exclude: Array<string>,
};
export type AllowOptionalDependencies =
  boolean | AllowOptionalDependenciesWithOptions;

export type BundlerResolution = Readonly<{
  type: 'sourceFile',
  filePath: string,
}>;

export type Options<T = MixedOutput> = Readonly<{
  resolve: ResolveFn,
  transform: TransformFn<T>,
  transformOptions: TransformInputOptions,
  onProgress: ?(numProcessed: number, total: number) => unknown,
  lazy: boolean,
  unstable_allowRequireContext: boolean,
  unstable_enablePackageExports: boolean,
  unstable_incrementalResolution: boolean,
  shallow: boolean,
}>;

export type DeltaResult<T = MixedOutput> = {
  readonly added: Map<string, Module<T>>,
  readonly modified: Map<string, Module<T>>,
  readonly deleted: Set<string>,
  readonly reset: boolean,
};

export type SerializerOptions = Readonly<{
  asyncRequireModulePath: string,
  createModuleId: string => number,
  dependencyMapReservedName?: ?string,
  dev: boolean,
  getRunModuleStatement: (
    moduleId: number | string,
    globalPrefix: string,
  ) => string,
  globalPrefix: string,
  includeAsyncPaths: boolean,
  inlineSourceMap: ?boolean,
  modulesOnly: boolean,
  processModuleFilter: (module: Module<>) => boolean,
  projectRoot: string,
  runBeforeMainModule: ReadonlyArray<string>,
  runModule: boolean,
  serverRoot: string,
  shouldAddToIgnoreList: (Module<>) => boolean,
  sourceMapUrl: ?string,
  sourceUrl: ?string,
  getSourceUrl: ?(Module<>) => string,
  unstable_inlineDependencyMap?: boolean,
}>;
