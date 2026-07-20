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

const path = require('node:path');

const ROOT_PATH = path.resolve(__dirname, 'basic_bundle');

module.exports = {
  cacheStores: [],
  maxWorkers: 1,
  projectRoot: ROOT_PATH,
  reporter: {update() {}},
  watchFolders: [path.resolve(__dirname, '../../../')],
  server: {port: 0},
  resolver: {
    blockList: [/excluded_from_file_map\.js$/],
    useWatchman: false,
  },
  transformer: {
    assetRegistryPath: path.join(ROOT_PATH, 'AssetRegistry'),
    asyncRequireModulePath:
      require.resolve('metro-runtime/src/modules/asyncRequire'),
    babelTransformerPath:
      require.resolve('@react-native/metro-babel-transformer'),
    enableBabelRCLookup: false,
    enableBabelRuntime: false,
    getTransformOptions: async entryFiles => ({
      transform: {
        experimentalImportSupport: true,
        inlineRequires: entryFiles.some(filePath =>
          filePath.includes('inline-requires'),
        ),
      },
      preloadedModules: false,
      ramGroups: [],
    }),
  },
  serializer: {
    getPolyfills: () => [
      require.resolve('./basic_bundle/loadBundleAsyncForTest'),
    ],
  },
};
