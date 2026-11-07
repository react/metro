/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {Node} from '@babel/types';

import {traverse} from '@babel/core';
import nullthrows from 'nullthrows';

/**
 * Select unused names for "metroImportDefault" and "metroImportAll", by
 * calling "generateUid".
 */
export default function generateImportNames(ast: Node): {
  importAll: string,
  importDefault: string,
} {
  let importDefault;
  let importAll;

  traverse(ast, {
    Program(path) {
      importAll = path.scope.generateUid('$$_IMPORT_ALL');
      importDefault = path.scope.generateUid('$$_IMPORT_DEFAULT');

      path.stop();
    },
  });

  return {
    importAll: nullthrows(importAll),
    importDefault: nullthrows(importDefault),
  };
}
