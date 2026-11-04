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

import type {AssetData} from '../../Assets';
import type {BuildOptions, OutputOptions, RequestOptions} from '../types';
import type {MixedSourceMap} from 'metro-source-map';

import relativizeSourceMapInline from '../../lib/relativizeSourceMap';
import Server from '../../Server';
import writeFile from './writeFile';

const DEFAULTS = Server.DEFAULT_BUNDLE_OPTIONS;

export function build(
  packagerClient: Server,
  requestOptions: RequestOptions,
  buildOptions?: BuildOptions = {},
): Promise<{
  code: string,
  map: string,
  assets?: ReadonlyArray<AssetData>,
  ...
}> {
  return packagerClient.build(
    {
      ...DEFAULTS,
      ...requestOptions,
      ...{
        customResolverOptions:
          requestOptions.customResolverOptions ??
          DEFAULTS.customResolverOptions,
        customTransformOptions:
          requestOptions.customTransformOptions ??
          DEFAULTS.customTransformOptions,
        dev: requestOptions.dev ?? DEFAULTS.dev,
        inlineSourceMap:
          requestOptions.inlineSourceMap ?? DEFAULTS.inlineSourceMap,
        unstable_transformProfile:
          requestOptions.unstable_transformProfile ??
          DEFAULTS.unstable_transformProfile,
      },
    },
    buildOptions,
  );
}

function relativateSerializedMap(
  map: string,
  sourceMapSourcesRoot: string,
): string {
  const sourceMap: MixedSourceMap = JSON.parse(map);
  relativizeSourceMapInline(sourceMap, sourceMapSourcesRoot);
  return JSON.stringify(sourceMap);
}

export async function save(
  bundle: {
    code: string,
    map: string,
    ...
  },
  options: OutputOptions,
  log: (v: string) => void,
): Promise<unknown> {
  const {
    bundleOutput,
    bundleEncoding: encoding,
    sourcemapOutput,
    sourcemapSourcesRoot,
  } = options;

  const writeFns = [];

  writeFns.push(async () => {
    log(`Writing bundle output to: ${bundleOutput}`);
    await writeFile(bundleOutput, bundle.code, encoding);
    log('Done writing bundle output');
  });

  if (sourcemapOutput) {
    let {map} = bundle;
    if (sourcemapSourcesRoot != null) {
      log('start relativating source map');
      map = relativateSerializedMap(map, sourcemapSourcesRoot);
      log('finished relativating');
    }

    writeFns.push(async () => {
      log(`Writing sourcemap output to: ${sourcemapOutput}`);
      await writeFile(sourcemapOutput, map);
      log('Done writing sourcemap output');
    });
  }

  // Wait until everything is written to disk.
  await Promise.all(writeFns.map((cb: (v: void) => unknown) => cb()));
}

export const formatName = 'bundle';
