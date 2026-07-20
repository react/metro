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

import CountingSet from '../../lib/CountingSet';

const Metro = require('../../..');
const path = require('node:path');

jest.useRealTimers();
jest.setTimeout(120 * 1000);

test('should build the dependency graph', async () => {
  const entryPoint = path.resolve(
    __dirname,
    '..',
    'basic_bundle',
    'TestBundle.js',
  );

  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });

  const graph = await Metro.buildGraph(config, {
    entries: [entryPoint],
  });

  expect(
    Array.from(graph.dependencies.entries()).map(([filePath, dep]) => ({
      file: path.basename(filePath),
      types: dep.output.map(output => output.type),
    })),
  ).toEqual([
    {file: 'TestBundle.js', types: ['js/module']},
    {file: 'Bar.js', types: ['js/module']},
    {file: 'Foo.js', types: ['js/module']},
    {file: 'test.png', types: ['js/module/asset']},
    {file: 'AssetRegistry.js', types: ['js/module']},
    {file: 'TypeScript.ts', types: ['js/module']},
  ]);

  expect(graph.dependencies.get(entryPoint)).toEqual(
    expect.objectContaining({
      path: entryPoint,
      inverseDependencies: new CountingSet(),
      output: [
        expect.objectContaining({
          type: 'js/module',
        }),
      ],
    }),
  );

  expect(graph.dependencies.get(entryPoint).output).toMatchSnapshot();
});
