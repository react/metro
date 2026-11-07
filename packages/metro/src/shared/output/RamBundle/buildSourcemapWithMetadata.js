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
import type {IndexMap} from 'metro-source-map';

import {
  combineSourceMaps,
  combineSourceMapsAddingOffsets,
  joinModules,
} from './util';

type Params = {
  fixWrapperOffset: boolean,
  lazyModules: ReadonlyArray<ModuleTransportLike>,
  moduleGroups: ?ModuleGroups,
  startupModules: ReadonlyArray<ModuleTransportLike>,
};

export default ({
  fixWrapperOffset,
  lazyModules,
  moduleGroups,
  startupModules,
}: Params): IndexMap => {
  const options = fixWrapperOffset ? {fixWrapperOffset: true} : undefined;
  const startupModule: ModuleTransportLike = {
    code: joinModules(startupModules),
    id: Number.MIN_SAFE_INTEGER,
    map: combineSourceMaps(startupModules, undefined, options),
    sourcePath: '',
  };

  // Add map of module id -> source to sourcemap
  const module_paths = [];
  startupModules.forEach((m: ModuleTransportLike) => {
    module_paths[m.id] = m.sourcePath;
  });
  lazyModules.forEach((m: ModuleTransportLike) => {
    module_paths[m.id] = m.sourcePath;
  });

  const map = combineSourceMapsAddingOffsets(
    [startupModule].concat(lazyModules),
    module_paths,
    moduleGroups,
    options,
  );
  if (map.x_facebook_offsets != null) {
    delete map.x_facebook_offsets[Number.MIN_SAFE_INTEGER];
  }

  return map;
};
