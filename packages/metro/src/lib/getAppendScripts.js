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

import type {Module} from '../DeltaBundler';
import type {Dependency} from '../DeltaBundler/types';

import getInlineSourceMappingURL from '../DeltaBundler/Serializers/helpers/getInlineSourceMappingURL';
import {sourceMapString} from '../DeltaBundler/Serializers/sourceMapString';
import CountingSet from './CountingSet';
import countLines from './countLines';
import nullthrows from 'nullthrows';

type Options<T extends number | string> = Readonly<{
  asyncRequireModulePath: string,
  createModuleId: string => T,
  getRunModuleStatement: (moduleId: T, globalPrefix: string) => string,
  globalPrefix: string,
  inlineSourceMap: ?boolean,
  processModuleFilter: (module: Module<>) => boolean,
  runBeforeMainModule: ReadonlyArray<string>,
  runModule: boolean,
  shouldAddToIgnoreList: (Module<>) => boolean,
  sourceMapUrl: ?string,
  sourceUrl: ?string,
  getSourceUrl: ?(Module<>) => string,
  ...
}>;

export default function getAppendScripts<T extends number | string>(
  entryPoint: string,
  modules: ReadonlyArray<Module<>>,
  options: Options<T>,
): ReadonlyArray<Module<>> {
  const output: Array<Module<>> = [];

  if (options.runModule) {
    const paths = [...options.runBeforeMainModule, entryPoint];

    for (const path of paths) {
      if (modules.some((module: Module<>) => module.path === path)) {
        const code = options.getRunModuleStatement(
          options.createModuleId(path),
          options.globalPrefix,
        );
        output.push({
          path: `require-${path}`,
          dependencies: new Map(),
          getSource: (): Buffer => Buffer.from(''),
          inverseDependencies: new CountingSet(),
          output: [
            {
              type: 'js/script/virtual',
              data: {
                code,
                lineCount: countLines(code),
                map: [],
              },
            },
          ],
        });
      }
    }
  }

  if (options.inlineSourceMap || options.sourceMapUrl) {
    const sourceMappingURL = options.inlineSourceMap
      ? getInlineSourceMappingURL(
          sourceMapString(modules, {
            processModuleFilter: options.processModuleFilter,
            excludeSource: false,
            shouldAddToIgnoreList: options.shouldAddToIgnoreList,
            getSourceUrl: options.getSourceUrl,
          }),
        )
      : nullthrows(options.sourceMapUrl);

    const code = `//# sourceMappingURL=${sourceMappingURL}`;
    output.push({
      path: 'source-map',
      dependencies: new Map<string, Dependency>(),
      getSource: (): Buffer => Buffer.from(''),
      inverseDependencies: new CountingSet(),
      output: [
        {
          type: 'js/script/virtual',
          data: {
            code,
            lineCount: countLines(code),
            map: [],
          },
        },
      ],
    });
  }

  if (options.sourceUrl) {
    const code = `//# sourceURL=${options.sourceUrl}`;
    output.push({
      path: 'source-url',
      dependencies: new Map<string, Dependency>(),
      getSource: (): Buffer => Buffer.from(''),
      inverseDependencies: new CountingSet(),
      output: [
        {
          type: 'js/script/virtual',
          data: {
            code,
            lineCount: countLines(code),
            map: [],
          },
        },
      ],
    });
  }

  return output;
}
