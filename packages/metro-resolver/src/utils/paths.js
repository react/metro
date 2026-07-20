/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

import path from 'node:path';

export const systemToPosixPath: (relativeSystemPath: string) => string =
  path.sep === '/'
    ? inputPath => inputPath
    : inputPath => inputPath.replaceAll('\\', '/');

export const posixToSystemPath: (relativePosixPath: string) => string =
  path.sep === '/'
    ? inputPath => inputPath
    : inputPath => inputPath.replaceAll('/', '\\');
