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

import type {BasicSourceMap, BundleBuilder} from 'metro-source-map';

export type LazyModuleSwitchEntry = Readonly<{
  moduleId: number | string,
  code: string,
  map: ?BasicSourceMap,
  sourcePath: string,
}>;

export function appendLazyModuleSwitch(
  builder: BundleBuilder,
  entries: ReadonlyArray<LazyModuleSwitchEntry>,
  options: Readonly<{globalPrefix: string}>,
): void {
  const modulePrefix = '_';

  builder.append(
    `var ${modulePrefix}${options.globalPrefix}__d = ${options.globalPrefix}__d;`,
  );
  builder.append('switch (moduleId) {\n');

  for (const entry of entries) {
    builder
      .append(
        'case ' + entry.moduleId + ':\n' + modulePrefix,
        moduleAnchorMap(entry.sourcePath),
      )
      .append(entry.code, entry.map)
      .append('return;\n');
  }

  builder.append('default: new Error("No module found for ID " + moduleId);}');
}

function moduleAnchorMap(sourcePath: string): BasicSourceMap {
  return {
    version: 3,
    sources: [sourcePath],
    names: [],
    mappings: 'AAAA',
  };
}
