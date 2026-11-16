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
  #map = new Map();
  get(key) {
    const value = this.#map.get(key.toString('hex'));
    if (value != null) {
      this.reads++;
    }
    return value == null ? null : structuredClone(value);
  }
  set(key, value) {
    this.#map.set(key.toString('hex'), structuredClone(value));
  }
}

async function createBundler(unstable_shareTransformResults) {
  const store = new CopyingMemoryStore();
  const baseConfig = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const config = MetroConfig.mergeConfig(baseConfig, {
    cacheStores: [store],
    transformer: {unstable_shareTransformResults},
  });
  return {bundler: new IncrementalBundler(config), store};
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
    const {bundler} = await createBundler(unstable_shareTransformResults);
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
  const {bundler, store} = await createBundler(true);
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
