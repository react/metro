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

import getSourceMapInfo from './helpers/getSourceMapInfo';
import {isJsModule} from './helpers/js';
import {
  fromRawMappings,
  fromRawMappingsIndexed,
  fromRawMappingsNonBlocking,
  isVlqMap,
} from 'metro-source-map';

export type SourceMapGeneratorOptions = Readonly<{
  excludeSource: boolean,
  processModuleFilter: (module: Module<>) => boolean,
  shouldAddToIgnoreList: (module: Module<>) => boolean,
  getSourceUrl: ?(module: Module<>) => string,
  // Allow an index map (sectioned) that passes VLQ-stored maps through
  // verbatim, instead of decoding + re-encoding into a flat map. No-op unless
  // VLQ maps are actually present.
  allowIndexMap?: boolean,
}>;

function getSourceMapInfosImpl(
  isBlocking: boolean,
  onDone: (ReadonlyArray<ReturnType<typeof getSourceMapInfo>>) => void,
  modules: ReadonlyArray<Module<>>,
  options: SourceMapGeneratorOptions,
): void {
  const sourceMapInfos = [];
  const modulesToProcess = modules
    .filter(isJsModule)
    .filter(options.processModuleFilter);

  function processNextModule() {
    if (modulesToProcess.length === 0) {
      return true;
    }

    const mod = modulesToProcess.shift();
    // $FlowFixMe[incompatible-type]
    const info = getSourceMapInfo(mod, {
      excludeSource: options.excludeSource,
      shouldAddToIgnoreList: options.shouldAddToIgnoreList,
      getSourceUrl: options.getSourceUrl,
    });
    sourceMapInfos.push(info);
    return false;
  }

  function workLoop() {
    const time = process.hrtime();
    while (true) {
      const isDone = processNextModule();
      if (isDone) {
        onDone(sourceMapInfos);
        break;
      }
      if (!isBlocking) {
        // Keep the loop running but try to avoid blocking
        // for too long because this is not in a worker yet.
        const diff = process.hrtime(time);
        const NS_IN_MS = 1000000;
        if (diff[1] > 50 * NS_IN_MS) {
          // We've blocked for more than 50ms.
          // This code currently runs on the main thread,
          // so let's give Metro an opportunity to handle requests.
          setImmediate(workLoop);
          break;
        }
      }
    }
  }
  workLoop();
}

function sourceMapGenerator(
  modules: ReadonlyArray<Module<>>,
  options: SourceMapGeneratorOptions,
):
  | ReturnType<typeof fromRawMappings>
  | ReturnType<typeof fromRawMappingsIndexed> {
  let sourceMapInfos;
  getSourceMapInfosImpl(
    true,
    infos => {
      sourceMapInfos = infos;
    },
    modules,
    options,
  );
  if (sourceMapInfos == null) {
    throw new Error(
      'Expected getSourceMapInfosImpl() to finish synchronously.',
    );
  }
  if (shouldEmitIndexedMap(options, sourceMapInfos)) {
    return fromRawMappingsIndexed(sourceMapInfos);
  }
  return fromRawMappings(sourceMapInfos);
}

async function sourceMapGeneratorNonBlocking(
  modules: ReadonlyArray<Module<>>,
  options: SourceMapGeneratorOptions,
): Promise<
  | ReturnType<typeof fromRawMappings>
  | ReturnType<typeof fromRawMappingsIndexed>,
> {
  const sourceMapInfos = await new Promise<
    ReadonlyArray<ReturnType<typeof getSourceMapInfo>>,
  >(resolve => {
    getSourceMapInfosImpl(false, resolve, modules, options);
  });
  if (shouldEmitIndexedMap(options, sourceMapInfos)) {
    // The indexed path is a cheap synchronous passthrough — no need to yield.
    return fromRawMappingsIndexed(sourceMapInfos);
  }
  return fromRawMappingsNonBlocking(sourceMapInfos);
}

// An index map only helps (and only avoids decode) when maps are actually stored
// as VLQ, so gate on both the option and the presence of a VLQ map.
function shouldEmitIndexedMap(
  options: SourceMapGeneratorOptions,
  sourceMapInfos: ReadonlyArray<ReturnType<typeof getSourceMapInfo>>,
): boolean {
  return (
    options.allowIndexMap === true &&
    sourceMapInfos.some(info => isVlqMap(info.map))
  );
}

export {sourceMapGenerator, sourceMapGeneratorNonBlocking};
