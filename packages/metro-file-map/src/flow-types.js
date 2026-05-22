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

import type {PerfLogger, PerfLoggerFactory, RootPerfLogger} from 'metro-config';

export type {PerfLoggerFactory, PerfLogger};

// These inputs affect the internal data collected for a given filesystem
// state, and changes may invalidate a cache.
export type BuildParameters = Readonly<{
  computeSha1: boolean,
  enableSymlinks: boolean,
  extensions: ReadonlyArray<string>,
  ignorePattern: RegExp,
  plugins: ReadonlyArray<InputFileMapPlugin>,
  retainAllFiles: boolean,
  rootDir: string,
  roots: ReadonlyArray<string>,

  cacheBreaker: string,
}>;

export type BuildResult = {
  fileSystem: FileSystem,
};

export type CacheData = Readonly<{
  clocks: WatchmanClocks,
  fileSystemData: unknown,
  plugins: ReadonlyMap<string, void | V8Serializable>,
}>;

export interface CacheManager {
  /**
   * Called during startup to load initial state, if available. Provided to
   * a crawler, which will return the delta between the initial state and the
   * current file system state.
   */
  read(): Promise<?CacheData>;

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
  onChange(listener: () => void): () => void /* unsubscribe */;
}

export type CacheManagerFactory = (
  options: CacheManagerFactoryOptions,
) => CacheManager;

export type CacheManagerFactoryOptions = Readonly<{
  buildParameters: BuildParameters,
}>;

export type CacheManagerWriteOptions = Readonly<{
  changedSinceCacheRead: boolean,
  eventSource: CacheManagerEventSource,
  onWriteError: (error: Error) => void,
}>;

// A path that is
//  - Relative to the contextual `rootDir`
//  - Normalised (no extraneous '.' or '..')
//  - Real (no symlinks in path, though the path itself may be a symlink)
export type CanonicalPath = string;

export type ChangedFileMetadata = Readonly<{
  isSymlink: boolean,
  modifiedTime?: ?number,
}>;

export type ChangeEvent = Readonly<{
  logger: ?RootPerfLogger,
  changes: ReadonlyFileSystemChanges<Readonly<ChangedFileMetadata>>,
  rootDir: string,
}>;

export type ChangeEventMetadata = {
  modifiedTime: ?number, // Epoch ms
  size: ?number, // Bytes
  type: 'f' | 'd' | 'l', // Regular file / Directory / Symlink
};

export type Console = typeof global.console;

export type CrawlerOptions = {
  abortSignal: ?AbortSignal,
  computeSha1: boolean,
  console: Console,
  extensions: ReadonlyArray<string>,
  ignore: IgnoreMatcher,
  includeSymlinks: boolean,
  perfLogger?: ?PerfLogger,
  previousState: Readonly<{
    clocks: ReadonlyMap<CanonicalPath, WatchmanClockSpec>,
    fileSystem: FileSystem,
  }>,
  rootDir: string,
  roots: ReadonlyArray<string>,
  onStatus: (status: WatcherStatus) => void,
  // Only consider files under this normalized subdirectory when computing
  // removedFiles. If not provided, all files in the file system are considered.
  subpath?: string,
};

export type CrawlResult =
  | {
      changedFiles: FileData,
      removedFiles: Set<Path>,
      clocks: WatchmanClocks,
    }
  | {
      changedFiles: FileData,
      removedFiles: Set<Path>,
    };

export type DependencyExtractor = {
  extract: (
    content: string,
    absoluteFilePath: string,
    defaultExtractor?: DependencyExtractor['extract'],
  ) => Set<string>,
  getCacheKey: () => string,
};

export type WatcherStatus =
  | {
      type: 'watchman_slow_command',
      timeElapsed: number,
      command: 'watch-project' | 'query',
    }
  | {
      type: 'watchman_slow_command_complete',
      timeElapsed: number,
      command: 'watch-project' | 'query',
    }
  | {
      type: 'watchman_warning',
      warning: unknown,
      command: 'watch-project' | 'query',
    };

export type DuplicatesSet = Map<string, /* type */ number>;
export type DuplicatesIndex = Map<string, Map<string, DuplicatesSet>>;

export type FileMapPluginInitOptions<
  out SerializableState,
  out PerFileData = void,
> = Readonly<{
  files: Readonly<{
    fileIterator(
      opts: Readonly<{
        includeNodeModules: boolean,
        includeSymlinks: boolean,
      }>,
    ): Iterable<{
      baseName: string,
      canonicalPath: string,
      +pluginData: ?PerFileData,
    }>,
    lookup(
      mixedPath: string,
    ):
      | {exists: false}
      | {exists: true, type: 'f', +pluginData: PerFileData}
      | {exists: true, type: 'd'},
  }>,
  pluginState: ?SerializableState,
}>;

export type FileMapPluginWorker = Readonly<{
  worker: Readonly<{
    modulePath: string,
    setupArgs: JsonData,
  }>,
  filter: ({normalPath: string, isNodeModules: boolean}) => boolean,
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
  in SerializableState extends void | V8Serializable = void | V8Serializable,
  in PerFileData extends void | V8Serializable = void | V8Serializable,
> {
  +name: string;
  initialize(
    initOptions: FileMapPluginInitOptions<SerializableState, PerFileData>,
  ): Promise<void>;
  assertValid(): void;
  onChanged(changes: ReadonlyFileSystemChanges<?PerFileData>): void;
  getSerializableSnapshot(): void | V8Serializable;
  getCacheKey(): string;
  getWorker(): ?FileMapPluginWorker;
}

export type InputFileMapPlugin = FileMapPlugin<empty, empty>;

export interface MetadataWorker {
  processFile(
    WorkerMessage,
    Readonly<{getContent: () => Buffer}>,
  ): V8Serializable;
}

export type HType = {
  MTIME: 0,
  SIZE: 1,
  VISITED: 2,
  SHA1: 3,
  SYMLINK: 4,
  PLUGINDATA: number,
  PATH: 0,
  TYPE: 1,
  MODULE: 0,
  PACKAGE: 1,
  GENERIC_PLATFORM: 'g',
  NATIVE_PLATFORM: 'native',
};

export type HTypeValue = Values<HType>;

export type IgnoreMatcher = (item: string) => boolean;

export type FileData = Map<CanonicalPath, FileMetadata>;

export type FileMetadata = [
  /* mtime */ ?number,
  /* size */ number,
  /* visited */ 0 | 1,
  /* sha1 */ ?string,
  /* symlink */ 0 | 1 | string, // string specifies target, if known
  /* plugindata */
  ...
];

export type FileStats = Readonly<{
  fileType: 'f' | 'l',
  modifiedTime: ?number,
  size: ?number,
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
      subpath?: string,
    }>,
  ): {
    changedFiles: FileData,
    removedFiles: Set<string>,
  };
  getSerializableSnapshot(): CacheData['fileSystemData'];
  getSha1(file: Path): ?string;
  getOrComputeSha1(file: Path): Promise<?{sha1: string, content?: Buffer}>;

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
      breakOnSegment: ?string,
      invalidatedBy: ?Set<string>,
      subpathType: 'f' | 'd',
    },
  ): ?{
    absolutePath: string,
    containerRelativePath: string,
  };

  /**
   * Analogous to posix lstat. If the file at `file` is a symlink, return
   * information about the symlink without following it.
   */
  linkStats(file: Path): ?FileStats;

  /**
   * Return information about the given path, whether a directory or file.
   * Always follow symlinks, and return a real path if it exists.
   */
  lookup(mixedPath: Path): LookupResult;

  matchFiles(opts: {
    /* Filter relative paths against a pattern. */
    filter?: RegExp | null,
    /* `filter` is applied against absolute paths, vs rootDir-relative. (default: false) */
    filterCompareAbsolute?: boolean,
    /* `filter` is applied against posix-delimited paths, even on Windows. (default: false) */
    filterComparePosix?: boolean,
    /* Follow symlinks when enumerating paths. (default: false) */
    follow?: boolean,
    /* Should search for files recursively. (default: true) */
    recursive?: boolean,
    /* Match files under a given root, or null for all files */
    rootDir?: Path | null,
  }): Iterable<Path>;
}

export type Glob = string;

export type JsonData =
  | string
  | number
  | boolean
  | null
  | Array<JsonData>
  | {[key: string]: JsonData};

export type LookupResult =
  | {
      // The node is missing from the FileSystem implementation (note this
      // could indicate an unwatched path, or a directory containing no watched
      // files).
      exists: false,
      // The real, normal, absolute paths of any symlinks traversed.
      links: ReadonlySet<string>,
      // The real, normal, absolute path of the first path segment
      // encountered that does not exist, or cannot be navigated through.
      missing: string,
    }
  | {
      exists: true,
      // The real, normal, absolute paths of any symlinks traversed.
      links: ReadonlySet<string>,
      // The real, normal, absolute path of the directory.
      realPath: string,
      // Currently lookup always follows symlinks, so can only return
      // directories or regular files, but this may be extended.
      type: 'd',
    }
  | {
      exists: true,
      // The real, normal, absolute paths of any symlinks traversed.
      links: ReadonlySet<string>,
      // The real, normal, absolute path of the file.
      realPath: string,
      // Currently lookup always follows symlinks, so can only return
      // directories or regular files, but this may be extended.
      type: 'f',
      // The file's metadata tuple. Must only be mutated via FileProcessor.
      metadata: FileMetadata,
    };

export interface MockMap {
  getMockModule(name: string): ?Path;
}

export type HasteConflict = {
  id: string,
  platform: string | null,
  absolutePaths: Array<string>,
  type: 'duplicate' | 'shadowing',
};

export interface HasteMap {
  getModule(
    name: string,
    platform?: ?string,
    supportsNativePlatform?: ?boolean,
    type?: ?HTypeValue,
  ): ?Path;

  getModuleNameByPath(file: Path): ?string;

  getPackage(
    name: string,
    platform: ?string,
    _supportsNativePlatform: ?boolean,
  ): ?Path;

  computeConflicts(): Array<HasteConflict>;
}

export type HasteMapData = Map<string, HasteMapItem>;

export type HasteMapItem = {
  [platform: string]: HasteMapItemMetadata,
  __proto__: null,
};
export type HasteMapItemMetadata = [/* path */ string, /* type */ number];

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

export interface ReadonlyFileSystemChanges<out T = FileMetadata> {
  +addedDirectories: Iterable<CanonicalPath>;
  +removedDirectories: Iterable<CanonicalPath>;

  +addedFiles: Iterable<Readonly<[CanonicalPath, T]>>;
  +modifiedFiles: Iterable<Readonly<[CanonicalPath, T]>>;
  +removedFiles: Iterable<Readonly<[CanonicalPath, T]>>;
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
) => ?Buffer;

export type RawMockMap = Readonly<{
  duplicates: Map<
    string, // posix-separated mock name
    Set<string>, // posix-separated, project-relative paths
  >,
  mocks: Map<
    string, // posix-separated mock name
    Path, // posix-separated, project-relative pathf
  >,
  version: number,
}>;

export type ReadOnlyRawMockMap = Readonly<{
  duplicates: ReadonlyMap<string, ReadonlySet<string>>,
  mocks: ReadonlyMap<string, Path>,
  version: number,
}>;

export interface WatcherBackend {
  getPauseReason(): ?string;
  onError(listener: (error: Error) => void): () => void;
  onFileEvent(listener: (event: WatcherBackendChangeEvent) => void): () => void;
  startWatching(): Promise<void>;
  stopWatching(): Promise<void>;
}

export type ChangeEventClock = [
  string /* absolute watch root */,
  string /* opaque clock */,
];

export type WatcherBackendChangeEvent =
  | Readonly<{
      event: 'touch',
      clock?: ChangeEventClock,
      relativePath: string,
      root: string,
      metadata: ChangeEventMetadata,
    }>
  | Readonly<{
      event: 'delete',
      clock?: ChangeEventClock,
      relativePath: string,
      root: string,
      metadata?: void,
    }>
  | Readonly<{
      event: 'recrawl',
      clock?: ChangeEventClock,
      relativePath: string,
      root: string,
    }>;

export type WatcherBackendOptions = Readonly<{
  ignored: ?RegExp,
  globs: ReadonlyArray<string>,
  dot: boolean,
  ...
}>;

export type WatchmanClockSpec =
  | string
  | Readonly<{scm: Readonly<{'mergebase-with': string}>}>;
export type WatchmanClocks = Map<Path, WatchmanClockSpec>;

export type WorkerMessage = Readonly<{
  computeSha1: boolean,
  filePath: string,
  maybeReturnContent: boolean,
  pluginsToRun: ReadonlyArray<number>,
}>;

export type WorkerMetadata = Readonly<{
  sha1?: ?string,
  content?: ?Buffer,
  pluginData?: ReadonlyArray<V8Serializable>,
}>;

export type WorkerSetupArgs = Readonly<{
  plugins?: ReadonlyArray<FileMapPluginWorker['worker']>,
}>;
