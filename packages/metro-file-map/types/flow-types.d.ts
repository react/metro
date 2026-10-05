/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<d6cc7fde1b672e3345edcfc4b8e05f52>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-file-map/src/flow-types.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {PerfLogger, PerfLoggerFactory, RootPerfLogger} from 'metro-config';

export type {PerfLoggerFactory, PerfLogger};
export type BuildParameters = Readonly<{
  computeSha1: boolean;
  enableSymlinks: boolean;
  extensions: ReadonlyArray<string>;
  forceNodeFilesystemAPI: boolean;
  ignorePattern: RegExp;
  plugins: ReadonlyArray<InputFileMapPlugin>;
  retainAllFiles: boolean;
  rootDir: string;
  roots: ReadonlyArray<string>;
  cacheBreaker: string;
}>;
export type BuildResult = {fileSystem: FileSystem};
export type CacheData = Readonly<{
  clocks: WatchmanClocks;
  fileSystemData: unknown;
  plugins: ReadonlyMap<string, void | V8Serializable>;
}>;
export interface CacheManager {
  /**
   * Called during startup to load initial state, if available. Provided to
   * a crawler, which will return the delta between the initial state and the
   * current file system state.
   */
  read(): Promise<null | undefined | CacheData>;
  /**
   * Called when metro-file-map `build()` has applied changes returned by the
   * crawler - i.e. internal state reflects the current file system state.
   *
   * getSnapshot may be retained and called at any time before end(), such as
   * in response to eventSource 'change' events.
   */
  write(
    getSnapshot: () => CacheData,
    opts: CacheManagerWriteOptions,
  ): Promise<void>;
  /**
   * The last call that will be made to this CacheManager. Any handles should
   * be closed by the time this settles.
   */
  end(): Promise<void>;
}
export interface CacheManagerEventSource {
  onChange(listener: () => void): () => void;
}
export type CacheManagerFactory = (
  options: CacheManagerFactoryOptions,
) => CacheManager;
export type CacheManagerFactoryOptions = Readonly<{
  buildParameters: BuildParameters;
}>;
export type CacheManagerWriteOptions = Readonly<{
  changedSinceCacheRead: boolean;
  eventSource: CacheManagerEventSource;
  onWriteError: (error: Error) => void;
}>;
export type CanonicalPath = string;
export type ChangedFileMetadata = Readonly<{
  isSymlink: boolean;
  modifiedTime?: null | undefined | number;
}>;
export type ChangeEvent = Readonly<{
  logger: null | undefined | RootPerfLogger;
  changes: ReadonlyFileSystemChanges<Readonly<ChangedFileMetadata>>;
  rootDir: string;
}>;
export type ChangeEventMetadata = {
  modifiedTime: null | undefined | number;
  size: null | undefined | number;
  type: 'f' | 'd' | 'l';
};
export type Console = typeof global.console;
export type CrawlerOptions = {
  abortSignal: null | undefined | AbortSignal;
  computeSha1: boolean;
  console: Console;
  extensions: ReadonlyArray<string>;
  forceNodeFilesystemAPI: boolean;
  ignore: IgnoreMatcher;
  includeSymlinks: boolean;
  perfLogger?: null | undefined | PerfLogger;
  previousState: Readonly<{
    clocks: ReadonlyMap<CanonicalPath, WatchmanClockSpec>;
    fileSystem: FileSystem;
  }>;
  rootDir: string;
  roots: ReadonlyArray<string>;
  onStatus: (status: WatcherStatus) => void;
  subpath?: string;
};
export type CrawlResult =
  | {changedFiles: FileData; removedFiles: Set<Path>; clocks: WatchmanClocks}
  | {changedFiles: FileData; removedFiles: Set<Path>};
export type DependencyExtractor = {
  extract: (
    content: string,
    absoluteFilePath: string,
    defaultExtractor?: DependencyExtractor['extract'],
  ) => Set<string>;
  getCacheKey: () => string;
};
export type WatcherStatus =
  | {
      type: 'watchman_slow_command';
      timeElapsed: number;
      command: 'watch-project' | 'query';
    }
  | {
      type: 'watchman_slow_command_complete';
      timeElapsed: number;
      command: 'watch-project' | 'query';
    }
  | {
      type: 'watchman_warning';
      warning: unknown;
      command: 'watch-project' | 'query';
    };
export type DuplicatesSet = Map<string, number>;
export type DuplicatesIndex = Map<string, Map<string, DuplicatesSet>>;
export type FileMapPluginInitOptions<
  SerializableState,
  PerFileData = void,
> = Readonly<{
  files: Readonly<{
    fileIterator(
      opts: Readonly<{includeNodeModules: boolean; includeSymlinks: boolean}>,
    ): Iterable<{
      baseName: string;
      canonicalPath: string;
      readonly pluginData: null | undefined | PerFileData;
    }>;
    lookup(
      mixedPath: string,
    ):
      | {exists: false}
      | {exists: true; type: 'f'; readonly pluginData: PerFileData}
      | {exists: true; type: 'd'};
  }>;
  pluginState: null | undefined | SerializableState;
}>;
export type FileMapPluginWorker = Readonly<{
  worker: Readonly<{modulePath: string; setupArgs: JsonData}>;
  filter: ($$PARAM_0$$: {
    normalPath: string;
    isNodeModules: boolean;
  }) => boolean;
}>;
export type V8Serializable =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<V8Serializable>
  | ReadonlySet<V8Serializable>
  | ReadonlyMap<string, V8Serializable>
  | Readonly<{[key: string]: V8Serializable}>;
export interface FileMapPlugin<
  SerializableState extends void | V8Serializable = void | V8Serializable,
  PerFileData extends void | V8Serializable = void | V8Serializable,
> {
  readonly name: string;
  initialize(
    initOptions: FileMapPluginInitOptions<SerializableState, PerFileData>,
  ): Promise<void>;
  assertValid(): void;
  onChanged(
    changes: ReadonlyFileSystemChanges<null | undefined | PerFileData>,
  ): void;
  getSerializableSnapshot(): void | V8Serializable;
  getCacheKey(): string;
  getWorker(): null | undefined | FileMapPluginWorker;
}
export type InputFileMapPlugin = FileMapPlugin<
  /**
   * > 235 | export type InputFileMapPlugin = FileMapPlugin<empty, empty>;
   *       |                                                ^^^^^ Unsupported feature: Translating "empty type" is currently not supported.
   **/
  any,
  /**
   * > 235 | export type InputFileMapPlugin = FileMapPlugin<empty, empty>;
   *       |                                                       ^^^^^ Unsupported feature: Translating "empty type" is currently not supported.
   **/
  any
>;
export interface MetadataWorker {
  processFile(
    $$PARAM_0$$: WorkerMessage,
    $$PARAM_1$$: Readonly<{getContent: () => Buffer}>,
  ): V8Serializable;
}
export type HType = {
  MTIME: 0;
  SIZE: 1;
  VISITED: 2;
  SHA1: 3;
  SYMLINK: 4;
  PLUGINDATA: number;
  PATH: 0;
  TYPE: 1;
  MODULE: 0;
  PACKAGE: 1;
  GENERIC_PLATFORM: 'g';
  NATIVE_PLATFORM: 'native';
};
export type HTypeValue = HType[keyof HType];
export type IgnoreMatcher = (item: string) => boolean;
export type FileData = Map<CanonicalPath, FileMetadata>;
export type FileMetadata = [
  null | undefined | number,
  number,
  0 | 1,
  null | undefined | string,
  0 | 1 | string,
  ...unknown[],
];
export type FileStats = Readonly<{
  fileType: 'f' | 'l';
  modifiedTime: null | undefined | number;
  size: null | undefined | number;
}>;
export interface FileSystem {
  exists(file: Path): boolean;
  getAllFiles(): Array<Path>;
  /**
   * Given a map of files, determine which of them are new or modified
   * (changedFiles), and which of them are missing from the input
   * (removedFiles), vs the current state of this instance of FileSystem.
   */
  getDifference(
    files: FileData,
    options?: Readonly<{
      /**
       * Only consider files under this subpath (which should be a directory)
       * when computing removedFiles. If not provided, all files in the file
       * system are considered.
       */
      subpath?: string;
    }>,
  ): {changedFiles: FileData; removedFiles: Set<string>};
  getSerializableSnapshot(): CacheData['fileSystemData'];
  getSha1(file: Path): null | undefined | string;
  getOrComputeSha1(
    file: Path,
  ): Promise<null | undefined | {sha1: string; content?: Buffer}>;
  /**
   * Given a start path (which need not exist), a subpath and type, and
   * optionally a 'breakOnSegment', performs the following:
   *
   * X = mixedStartPath
   * do
   *   if basename(X) === opts.breakOnSegment
   *     return null
   *   if X + subpath exists and has type opts.subpathType
   *     return {
   *       absolutePath: realpath(X + subpath)
   *       containerRelativePath: relative(mixedStartPath, X)
   *     }
   *   X = dirname(X)
   * while X !== dirname(X)
   *
   * If opts.invalidatedBy is given, collects all absolute, real paths that if
   * added or removed may invalidate this result.
   *
   * Useful for finding the closest package scope (subpath: package.json,
   * type f, breakOnSegment: node_modules) or closest potential package root
   * (subpath: node_modules/pkg, type: d) in Node.js resolution.
   */
  hierarchicalLookup(
    mixedStartPath: string,
    subpath: string,
    opts: {
      breakOnSegment: null | undefined | string;
      invalidatedBy: null | undefined | Set<string>;
      subpathType: 'f' | 'd';
    },
  ): null | undefined | {absolutePath: string; containerRelativePath: string};
  /**
   * Analogous to posix lstat. If the file at `file` is a symlink, return
   * information about the symlink without following it.
   */
  linkStats(file: Path): null | undefined | FileStats;
  /**
   * Return information about the given path, whether a directory or file.
   * Always follow symlinks, and return a real path if it exists.
   */
  lookup(mixedPath: Path): LookupResult;
  matchFiles(opts: {
    filter?: RegExp | null;
    filterCompareAbsolute?: boolean;
    filterComparePosix?: boolean;
    follow?: boolean;
    recursive?: boolean;
    rootDir?: Path | null;
  }): Iterable<Path>;
}
export type JsonData =
  | string
  | number
  | boolean
  | null
  | Array<JsonData>
  | {[key: string]: JsonData};
export type LookupResult =
  | {exists: false; links: ReadonlySet<string>; missing: string}
  | {exists: true; links: ReadonlySet<string>; realPath: string; type: 'd'}
  | {
      exists: true;
      links: ReadonlySet<string>;
      realPath: string;
      type: 'f';
      metadata: FileMetadata;
    };
export interface MockMap {
  getMockModule(name: string): null | undefined | Path;
}
export type HasteConflict = {
  id: string;
  platform: string | null;
  absolutePaths: Array<string>;
  type: 'duplicate' | 'shadowing';
};
export interface HasteMap {
  getModule(
    name: string,
    platform?: null | undefined | string,
    supportsNativePlatform?: null | undefined | boolean,
    type?: null | undefined | HTypeValue,
  ): null | undefined | Path;
  getModuleNameByPath(file: Path): null | undefined | string;
  getPackage(
    name: string,
    platform: null | undefined | string,
    _supportsNativePlatform: null | undefined | boolean,
  ): null | undefined | Path;
  computeConflicts(): Array<HasteConflict>;
}
export type HasteMapData = Map<string, HasteMapItem>;
export type HasteMapItem = {
  [platform: string]: HasteMapItemMetadata;
};
export type HasteMapItemMetadata = [string, number];
export interface FileSystemListener {
  directoryAdded(canonicalPath: CanonicalPath): void;
  directoryRemoved(canonicalPath: CanonicalPath): void;
  fileAdded(canonicalPath: CanonicalPath, data: FileMetadata): void;
  fileModified(
    canonicalPath: CanonicalPath,
    oldData: FileMetadata,
    newData: FileMetadata,
  ): void;
  fileRemoved(canonicalPath: CanonicalPath, data: FileMetadata): void;
}
export interface ReadonlyFileSystemChanges<T = FileMetadata> {
  readonly addedDirectories: Iterable<CanonicalPath>;
  readonly removedDirectories: Iterable<CanonicalPath>;
  readonly addedFiles: Iterable<Readonly<[CanonicalPath, T]>>;
  readonly modifiedFiles: Iterable<Readonly<[CanonicalPath, T]>>;
  readonly removedFiles: Iterable<Readonly<[CanonicalPath, T]>>;
}
export interface MutableFileSystem extends FileSystem {
  remove(filePath: Path, listener?: FileSystemListener): void;
  addOrModify(
    filePath: Path,
    fileMetadata: FileMetadata,
    listener?: FileSystemListener,
  ): void;
  bulkAddOrModify(
    addedOrModifiedFiles: FileData,
    listener?: FileSystemListener,
  ): void;
}
export type Path = string;
export type ProcessFileFunction = (
  normalPath: string,
  metadata: FileMetadata,
  request: Readonly<{computeSha1: boolean}>,
) => null | undefined | Buffer;
export type RawMockMap = Readonly<{
  duplicates: Map<string, Set<string>>;
  mocks: Map<string, Path>;
  version: number;
}>;
export type ReadOnlyRawMockMap = Readonly<{
  duplicates: ReadonlyMap<string, ReadonlySet<string>>;
  mocks: ReadonlyMap<string, Path>;
  version: number;
}>;
export interface WatcherBackend {
  getPauseReason(): null | undefined | string;
  onError(listener: (error: Error) => void): () => void;
  onFileEvent(listener: (event: WatcherBackendChangeEvent) => void): () => void;
  startWatching(): Promise<void>;
  stopWatching(): Promise<void>;
}
export type ChangeEventClock = [string, string];
export type WatcherBackendChangeEvent =
  | Readonly<{
      event: 'touch';
      clock?: ChangeEventClock;
      relativePath: string;
      root: string;
      metadata: ChangeEventMetadata;
    }>
  | Readonly<{
      event: 'delete';
      clock?: ChangeEventClock;
      relativePath: string;
      root: string;
      metadata?: void;
    }>
  | Readonly<{
      event: 'recrawl';
      clock?: ChangeEventClock;
      relativePath: string;
      root: string;
    }>;
export type WatcherBackendOptions = Readonly<{
  ignored: null | undefined | RegExp;
  included: null | undefined | WatcherIncludedFiles;
}>;
/**
 * Regular files a watcher reports changes to: those matching any of the
 * extensions (without a leading dot), basenames, or basename prefixes.
 */
export type WatcherIncludedFiles = Readonly<{
  extensions: ReadonlySet<string>;
  basenames: ReadonlySet<string>;
  basenamePrefixes: ReadonlyArray<string>;
}>;
export type WatchmanClockSpec =
  | string
  | Readonly<{scm: Readonly<{'mergebase-with': string}>}>;
export type WatchmanClocks = Map<Path, WatchmanClockSpec>;
export type WorkerMessage = Readonly<{
  computeSha1: boolean;
  filePath: string;
  maybeReturnContent: boolean;
  pluginsToRun: ReadonlyArray<number>;
}>;
export type WorkerMetadata = Readonly<{
  sha1?: null | undefined | string;
  content?: null | undefined | Buffer;
  pluginData?: ReadonlyArray<V8Serializable>;
}>;
export type WorkerSetupArgs = Readonly<{
  plugins?: ReadonlyArray<FileMapPluginWorker['worker']>;
}>;
