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
const execBundle = require('../execBundle');

jest.setTimeout(30 * 1000);

test('builds a simple bundle', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });

  const result = await Metro.runBuild(config, {
    entry: 'import-export/index.js',
  });

  const object = execBundle(result.code);
  const cjs = await object.asyncImportCJS;

  expect(object.extraData.namespaceReExportDefault).toBe('export-2: DEFAULT');
  expect(object.extraData.namespaceReExportFoo).toBe('export-2: FOO');
  expect(object).toMatchSnapshot();
  expect(cjs).toEqual(expect.objectContaining(cjs.default));

  await expect(object.asyncImportCJS).resolves.toMatchSnapshot();
  await expect(object.asyncImportESM).resolves.toMatchSnapshot();
});
