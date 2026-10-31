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

import type FileMapT from '../index';

import {WATCHERS} from '../watchers/__tests__/helpers';
import {promises as fsPromises} from 'node:fs';
import os from 'node:os';
import * as path from 'node:path';

const {mkdir, mkdtemp, realpath, rename, rm, writeFile} = fsPromises;

jest.useRealTimers();
jest.setTimeout(30 * 1000);

// End to end against the disk: roots going pending as their directories are
// deleted, and live again as they reappear, with each backend in turn.
describe.each([
  ['without Watchman', false, false],
  ['with Watchman, each root its own watch', true, false],
  ['with Watchman, within one project', true, true],
])(
  'FileMap roots on disk, %s',
  (_, useWatchman: boolean, withinProject: boolean) => {
    const maybeTest =
      !useWatchman || WATCHERS.Watchman != null ? test : test.skip;
    // Watchman goes on watching a deleted directory within a project.
    const goesPending = !(useWatchman && withinProject);

    let base: string;
    let fileMap: FileMapT;

    const statusOf = (absolutePath: string) =>
      fileMap.getRoots().find(root => root.absolutePath === absolutePath)
        ?.status;

    async function build(roots: ReadonlyArray<string>) {
      const {default: FileMap, NoopCacheManager} = require('../');
      fileMap = new FileMap({
        cacheManagerFactory: () => new NoopCacheManager(),
        extensions: ['js'],
        healthCheck: {
          enabled: false,
          filePrefix: '.metro-health-check',
          interval: 30000,
          timeout: 5000,
        },
        maxWorkers: 1,
        plugins: [],
        retainAllFiles: true,
        rootDir: path.join(base, 'project'),
        roots,
        useWatchman,
        watch: true,
      });
      return (await fileMap.build()).fileSystem;
    }

    beforeEach(async () => {
      base = await realpath(
        await mkdtemp(path.join(os.tmpdir(), 'metro-root-lifecycle-')),
      );
      if (withinProject) {
        await writeFile(path.join(base, '.watchmanconfig'), '{}');
      }
      await mkdir(path.join(base, 'project'));
      await writeFile(path.join(base, 'project', 'index.js'), '');
    });

    afterEach(async () => {
      await fileMap?.end();
      await rm(base, {force: true, recursive: true});
    });

    maybeTest(
      'a root added before its directory exists goes live when it is created',
      async () => {
        const fileSystem = await build([path.join(base, 'project')]);
        const pending = path.join(base, 'pending');
        await fileMap.addRoot(pending);
        expect(statusOf(pending)).toBe('pending');

        await mkdir(pending);
        await writeFile(path.join(pending, 'later.js'), '');
        await waitFor(() => fileSystem.exists(path.join(pending, 'later.js')));
        await waitFor(() => statusOf(pending) === 'live');

        // Then it is watched.
        await writeFile(path.join(pending, 'watched.js'), '');
        await waitFor(() =>
          fileSystem.exists(path.join(pending, 'watched.js')),
        );
      },
    );

    maybeTest(
      'a root given in `roots` loses its files when deleted, and is watched again when recreated',
      async () => {
        const ext = path.join(base, 'ext');
        await mkdir(ext);
        await writeFile(path.join(ext, 'a.js'), '');
        const fileSystem = await build([path.join(base, 'project'), ext]);
        expect(fileSystem.exists(path.join(ext, 'a.js'))).toBe(true);

        await rm(ext, {recursive: true});
        await waitFor(() => !fileSystem.exists(path.join(ext, 'a.js')));
        if (goesPending) {
          await waitFor(() => statusOf(ext) === 'pending');
        }

        await mkdir(ext);
        await writeFile(path.join(ext, 'b.js'), '');
        await waitFor(() => fileSystem.exists(path.join(ext, 'b.js')));
        await waitFor(() => statusOf(ext) === 'live');

        await writeFile(path.join(ext, 'c.js'), '');
        await waitFor(() => fileSystem.exists(path.join(ext, 'c.js')));
      },
    );

    // As npm replaces a package: a staged copy is moved into place, and the
    // old copy, moved aside, is deleted.
    maybeTest(
      'a directory moved into the place of an added root replaces its files',
      async () => {
        const fileSystem = await build([path.join(base, 'project')]);
        const pkg = path.join(base, 'pkg');
        await mkdir(pkg);
        await writeFile(path.join(pkg, 'old.js'), '');
        await fileMap.addRoot(pkg);
        expect(fileSystem.exists(path.join(pkg, 'old.js'))).toBe(true);

        await mkdir(path.join(base, 'staged'));
        await writeFile(path.join(base, 'staged', 'new.js'), '');
        await rename(pkg, path.join(base, 'retired'));
        await rename(path.join(base, 'staged'), pkg);
        await rm(path.join(base, 'retired'), {recursive: true});

        await waitFor(() => fileSystem.exists(path.join(pkg, 'new.js')));
        await waitFor(() => !fileSystem.exists(path.join(pkg, 'old.js')));
        await waitFor(() => statusOf(pkg) === 'live');
      },
    );

    maybeTest(
      'a root under a deleted ancestor loses its files, and is watched again when recreated',
      async () => {
        const fileSystem = await build([path.join(base, 'project')]);
        const app = path.join(base, 'mono', 'apps', 'app');
        await mkdir(app, {recursive: true});
        await writeFile(path.join(app, 'app.js'), '');
        await fileMap.addRoot(app);

        await rm(path.join(base, 'mono'), {recursive: true});
        await waitFor(() => !fileSystem.exists(path.join(app, 'app.js')));
        if (goesPending) {
          await waitFor(() => statusOf(app) === 'pending');
        }

        await mkdir(app, {recursive: true});
        await writeFile(path.join(app, 'again.js'), '');
        await waitFor(() => fileSystem.exists(path.join(app, 'again.js')));
        await waitFor(() => statusOf(app) === 'live');
      },
    );
  },
);

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for a condition');
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
