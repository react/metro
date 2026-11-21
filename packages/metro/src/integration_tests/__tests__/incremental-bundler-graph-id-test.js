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
const path = require('node:path');

jest.setTimeout(60 * 1000);

const entryFile = path.resolve(__dirname, '../basic_bundle/TestBundle.js');
const transformOptions = {
  dev: true,
  minify: false,
  platform: 'ios',
  type: 'module',
  unstable_transformProfile: 'default',
};
const resolverOptions = {dev: true};

test('getGraphId and getRevisionFor find the graph initializeGraph built', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const bundler = new IncrementalBundler(config, {watch: false});
  try {
    const graphOptions = {onProgress: null, shallow: false, lazy: true};
    const {revision} = await bundler.initializeGraph(
      entryFile,
      transformOptions,
      resolverOptions,
      graphOptions,
    );

    expect(
      bundler.getGraphId(
        entryFile,
        transformOptions,
        resolverOptions,
        graphOptions,
      ),
    ).toBe(revision.graphId);
    expect(
      await bundler.getRevisionFor(
        entryFile,
        transformOptions,
        resolverOptions,
        graphOptions,
      ),
    ).toBe(revision);

    // Each graph option is part of the identity.
    expect(
      bundler.getRevisionFor(entryFile, transformOptions, resolverOptions, {
        shallow: false,
        lazy: false,
      }),
    ).toBeUndefined();
    expect(
      bundler.getRevisionFor(
        entryFile,
        {...transformOptions, platform: 'android'},
        resolverOptions,
        graphOptions,
      ),
    ).toBeUndefined();
  } finally {
    await bundler.end();
  }
});
