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
  ResolutionObservations,
  TransformResultDependency,
} from '../../DeltaBundler/types';
import type {Reporter} from '../../lib/reporting';
import type {ResolverInputOptions} from '../../shared/types';
import type {
  CustomResolver,
  FileCandidates,
  FileSystemLookup,
  Resolution,
  ResolveAsset,
} from 'metro-resolver';
import type {PackageForModule, PackageJson} from 'metro-resolver/private/types';

import {codeFrameColumns} from '@babel/code-frame';
import invariant from 'invariant';
import * as Resolver from 'metro-resolver';
import createDefaultContext from 'metro-resolver/private/createDefaultContext';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

type Options = Readonly<{
  assetExts: ReadonlySet<string>,
  disableHierarchicalLookup: boolean,
  doesFileExist: (
    filePath: string,
    observations?: ?ResolutionObservations,
  ) => boolean,
  emptyModulePath: string,
  extraNodeModules: ?Object,
  fileSystemLookup: (
    filePath: string,
    observations?: ?ResolutionObservations,
  ) => ReturnType<FileSystemLookup>,
  getHasteModulePath: (name: string, platform: ?string) => ?string,
  getHastePackagePath: (name: string, platform: ?string) => ?string,
  // Whether any file can be given a Haste name. If not, Haste lookups always
  // miss, and are not worth observing.
  isHasteEnabled: boolean,
  mainFields: ReadonlyArray<string>,
  getPackage: (packageJsonPath: string) => ?PackageJson,
  getPackageForModule: (
    absolutePath: string,
    observations?: ?ResolutionObservations,
  ) => ?PackageForModule,
  nodeModulesPaths: ReadonlyArray<string>,
  preferNativePlatform: boolean,
  projectRoot: string,
  reporter: Reporter,
  resolveAsset: (
    dirPath: string,
    assetName: string,
    extension: string,
    observations?: ?ResolutionObservations,
  ) => ReturnType<ResolveAsset>,
  resolveRequest: ?CustomResolver,
  schemeResolvers: Readonly<{[scheme: string]: CustomResolver}>,
  sourceExts: ReadonlyArray<string>,
  unstable_conditionNames: ReadonlyArray<string>,
  unstable_conditionsByPlatform: Readonly<{
    [platform: string]: ReadonlyArray<string>,
  }>,
  unstable_enablePackageExports: boolean,
  unstable_incrementalResolution: boolean,
}>;

// Every record is created here, with the same properties in the same order,
// so that reading them stays monomorphic on the lookup hot path.
function createObservations(): {...ResolutionObservations} {
  return {existence: new Set(), content: new Set(), haste: null};
}

export class ModuleResolver {
  _options: Options;
  // A module representing the project root, used as the origin when resolving `emptyModulePath`.
  _projectRootFakeModulePath: string;
  // An empty module, the result of resolving `emptyModulePath` from the project root.
  _cachedEmptyModule: ?BundlerResolution;

  constructor(options: Options) {
    this._options = options;
    const {projectRoot} = this._options;
    this._projectRootFakeModulePath = path.join(projectRoot, '_');
  }

  _getEmptyModule(): BundlerResolution {
    let emptyModule = this._cachedEmptyModule;
    if (!emptyModule) {
      emptyModule = this.resolveDependency(
        this._projectRootFakeModulePath,
        {
          data: {
            asyncType: null,
            isESMImport: false,
            key: this._options.emptyModulePath,
            locs: [],
          },
          name: this._options.emptyModulePath,
        },
        false,
        null,
        /* resolverOptions */ {dev: false},
      );
      this._cachedEmptyModule = emptyModule;
    }
    return emptyModule;
  }

  resolveDependency(
    originModulePath: string,
    dependency: TransformResultDependency,
    allowHaste: boolean,
    platform: string | null,
    resolverOptions: ResolverInputOptions,
  ): BundlerResolution {
    const {
      assetExts,
      disableHierarchicalLookup,
      doesFileExist,
      extraNodeModules,
      fileSystemLookup,
      getPackage,
      getPackageForModule,
      mainFields,
      nodeModulesPaths,
      preferNativePlatform,
      resolveAsset,
      resolveRequest,
      schemeResolvers,
      sourceExts,
      unstable_conditionNames,
      unstable_conditionsByPlatform,
      unstable_enablePackageExports,
      unstable_incrementalResolution,
    } = this._options;

    // Everything this resolution observes of the file system is recorded here.
    // The capabilities given to the resolver are bound to it, so that the
    // resolution context keeps its shape and a custom resolver records what
    // it looks up without having to know about it.
    const observations = unstable_incrementalResolution
      ? createObservations()
      : null;
    // Most resolutions never consult Haste, so the set is created on demand.
    const observeHasteName =
      observations != null && this._options.isHasteEnabled
        ? (name: string) => {
            let names = observations.haste;
            if (names == null) {
              names = new Set<string>();
              observations.haste = names;
            }
            names.add(name);
          }
        : null;

    try {
      const result = Resolver.resolve(
        createDefaultContext(
          {
            allowHaste,
            assetExts,
            customResolverOptions: resolverOptions.customResolverOptions ?? {},
            dev: resolverOptions.dev,
            disableHierarchicalLookup,
            doesFileExist:
              observations == null
                ? doesFileExist
                : filePath => doesFileExist(filePath, observations),
            extraNodeModules,
            fileSystemLookup:
              observations == null
                ? fileSystemLookup
                : filePath => fileSystemLookup(filePath, observations),
            getPackage,
            getPackageForModule:
              observations == null
                ? getPackageForModule
                : absolutePath =>
                    getPackageForModule(absolutePath, observations),
            isESMImport: dependency.data.isESMImport,
            mainFields,
            nodeModulesPaths,
            originModulePath,
            preferNativePlatform,
            resolveAsset:
              observations == null
                ? resolveAsset
                : (dirPath, assetName, extension) =>
                    resolveAsset(dirPath, assetName, extension, observations),
            // A name is recorded whether or not it is found, and for any
            // platform, since `HastePlugin` falls back from the platform to
            // `native` and then to the generic module of that name.
            resolveHasteModule: (name: string) => {
              observeHasteName?.(name);
              return this._options.getHasteModulePath(name, platform);
            },
            resolveHastePackage: (name: string) => {
              observeHasteName?.(name);
              return this._options.getHastePackagePath(name, platform);
            },
            resolveRequest,
            schemeResolvers,
            sourceExts,
            unstable_conditionNames,
            unstable_conditionsByPlatform,
            unstable_enablePackageExports,
            unstable_incrementalResolution,
            unstable_logWarning: this._logWarning,
          },
          dependency,
        ),
        dependency.name,
        platform,
      );
      return this._getFileResolvedModule(result, observations);
    } catch (error) {
      if (error instanceof Resolver.FailedToResolvePathError) {
        const {candidates} = error;
        throw new UnableToResolveError(
          originModulePath,
          dependency.name,
          '\n\nNone of these files exist:\n' +
            [candidates.file, candidates.dir]
              .filter(Boolean)
              .map(
                candidates =>
                  `  * ${Resolver.formatFileCandidates(
                    this._removeRoot(candidates),
                  )}`,
              )
              .join('\n'),
          {
            cause: error,
            dependency,
          },
        );
      } else if (error instanceof Resolver.FailedToResolveUnsupportedError) {
        throw new UnableToResolveError(
          originModulePath,
          dependency.name,
          error.message,
          {cause: error, dependency},
        );
      } else if (error instanceof Resolver.FailedToResolveNameError) {
        const dirPaths = error.dirPaths;
        const extraPaths = error.extraPaths;
        const displayDirPaths = dirPaths
          .filter((dirPath: string) => {
            // Report only the directories resolution actually considered -
            // `resolveFromNodeModulesPath` gates candidates on this same test.
            const lookupResult = this._options.fileSystemLookup(dirPath);
            return lookupResult.exists && lookupResult.type === 'd';
          })
          .map(dirPath => path.relative(this._options.projectRoot, dirPath))
          .concat(extraPaths);

        const hint = displayDirPaths.length ? ' or in these directories:' : '';

        throw new UnableToResolveError(
          originModulePath,
          dependency.name,
          [
            `${dependency.name} could not be found within the project${
              hint || '.'
            }`,
            ...displayDirPaths.map((dirPath: string) => `  ${dirPath}`),
          ].join('\n'),
          {
            cause: error,
            dependency,
          },
        );
      }
      throw error;
    }
  }

  /**
   * TODO: Return Resolution instead of coercing to BundlerResolution here
   */
  _getFileResolvedModule(
    resolution: Resolution,
    observations: ?ResolutionObservations,
  ): BundlerResolution {
    switch (resolution.type) {
      case 'sourceFile':
        return observations == null
          ? resolution
          : {
              filePath: resolution.filePath,
              type: 'sourceFile',
              unstable_observations: observations,
            };
      case 'assetFiles':
        // FIXME: we should forward ALL the paths/metadata,
        // not just an arbitrary item!
        const arbitrary = getArrayLowestItem(resolution.filePaths);
        invariant(arbitrary != null, 'invalid asset resolution');
        return observations == null
          ? {filePath: arbitrary, type: 'sourceFile'}
          : {
              filePath: arbitrary,
              type: 'sourceFile',
              unstable_observations: observations,
            };
      case 'empty':
        const emptyModule = this._getEmptyModule();
        if (observations == null) {
          return emptyModule;
        }
        // The empty module is resolved once and cached, so a resolution that
        // lands on it depends on what that resolution observed as well as on
        // what led here. It is resolved without Haste, so observes no names.
        const emptyObservations = emptyModule.unstable_observations;
        if (emptyObservations != null) {
          for (const canonicalPath of emptyObservations.existence) {
            observations.existence.add(canonicalPath);
          }
          for (const canonicalPath of emptyObservations.content) {
            observations.content.add(canonicalPath);
          }
        }
        return {
          filePath: emptyModule.filePath,
          type: 'sourceFile',
          unstable_observations: observations,
        };
      case 'virtualModule':
        // Reserved for future implementation.
        throw new Error('Virtual modules are not yet implemented.');
      default:
        resolution.type as empty;
        throw new Error('invalid type');
    }
  }

  _logWarning = (message: string): void => {
    this._options.reporter.update({
      message,
      type: 'resolver_warning',
    });
  };

  _removeRoot(candidates: FileCandidates): FileCandidates {
    if (candidates.filePathPrefix) {
      candidates.filePathPrefix = path.relative(
        this._options.projectRoot,
        candidates.filePathPrefix,
      );
    }
    return candidates;
  }
}

function getArrayLowestItem(a: ReadonlyArray<string>): string | void {
  if (a.length === 0) {
    return undefined;
  }
  let lowest = a[0];
  for (let i = 1; i < a.length; ++i) {
    if (a[i] < lowest) {
      lowest = a[i];
    }
  }
  return lowest;
}

// $FlowFixMe[incompatible-type]
export class UnableToResolveError extends Error {
  /**
   * File path of the module that tried to require a module, ex. `/js/foo.js`.
   */
  originModulePath: string;
  /**
   * The name of the module that was required, no necessarily a path,
   * ex. `./bar`, or `invariant`.
   */
  targetModuleName: string;
  /**
   * Original error that causes this error
   */
  cause: ?Error;
  /**
   * Fixed type field in common with other Metro build errors.
   */
  readonly type: 'UnableToResolveError' = 'UnableToResolveError';

  constructor(
    originModulePath: string,
    targetModuleName: string,
    message: string,
    options?: Readonly<{
      dependency?: ?TransformResultDependency,
      cause?: Error,
    }>,
  ) {
    super();
    this.originModulePath = originModulePath;
    this.targetModuleName = targetModuleName;
    const codeFrameMessage = this.buildCodeFrameMessage(options?.dependency);
    this.message =
      util.format(
        'Unable to resolve module %s from %s: %s',
        targetModuleName,
        originModulePath,
        message,
      ) + (codeFrameMessage ? '\n' + codeFrameMessage : '');

    this.cause = options?.cause;
  }

  buildCodeFrameMessage(dependency: ?TransformResultDependency): ?string {
    let file;
    try {
      file = fs.readFileSync(this.originModulePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EISDIR') {
        // We're probably dealing with a virtualised file system where
        // `this.originModulePath` doesn't actually exist on disk.
        // We can't show a code frame, but there's no need to let this I/O
        // error shadow the original module resolution error.
        return null;
      }
      throw error;
    }

    const location = dependency?.data.locs.length
      ? refineDependencyLocation(
          dependency.data.locs[0],
          file,
          this.targetModuleName,
        )
      : // TODO: Ultimately we shouldn't ever have to guess the location.
        guessDependencyLocation(file, this.targetModuleName);
    return codeFrameColumns(
      fs.readFileSync(this.originModulePath, 'utf8'),
      location,
      {forceColor: process.env.NODE_ENV !== 'test'},
    );
  }
}

// Given a source location for an import declaration or `require()` call (etc),
// return a location for use with @babel/code-frame in the resolution error.
function refineDependencyLocation(
  loc: BabelSourceLocation,
  fileContents: string,
  targetSpecifier: string,
): {
  start: {column: number, line: number},
  end?: {column: number, line: number},
} {
  const lines = fileContents.split('\n');
  // If we can find the module name in range of the given loc, surrounded by
  // matching quotes, that's likely our specifier. Point to the first column of
  // the *last* valid occurrence.
  // Note that module names may not always be found in the source code verbatim,
  // whether because of escaping or because of exotic dependency APIs.
  for (let line = loc.end.line - 1; line >= loc.start.line - 1; line--) {
    const maxColumn =
      line === loc.end.line ? loc.end.column + 2 : lines[line].length;
    const minColumn = line === loc.start.line ? loc.start.column - 1 : 0;
    const lineStr = lines[line];
    const lineSlice = lineStr.slice(minColumn, maxColumn);
    for (
      let offset = lineSlice.lastIndexOf(targetSpecifier);
      offset !== -1 && // leave room for quotes
      offset > 0 &&
      offset < lineSlice.length - 1;
      offset = lineSlice.lastIndexOf(targetSpecifier, offset - 1)
    ) {
      const maybeQuoteBefore = lineSlice[minColumn + offset - 1];
      const maybeQuoteAfter =
        lineStr[minColumn + offset + targetSpecifier.length];
      if (isQuote(maybeQuoteBefore) && maybeQuoteBefore === maybeQuoteAfter) {
        return {
          start: {
            column: minColumn + offset + 1,
            line: line + 1,
          },
        };
      }
    }
  }
  // Otherwise, if this is a single-line loc, return it exactly, as a range.
  if (loc.start.line === loc.end.line) {
    return {
      end: {
        column: loc.end.column + 1,
        line: loc.end.line,
      },
      start: {
        column: loc.start.column + 1,
        line: loc.start.line,
      },
    };
  }
  // Otherwise, point to the first column of the loc, to avoid including too
  // much unnecessary context.
  return {
    start: {
      column: loc.start.column + 1,
      line: loc.start.line,
    },
  };
}

function guessDependencyLocation(
  fileContents: string,
  targetSpecifier: string,
) {
  const lines = fileContents.split('\n');
  let lineNumber = 0;
  let column = -1;
  for (let line = 0; line < lines.length; line++) {
    const columnLocation = lines[line].lastIndexOf(targetSpecifier);
    if (columnLocation >= 0) {
      lineNumber = line;
      column = columnLocation;
      break;
    }
  }
  return {
    start: {column: column + 1, line: lineNumber + 1},
  };
}

function isQuote(str: ?string): boolean {
  return str === '"' || str === "'" || str === '`';
}
