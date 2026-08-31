/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

jest.mock('../../../Assets');

import {getAssetData, getAssetUrlPath} from '../../../Assets';
import getAssets from '../getAssets';
import path from 'node:path';

beforeEach(() => {
  getAssetData.mockImplementation(async (path, localPath) => ({
    path,
    localPath,
  }));
  getAssetUrlPath.mockImplementation(
    jest.requireActual('../../../Assets').getAssetUrlPath,
  );
});

test('should return the bundle assets', async () => {
  const dependencies = new Map([
    [
      '/tmp/1.js',
      {
        path: '/tmp/1.js',
        output: [
          {
            type: 'js/module',
            data: {code: '//', lineCount: 1, map: [], functionMap: null},
          },
        ],
      },
    ],
    [
      '/tmp/2.js',
      {
        path: '/tmp/2.js',
        output: [
          {
            type: 'js/module',
            data: {code: '//', lineCount: 1, map: [], functionMap: null},
          },
        ],
      },
    ],
    [
      '/tmp/3.png',
      {
        path: '/tmp/3.png',
        output: [
          {
            type: 'js/module/asset',
            data: {code: '//', lineCount: 1, map: [], functionMap: null},
          },
        ],
      },
    ],
    [
      '/tmp/4.js',
      {
        path: '/tmp/2.js',
        output: [
          {
            type: 'js/module',
            data: {code: '//', lineCount: 1, map: [], functionMap: null},
          },
        ],
      },
    ],
    [
      '/tmp/5.mov',
      {
        path: '/tmp/5.mov',
        output: [
          {
            type: 'js/module/asset',
            data: {code: '//', lineCount: 1, map: [], functionMap: null},
          },
        ],
      },
    ],
    [
      '/external/6.png',
      {
        path: '/external/6.png',
        output: [
          {
            type: 'js/module/asset',
            data: {code: '//', lineCount: 1, map: [], functionMap: null},
          },
        ],
      },
    ],
  ]);

  expect(
    await getAssets(dependencies, {
      projectRoot: '/tmp',
      watchFolders: ['/tmp', '/external'],
      processModuleFilter: () => true,
    }),
  ).toEqual([
    {path: '/tmp/3.png', localPath: '3.png'},
    {path: '/tmp/5.mov', localPath: '5.mov'},
    {
      path: '/external/6.png',
      localPath: path.join('[metro-watchFolders]', '1', '6.png'),
    },
  ]);
});
