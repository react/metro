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

import type {RamBundleInfo} from '../../DeltaBundler/Serializers/getRamBundleInfo';
import type {OutputOptions, RequestOptions} from '../types';

import Server from '../../Server';
import asAssets from './RamBundle/as-assets';
import {save as asIndexedFile} from './RamBundle/as-indexed-file';

export async function build(
  packagerClient: Server,
  requestOptions: RequestOptions,
): Promise<RamBundleInfo> {
  const options = {
    ...Server.DEFAULT_BUNDLE_OPTIONS,
    ...requestOptions,
  };
  /* $FlowFixMe[incompatible-type] Natural Inference rollout. See
   * https://fburl.com/gdoc/y8dn025u */
  return await packagerClient.getRamBundleInfo(options);
}

export function save(
  bundle: RamBundleInfo,
  options: OutputOptions,
  log: (x: string) => void,
): Promise<unknown> {
  // We fork here depending on the platform: while Android is pretty good at
  // loading individual assets, iOS has a large overhead when reading hundreds
  // of assets from disk.
  return options.platform === 'android' && !(options.indexedRamBundle === true)
    ? asAssets(bundle, options, log)
    : asIndexedFile(bundle, options, log);
}

export const formatName = 'bundle';
