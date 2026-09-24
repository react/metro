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

import type {ModuleGroups, ModuleTransportLike} from '../../types';
import type {
  BasicSourceMap,
  IndexMap,
  IndexMapSection,
  MixedSourceMap,
} from 'metro-source-map';

import countLines from '../../../lib/countLines';
import invariant from 'invariant';

function lineToLineSourceMap(
  source: string,
  filename: string = '',
): BasicSourceMap {
  // The first line mapping in our package is the base64vlq code for zeros (A).
  const firstLine = 'AAAA;';

  // Most other lines in our mappings are all zeros (for module, column etc)
  // except for the lineno mapping: curLineno - prevLineno = 1; Which is C.
  const line = 'AACA;';

  return {
    file: filename,
    mappings: firstLine + Array(countLines(source)).join(line),
    sources: [filename],
    names: [],
    version: 3,
  };
}

const wrapperEnd = (wrappedCode: string) => wrappedCode.indexOf('{') + 1;

const Section = (line: number, column: number, map: MixedSourceMap) => ({
  map,
  offset: {line, column},
});

type CombineOptions = {fixWrapperOffset: boolean, ...};

function combineSourceMaps(
  modules: ReadonlyArray<ModuleTransportLike>,
  moduleGroups?: ModuleGroups,
  options?: ?CombineOptions,
): IndexMap {
  const sections = combineMaps(modules, null, moduleGroups, options);
  return {sections, version: 3};
}

function combineSourceMapsAddingOffsets(
  modules: ReadonlyArray<ModuleTransportLike>,
  x_metro_module_paths: Array<string>,
  moduleGroups?: ?ModuleGroups,
  options?: ?CombineOptions,
): IndexMap {
  const x_facebook_offsets: Array<number> = [];
  const sections = combineMaps(
    modules,
    x_facebook_offsets,
    moduleGroups,
    options,
  );
  return {sections, version: 3, x_facebook_offsets, x_metro_module_paths};
}

function combineMaps(
  modules: ReadonlyArray<ModuleTransportLike>,
  offsets: ?Array<number>,
  moduleGroups: ?ModuleGroups,
  options: ?CombineOptions,
): Array<IndexMapSection> {
  const sections: Array<IndexMapSection> = [];

  let line = 0;
  modules.forEach((moduleTransport: ModuleTransportLike) => {
    const {code, id, name} = moduleTransport;
    let column = 0;
    let group;
    let groupLines = 0;
    let {map} = moduleTransport;

    if (moduleGroups && moduleGroups.modulesInGroups.has(id)) {
      // this is a module appended to another module
      return;
    }

    if (offsets != null) {
      group = moduleGroups && moduleGroups.groups.get(id);
      if (group && moduleGroups) {
        const {modulesById} = moduleGroups;
        const otherModules: ReadonlyArray<ModuleTransportLike> = Array.from(
          group || [],
        )
          .map((moduleId: number) => modulesById.get(moduleId))
          .filter(Boolean); // needed to appease flow
        otherModules.forEach((m: ModuleTransportLike) => {
          groupLines += countLines(m.code);
        });
        map = combineSourceMaps([moduleTransport].concat(otherModules));
      }

      column = options && options.fixWrapperOffset ? wrapperEnd(code) : 0;
    }

    invariant(
      !Array.isArray(map),
      'Random Access Bundle source maps cannot be built from raw mappings',
    );
    sections.push(
      // $FlowFixMe[incompatible-type]
      Section(line, column, map || lineToLineSourceMap(code, name)),
    );
    if (offsets != null && id != null) {
      offsets[id] = line;
      for (const moduleId of group || []) {
        offsets[moduleId] = line;
      }
    }
    line += countLines(code) + groupLines;
  });

  return sections;
}

const joinModules = (
  modules: ReadonlyArray<{readonly code: string, ...}>,
): string =>
  modules.map((m: {readonly code: string, ...}) => m.code).join('\n');

export {
  combineSourceMaps,
  combineSourceMapsAddingOffsets,
  countLines,
  joinModules,
  lineToLineSourceMap,
};
