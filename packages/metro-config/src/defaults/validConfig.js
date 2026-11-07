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

import type {InputConfigT} from '../types';

export default async function validConfig(): Promise<InputConfigT> {
  const defaultConfig = await require('./index').default('/path/to/project');
  const validConfig = {
    ...defaultConfig,
    resolver: {
      ...defaultConfig.resolver,
      resolveRequest: function CustomResolver() {
        throw new Error('Not implemented');
      },
      hasteImplModulePath: './path',
    },
    server: {
      ...defaultConfig.server,
      unstable_serverRoot: '',
    },
    transformer: {
      ...defaultConfig.transformer,
      getTransformOptions: function getTransformOptions() {
        throw new Error('Not implemented');
      },
    },
    serializer: {
      ...defaultConfig.serializer,
      customSerializer: function customSerializer() {
        throw new Error('Not implemented');
      },
    },
  };

  return validConfig;
}
