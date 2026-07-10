/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

'use strict';

import type {RequireWithUnstableImportMaybeSync} from './utils';

import {default as myDefault, foo as myFoo, myFunction} from './export-1';
import * as importStar from './export-2';
import {
  arrayFirst,
  arrayRest,
  objectRest,
  renamedObject,
} from './export-destructuring';
import {namespaceReExport} from './export-namespace';
import {foo} from './export-null';
import primitiveDefault, {
  foo as primitiveFoo,
} from './export-primitive-default';
import exportStarDefault, {
  overridden as exportStarOverridden,
  sourceOnly as exportStarSourceOnly,
} from './export-star-overrides';

declare var require: RequireWithUnstableImportMaybeSync;

export {default as namedDefaultExported} from './export-3';
export {foo as default} from './export-4';

export const extraData = {
  arrayFirst,
  arrayRest,
  exportStarDefault,
  exportStarOverridden,
  exportStarSourceOnly,
  foo,
  importStar,
  myDefault,
  myFoo,
  myFunction: myFunction() as string,
  namespaceReExportDefault: namespaceReExport.default,
  namespaceReExportFoo: namespaceReExport.foo,
  objectRest,
  primitiveDefault,
  primitiveFoo,
  renamedObject,
};

export const asyncImportCJS = import('./export-5');
export const asyncImportESM = import('./export-6');

export const asyncImportMaybeSyncCJS: unknown =
  require.unstable_importMaybeSync('./export-7');
export const asyncImportMaybeSyncESM: unknown =
  require.unstable_importMaybeSync('./export-8');
