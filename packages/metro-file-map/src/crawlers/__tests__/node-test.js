/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type TreeFSType from '../../lib/TreeFS';

let mockPathModule;
jest.mock('node:path', () => mockPathModule);

// The platform-specific path helper `p` for the graceful-fs mock
let mockP: string => string;

jest.useRealTimers();

jest.mock('graceful-fs', () => {
  const slash = require('slash');
  let mtime = 32;
  const size = 42;
  const stat = (path, callback) => {
    setTimeout(
      () =>
        callback(null, {
          isDirectory() {
            return slash(path).endsWith('/directory');
          },
          isSymbolicLink() {
            return slash(path).endsWith('symlink');
          },
          mtime: {
            getTime() {
              return mtime++;
            },
          },
          size,
        }),
      0,
    );
  };
  return {
    lstat: jest.fn(stat),
    readdir: jest.fn((dir, options, callback) => {
      // readdir has an optional `options` arg that's in the middle of the args list.
      // we always provide it in practice, but let's try to handle the case where it's not
      // provided too
      if (typeof callback === 'undefined') {
        if (typeof options === 'function') {
          callback = options;
        }
        throw new Error('readdir: callback is not a function!');
      }

      if (dir === mockP('/project/fruits')) {
        setTimeout(
          () =>
            callback(null, [
              {
                isDirectory: () => true,
                isSymbolicLink: () => false,
                name: 'directory',
              },
              {
                isDirectory: () => false,
                isSymbolicLink: () => false,
                name: 'tomato.js',
              },
              {
                isDirectory: () => false,
                isSymbolicLink: () => true,
                name: 'symlink',
              },
            ]),
          0,
        );
      } else if (dir === mockP('/project/fruits/directory')) {
        setTimeout(
          () =>
            callback(null, [
              {
                isDirectory: () => false,
                isSymbolicLink: () => false,
                name: 'strawberry.js',
              },
            ]),
          0,
        );
      } else if (dir === mockP('/error')) {
        setTimeout(() => callback({code: 'ENOTDIR'}, undefined), 0);
      }
    }),
    stat: jest.fn(stat),
  };
});

const pearMatcher = path => /pear/.test(path);

describe.each([['win32'], ['posix']])('node crawler on %s', platform => {
  // Convenience function to write paths with posix separators but convert them
  // to system separators
  const p: string => string = filePath =>
    platform === 'win32'
      ? filePath.replace(/\//g, '\\').replace(/^\\/, 'C:\\')
      : filePath;
  const createMap = obj =>
    new Map(Object.keys(obj).map(key => [p(key), obj[key]]));

  const rootDir = p('/project');
  let TreeFS: Class<TreeFSType>;
  let emptyFS: TreeFSType;
  let getFS: (files: FileData) => TreeFSType;
  let nodeCrawl;

  beforeEach(() => {
    jest.resetModules();
    mockPathModule = jest.requireActual<{}>('path')[platform];
    mockP = p;
    TreeFS = require('../../lib/TreeFS').default;
    emptyFS = new TreeFS({rootDir, files: new Map()});
    getFS = files => new TreeFS({rootDir, files});
  });

  test('updates only changed files', async () => {
    nodeCrawl = require('../node').default;

    // The readdir mock returns tomato.js (mtime=32) and
    // directory/strawberry.js (mtime=33). In this test, tomato is unchanged
    // and strawberry is changed.
    const files = createMap({
      'fruits/directory/strawberry.js': [30, 40, 1, null, 0, null],
      'fruits/tomato.js': [32, 42, 1, null, 0, null],
    });

    const {changedFiles, removedFiles} = await nodeCrawl({
      console: global.console,
      previousState: {fileSystem: getFS(files)},
      extensions: ['js'],
      ignore: pearMatcher,
      rootDir,
      roots: [p('/project/fruits')],
    });

    // Tomato is not included because its mtime is unchanged
    expect(changedFiles).toEqual(
      createMap({
        'fruits/directory/strawberry.js': [33, 42, 0, null, 0, null],
      }),
    );

    expect(removedFiles).toEqual(new Set());
  });

  test('returns removed files', async () => {
    nodeCrawl = require('../node').default;

    // In this test sample, previouslyExisted was present before and will not
    // be found when crawling this directory.
    const files = createMap({
      'fruits/previouslyExisted.js': [30, 40, 1, null, 0, null],
      'fruits/directory/strawberry.js': [33, 42, 0, null, 0, null],
      'fruits/tomato.js': [32, 42, 0, null, 0, null],
    });

    const {changedFiles, removedFiles} = await nodeCrawl({
      console: global.console,
      previousState: {fileSystem: getFS(files)},
      extensions: ['js'],
      ignore: pearMatcher,
      rootDir,
      roots: [p('/project/fruits')],
    });

    expect(changedFiles).toEqual(new Map());
    expect(removedFiles).toEqual(new Set([p('fruits/previouslyExisted.js')]));
  });

  test('completes with empty roots', async () => {
    nodeCrawl = require('../node').default;

    const {changedFiles, removedFiles} = await nodeCrawl({
      console: global.console,
      previousState: {fileSystem: emptyFS},
      extensions: ['js'],
      ignore: pearMatcher,
      rootDir,
      roots: [],
    });

    expect(changedFiles).toEqual(new Map());
    expect(removedFiles).toEqual(new Set());
  });

  test('completes with fs.readdir throwing an error', async () => {
    nodeCrawl = require('../node').default;

    const mockConsole = {
      ...global.console,
      warn: jest.fn(),
    };

    const {changedFiles, removedFiles} = await nodeCrawl({
      console: mockConsole,
      previousState: {fileSystem: emptyFS},
      extensions: ['js'],
      ignore: pearMatcher,
      rootDir,
      roots: [p('/error')],
    });

    expect(mockConsole.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `Error "ENOTDIR" reading contents of "${p('/error')}"`,
      ),
    );
    expect(changedFiles).toEqual(new Map());
    expect(removedFiles).toEqual(new Set());
  });

  test('uses the withFileTypes option with readdir', async () => {
    nodeCrawl = require('../node').default;
    const fs = require('graceful-fs');

    const {changedFiles, removedFiles} = await nodeCrawl({
      console: global.console,
      previousState: {fileSystem: emptyFS},
      extensions: ['js'],
      ignore: pearMatcher,
      rootDir,
      roots: [p('/project/fruits')],
    });

    expect(changedFiles).toEqual(
      createMap({
        'fruits/directory/strawberry.js': [33, 42, 0, null, 0, null],
        'fruits/tomato.js': [32, 42, 0, null, 0, null],
      }),
    );
    expect(removedFiles).toEqual(new Set());
    // once for /project/fruits, once for /project/fruits/directory
    expect(fs.readdir).toHaveBeenCalledTimes(2);
    // once for strawberry.js, once for tomato.js
    expect(fs.lstat).toHaveBeenCalledTimes(2);
  });

  test('aborts the crawl on pre-aborted signal', async () => {
    nodeCrawl = require('../node').default;
    const err = new Error('aborted for test');
    await expect(
      nodeCrawl({
        console: global.console,
        abortSignal: AbortSignal.abort(err),
        previousState: {fileSystem: emptyFS},
        extensions: ['js', 'json'],
        ignore: pearMatcher,
        rootDir,
        roots: [p('/project/fruits'), p('/project/vegtables')],
      }),
    ).rejects.toThrow(err);
  });

  test('aborts the crawl if signalled after start', async () => {
    const err = new Error('aborted for test');
    const abortController = new AbortController();

    // Pass a fake perf logger that will trigger the abort controller
    const fakePerfLogger = {
      point(name, opts) {
        abortController.abort(err);
      },
      annotate() {
        abortController.abort(err);
      },
      subSpan() {
        return fakePerfLogger;
      },
    };

    nodeCrawl = require('../node').default;
    await expect(
      nodeCrawl({
        console: global.console,
        perfLogger: fakePerfLogger,
        abortSignal: abortController.signal,
        previousState: {fileSystem: emptyFS},
        extensions: ['js', 'json'],
        ignore: pearMatcher,
        rootDir,
        roots: [p('/project/fruits')],
      }),
    ).rejects.toThrow(err);
  });
});
