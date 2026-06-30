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

import type {ConfigT} from 'metro-config';
import type {HasteMap, InputFileMapPlugin} from 'metro-file-map';

import ci from 'ci-info';
import MetroFileMap, {
  DependencyPlugin,
  DiskCacheManager,
  HastePlugin,
} from 'metro-file-map';

const flattenBlockList = (regexes: ConfigT['resolver']['blockList']) => {
  if (!Array.isArray(regexes)) {
    return regexes;
  }
  return new RegExp(
    regexes
      .map((regex, index) => {
        if (regex.flags !== regexes[0].flags) {
          throw new Error(
            'Cannot combine blockList patterns, because they have different flags:\n' +
              ' - Pattern 0: ' +
              regexes[0].toString() +
              '\n' +
              ` - Pattern ${index}: ` +
              regexes[index].toString(),
          );
        }
        return '(' + regex.source + ')';
      })
      .join('|'),
    regexes[0]?.flags ?? '',
  );
};

export default function createFileMap(
  config: ConfigT,
  options?: Readonly<{
    extractDependencies?: boolean,
    watch?: boolean,
    throwOnModuleCollision?: boolean,
    cacheFilePrefix?: string,
  }>,
): {
  fileMap: MetroFileMap,
  hasteMap: HasteMap,
  dependencyPlugin: ?DependencyPlugin,
} {
  const watch = options?.watch == null ? !ci.isCI : options.watch;
  const {enabled: autoSaveEnabled, ...autoSaveOpts} =
    config.watcher.unstable_autoSaveCache ?? {};
  const autoSave = watch && autoSaveEnabled ? autoSaveOpts : false;

  const plugins: Array<InputFileMapPlugin> = [
    ...(config.unstable_fileMapPlugins ?? []),
  ];

  let dependencyPlugin = null;
  // Add DependencyPlugin if dependencies should be extracted
  if (
    config.resolver.dependencyExtractor != null &&
    options?.extractDependencies !== false
  ) {
    dependencyPlugin = new DependencyPlugin({
      dependencyExtractor: config.resolver.dependencyExtractor,
      computeDependencies: true,
    });
    plugins.push(dependencyPlugin);
  }

  const hasteMap = new HastePlugin({
    platforms: new Set([
      ...config.resolver.platforms,
      MetroFileMap.H.NATIVE_PLATFORM,
    ]),
    hasteImplModulePath: config.resolver.hasteImplModulePath,
    enableHastePackages: config.resolver.enableGlobalPackages,
    rootDir: config.projectRoot,
    failValidationOnConflicts: options?.throwOnModuleCollision ?? true,
  });

  plugins.push(hasteMap);

  const fileMap = new MetroFileMap({
    cacheManagerFactory:
      config?.unstable_fileMapCacheManagerFactory ??
      (factoryParams =>
        new DiskCacheManager(factoryParams, {
          cacheDirectory:
            config.fileMapCacheDirectory ?? config.hasteMapCacheDirectory,
          cacheFilePrefix: options?.cacheFilePrefix,
          autoSave,
        })),
    perfLoggerFactory: config.unstable_perfLoggerFactory,
    computeSha1: !config.watcher.unstable_lazySha1,
    enableSymlinks: true,
    extensions: Array.from(
      new Set([
        ...config.resolver.sourceExts,
        ...config.resolver.assetExts,
        ...config.watcher.additionalExts,
      ]),
    ),
    healthCheck: config.watcher.healthCheck,
    ignorePattern: flattenBlockList(config.resolver.blockList),
    maxWorkers: config.maxWorkers,
    plugins,
    retainAllFiles: true,
    resetCache: config.resetCache,
    rootDir: config.projectRoot,
    roots: config.watchFolders,
    useWatchman: config.resolver.useWatchman,
    watch,
    watchmanDeferStates: config.watcher.watchman.deferStates,
  });
  return {fileMap, hasteMap, dependencyPlugin};
}
