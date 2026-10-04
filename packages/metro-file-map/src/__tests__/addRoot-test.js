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

import type {
  CacheData,
  ChangeEvent,
  CrawlerOptions,
  FileMetadata,
  WatcherBackendOptions,
} from '../flow-types';
import type FileMapT from '../index';

import {AbstractWatcher} from '../watchers/AbstractWatcher';
import * as path from 'node:path';

jest.useRealTimers();

// Absolute path -> mtime, standing in for the file system seen by the crawler.
let mockFiles: Map<string, number>;

const mockNodeCrawler = jest.fn((options: CrawlerOptions) => {
  const path = require('node:path');
  const files = new Map<string, FileMetadata>();
  for (const [absolutePath, mtime] of mockFiles) {
    if (options.roots.some(root => absolutePath.startsWith(root + path.sep))) {
      files.set(path.relative(options.rootDir, absolutePath), [
        mtime,
        42,
        0,
        null,
        0,
      ]);
    }
  }
  return Promise.resolve(
    options.previousState.fileSystem.getDifference(files, {
      subpath: options.subpath,
    }),
  );
});

jest.mock('../crawlers/node', () => ({
  __esModule: true,
  default: mockNodeCrawler,
}));

let mockWatchers: Map<string, MockWatcher>;

class MockWatcher extends AbstractWatcher {
  constructor(root: string, opts: WatcherBackendOptions) {
    super(root, opts);
    mockWatchers.set(root, this);
  }

  static isSupported(): boolean {
    return true;
  }
}

jest.mock('../watchers/FallbackWatcher', () => MockWatcher);
jest.mock('../watchers/NativeWatcher', () => MockWatcher);

let FileMap: Class<FileMapT>;
let mockCacheContent: ?CacheData;

// Resolved, so that on Windows they carry a drive letter like the roots that
// addRoot() resolves.
const ROOT_DIR = path.resolve('/', 'repo', 'project');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const EXTERNAL_DIR = path.resolve('/', 'external');
const EXTERNAL_FILE = path.join(EXTERNAL_DIR, 'lib', 'helper.js');

function createFileMap(
  opts?: Readonly<{watch?: boolean, noChangesFromCrawl?: boolean}>,
): FileMapT {
  return new FileMap({
    cacheManagerFactory: () => ({
      end: async () => {},
      read: async () => mockCacheContent,
      write: async getSnapshot => {
        mockCacheContent = getSnapshot();
      },
    }),
    computeSha1: false,
    extensions: ['js'],
    healthCheck: {
      enabled: false,
      filePrefix: '.metro-file-map-health-check',
      interval: 10000,
      timeout: 1000,
    },
    maxWorkers: 1,
    plugins: [],
    resetCache: false,
    retainAllFiles: true,
    rootDir: ROOT_DIR,
    roots: [SRC_DIR],
    useWatchman: false,
    watch: opts?.watch ?? false,
  });
}

const rootPaths = (fileMap: FileMapT) =>
  fileMap.getRoots().map(root => root.absolutePath);

describe('FileMap.addRoot', () => {
  let fileMap: FileMapT;

  beforeEach(() => {
    jest.resetModules();
    mockNodeCrawler.mockClear();
    mockCacheContent = null;
    mockWatchers = new Map();
    mockFiles = new Map([
      [path.join(SRC_DIR, 'index.js'), 1],
      [EXTERNAL_FILE, 1],
      [path.join(EXTERNAL_DIR, 'other.js'), 1],
    ]);
    ({default: FileMap} = require('../'));
    fileMap = createFileMap();
  });

  afterEach(async () => {
    await fileMap.end();
  });

  test('throws if called before build()', () => {
    expect(() => fileMap.addRoot(EXTERNAL_DIR)).toThrow(
      'addRoot() must be called after build()',
    );
  });

  test('crawls the root, adds its files and emits a change event', async () => {
    const {fileSystem} = await fileMap.build();
    expect(fileSystem.exists(EXTERNAL_FILE)).toBe(false);
    expect(fileMap.getRoots()).toEqual([
      {absolutePath: SRC_DIR, rootRelativePath: 'src', dynamic: false},
    ]);

    const onChange = jest.fn<[ChangeEvent], void>();
    fileMap.on('change', onChange);
    await fileMap.addRoot(EXTERNAL_DIR);

    expect(fileSystem.exists(EXTERNAL_FILE)).toBe(true);
    expect(fileMap.getRoots()).toEqual([
      {absolutePath: SRC_DIR, rootRelativePath: 'src', dynamic: false},
      {
        absolutePath: EXTERNAL_DIR,
        rootRelativePath: path.relative(ROOT_DIR, EXTERNAL_DIR),
        dynamic: true,
      },
    ]);
    expect(mockNodeCrawler).toHaveBeenCalledTimes(2);
    expect(mockNodeCrawler).toHaveBeenLastCalledWith(
      expect.objectContaining({
        roots: [EXTERNAL_DIR],
        subpath: path.relative(ROOT_DIR, EXTERNAL_DIR),
      }),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(
      [...onChange.mock.calls[0][0].changes.addedFiles].map(([file]) => file),
    ).toEqual(
      [EXTERNAL_FILE, path.join(EXTERNAL_DIR, 'other.js')].map(file =>
        path.relative(ROOT_DIR, file),
      ),
    );
  });

  test('is idempotent, including for concurrent calls', async () => {
    await fileMap.build();
    await Promise.all([
      fileMap.addRoot(EXTERNAL_DIR),
      fileMap.addRoot(EXTERNAL_DIR + path.sep),
    ]);
    await fileMap.addRoot(EXTERNAL_DIR);
    expect(mockNodeCrawler).toHaveBeenCalledTimes(2);
    expect(rootPaths(fileMap)).toEqual([SRC_DIR, EXTERNAL_DIR]);
  });

  test.each([
    ['an initial root', SRC_DIR, [SRC_DIR]],
    [
      'within an initial root',
      path.join(SRC_DIR, 'nested'),
      [SRC_DIR, path.join(SRC_DIR, 'nested')],
    ],
  ])('does not crawl a root that is %s', async (_, root, expectedRoots) => {
    await fileMap.build();
    const onChange = jest.fn<[ChangeEvent], void>();
    fileMap.on('change', onChange);
    await fileMap.addRoot(root);
    expect(mockNodeCrawler).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(rootPaths(fileMap)).toEqual(expectedRoots);
  });

  test('does not crawl a root within one added earlier, and waits for it', async () => {
    const {fileSystem} = await fileMap.build();
    // $FlowFixMe[unused-promise] Awaited through the nested root below
    fileMap.addRoot(EXTERNAL_DIR);
    await fileMap.addRoot(path.join(EXTERNAL_DIR, 'lib'));
    expect(fileSystem.exists(EXTERNAL_FILE)).toBe(true);
    expect(mockNodeCrawler).toHaveBeenCalledTimes(2);
    expect(rootPaths(fileMap)).toEqual([
      SRC_DIR,
      EXTERNAL_DIR,
      path.join(EXTERNAL_DIR, 'lib'),
    ]);
  });

  test('crawls only what is new when a root contains existing roots', async () => {
    const {fileSystem} = await fileMap.build();
    mockFiles.set(path.join(ROOT_DIR, 'other.js'), 1);
    const onChange = jest.fn<[ChangeEvent], void>();
    fileMap.on('change', onChange);
    await fileMap.addRoot(ROOT_DIR);
    expect(fileSystem.exists(path.join(ROOT_DIR, 'other.js'))).toBe(true);
    expect(
      [...onChange.mock.calls[0][0].changes.addedFiles].map(([file]) => file),
    ).toEqual(['other.js']);
  });

  test('a failed crawl rejects, and the root is not reported', async () => {
    await fileMap.build();
    mockNodeCrawler.mockImplementationOnce(() =>
      Promise.reject(new Error('crawl failed')),
    );
    await expect(fileMap.addRoot(EXTERNAL_DIR)).rejects.toThrow('crawl failed');
    expect(rootPaths(fileMap)).toEqual([SRC_DIR]);
    // A later attempt may succeed.
    await fileMap.addRoot(EXTERNAL_DIR);
    expect(rootPaths(fileMap)).toEqual([SRC_DIR, EXTERNAL_DIR]);
  });

  test('added roots do not survive into an instance built from the cache', async () => {
    await fileMap.build();
    await fileMap.addRoot(EXTERNAL_DIR);
    await fileMap.end();

    // Simulate a crawler that reports only changes since the cached state,
    // as Watchman does, so that removal cannot come from the crawl.
    mockNodeCrawler.mockImplementationOnce(() =>
      Promise.resolve({changedFiles: new Map(), removedFiles: new Set()}),
    );
    fileMap = createFileMap();
    const {fileSystem} = await fileMap.build();

    expect(rootPaths(fileMap)).toEqual([SRC_DIR]);
    expect(fileSystem.exists(path.join(SRC_DIR, 'index.js'))).toBe(true);
    expect(fileSystem.exists(EXTERNAL_FILE)).toBe(false);
    expect(fileSystem.getAllFiles()).toEqual([path.join(SRC_DIR, 'index.js')]);
  });

  describe('in watch mode', () => {
    beforeEach(() => {
      fileMap = createFileMap({watch: true});
    });

    test('watches the added root and applies its changes', async () => {
      const {fileSystem} = await fileMap.build();
      expect([...mockWatchers.keys()]).toEqual([SRC_DIR]);

      await fileMap.addRoot(EXTERNAL_DIR);
      expect([...mockWatchers.keys()]).toEqual([SRC_DIR, EXTERNAL_DIR]);

      const changed = new Promise<ChangeEvent>(resolve =>
        fileMap.once('change', resolve),
      );
      mockWatchers.get(EXTERNAL_DIR)?.emitFileEvent({
        event: 'delete',
        relativePath: path.join('lib', 'helper.js'),
      });
      const {changes} = await changed;
      expect([...changes.removedFiles].map(([file]) => file)).toEqual([
        path.relative(ROOT_DIR, EXTERNAL_FILE),
      ]);
      expect(fileSystem.exists(EXTERNAL_FILE)).toBe(false);
    });

    test('does not watch a root within an existing root', async () => {
      await fileMap.build();
      await fileMap.addRoot(path.join(SRC_DIR, 'nested'));
      expect([...mockWatchers.keys()]).toEqual([SRC_DIR]);
    });

    test('stops watching added roots on end()', async () => {
      await fileMap.build();
      await fileMap.addRoot(EXTERNAL_DIR);
      const stopWatching = jest.spyOn(
        mockWatchers.get(EXTERNAL_DIR),
        'stopWatching',
      );
      await fileMap.end();
      expect(stopWatching).toHaveBeenCalled();
    });
  });
});
