/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @generated SignedSource<<780e521123ff9528911d3a6307815dee>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/ModuleGraph/worker/collectDependencies.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {ReadonlySourceLocation} from '../../shared/types';
import type {NodePath} from '@babel/traverse';
import type {CallExpression, File as BabelNodeFile, Identifier, StringLiteral} from '@babel/types';
import type {AllowOptionalDependencies, AsyncDependencyType} from 'metro/private/DeltaBundler/types';

export type Dependency = Readonly<{data: DependencyData; name: string}>;
export type ContextMode = 'sync' | 'eager' | 'lazy' | 'lazy-once';
type ContextFilter = Readonly<{pattern: string; flags: string}>;
export type RequireContextParams = Readonly<{
  recursive: boolean;
  filter: Readonly<ContextFilter>;
  /** Mode for resolving dynamic dependencies. Defaults to `sync` */
  mode: ContextMode;
}>;
type DependencyData = Readonly<{
  key: string;
  asyncType: AsyncDependencyType | null;
  isESMImport: boolean;
  isOptional?: boolean;
  locs: ReadonlyArray<ReadonlySourceLocation>;
  /** Context for requiring a collection of modules. */
  contextParams?: RequireContextParams;
}>;
export type MutableInternalDependency = Omit<DependencyData, 'locs' | 'index' | 'name'> & {locs: Array<ReadonlySourceLocation>; index: number; name: string};
export type InternalDependency = Readonly<MutableInternalDependency>;
export type State = {
  asyncRequireModulePathStringLiteral: null | undefined | StringLiteral;
  dependencyCalls: Set<string>;
  dependencyRegistry: DependencyRegistry;
  dependencyTransformer: DependencyTransformer;
  dynamicRequires: DynamicRequiresBehavior;
  dependencyMapIdentifier: null | undefined | Identifier;
  keepRequireNames: boolean;
  allowOptionalDependencies: AllowOptionalDependencies;
  /** Enable `require.context` statements which can be used to import multiple files in a directory. */
  unstable_allowRequireContext: boolean;
  unstable_isESMImportAtSource: null | undefined | (($$PARAM_0$$: ReadonlySourceLocation) => boolean);
};
export type Options = Readonly<{
  asyncRequireModulePath: string;
  dependencyMapName: null | undefined | string;
  dynamicRequires: DynamicRequiresBehavior;
  inlineableCalls: ReadonlyArray<string>;
  keepRequireNames: boolean;
  allowOptionalDependencies: AllowOptionalDependencies;
  dependencyTransformer?: DependencyTransformer;
  /** Enable `require.context` statements which can be used to import multiple files in a directory. */
  unstable_allowRequireContext: boolean;
  unstable_isESMImportAtSource?: null | undefined | (($$PARAM_0$$: ReadonlySourceLocation) => boolean);
}>;
export type CollectedDependencies = Readonly<{
  ast: BabelNodeFile;
  dependencyMapName: string;
  dependencies: ReadonlyArray<Dependency>;
}>;
export interface DependencyTransformer {
  transformSyncRequire(path: NodePath<CallExpression>, dependency: InternalDependency, state: State): void;
  transformImportCall(path: NodePath, dependency: InternalDependency, state: State): void;
  transformImportMaybeSyncCall(path: NodePath, dependency: InternalDependency, state: State): void;
  transformPrefetch(path: NodePath, dependency: InternalDependency, state: State): void;
  transformIllegalDynamicRequire(path: NodePath, state: State): void;
}
export type DynamicRequiresBehavior = 'throwAtRuntime' | 'reject';
/**
 * Transform all the calls to `require()` and `import()` in a file into ID-
 * independent code, and return the list of dependencies. For example, a call
 * like `require('Foo')` could be transformed to `require(_depMap[3], 'Foo')`
 * where `_depMap` is provided by the outer scope. As such, we don't need to
 * know the actual module ID.
 *
 * The second argument is only provided for debugging purposes.
 */
declare function collectDependencies(ast: BabelNodeFile, options: Options): CollectedDependencies;
export default collectDependencies;
export type ImportQualifier = Readonly<{
  name: string;
  asyncType: AsyncDependencyType | null;
  isESMImport: boolean;
  optional: boolean;
  contextParams?: RequireContextParams;
}>;
declare class DependencyRegistry {
  registerDependency(qualifier: ImportQualifier): InternalDependency;
  getDependencies(): Array<InternalDependency>;
}
