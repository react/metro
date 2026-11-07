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

import type {Module} from '../types';
import type {SourceMapGeneratorOptions} from './sourceMapGenerator';

import {
  sourceMapGenerator,
  sourceMapGeneratorNonBlocking,
} from './sourceMapGenerator';

function sourceMapString(
  modules: ReadonlyArray<Module<>>,
  options: SourceMapGeneratorOptions,
): string {
  return sourceMapGenerator(modules, options).toString(undefined, {
    excludeSource: options.excludeSource,
  });
}

async function sourceMapStringNonBlocking(
  modules: ReadonlyArray<Module<>>,
  options: SourceMapGeneratorOptions,
): Promise<string> {
  const generator = await sourceMapGeneratorNonBlocking(modules, options);
  return generator.toString(undefined, {
    excludeSource: options.excludeSource,
  });
}

export {sourceMapString, sourceMapStringNonBlocking};
