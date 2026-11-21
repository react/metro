/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

const Metro = require('../../..');
const IncrementalBundler = require('../../IncrementalBundler').default;
const MetroConfig = require('metro-config');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

jest.setTimeout(60 * 1000);

const INPUT_PATH = path.resolve(__dirname, '../basic_bundle');

const transformOptions = {
  dev: true,
  minify: false,
  platform: 'ios',
  type: 'module',
  unstable_transformProfile: 'default',
};
const resolverOptions = {dev: true};

// Returns a new copy on each read, as a deserializing store does.
class CopyingMemoryStore {
  reads = 0;
  writes = 0;
  #map = new Map();
  get(key) {
    const value = this.#map.get(key.toString('hex'));
    if (value != null) {
      this.reads++;
    }
    return value == null ? null : structuredClone(value);
  }
  set(key, value) {
    this.writes++;
    this.#map.set(key.toString('hex'), structuredClone(value));
  }
}

async function createBundler({
  unstable_shareTransformResults = true,
  resolver = {},
  transformer = {},
  transformerPath,
}) {
  const store = new CopyingMemoryStore();
  const baseConfig = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const config = MetroConfig.mergeConfig(baseConfig, {
    cacheStores: [store],
    resolver,
    transformer: {unstable_shareTransformResults, ...transformer},
    ...(transformerPath != null ? {transformerPath} : null),
  });
  return {bundler: new IncrementalBundler(config, {watch: false}), store};
}

async function buildGraphs(bundler) {
  const [{revision: test}, {revision: bar}] = await Promise.all(
    ['TestBundle.js', 'Bar.js'].map(entry =>
      bundler.initializeGraph(
        path.join(INPUT_PATH, entry),
        transformOptions,
        resolverOptions,
      ),
    ),
  );
  return {test, bar};
}

const barPath = path.join(INPUT_PATH, 'Bar.js');
const fooPath = path.join(INPUT_PATH, 'Foo.js');

test.each([
  [true, true],
  [false, false],
])(
  'with transformer.unstable_shareTransformResults: %s, graphs share module outputs: %s',
  async (unstable_shareTransformResults, expectShared) => {
    const {bundler} = await createBundler({unstable_shareTransformResults});
    try {
      const {test, bar} = await buildGraphs(bundler);
      for (const modulePath of [barPath, fooPath]) {
        const inTest = test.graph.dependencies.get(modulePath);
        const inBar = bar.graph.dependencies.get(modulePath);
        expect(inBar?.output === inTest?.output).toBe(expectShared);
        expect(inBar?.output).toEqual(inTest?.output);
      }
    } finally {
      await bundler.end();
    }
  },
);

test('drops shared results once every graph holding them has ended', async () => {
  const {bundler, store} = await createBundler({});
  try {
    const {test, bar} = await buildGraphs(bundler);
    // Builds a graph of Foo.js, which `bar` holds, and counts cache reads.
    const readsToBuildFoo = async () => {
      const readsBefore = store.reads;
      const {revision} = await bundler.initializeGraph(
        fooPath,
        transformOptions,
        resolverOptions,
      );
      const reads = store.reads - readsBefore;
      await bundler.endGraph(revision.graphId);
      return reads;
    };

    // Ending one graph keeps what another still holds.
    await bundler.endGraph(test.graphId);
    expect(await readsToBuildFoo()).toBe(0);

    // Ending the last graph that holds it drops it, so it's read again.
    await bundler.endGraph(bar.graphId);
    expect(await readsToBuildFoo()).toBeGreaterThan(0);
  } finally {
    await bundler.end();
  }
});

test('drops shared results of virtual modules once every graph holding them has ended', async () => {
  // Answers one specifier with a virtual module at the importer's own path,
  // and one with a virtual module at a path no file has.
  const resolveRequest = (context, moduleName, platform) => {
    switch (moduleName) {
      case 'test:bump':
        return {
          type: 'virtualModule',
          virtualPath: context.originModulePath,
          source: `import {increment} from './subdir/counter';
export default n => increment() + n;`,
        };
      case 'test:typed':
        return {
          type: 'virtualModule',
          virtualPath: path.join(
            path.dirname(context.originModulePath),
            'typed.ts',
          ),
          source: 'export default (n: number): number => n * 2;',
        };
      default:
        return context.resolveRequest(context, moduleName, platform);
    }
  };
  const {bundler, store} = await createBundler({
    resolver: {resolveRequest, unstable_allowVirtualModules: true},
  });
  try {
    const build = () =>
      bundler.initializeGraph(
        path.join(INPUT_PATH, 'virtual-module/index.js'),
        transformOptions,
        resolverOptions,
      );
    const {revision: first} = await build();
    expect(
      Array.from(first.graph.dependencies.keys()).filter(modulePath =>
        modulePath.startsWith('virtual:'),
      ),
    ).toHaveLength(3);
    await bundler.endGraph(first.graphId);

    // No graph holds any of its modules, so every one is read again.
    const readsBefore = store.reads;
    const {revision: second} = await build();
    expect(store.reads - readsBefore).toBe(second.graph.dependencies.size);
    await bundler.endGraph(second.graphId);
  } finally {
    await bundler.end();
  }
});

test('re-transforms a result with an external input in every graph when the input changes', async () => {
  const inputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metro-external-'));
  const inputPath = path.join(inputDir, 'input.txt');
  fs.writeFileSync(inputPath, 'one');
  const {bundler, store} = await createBundler({
    transformer: {unstable_testExternalInputPath: inputPath},
    transformerPath: require.resolve('../externalInputTransformer'),
  });
  try {
    const {test, bar} = await buildGraphs(bundler);
    const barCode = revision =>
      revision.graph.dependencies.get(barPath)?.output[0].data.code;
    expect(barCode(test)).toMatch('/* external: one */');
    expect(barCode(bar)).toMatch('/* external: one */');
    // Each graph transformed Bar.js itself, and neither stored the result.
    expect(test.graph.dependencies.get(barPath)?.output).not.toBe(
      bar.graph.dependencies.get(barPath)?.output,
    );
    const writesBefore = store.writes;

    fs.writeFileSync(inputPath, 'two');
    bundler
      .getBundler()
      .getWatcher()
      .emit('change', {
        changes: {
          addedFiles: [],
          modifiedFiles: [
            ['input.txt', {modifiedTime: Date.now(), isSymlink: false}],
          ],
          removedFiles: [],
          addedDirectories: [],
          removedDirectories: [],
        },
        rootDir: inputDir,
        logger: null,
      });

    for (const revision of [test, bar]) {
      const {revision: next, delta} = await bundler.updateGraph(
        revision,
        false,
      );
      expect([...delta.modified.keys()]).toEqual([barPath]);
      expect(barCode(next)).toMatch('/* external: two */');
    }
    expect(store.writes).toBe(writesBefore);
  } finally {
    await bundler.end();
    fs.rmSync(inputDir, {recursive: true, force: true});
  }
});
