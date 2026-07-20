/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 * @oncall react_native
 */

import type {
  FileMapPluginWorker,
  FileMetadata,
  WorkerMessage,
  WorkerMetadata,
} from '../../flow-types';

import H from '../../constants';
import path from 'node:path';

const MockJestWorker = jest.fn().mockImplementation(() => ({
  processFile: async () => ({}),
  end: async () => {},
}));
const mockWorkerFn = jest.fn().mockReturnValue({});

// Convenience function to write paths with posix separators but convert them
// to system separators
const p: string => string = filePath =>
  process.platform === 'win32'
    ? filePath.replace(/\//g, '\\').replace(/^\\/, 'C:\\')
    : filePath;

const defaultOptions = {
  maxWorkers: 5,
  perfLogger: null,
  pluginWorkers: [] as ReadonlyArray<FileMapPluginWorker>,
  rootDir: process.platform === 'win32' ? 'C:\\root' : '/root',
};

describe('processBatch', () => {
  let FileProcessor;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.mock('jest-worker', () => ({
      Worker: MockJestWorker,
    }));
    jest.mock('../../worker.js', () => ({
      setup: () => {},
      processFile: mockWorkerFn,
      Worker: class {
        processFile: WorkerMessage => WorkerMetadata = mockWorkerFn;
      },
    }));
    FileProcessor = require('../FileProcessor').FileProcessor;
  });

  test('never creates more than maxWorkers', async () => {
    const processor = new FileProcessor({
      ...defaultOptions,
      maxWorkers: 5,
      maxFilesPerWorker: 1,
    });

    await processor.processBatch(getNMockFiles(100), {
      computeSha1: true,
      maybeReturnContent: false,
    });

    expect(MockJestWorker).toHaveBeenCalledWith(
      expect.stringContaining('worker.js'),
      expect.objectContaining({
        numWorkers: 5,
      }),
    );
  });

  test('processes in band if workload <= maxFilesPerWorker', async () => {
    const processor = new FileProcessor({
      ...defaultOptions,
      maxWorkers: 5,
      maxFilesPerWorker: 50,
    });

    await processor.processBatch(getNMockFiles(50), {
      computeSha1: true,
      maybeReturnContent: false,
    });

    expect(MockJestWorker).not.toHaveBeenCalled();
    expect(mockWorkerFn).toHaveBeenCalledTimes(50);
  });

  test('calculates number of workers based on actual jobs after filtering no-ops', async () => {
    const processor = new FileProcessor({
      ...defaultOptions,
      maxWorkers: 10,
      maxFilesPerWorker: 10,
    });

    // Create 100 files, but some already have SHA1 hashes (no-op jobs)
    const filesWithSomeAlreadyHashed = new Array<?[string, FileMetadata]>(100)
      .fill(null)
      .map((_, i) => {
        const metadata: FileMetadata =
          i < 50
            ? // First 50 files already have SHA1 hashes
              [123, 234, 0, 'existing-sha1-hash', 0]
            : // Last 50 files need SHA1 computation
              [123, 234, 0, null, 0];
        return [`file${i}.js`, metadata];
      });

    await processor.processBatch(filesWithSomeAlreadyHashed, {
      computeSha1: true,
      maybeReturnContent: false,
    });

    // Should create workers based on 50 actual jobs, not 100 total files
    // 50 jobs / 10 maxFilesPerWorker = 5 workers
    expect(MockJestWorker).toHaveBeenCalledWith(
      expect.stringContaining('worker.js'),
      expect.objectContaining({
        numWorkers: 5,
      }),
    );
  });

  test('plugin filters are called with correct arguments', async () => {
    const mockFilter = jest.fn().mockReturnValue(true);

    const processor = new FileProcessor({
      ...defaultOptions,
      pluginWorkers: [
        {
          worker: {
            modulePath: 'mock-plugin-1',
            setupArgs: {},
          },
          filter: mockFilter,
        },
      ],
    });

    await processor.processBatch(
      [
        [p('src/Component.js'), [123, 234, 0, null, 0, null]],
        [p('node_modules/lib/index.js'), [123, 234, 0, null, 0, null]],
        [p('packages/node_modules/foo.js'), [123, 234, 0, null, 0, null]],
      ],
      {
        computeSha1: true,
        maybeReturnContent: false,
      },
    );

    // Filter should be called for regular file with isNodeModules = false
    expect(mockFilter).toHaveBeenCalledWith({
      normalPath: p('src/Component.js'),
      isNodeModules: false,
    });

    // Filter should be called for node_modules files with isNodeModules = true
    expect(mockFilter).toHaveBeenCalledWith({
      normalPath: p('node_modules/lib/index.js'),
      isNodeModules: true,
    });
    expect(mockFilter).toHaveBeenCalledWith({
      normalPath: p('packages/node_modules/foo.js'),
      isNodeModules: true,
    });
  });

  test('pluginsToRun is correctly passed to workers based on filter results', async () => {
    const mockFilter1 = jest.fn().mockReturnValue(true);
    const mockFilter2 = jest.fn().mockReturnValue(false);
    const mockFilter3 = jest.fn().mockReturnValue(true);

    const processor = new FileProcessor({
      ...defaultOptions,
      pluginWorkers: [
        {
          worker: {
            modulePath: 'mock-plugin-1',
            setupArgs: {},
          },
          filter: mockFilter1,
        },
        {
          worker: {
            modulePath: 'mock-plugin-2',
            setupArgs: {},
          },
          filter: mockFilter2,
        },
        {
          worker: {
            modulePath: 'mock-plugin-3',
            setupArgs: {},
          },
          filter: mockFilter3,
        },
      ],
    });

    await processor.processBatch(
      [[p('src/Component.js'), [123, 234, 0, null, 0, null]]],
      {
        computeSha1: true,
        maybeReturnContent: false,
      },
    );

    // Worker should be called with pluginsToRun containing indices 0 and 2
    // (plugins 1 and 3 passed filter, plugin 2 did not)
    expect(mockWorkerFn).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginsToRun: [0, 2],
      }),
    );
  });

  test('worker reply plugin data is mapped to correct fileMetadata indices', async () => {
    const mockFilter1 = jest.fn().mockReturnValue(true);
    const mockFilter2 = jest.fn().mockReturnValue(false);
    const mockFilter3 = jest.fn().mockReturnValue(true);

    // Mock worker returns plugin data
    mockWorkerFn.mockReturnValue({
      dependencies: null,
      sha1: 'abc123',
      pluginData: ['plugin0-data', 'plugin2-data'],
    });

    const processor = new FileProcessor({
      ...defaultOptions,
      pluginWorkers: [
        {
          worker: {
            modulePath: 'mock-plugin-1',
            setupArgs: {},
          },
          filter: mockFilter1,
        },
        {
          worker: {
            modulePath: 'mock-plugin-2',
            setupArgs: {},
          },
          filter: mockFilter2,
        },
        {
          worker: {
            modulePath: 'mock-plugin-3',
            setupArgs: {},
          },
          filter: mockFilter3,
        },
      ],
    });

    const fileMetadata: FileMetadata = [123, 234, 0, null, 0, null];

    await processor.processBatch([[p('src/Component.js'), fileMetadata]], {
      computeSha1: true,
      maybeReturnContent: false,
    });

    // Verify pluginData is stored at correct indices
    // Plugin 0 data at H.PLUGINDATA + 0
    expect(fileMetadata[H.PLUGINDATA + 0]).toBe('plugin0-data');
    // Plugin 2 data at H.PLUGINDATA + 2 (not at +1, because it's plugin index 2)
    expect(fileMetadata[H.PLUGINDATA + 2]).toBe('plugin2-data');
    // Plugin 1 should not have data (filter returned false)
    expect(fileMetadata[H.PLUGINDATA + 1]).toBeUndefined();

    // Verify other metadata fields
    expect(fileMetadata[H.SHA1]).toBe('abc123');
    expect(fileMetadata[H.VISITED]).toBe(1);
  });

  test('file is skipped if no plugins match and no other work needed', async () => {
    const mockFilter = jest.fn().mockReturnValue(false);

    const processor = new FileProcessor({
      ...defaultOptions,
      pluginWorkers: [
        {
          worker: {
            modulePath: 'mock-plugin',
            setupArgs: {},
          },
          filter: mockFilter,
        },
      ],
    });

    const fileMetadata: FileMetadata = [123, 234, 0, 'existing-sha1', 0, null];

    await processor.processBatch([[p('src/Component.js'), fileMetadata]], {
      computeSha1: false,
      maybeReturnContent: false,
    });

    // Worker should not be called because:
    // - No SHA1 needed (already exists)
    // - No dependencies requested
    // - No plugins matched
    expect(mockWorkerFn).not.toHaveBeenCalled();
  });

  test('file is processed if at least one plugin matches', async () => {
    const mockFilter = jest.fn().mockReturnValue(true);

    const processor = new FileProcessor({
      ...defaultOptions,
      pluginWorkers: [
        {
          worker: {
            modulePath: 'mock-plugin',
            setupArgs: {},
          },
          filter: mockFilter,
        },
      ],
    });

    const fileMetadata: FileMetadata = [123, 234, 0, 'existing-sha1', 0, null];

    await processor.processBatch([[p('src/Component.js'), fileMetadata]], {
      computeSha1: false,
      maybeReturnContent: false,
    });

    // Worker should be called because at least one plugin matched
    expect(mockWorkerFn).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginsToRun: [0],
      }),
    );
  });
});

describe('processRegularFile', () => {
  let FileProcessor;
  const mockReadFileSync = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.unmock('../../worker.js');
    jest.mock('fs', () => ({
      readFileSync: mockReadFileSync,
    }));
    FileProcessor = require('../FileProcessor').FileProcessor;
  });

  test('synchronously populates metadata', () => {
    const processor = new FileProcessor(defaultOptions);
    const [normalFilePath, metadata] = getNMockFiles(1)[0];
    expect(metadata[H.SHA1]).toBeFalsy();

    const fileContent = Buffer.from('hello world');
    mockReadFileSync.mockReturnValue(fileContent);

    const result = processor.processRegularFile(normalFilePath, metadata, {
      computeSha1: true,

      maybeReturnContent: true,
    });

    expect(mockReadFileSync).toHaveBeenCalledWith(
      path.resolve(defaultOptions.rootDir, normalFilePath),
    );

    expect(result).toEqual({
      content: fileContent,
    });

    expect(metadata[H.SHA1]).toMatch(/^[a-f0-9]{40}$/);
  });
});

function getNMockFiles(numFiles: number): Array<[string, FileMetadata]> {
  return new Array<?[string, FileMetadata]>(numFiles)
    .fill(null)
    .map((_, i) => [
      `file${i}.js`,
      [123, 234, 0, null, 0, null] as FileMetadata,
    ]);
}
