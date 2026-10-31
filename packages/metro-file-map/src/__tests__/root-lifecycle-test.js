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

const {mkdir, mkdtemp, realpath, rm, writeFile} = fsPromises;

jest.useRealTimers();
jest.setTimeout(30 * 1000);

// End to end against the disk, with each backend in turn.
describe.each([
  ['without Watchman', false, false],
  ['with Watchman, each root its own watch', true, false],
  ['with Watchman, within one project', true, true],
])(
  'FileMap roots on disk, %s',
  (_, useWatchman: boolean, withinProject: boolean) => {
    const maybeTest =
      !useWatchman || WATCHERS.Watchman != null ? test : test.skip;

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
