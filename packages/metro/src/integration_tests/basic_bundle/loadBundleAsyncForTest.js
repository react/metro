/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

declare var __METRO_GLOBAL_PREFIX__: string;
declare var __DOWNLOAD_AND_EXEC_FOR_TESTS__: (path: string) => Promise<unknown>;

const key = `${global.__METRO_GLOBAL_PREFIX__ ?? ''}__loadBundleAsync`;

global[key] = async function loadBundleAsyncForTest(path: string) {
  await __DOWNLOAD_AND_EXEC_FOR_TESTS__(path);
};
