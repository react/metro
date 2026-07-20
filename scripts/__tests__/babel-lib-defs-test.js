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

import generateBabelFlowLibraryDefinitions from '../support/generateBabelFlowLibraryDefinitions';
import {promises as fsPromises} from 'node:fs';

test('Babel Flow library definitions should be up to date', async () => {
  // Run `yarn update-babel-flow-lib-defs` in the Metro monorepo if this test fails.
  const contentByFilePath = await generateBabelFlowLibraryDefinitions();
  expect(contentByFilePath).toBeInstanceOf(Map);
  expect(contentByFilePath.size).toBe(2);
  for (const [filePath, content] of contentByFilePath) {
    expect(await fsPromises.readFile(filePath, 'utf8')).toEqual(content);
  }
});
