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
import type {MixedSourceMap} from 'metro-source-map';

import {
  sourceMapGenerator,
  sourceMapGeneratorNonBlocking,
} from './sourceMapGenerator';

function sourceMapObject(
  modules: ReadonlyArray<Module<>>,
  options: SourceMapGeneratorOptions,
): MixedSourceMap {
  const generator = sourceMapGenerator(modules, options);
  return generator.toMap(undefined, {
    excludeSource: options.excludeSource,
  });
}

async function sourceMapObjectNonBlocking(
  modules: ReadonlyArray<Module<>>,
  options: SourceMapGeneratorOptions,
): Promise<MixedSourceMap> {
  const generator = await sourceMapGeneratorNonBlocking(modules, options);
  return generator.toMap(undefined, {
    excludeSource: options.excludeSource,
  });
}

export {sourceMapObject, sourceMapObjectNonBlocking};
