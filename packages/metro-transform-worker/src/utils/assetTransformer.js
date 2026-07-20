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

import type {File} from '@babel/types';
import type {BabelTransformerArgs} from 'metro-babel-transformer';

import {getAssetData} from 'metro/private/Assets';
import {generateAssetCodeFileAst} from 'metro/private/Bundler/util';
import path from 'node:path';

export async function transform(
  {filename, options, src}: BabelTransformerArgs,
  assetRegistryPath: string,
  assetDataPlugins: ReadonlyArray<string>,
): Promise<{ast: File, ...}> {
  options = options || {
    platform: '',
    projectRoot: '',
    inlineRequires: false,
    minify: false,
  };

  const absolutePath = path.resolve(options.projectRoot, filename);

  const data = await getAssetData(
    absolutePath,
    filename,
    assetDataPlugins,
    options.platform,
    options.publicPath,
  );

  return {
    ast: generateAssetCodeFileAst(assetRegistryPath, data),
  };
}
