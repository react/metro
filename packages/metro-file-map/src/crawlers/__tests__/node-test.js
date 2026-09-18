/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import TreeFS from '../../lib/TreeFS';

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

      if (slash(dir) === '/project/fruits') {
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
      } else if (slash(dir) === '/project/fruits/directory') {
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
      } else if (slash(dir) == '/error') {
        setTimeout(() => callback({code: 'ENOTDIR'}, undefined), 0);
      }
    }),
    stat: jest.fn(stat),
  };
});

const pearMatcher = path => /pear/.test(path);
const normalize = path =>
  process.platform === 'win32' ? path.replace(/\//g, '\\') : path;
const createMap = obj =>
  new Map(Object.keys(obj).map(key => [normalize(key), obj[key]]));

const rootDir = '/project';
const emptyFS = new TreeFS({rootDir, files: new Map()});
const getFS = (files: FileData) => new TreeFS({rootDir, files});
let nodeCrawl;

describe('node crawler', () => {
  beforeEach(() => {
    jest.resetModules();
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
      roots: ['/project/fruits'],
    });

    // Tomato is not included because its mtime is unchanged
    expect(changedFiles).toEqual(
      createMap({
        'fruits/directory/strawberry.js': [33, 42, 0, null, 0],
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
      'fruits/directory/strawberry.js': [33, 42, 0, null, 0],
      'fruits/tomato.js': [32, 42, 0, null, 0],
    });

    const {changedFiles, removedFiles} = await nodeCrawl({
      console: global.console,
      previousState: {fileSystem: getFS(files)},
      extensions: ['js'],
      ignore: pearMatcher,
      rootDir,
      roots: ['/project/fruits'],
    });

    expect(changedFiles).toEqual(new Map());
    expect(removedFiles).toEqual(new Set(['fruits/previouslyExisted.js']));
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
      roots: ['/error'],
    });

    expect(mockConsole.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error "ENOTDIR" reading contents of "/error"'),
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
      roots: ['/project/fruits'],
    });

    expect(changedFiles).toEqual(
      createMap({
        'fruits/directory/strawberry.js': [33, 42, 0, null, 0],
        'fruits/tomato.js': [32, 42, 0, null, 0],
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
        roots: ['/project/fruits', '/project/vegtables'],
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
        roots: ['/project/fruits'],
      }),
    ).rejects.toThrow(err);
  });
});
