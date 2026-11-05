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

import type {AssetData} from '../../Assets';
import type {Module, ReadOnlyDependencies} from '../types';

import {getAssetData} from '../../Assets';
import {getJsOutput, isJsModule} from './helpers/js';
import path from 'node:path';

type Options = {
  readonly processModuleFilter: (module: Module<>) => boolean,
  assetPlugins: ReadonlyArray<string>,
  platform: ?string,
  projectRoot: string,
  publicPath: string,
};

export default async function getAssets(
  dependencies: ReadOnlyDependencies<>,
  options: Options,
): Promise<ReadonlyArray<AssetData>> {
  const promises = [];
  const {processModuleFilter} = options;

  for (const module of dependencies.values()) {
    if (!isJsModule(module) || !processModuleFilter(module)) {
      continue;
    }
    const output = getJsOutput(module);
    const projectRelativePath = path.relative(options.projectRoot, module.path);
    if (
      output.type === 'js/module/asset' &&
      projectRelativePath !== 'package.json'
    ) {
      promises.push(
        getAssetData(
          module.path,
          // Transformers other than Metro's use the project-relative path.
          output.data.unstable_assetUrlPath ?? projectRelativePath,
          options.assetPlugins,
          options.platform,
          options.publicPath,
        ),
      );
    }
  }

  return await Promise.all(promises);
}
