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

import type {ResolutionContext} from '../index';
import type {PackageJson} from '../types';

import path from 'node:path';

/**
 * Data structure approximating a file tree. Should be populated with complete
 * paths mapping to file contents.
 */
type MockFileMap = Readonly<{
  [path: string]: ?(string | Readonly<{realPath: ?string}>),
}>;

/**
 * Create a new partial `ResolutionContext` object given a mock file structure.
 * Includes defaults closely matching metro-config, which can be overridden by
 * consuming tests.
 */
export function createResolutionContext(
  fileMap: MockFileMap = {},
): Omit<ResolutionContext, 'originModulePath'> {
  const directorySet = new Set<string>();
  for (const filePath of Object.keys(fileMap)) {
    let currentDir = filePath;
    let prevDir;
    do {
      prevDir = currentDir;
      currentDir = path.dirname(currentDir);
      directorySet.add(currentDir);
    } while (currentDir !== prevDir);
  }

  return {
    dev: true,
    allowHaste: true,
    assetExts: new Set(['jpg', 'png']),
    customResolverOptions: {},
    disableHierarchicalLookup: false,
    doesFileExist: (filePath: string) =>
      // Should return false unless realpath(filePath) exists. We mock shallow
      // dereferencing.
      fileMap[filePath] != null &&
      (typeof fileMap[filePath] === 'string' ||
        typeof fileMap[filePath].realPath === 'string'),
    extraNodeModules: null,
    fileSystemLookup: inputPath => {
      // Normalise and remove any trailing slash.
      const filePath = path.resolve(inputPath);
      const candidate = fileMap[filePath];
      if (typeof candidate === 'string') {
        return {exists: true, type: 'f', realPath: filePath};
      }
      if (candidate == null) {
        if (directorySet.has(filePath)) {
          return {exists: true, type: 'd', realPath: filePath};
        }
        return {exists: false};
      }
      if (candidate.realPath == null) {
        return {exists: false};
      }
      return {
        exists: true,
        type: 'f',
        realPath: candidate.realPath,
      };
    },
    isESMImport: false,
    mainFields: ['browser', 'main'],
    nodeModulesPaths: [],
    preferNativePlatform: false,
    redirectModulePath: (filePath: string) => filePath,
    resolveAsset: (filePath: string) => null,
    resolveHasteModule: (name: string) => null,
    resolveHastePackage: (name: string) => null,
    sourceExts: ['js', 'jsx', 'json', 'ts', 'tsx'],
    unstable_conditionNames: ['require'],
    unstable_conditionsByPlatform: {
      web: ['browser'],
    },
    unstable_enablePackageExports: false,
    unstable_incrementalResolution: false,
    unstable_logWarning: () => {},
    ...createPackageAccessors(fileMap),
  };
}

/**
 * Create `getPackage` and `getPackageForModule` accessor properties on
 * `ResolutionContext` based on the input mock file/package.json map.
 */
export function createPackageAccessors(
  fileOrPackageJsonMap: MockFileMap | {[path: string]: PackageJson},
): Readonly<{
  getPackage: ResolutionContext['getPackage'],
  getPackageForModule: ResolutionContext['getPackageForModule'],
}> {
  const getPackage = (packageJsonPath: string) => {
    const contents = fileOrPackageJsonMap[packageJsonPath];

    if (typeof contents === 'string') {
      return JSON.parse(contents);
    }

    if (contents != null) {
      return contents;
    }

    return null;
  };
  const getPackageForModule = (modulePath: string) => {
    const parsedPath = path.parse(modulePath);
    const root = parsedPath.root;
    let dir = path.join(parsedPath.dir, parsedPath.base);

    do {
      if (path.basename(dir) === 'node_modules') {
        return null;
      }
      const candidate = path.join(dir, 'package.json');
      const packageJson = getPackage(candidate);

      if (packageJson != null) {
        return {
          rootPath: dir,
          packageJson,
          packageRelativePath: path.relative(dir, modulePath),
        };
      }

      dir = path.dirname(dir);
    } while (dir !== '.' && dir !== root);

    return null;
  };

  return {
    getPackage,
    getPackageForModule,
  };
}

export const posixToSystemPath: string => string =
  process.platform === 'win32'
    ? filePath => filePath.replaceAll('/', '\\').replace(/^\\/, 'C:\\')
    : filePath => filePath;
