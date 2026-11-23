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

import Server from '../../Server';
import splitBundleOptions from '../splitBundleOptions';

test.each([
  ['react-server', 'react-server'],
  [undefined, undefined],
  [null, undefined],
  ['', undefined],
  ['client', undefined],
])(
  'with environment: %p, resolves and transforms for: %p',
  (environment, expected) => {
    const {resolverOptions, transformOptions} = splitBundleOptions({
      ...Server.DEFAULT_BUNDLE_OPTIONS,
      entryFile: 'index.js',
      environment,
      platform: null,
    });
    expect(resolverOptions.environment).toBe(expected);
    expect(transformOptions.environment).toBe(expected);
  },
);
