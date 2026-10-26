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

import type {FileSystem} from '../flow-types';

import FileMap, {DiskCacheManager} from '../index';
import FileDataPlugin from '../plugins/FileDataPlugin';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The node crawler stats a regular file only once data is derived from its
// content, and treats one that was never stat'd as unchanged. These tests
// change files while no FileMap is running, as between two starts of Metro,
// against a real file system and cache.

jest.useRealTimers();

type LengthPlugin = FileDataPlugin<?{length: number}>;

let rootDir: string;
let cacheDirectory: string;

beforeEach(() => {
  rootDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'metro-file-map-root-')),
  );
  cacheDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'metro-file-map-cache-'),
  );
});

afterEach(() => {
  fs.rmSync(rootDir, {recursive: true, force: true});
  fs.rmSync(cacheDirectory, {recursive: true, force: true});
});

const abs = (normalPath: string) => path.join(rootDir, normalPath);

function write(normalPath: string, content: string) {
  fs.mkdirSync(path.dirname(abs(normalPath)), {recursive: true});
  fs.writeFileSync(abs(normalPath), content);
}

// Timestamps can be coarser than a test runs (about 15ms on Windows), so move
// the modified time on, as an edit some time after the last start would.
let offlineEdits = 0;
function editOffline(normalPath: string, content: string) {
  write(normalPath, content);
  const seconds = Date.now() / 1000 + 60 + ++offlineEdits;
  fs.utimesSync(abs(normalPath), seconds, seconds);
}

const sha1 = (content: string) =>
  createHash('sha1').update(content).digest('hex');

function createLengthPlugin(name: string, lazy: boolean): LengthPlugin {
  return new FileDataPlugin({
    name,
    cacheKey: name,
    worker: {
      modulePath: require.resolve('./lazy_plugin_worker.js'),
      setupArgs: {},
    },
    filter: ({normalPath}) => normalPath.endsWith('.eager.js'),
    lazy,
  });
}

async function session(
  fn: (
    fileSystem: FileSystem,
    plugins: {eager: LengthPlugin, lazy: LengthPlugin},
  ) => Promise<void> | void,
): Promise<void> {
  const eager = createLengthPlugin('eager', false);
  const lazy = createLengthPlugin('lazy', true);
  const fileMap = new FileMap({
    cacheManagerFactory: ({buildParameters}) =>
      new DiskCacheManager({buildParameters}, {cacheDirectory}),
    enableSymlinks: true,
    extensions: ['js'],
    healthCheck: {
      enabled: false,
      interval: 10000,
      timeout: 1000,
      filePrefix: '.metro-file-map-health-check',
    },
    maxWorkers: 1,
    plugins: [eager, lazy],
    retainAllFiles: true,
    rootDir,
    roots: [rootDir],
    useWatchman: false,
    watch: false,
  });
  try {
    const {fileSystem} = await fileMap.build();
    await fn(fileSystem, {eager, lazy});
  } finally {
    await fileMap.end();
  }
}

test('a SHA-1 is recomputed after an edit', async () => {
  write('a.js', 'before');
  await session(async fileSystem => {
    expect(await fileSystem.getOrComputeSha1(abs('a.js'))).toMatchObject({
      sha1: sha1('before'),
    });
  });

  editOffline('a.js', 'after');

  await session(async fileSystem => {
    expect(await fileSystem.getOrComputeSha1(abs('a.js'))).toMatchObject({
      sha1: sha1('after'),
    });
  });
});

test("an eager plugin's data is recomputed after an edit", async () => {
  write('b.eager.js', 'before');
  await session((_, {eager}) => {
    expect(eager.getOrComputeFileData(abs('b.eager.js'))).toMatchObject({
      data: {length: 6},
    });
  });

  editOffline('b.eager.js', 'and after');

  await session((_, {eager}) => {
    expect(eager.getOrComputeFileData(abs('b.eager.js'))).toMatchObject({
      data: {length: 9},
    });
  });
});

test("a lazy plugin's data is recomputed after an edit", async () => {
  write('c.js', 'before');
  await session((_, {lazy}) => {
    expect(lazy.getOrComputeFileData(abs('c.js'))).toMatchObject({
      data: {length: 6},
    });
  });

  editOffline('c.js', 'and after');

  await session((_, {lazy}) => {
    expect(lazy.getOrComputeFileData(abs('c.js'))).toMatchObject({
      data: {length: 9},
    });
  });
});

test('an edit to a file not yet read is seen when it is first read', async () => {
  write('d.js', 'before');
  await session(() => {});

  editOffline('d.js', 'and after');

  await session(async (fileSystem, {lazy}) => {
    expect(lazy.getOrComputeFileData(abs('d.js'))).toMatchObject({
      data: {length: 9},
    });
    expect(await fileSystem.getOrComputeSha1(abs('d.js'))).toMatchObject({
      sha1: sha1('and after'),
    });
  });
});

test('a retargeted symlink is followed to its new target', async () => {
  write('pkgs/a@1/index.js', 'one');
  write('pkgs/a@2/index.js', 'two');
  fs.mkdirSync(abs('node_modules'));
  const link = abs('node_modules/a');
  fs.symlinkSync(path.join('..', 'pkgs', 'a@1'), link, 'dir');

  await session(async fileSystem => {
    expect(fileSystem.lookup(abs('node_modules/a/index.js'))).toMatchObject({
      exists: true,
      realPath: abs('pkgs/a@1/index.js'),
    });
    await fileSystem.getOrComputeSha1(abs('node_modules/a/index.js'));
  });

  // As a package manager upgrading `a`
  fs.unlinkSync(link);
  fs.symlinkSync(path.join('..', 'pkgs', 'a@2'), link, 'dir');
  const seconds = Date.now() / 1000 + 60;
  // $FlowFixMe[prop-missing] - lutimesSync is missing from flow-typed's node defs
  fs.lutimesSync(link, seconds, seconds);
  fs.rmSync(abs('pkgs/a@1'), {recursive: true});

  await session(fileSystem => {
    expect(fileSystem.lookup(abs('node_modules/a/index.js'))).toMatchObject({
      exists: true,
      realPath: abs('pkgs/a@2/index.js'),
    });
  });
});

test('a start stats only the files with data derived from them', async () => {
  for (let i = 0; i < 10; i++) {
    write(`f${i}.js`, String(i));
  }
  await session(async fileSystem => {
    await fileSystem.getOrComputeSha1(abs('f0.js'));
  });

  const lstat = jest.spyOn(fs, 'lstat');
  try {
    await session(fileSystem => {
      // Without a stat, a file's size isn't known
      expect(fileSystem.linkStats(abs('f1.js'))).toEqual({
        fileType: 'f',
        modifiedTime: null,
        size: null,
      });
    });
    expect(lstat.mock.calls.map(([filePath]) => filePath)).toEqual([
      abs('f0.js'),
    ]);
  } finally {
    lstat.mockRestore();
  }
});
