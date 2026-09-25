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

import type {ResolutionObservations} from '../../DeltaBundler/types';
import type {PackageCache} from '../PackageCache';
import type {ConfigT} from 'metro-config';
import type {FileSystem, HasteMap} from 'metro-file-map';
import type {FileSystemLookup} from 'metro-resolver';

import getSchemeResolvers from '../../lib/getSchemeResolvers';
import {ModuleResolver} from './ModuleResolution';
import path from 'node:path';

export type CreateModuleResolverOptions = Readonly<{
  config: ConfigT,
  fileSystem: FileSystem,
  hasteMap: HasteMap,
  packageCache: PackageCache,
}>;

export default function createModuleResolver({
  config,
  fileSystem,
  hasteMap,
  packageCache,
}: CreateModuleResolverOptions): ModuleResolver {
  const fileSystemLookup = (
    filePath: string,
    observations?: ?ResolutionObservations,
  ): ReturnType<FileSystemLookup> => {
    const result = fileSystem.lookup(filePath, observations);
    if (result.exists) {
      return {
        exists: true,
        realPath: result.realPath,
        type: result.type,
      };
    }
    return {exists: false};
  };

  return new ModuleResolver({
    assetExts: new Set(config.resolver.assetExts),
    disableHierarchicalLookup: config.resolver.disableHierarchicalLookup,
    doesFileExist: (
      filePath: string,
      observations?: ?ResolutionObservations,
    ) => {
      if (observations == null) {
        return fileSystem.exists(filePath);
      }
      // `exists` cannot record what it observed, and is true for exactly the
      // paths that `lookup` finds to be a file.
      const result = fileSystem.lookup(filePath, observations);
      return result.exists && result.type === 'f';
    },
    emptyModulePath: config.resolver.emptyModulePath,
    extraNodeModules: config.resolver.extraNodeModules,
    fileSystemLookup,
    // As `HastePlugin` decides which files to give a name: packages only if
    // global packages are enabled, and other files only with a `hasteImpl`.
    isHasteEnabled:
      config.resolver.enableGlobalPackages ||
      config.resolver.hasteImplModulePath != null,
    getHasteModulePath: (name, platform) =>
      hasteMap.getModule(name, platform, true),
    getHastePackagePath: (name, platform) =>
      hasteMap.getPackage(name, platform, true),
    getPackage: (packageJsonPath: string) => {
      try {
        return packageCache.getPackage(packageJsonPath).packageJson ?? null;
      } catch {
        // Non-existence or malformed JSON, we treat both as non-existent
        return null;
      }
    },
    getPackageForModule: (
      absolutePath: string,
      observations?: ?ResolutionObservations,
    ) => packageCache.getPackageForModule(absolutePath, observations),
    mainFields: config.resolver.resolverMainFields,
    nodeModulesPaths: config.resolver.nodeModulesPaths,
    preferNativePlatform: true,
    projectRoot: config.projectRoot,
    reporter: config.reporter,
    resolveAsset: (
      dirPath: string,
      assetName: string,
      extension: string,
      observations?: ?ResolutionObservations,
    ) => {
      const basePath = dirPath + path.sep + assetName;
      const assets = [
        basePath + extension,
        ...config.resolver.assetResolutions.map(
          resolution => basePath + '@' + resolution + 'x' + extension,
        ),
      ]
        .map(assetPath => fileSystemLookup(assetPath, observations).realPath)
        .filter(Boolean);

      return assets.length ? assets : null;
    },
    resolveRequest: config.resolver.resolveRequest,
    schemeResolvers: {
      ...getSchemeResolvers(),
      ...config.resolver.schemeResolvers,
    },
    sourceExts: config.resolver.sourceExts,
    unstable_conditionNames: config.resolver.unstable_conditionNames,
    unstable_conditionsByPlatform:
      config.resolver.unstable_conditionsByPlatform,
    unstable_enablePackageExports:
      config.resolver.unstable_enablePackageExports,
    unstable_incrementalResolution:
      config.resolver.unstable_incrementalResolution,
  });
}
