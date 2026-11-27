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
import type {ChangeEvent} from 'metro-file-map';

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

describe('watch mode with unstable_incrementalResolution', () => {
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
    resolverConfig: Readonly<{unstable_enablePackageExports?: boolean}> = {},
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
      resolver: {...resolverConfig, unstable_incrementalResolution: true},
      serializer: {getPolyfills: (): ReadonlyArray<string> => []},
    });
    bundler = new IncrementalBundler(config, {watch: true});
    ({revision} = await bundler.initializeGraph(
      path.join(projectRoot, entry),
      transformOptions,
      {dev: true},
    ));
  }

  // Writes a file, waits for the file map to report it, and returns the
  // graph's next delta.
  async function change(relativePath: string, content: string) {
    const watcher = bundler.getBundler().getWatcher();
    const canonicalPath = path.normalize(relativePath);
    const changed = new Promise<void>(resolve => {
      const onChange = ({changes}: ChangeEvent) => {
        for (const [changedPath] of [
          ...changes.addedFiles,
          ...changes.modifiedFiles,
        ]) {
          if (changedPath === canonicalPath) {
            watcher.removeListener('change', onChange);
            resolve();
          }
        }
      };
      watcher.on('change', onChange);
    });
    write(relativePath, content);
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

    const delta = await change('foo.ios.js', "module.exports = 'foo.ios';");

    expect(modulePaths(delta.added.keys())).toEqual(['foo.ios.js']);
    expect(modulePaths(delta.deleted)).toEqual(['foo.js']);
    expect(modulePaths(delta.modified.keys())).toEqual(['index.js']);
  });

  test('a missing optional dependency appears', async () => {
    await build(
      {'index.js': "try { require('./optional'); } catch {}"},
      'index.js',
    );

    const delta = await change('optional.js', "module.exports = 'optional';");

    expect(modulePaths(delta.added.keys())).toEqual(['optional.js']);
  });

  test('a nearer package is installed', async () => {
    await build(
      {
        'app/index.js': "module.exports = require('pkg');",
        'node_modules/pkg/index.js': "module.exports = 'hoisted';",
      },
      'app/index.js',
    );

    const delta = await change(
      'app/node_modules/pkg/index.js',
      "module.exports = 'nested';",
    );

    expect(modulePaths(delta.added.keys())).toEqual([
      path.join('app', 'node_modules', 'pkg', 'index.js'),
    ]);
    expect(modulePaths(delta.deleted)).toEqual([
      path.join('node_modules', 'pkg', 'index.js'),
    ]);
  });

  // With "exports" enabled, any manifest change resets the graph
  describe('with package exports off', () => {
    const resolverConfig = {unstable_enablePackageExports: false};

    test("a package's manifest changes its main", async () => {
      await build(
        {
          'index.js': "module.exports = require('pkg');",
          'node_modules/pkg/package.json': JSON.stringify({main: 'a.js'}),
          'node_modules/pkg/a.js': "module.exports = 'a';",
          'node_modules/pkg/b.js': "module.exports = 'b';",
        },
        'index.js',
        resolverConfig,
      );

      const delta = await change(
        'node_modules/pkg/package.json',
        JSON.stringify({main: 'b.js'}),
      );

      expect(modulePaths(delta.added.keys())).toEqual([
        path.join('node_modules', 'pkg', 'b.js'),
      ]);
    });

    test("a symlinked package's manifest changes its main", async () => {
      write('index.js', "module.exports = require('pkg');");
      write('packages/pkg/package.json', JSON.stringify({main: 'a.js'}));
      write('packages/pkg/a.js', "module.exports = 'a';");
      write('packages/pkg/b.js', "module.exports = 'b';");
      fs.mkdirSync(path.join(projectRoot, 'node_modules'));
      fs.symlinkSync(
        path.join('..', 'packages', 'pkg'),
        path.join(projectRoot, 'node_modules', 'pkg'),
        'junction',
      );
      await build({}, 'index.js', resolverConfig);

      const delta = await change(
        'packages/pkg/package.json',
        JSON.stringify({main: 'b.js'}),
      );

      expect(modulePaths(delta.added.keys())).toEqual([
        path.join('packages', 'pkg', 'b.js'),
      ]);
    });

    test("a manifest change fixes an optional dependency's main", async () => {
      await build(
        {
          'index.js': "try { require('pkg'); } catch {}",
          'node_modules/pkg/package.json': JSON.stringify({main: 'missing.js'}),
          'node_modules/pkg/a.js': "module.exports = 'a';",
        },
        'index.js',
        resolverConfig,
      );

      const delta = await change(
        'node_modules/pkg/package.json',
        JSON.stringify({main: 'a.js'}),
      );

      expect(modulePaths(delta.added.keys())).toEqual([
        path.join('node_modules', 'pkg', 'a.js'),
      ]);
    });
  });
});
