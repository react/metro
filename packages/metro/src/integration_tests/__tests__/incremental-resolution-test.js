/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

import type {GraphRevision} from '../../IncrementalBundler';

import IncrementalBundler from '../../IncrementalBundler';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const Metro = require('../../..');
const {mergeConfig} = require('metro-config');

jest.useRealTimers();
jest.setTimeout(60 * 1000);

const transformOptions = {
  dev: true,
  minify: false,
  platform: 'ios',
  type: 'module',
  unstable_transformProfile: 'default',
} as const;

describe.each([[true], [false]])(
  'watch mode with unstable_incrementalResolution: %s',
  incrementalResolution => {
    let projectRoot: string;
    let bundler: IncrementalBundler;
    let revision: GraphRevision;

    const write = (relativePath: string, content: string) => {
      const filePath = path.join(projectRoot, relativePath);
      fs.mkdirSync(path.dirname(filePath), {recursive: true});
      fs.writeFileSync(filePath, content);
    };

    async function build(
      files: {[relativePath: string]: string},
      entry: string,
      resolverConfig: {unstable_enablePackageExports?: boolean} = {},
    ) {
      for (const [relativePath, content] of Object.entries(files)) {
        write(relativePath, content);
      }
      const baseConfig = await Metro.loadConfig({
        config: require.resolve('../metro.config.js'),
      });
      const config = mergeConfig(baseConfig, {
        projectRoot,
        watchFolders: [projectRoot],
        resolver: {
          ...resolverConfig,
          unstable_incrementalResolution: incrementalResolution,
        },
        serializer: {getPolyfills: (): ReadonlyArray<string> => []},
      });
      bundler = new IncrementalBundler(config, {watch: true});
      ({revision} = await bundler.initializeGraph(
        path.join(projectRoot, entry),
        transformOptions,
        {dev: true},
      ));
    }

    // Applies a change and returns the graph's next delta.
    async function change(apply: () => void) {
      const changed = new Promise(resolve =>
        bundler.getBundler().getWatcher().once('change', resolve),
      );
      apply();
      await changed;
      const result = await bundler.updateGraph(revision, false);
      revision = result.revision;
      return result.delta;
    }

    const modulePaths = (modules: Iterable<string>) =>
      [...modules].map(p => path.relative(projectRoot, p)).sort();

    beforeEach(() => {
      projectRoot = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'metro-incremental-')),
      );
    });

    afterEach(async () => {
      await bundler?.end();
      fs.rmSync(projectRoot, {recursive: true, force: true});
    });

    test('a new platform-specific file replaces the one resolved', async () => {
      await build(
        {
          'index.js': "module.exports = require('./foo');",
          'foo.js': "module.exports = 'foo';",
        },
        'index.js',
      );

      const delta = await change(() =>
        write('foo.ios.js', "module.exports = 'foo.ios';"),
      );

      if (incrementalResolution) {
        expect(modulePaths(delta.added.keys())).toEqual(['foo.ios.js']);
        expect(modulePaths(delta.deleted)).toEqual(['foo.js']);
        expect(modulePaths(delta.modified.keys())).toEqual(['index.js']);
      } else {
        // The resolution is stale until something else revisits `index.js`
        expect(delta.added.size + delta.deleted.size).toBe(0);
      }
    });

    test('a missing optional dependency appears', async () => {
      await build(
        {
          'index.js': "try { require('./optional'); } catch {}",
        },
        'index.js',
      );

      const delta = await change(() =>
        write('optional.js', "module.exports = 'optional';"),
      );

      expect(modulePaths(delta.added.keys())).toEqual(
        incrementalResolution ? ['optional.js'] : [],
      );
    });

    test('a nearer package is installed', async () => {
      await build(
        {
          'app/index.js': "module.exports = require('pkg');",
          'node_modules/pkg/index.js': "module.exports = 'hoisted';",
        },
        'app/index.js',
      );

      const delta = await change(() =>
        write('app/node_modules/pkg/index.js', "module.exports = 'nested';"),
      );

      if (incrementalResolution) {
        expect(modulePaths(delta.added.keys())).toEqual([
          path.join('app', 'node_modules', 'pkg', 'index.js'),
        ]);
        expect(modulePaths(delta.deleted)).toEqual([
          path.join('node_modules', 'pkg', 'index.js'),
        ]);
      } else {
        expect(delta.added.size + delta.deleted.size).toBe(0);
      }
    });

    test("a package's manifest changes its main", async () => {
      await build(
        {
          'index.js': "module.exports = require('pkg');",
          'node_modules/pkg/package.json': JSON.stringify({main: 'a.js'}),
          'node_modules/pkg/a.js': "module.exports = 'a';",
          'node_modules/pkg/b.js': "module.exports = 'b';",
        },
        'index.js',
        // With "exports" enabled, any manifest change resets the graph
        {unstable_enablePackageExports: false},
      );

      const delta = await change(() =>
        write('node_modules/pkg/package.json', JSON.stringify({main: 'b.js'})),
      );

      if (incrementalResolution) {
        expect(modulePaths(delta.added.keys())).toEqual([
          path.join('node_modules', 'pkg', 'b.js'),
        ]);
      } else {
        expect(delta.added.size).toBe(0);
      }
    });
  },
);
