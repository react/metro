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

import type {RamBundleInfo} from '../../../DeltaBundler/Serializers/getRamBundleInfo';
import type {ModuleTransportLike} from '../../../shared/types';
import type {OutputOptions} from '../../types';

import relativizeSourceMapInline from '../../../lib/relativizeSourceMap';
import writeFile from '../writeFile';
import buildSourcemapWithMetadata from './buildSourcemapWithMetadata';
import MAGIC_RAM_BUNDLE_NUMBER from './magic-number';
import {joinModules} from './util';
import writeSourceMap from './write-sourcemap';
import {promises as fsPromises} from 'node:fs';
import path from 'node:path';

// must not start with a dot, as that won't go into the apk
const MAGIC_RAM_BUNDLE_FILENAME = 'UNBUNDLE';
const MODULES_DIR = 'js-modules';

/**
 * Saves all JS modules of an app as single files
 * The startup code (prelude, polyfills etc.) are written to the file
 * designated by the `bundleOuput` option.
 * All other modules go into a 'js-modules' folder that in the same parent
 * directory as the startup file.
 */
export default function saveAsAssets(
  bundle: RamBundleInfo,
  options: OutputOptions,
  log: (...args: Array<string>) => void,
): Promise<unknown> {
  const {
    bundleOutput,
    bundleEncoding: encoding,
    sourcemapOutput,
    sourcemapSourcesRoot,
  } = options;

  log('start');
  const {startupModules, lazyModules} = bundle;
  log('finish');
  const startupCode = joinModules(startupModules);

  log('Writing bundle output to:', bundleOutput);
  const modulesDir = path.join(path.dirname(bundleOutput), MODULES_DIR);
  const writeUnbundle = createDir(modulesDir).then(
    // create the modules directory first
    () =>
      Promise.all([
        writeModules(lazyModules, modulesDir, encoding),
        writeFile(bundleOutput, startupCode, encoding),
        writeMagicFlagFile(modulesDir),
      ]),
  );
  // $FlowFixMe[unused-promise]
  writeUnbundle.then(() => log('Done writing unbundle output'));

  if (sourcemapOutput) {
    const sourceMap = buildSourcemapWithMetadata({
      fixWrapperOffset: true,
      lazyModules: lazyModules.concat<
        ModuleTransportLike,
        ModuleTransportLike,
      >(),
      moduleGroups: null,
      startupModules: startupModules.concat<
        ModuleTransportLike,
        ModuleTransportLike,
      >(),
    });
    if (sourcemapSourcesRoot != null) {
      relativizeSourceMapInline(sourceMap, sourcemapSourcesRoot);
    }
    const wroteSourceMap = writeSourceMap(
      sourcemapOutput,
      JSON.stringify(sourceMap),
      log,
    );

    return Promise.all([writeUnbundle, wroteSourceMap]);
  } else {
    return writeUnbundle;
  }
}

function createDir(dirName: string): Promise<void> {
  return fsPromises.mkdir(dirName, {recursive: true});
}

function writeModuleFile(
  module: ModuleTransportLike,
  modulesDir: string,
  encoding: void | 'ascii' | 'utf16le' | 'utf8',
): Promise<unknown> {
  const {code, id} = module;
  return writeFile(path.join(modulesDir, id + '.js'), code, encoding);
}

function writeModules(
  modules: ReadonlyArray<ModuleTransportLike>,
  modulesDir: string,
  encoding: void | 'ascii' | 'utf16le' | 'utf8',
): Promise<Array<unknown>> {
  const writeFiles = modules.map(
    (module: ModuleTransportLike): Promise<unknown> =>
      writeModuleFile(module, modulesDir, encoding),
  );
  return Promise.all(writeFiles);
}

function writeMagicFlagFile(outputDir: string): Promise<unknown> {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(MAGIC_RAM_BUNDLE_NUMBER, 0);
  return writeFile(path.join(outputDir, MAGIC_RAM_BUNDLE_FILENAME), buffer);
}
