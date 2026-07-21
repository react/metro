/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<58467833638b1ab05fcf02a24738f4ab>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-resolver/src/types.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {TransformResultDependency} from 'metro/private/DeltaBundler/types';

export type Result<TResolution, TCandidates> = {readonly type: 'resolved'; readonly resolution: TResolution} | {readonly type: 'failed'; readonly candidates: TCandidates};
export type Resolution = FileResolution | VirtualResolution | {readonly type: 'empty'};
export type SourceFileResolution = Readonly<{
  type: 'sourceFile';
  filePath: string;
}>;
export type AssetFileResolution = ReadonlyArray<string>;
export type AssetResolution = Readonly<{
  type: 'assetFiles';
  filePaths: AssetFileResolution;
}>;
export type FileResolution = AssetResolution | SourceFileResolution;
/**
 * A JS module whose contents are provided out-of-band rather than read from a file
 * on disk.
 *
 * NOTE: Resolving to a virtual module is not yet implemented. This is a reservation.
 */
export type VirtualResolution = Readonly<{type: 'virtualModule'}>;
export type FileAndDirCandidates = {
  readonly dir: null | undefined | FileCandidates;
  readonly file: null | undefined | FileCandidates;
};
/**
 * This is a way to describe what files we tried to look for when resolving
 * a module name as file. This is mainly used for error reporting, so that
 * we can explain why we cannot resolve a module.
 */
export type FileCandidates =
  | {readonly type: 'asset'; readonly name: string}
  | {
      readonly type: 'sourceFile';
      filePathPrefix: string;
      readonly candidateExts: ReadonlyArray<string>;
    };
export type ExportsLikeMap = Readonly<{
  [subpathOrCondition: string]: string | ExportsLikeMap | null;
}>;
/** "exports" mapping where values may be legacy Node.js <13.7 array format. */
export type ExportMapWithFallbacks = Readonly<{
  [subpath: string]: ExportsLikeMap[keyof ExportsLikeMap] | ExportValueWithFallback;
}>;
/** "exports" subpath value when in legacy Node.js <13.7 array format. */
export type ExportValueWithFallback = ReadonlyArray<ExportsLikeMap | string> | ReadonlyArray<ReadonlyArray<unknown>>;
export type ExportsField = string | ReadonlyArray<string> | ExportValueWithFallback | ExportsLikeMap | ExportMapWithFallbacks;
export type FlattenedExportMap = ReadonlyMap<string, string | null>;
export type NormalizedExportsLikeMap = Map<string, null | string | ExportsLikeMap>;
export type PackageJson = Readonly<{
  name?: string;
  main?: string;
  exports?: ExportsField;
  imports?: ExportsLikeMap;
}>;
export type PackageInfo = Readonly<{
  packageJson: PackageJson;
  rootPath: string;
}>;
export type PackageForModule = Readonly<Omit<PackageInfo, 'packageRelativePath'> & {packageRelativePath: string}>;
/**
 * Check existence of a single file.
 */
export type DoesFileExist = (filePath: string) => boolean;
/**
 * Performs a lookup against an absolute or project-relative path to determine
 * whether it exists as a file or directory. Follows any symlinks, and returns
 * a real absolute path on existence.
 */
export type FileSystemLookup = (absoluteOrProjectRelativePath: string) => {exists: false} | {exists: true; type: 'f' | 'd'; realPath: string};
/**
 * Given a directory path and the base asset name, return a list of all the
 * asset file names that match the given base name in that directory. Return
 * null if there's no such named asset. `platform` is used to identify
 * platform-specific assets, ex. `foo.ios.js` instead of a generic `foo.js`.
 */
export type ResolveAsset = (dirPath: string, assetName: string, extension: string) => null | undefined | ReadonlyArray<string>;
export type ResolutionContext = Readonly<{
  allowHaste: boolean;
  assetExts: ReadonlySet<string>;
  customResolverOptions: CustomResolverOptions;
  disableHierarchicalLookup: boolean;
  /**
   * Determine whether a regular file exists at the given path.
   *
   * @deprecated, prefer `fileSystemLookup`
   */
  doesFileExist: DoesFileExist;
  extraNodeModules: null | undefined | {[$$Key$$: string]: string};
  /** Is resolving for a development bundle. */
  dev: boolean;
  /**
   * Get the parsed contents of the specified `package.json` file.
   */
  getPackage: (packageJsonPath: string) => null | undefined | PackageJson;
  /**
   * Get the closest package scope, parsed `package.json` and relative subpath
   * for a given absolute candidate path (which need not exist), or null if
   * there is no package.json closer than the nearest node_modules directory.
   *
   * @deprecated See https://github.com/facebook/metro/commit/29c77bff31e2475a086bc3f04073f485da8f9ff0
   */
  getPackageForModule: (absoluteModulePath: string) => null | undefined | PackageForModule;
  /**
   * The dependency descriptor, within the origin module, corresponding to the
   * current resolution request. This is provided for diagnostic purposes ONLY
   * and may not be used for resolution purposes.
   */
  dependency?: TransformResultDependency;
  /**
   * Whether the dependency to be resolved was declared with an ESM import,
   * ("import x from 'y'" or "await import('z')"), or a CommonJS "require".
   * Corresponds to the criteria Node.js uses to assert an "import"
   * resolution condition, vs "require".
   *
   * Always equal to dependency.data.isESMImport where dependency is provided,
   * but may be used for resolution.
   */
  isESMImport?: boolean;
  /**
   * Synchonously returns information about a given absolute path, including
   * whether it exists, whether it is a file or directory, and its absolute
   * real path.
   */
  fileSystemLookup: FileSystemLookup;
  /**
   * The ordered list of fields to read in `package.json` to resolve a main
   * entry point based on the "browser" field spec.
   */
  mainFields: ReadonlyArray<string>;
  /**
   * Full path of the module that is requiring or importing the module to be
   * resolved. This may not be the only place this dependency was found,
   * as resolutions can be cached.
   */
  originModulePath: string;
  nodeModulesPaths: ReadonlyArray<string>;
  preferNativePlatform: boolean;
  resolveAsset: ResolveAsset;
  redirectModulePath: (modulePath: string) => string | false;
  /**
   * Given a name, this should return the full path to the file that provides
   * a Haste module of that name. Ex. for `Foo` it may return `/smth/Foo.js`.
   */
  resolveHasteModule: (name: string) => null | undefined | string;
  /**
   * Given a name, this should return the full path to the package manifest that
   * provides a Haste package of that name. Ex. for `Foo` it may return
   * `/smth/Foo/package.json`.
   */
  resolveHastePackage: (name: string) => null | undefined | string;
  resolveRequest?: null | undefined | CustomResolver;
  sourceExts: ReadonlyArray<string>;
  unstable_conditionNames: ReadonlyArray<string>;
  unstable_conditionsByPlatform: Readonly<{
    [platform: string]: ReadonlyArray<string>;
  }>;
  unstable_enablePackageExports: boolean;
  unstable_incrementalResolution: boolean;
  unstable_logWarning: (message: string) => void;
}>;
export type CustomResolutionContext = Readonly<Omit<ResolutionContext, 'resolveRequest'> & {resolveRequest: CustomResolver}>;
export type CustomResolver = (context: CustomResolutionContext, moduleName: string, platform: string | null) => Resolution;
export type CustomResolverOptions = {
  readonly [$$Key$$: string]: unknown;
};
