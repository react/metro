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

import * as Resolver from '../index';
import {createResolutionContext} from './utils';
import path from 'node:path';

describe('asset resolutions', () => {
  const baseContext = {
    ...createResolutionContext({
      '/root/project/index.js': '',
      '/root/project/src/data.json': '',
      '/root/project/assets/example.asset.json': '',
      '/root/project/assets/icon.png': '',
      '/root/project/assets/icon@2x.png': '',
    }),
    originModulePath: '/root/project/index.js',
  };
  const assetResolutions = ['1', '2'];
  const resolveAsset = (
    dirPath: string,
    assetName: string,
    extension: string,
  ) => {
    const basePath = dirPath + path.sep + assetName;
    let assets = [
      basePath + extension,
      ...assetResolutions.map(
        resolution => basePath + '@' + resolution + 'x' + extension,
      ),
    ];

    assets = assets.filter(candidate => baseContext.doesFileExist(candidate));

    return assets.length ? assets : null;
  };

  test('should resolve a path as an asset when matched against `assetExts`', () => {
    const context = {
      ...baseContext,
      assetExts: new Set(['png']),
      resolveAsset,
    };

    expect(Resolver.resolve(context, './assets/icon.png', null)).toEqual({
      type: 'assetFiles',
      filePaths: [
        '/root/project/assets/icon.png',
        '/root/project/assets/icon@2x.png',
      ],
    });
  });

  test('should resolve a path as an asset when matched against `assetExts` (overlap with `sourceExts`)', () => {
    const context = {
      ...baseContext,
      assetExts: new Set(['asset.json']),
      resolveAsset,
      sourceExts: ['js', 'json'],
    };

    // Source file matching `sourceExts`
    expect(Resolver.resolve(context, './src/data.json', null)).toEqual({
      type: 'sourceFile',
      filePath: '/root/project/src/data.json',
    });

    // Asset file matching more specific asset ext
    expect(
      Resolver.resolve(context, './assets/example.asset.json', null),
    ).toEqual({
      type: 'assetFiles',
      filePaths: ['/root/project/assets/example.asset.json'],
    });
  });
});
