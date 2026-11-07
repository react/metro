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

const {generateAssetCodeFileAst} = require('../util');
const babelGenerate = require('@babel/generator').default;

describe('Util', () => {
  const assetDescriptor = {
    __packager_asset: true,
    fileSystemLocation: '/foo/bar',
    hash: '9ec9c5721fcd5cc401b4499a0cc8878bc1a18bb5',
    height: 24,
    name: 'my-asset',
    scales: [1, 1.5, 2, 3, 4],
    type: 'png',
    width: 240,
  };

  test('generates a local asset for a given descriptor', () => {
    const {code} = babelGenerate(
      generateAssetCodeFileAst(
        'react-native-module/asset-resolver',
        assetDescriptor,
      ),
    );

    expect(code).toMatchSnapshot();
  });
});
