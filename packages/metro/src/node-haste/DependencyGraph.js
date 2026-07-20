/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

import type {
  BundlerResolution,
  TransformResultDependency,
} from '../DeltaBundler/types';
import type {ResolverInputOptions} from '../shared/types';
import type {ConfigT} from 'metro-config';
import type {
  ChangeEvent,
  DependencyPlugin,
  FileSystem,
  HasteMap,
  HealthCheckResult,
  WatcherStatus,
  default as MetroFileMap,
} from 'metro-file-map';
import type {FileSystemLookup} from 'metro-resolver';

import createFileMap from './DependencyGraph/createFileMap';
import {ModuleResolver} from './DependencyGraph/ModuleResolution';
import {PackageCache} from './PackageCache';
import {
  AmbiguousModuleResolutionError,
  Logger,
  PackageResolutionError,
} from 'metro-core';
import canonicalize from 'metro-core/private/canonicalize';
import {DuplicateHasteCandidatesError} from 'metro-file-map';
import {InvalidPackageError} from 'metro-resolver';
import EventEmitter from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import nullthrows from 'nullthrows';

const {createActionStartEntry, createActionEndEntry, log} = Logger;

const NULL_PLATFORM = Symbol();

function getOrCreateMap<T>(
  map: Map<string | symbol, Map<string | symbol, T>>,
  field: string,
): Map<string | symbol, T> {
  let subMap = map.get(field);
  if (!subMap) {
    subMap = new Map();
    map.set(field, subMap);
  }
  return subMap;
}

export default class DependencyGraph extends EventEmitter {
  _config: ConfigT;
  _haste: MetroFileMap;
  _fileSystem: FileSystem;
  #packageCache: PackageCache;
  _hasteMap: HasteMap;
  #dependencyPlugin: ?DependencyPlugin;
  _moduleResolver: ModuleResolver;
  _resolutionCache: Map<
    // Custom resolver options
    string | symbol,
    Map<
      // Origin folder
      string | symbol,
      Map<
        // Dependency name
        string | symbol,
        Map<
          // Platform
          string | symbol,
          BundlerResolution,
        >,
      >,
    >,
  >;
  _initializedPromise: Promise<void>;

  constructor(
    config: ConfigT,
    options?: {
      readonly hasReducedPerformance?: boolean,
      readonly watch?: boolean,
    },
  ) {
    super();

    this._config = config;

    const {hasReducedPerformance, watch} = options ?? {};
    const initializingMetroLogEntry = log(
      createActionStartEntry('Initializing Metro'),
    );

    config.reporter.update({
      type: 'dep_graph_loading',
      hasReducedPerformance: !!hasReducedPerformance,
    });
    const {fileMap, hasteMap, dependencyPlugin} = createFileMap(config, {
      throwOnModuleCollision: false,
      watch,
    });

    // We can have a lot of graphs listening to Haste for changes.
    // Bump this up to silence the max listeners EventEmitter warning.
    fileMap.setMaxListeners(1000);

    this._haste = fileMap;
    this._haste.on('status', status => this._onWatcherStatus(status));

    this._initializedPromise = fileMap.build().then(({fileSystem}) => {
      log(createActionEndEntry(initializingMetroLogEntry));
      config.reporter.update({type: 'dep_graph_loaded'});

      this._fileSystem = fileSystem;
      this._hasteMap = hasteMap;
      this.#dependencyPlugin = dependencyPlugin;

      this._haste.on('change', changeEvent => this._onHasteChange(changeEvent));
      this._haste.on('healthCheck', result =>
        this._onWatcherHealthCheck(result),
      );
      this._resolutionCache = new Map();
      this.#packageCache = new PackageCache({
        getClosestPackage: absoluteModulePath =>
          this._getClosestPackage(absoluteModulePath),
      });
      this._createModuleResolver();
    });
  }

  _onWatcherHealthCheck(result: HealthCheckResult) {
    this._config.reporter.update({type: 'watcher_health_check_result', result});
  }

  _onWatcherStatus(status: WatcherStatus) {
    this._config.reporter.update({type: 'watcher_status', status});
  }

  // Waits for the dependency graph to become ready after initialisation.
  // Don't read anything from the graph until this resolves.
  async ready(): Promise<void> {
    await this._initializedPromise;
  }

  _onHasteChange({changes, rootDir}: ChangeEvent) {
    this._resolutionCache = new Map();
    [
      ...changes.addedFiles,
      ...changes.modifiedFiles,
      ...changes.removedFiles,
    ].forEach(([canonicalPath]) =>
      this.#packageCache.invalidate(path.join(rootDir, canonicalPath)),
    );
    this._createModuleResolver();
    this.emit('change');
  }

  _createModuleResolver() {
    const fileSystemLookup = (path: string): ReturnType<FileSystemLookup> => {
      const result = this._fileSystem.lookup(path);
      if (result.exists) {
        return {
          exists: true,
          realPath: result.realPath,
          type: result.type,
        };
      }
      return {exists: false};
    };

    this._moduleResolver = new ModuleResolver({
      assetExts: new Set(this._config.resolver.assetExts),
      dirExists: (filePath: string) => {
        try {
          return fs.lstatSync(filePath).isDirectory();
        } catch (e) {}
        return false;
      },
      disableHierarchicalLookup:
        this._config.resolver.disableHierarchicalLookup,
      doesFileExist: this.doesFileExist,
      emptyModulePath: this._config.resolver.emptyModulePath,
      extraNodeModules: this._config.resolver.extraNodeModules,
      fileSystemLookup,
      getHasteModulePath: (name, platform) =>
        this._hasteMap.getModule(name, platform, true),
      getHastePackagePath: (name, platform) =>
        this._hasteMap.getPackage(name, platform, true),
      getPackage: (packageJsonPath: string) => {
        try {
          return (
            this.#packageCache.getPackage(packageJsonPath).packageJson ?? null
          );
        } catch {
          // Non-existence or malformed JSON, we treat both as non-existent
          return null;
        }
      },
      getPackageForModule: (absolutePath: string) =>
        this.#packageCache.getPackageForModule(absolutePath),
      mainFields: this._config.resolver.resolverMainFields,
      nodeModulesPaths: this._config.resolver.nodeModulesPaths,
      preferNativePlatform: true,
      projectRoot: this._config.projectRoot,
      reporter: this._config.reporter,
      resolveAsset: (dirPath: string, assetName: string, extension: string) => {
        const basePath = dirPath + path.sep + assetName;
        const assets = [
          basePath + extension,
          ...this._config.resolver.assetResolutions.map(
            resolution => basePath + '@' + resolution + 'x' + extension,
          ),
        ]
          .map(assetPath => fileSystemLookup(assetPath).realPath)
          .filter(Boolean);

        return assets.length ? assets : null;
      },
      resolveRequest: this._config.resolver.resolveRequest,
      sourceExts: this._config.resolver.sourceExts,
      unstable_conditionNames: this._config.resolver.unstable_conditionNames,
      unstable_conditionsByPlatform:
        this._config.resolver.unstable_conditionsByPlatform,
      unstable_enablePackageExports:
        this._config.resolver.unstable_enablePackageExports,
      unstable_incrementalResolution:
        this._config.resolver.unstable_incrementalResolution,
    });
  }

  _getClosestPackage(
    absoluteModulePath: string,
  ): ?{packageJsonPath: string, packageRelativePath: string} {
    const result = this._fileSystem.hierarchicalLookup(
      absoluteModulePath,
      'package.json',
      {
        breakOnSegment: 'node_modules',
        invalidatedBy: null,
        subpathType: 'f',
      },
    );
    return result
      ? {
          packageJsonPath: result.absolutePath,
          packageRelativePath: result.containerRelativePath,
        }
      : null;
  }

  getAllFiles(): Array<string> {
    return nullthrows(this._fileSystem).getAllFiles();
  }

  /**
   * Used when watcher.unstable_lazySha1 is true
   */
  async getOrComputeSha1(
    mixedPath: string,
  ): Promise<{content?: Buffer, sha1: string}> {
    const result = await this._fileSystem.getOrComputeSha1(mixedPath);
    if (!result || !result.sha1) {
      throw new Error(`Failed to get the SHA-1 for: ${mixedPath}.
      Potential causes:
        1) The file is not watched. Ensure it is under the configured \`projectRoot\` or \`watchFolders\`.
        2) Check \`blockList\` in your metro.config.js and make sure it isn't excluding the file path.
        3) The file may have been deleted since it was resolved - try refreshing your app.
        4) Otherwise, this is a bug in Metro or the configured resolver - please report it.`);
    }
    return result;
  }

  getWatcher(): EventEmitter {
    return this._haste;
  }

  async end() {
    await this.ready();
    await this._haste.end();
  }

  /** Given a search context, return a list of file paths matching the query. */
  matchFilesWithContext(
    from: string,
    context: Readonly<{
      /* Should search for files recursively. */
      recursive: boolean,
      /* Filter relative paths against a pattern. */
      filter: RegExp,
    }>,
  ): Iterable<string> {
    return this._fileSystem.matchFiles({
      rootDir: from,
      recursive: context.recursive,
      filter: context.filter,
      filterComparePosix: true,
      follow: true,
    });
  }

  resolveDependency(
    originModulePath: string,
    dependency: TransformResultDependency,
    platform: string | null,
    resolverOptions: ResolverInputOptions,

    // TODO: Fold assumeFlatNodeModules into resolverOptions and add to graphId
    {assumeFlatNodeModules}: {assumeFlatNodeModules: boolean} = {
      assumeFlatNodeModules: false,
    },
  ): BundlerResolution {
    const to = dependency.name;
    const isSensitiveToOriginFolder =
      // Resolution is always relative to the origin folder unless we assume a flat node_modules
      !assumeFlatNodeModules ||
      // Path requests are resolved relative to the origin folder
      to.includes('/') ||
      to === '.' ||
      to === '..' ||
      // Preserve standard assumptions under node_modules
      originModulePath.includes(path.sep + 'node_modules' + path.sep);

    // Compound key for the resolver cache
    const resolverOptionsKey =
      JSON.stringify(resolverOptions ?? {}, canonicalize) ?? '';
    const originKey = isSensitiveToOriginFolder
      ? path.dirname(originModulePath)
      : '';
    const targetKey =
      to + (dependency.data.isESMImport === true ? '\0esm' : '\0cjs');
    const platformKey = platform ?? NULL_PLATFORM;

    // Traverse the resolver cache, which is a tree of maps
    const mapByResolverOptions = this._resolutionCache;
    const mapByOrigin = getOrCreateMap(
      mapByResolverOptions,
      resolverOptionsKey,
    );
    const mapByTarget = getOrCreateMap(mapByOrigin, originKey);
    const mapByPlatform = getOrCreateMap(mapByTarget, targetKey);
    let resolution: ?BundlerResolution = mapByPlatform.get(platformKey);

    if (!resolution) {
      try {
        resolution = this._moduleResolver.resolveDependency(
          originModulePath,
          dependency,
          true,
          platform,
          resolverOptions,
        );
      } catch (error) {
        if (error instanceof DuplicateHasteCandidatesError) {
          throw new AmbiguousModuleResolutionError(originModulePath, error);
        }
        if (error instanceof InvalidPackageError) {
          throw new PackageResolutionError({
            packageError: error,
            originModulePath,
            targetModuleName: to,
          });
        }
        throw error;
      }
    }

    mapByPlatform.set(platformKey, resolution);
    return resolution;
  }

  doesFileExist = (filePath: string): boolean => {
    return this._fileSystem.exists(filePath);
  };

  getHasteName(filePath: string): string {
    const hasteName = this._hasteMap.getModuleNameByPath(filePath);

    if (hasteName) {
      return hasteName;
    }

    return path.relative(this._config.projectRoot, filePath);
  }

  getDependencies(filePath: string): Array<string> {
    if (!this.#dependencyPlugin) {
      throw new Error(
        'getDependencies called but extractDependencies is false',
      );
    }
    return Array.from(
      nullthrows(this.#dependencyPlugin.getDependencies(filePath)),
    );
  }
}
