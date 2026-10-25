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

import type {ChangeEvent, FileSystem} from '../flow-types';

import FileMap from '../index';
import NativeWatcher from '../watchers/NativeWatcher';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A FileMap in watch mode with FallbackWatcher, against a real file system.
// Changes are made after the initial crawl and checked through the file system
// the build returned. Where NativeWatcher is supported, FileMap uses it
// instead, and it has its own integration tests.
const maybeDescribe = NativeWatcher.isSupported() ? describe.skip : describe;

jest.useRealTimers();
jest.setTimeout(30000);

let rootDir: string;
let fileMap: FileMap;
let fileSystem: FileSystem;
let removedFiles: Set<string>;

const abs = (normalPath: string) => path.join(rootDir, normalPath);

function write(normalPath: string, content: string = '') {
  fs.mkdirSync(path.dirname(abs(normalPath)), {recursive: true});
  fs.writeFileSync(abs(normalPath), content);
}

async function until(label: string, check: () => boolean): Promise<void> {
  const deadline = Date.now() + 10000;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for: ${label}`);
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

const exists = (normalPath: string) => fileSystem.exists(abs(normalPath));

maybeDescribe('FileMap with FallbackWatcher', () => {
  beforeEach(async () => {
    rootDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'metro-file-map-watch-')),
    );
    write('src/deep/a/b/c/one.js');
    write('src/two.js');
    write('pkg/real/index.js');
    write('ignored-dir/x.js');
    for (let i = 0; i < 20; i++) {
      write(`many/d${i}/f.js`);
    }
    fs.mkdirSync(abs('node_modules'));
    fs.symlinkSync(
      path.join('..', 'pkg', 'real'),
      abs('node_modules/linked'),
      'junction',
    );

    removedFiles = new Set();
    fileMap = new FileMap({
      cacheManagerFactory: () => ({
        read: async () => null,
        write: async () => {},
        end: async () => {},
      }),
      enableSymlinks: true,
      extensions: ['js'],
      healthCheck: {
        enabled: false,
        interval: 10000,
        timeout: 1000,
        filePrefix: '.metro-file-map-health-check',
      },
      ignorePattern: /ignored-dir/,
      maxWorkers: 1,
      retainAllFiles: true,
      rootDir,
      roots: [rootDir],
      useWatchman: false,
      watch: true,
    });
    ({fileSystem} = await fileMap.build());
    fileMap.on('change', ({changes}: ChangeEvent) => {
      for (const [canonicalPath] of changes.removedFiles) {
        removedFiles.add(canonicalPath);
      }
    });
  });

  afterEach(async () => {
    await fileMap.end();
    fs.rmSync(rootDir, {recursive: true, force: true});
  });

  test('reports a new file in a directory that existed at startup', async () => {
    write('src/deep/a/b/c/new.js');
    await until('new.js added', () => exists('src/deep/a/b/c/new.js'));
  });

  test('watches every directory that existed at startup', async () => {
    for (let i = 0; i < 20; i++) {
      write(`many/d${i}/g.js`);
    }
    await until('all added', () =>
      Array.from({length: 20}, (_, i) => exists(`many/d${i}/g.js`)).every(
        Boolean,
      ),
    );
  });

  test('removes the files under a deleted directory', async () => {
    fs.rmSync(abs('src/deep'), {recursive: true});
    await until('one.js removed', () => !exists('src/deep/a/b/c/one.js'));
    expect(removedFiles).toContain(
      path.join('src', 'deep', 'a', 'b', 'c', 'one.js'),
    );
    expect(exists('src/two.js')).toBe(true);
  });

  test('removes the files under a directory moved out of the root', async () => {
    const outside = fs.mkdtempSync(
      path.join(os.tmpdir(), 'metro-file-map-out-'),
    );
    try {
      fs.renameSync(abs('many/d7'), path.join(outside, 'd7'));
      await until('f.js removed', () => !exists('many/d7/f.js'));
      expect(exists('many/d8/f.js')).toBe(true);
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }
  });

  test('reports files in a new directory, and files added to it later', async () => {
    write('fresh/sub/new.js');
    await until('new.js added', () => exists('fresh/sub/new.js'));
    write('fresh/sub/later.js');
    await until('later.js added', () => exists('fresh/sub/later.js'));
  });

  test('removes a deleted symlink', async () => {
    expect(fileSystem.linkStats(abs('node_modules/linked'))).toMatchObject({
      fileType: 'l',
    });
    // A junction on Windows, which is removed as a directory
    (process.platform === 'win32' ? fs.rmdirSync : fs.unlinkSync)(
      abs('node_modules/linked'),
    );
    await until(
      'link removed',
      () => fileSystem.linkStats(abs('node_modules/linked')) == null,
    );
  });

  test('ignores changes in an ignored directory', async () => {
    write('ignored-dir/y.js');
    write('src/marker.js');
    await until('marker.js added', () => exists('src/marker.js'));
    expect(exists('ignored-dir/y.js')).toBe(false);
  });
});
