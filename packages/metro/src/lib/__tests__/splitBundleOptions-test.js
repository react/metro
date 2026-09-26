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

const baseOptions = {
  ...Server.DEFAULT_BUNDLE_OPTIONS,
  entryFile: 'index.js',
  platform: null,
};

describe('splitBundleOptions', () => {
  test('passes unstable_environment to resolver and transform options', () => {
    const {resolverOptions, transformOptions} = splitBundleOptions({
      ...baseOptions,
      unstable_environment: 'react-server',
    });
    expect(resolverOptions.unstable_environment).toBe('react-server');
    expect(transformOptions.unstable_environment).toBe('react-server');
  });

  test.each([[undefined], [null]])(
    'omits unstable_environment when it is %s',
    unstable_environment => {
      const {resolverOptions, transformOptions} = splitBundleOptions({
        ...baseOptions,
        unstable_environment,
      });
      expect(resolverOptions).not.toHaveProperty('unstable_environment');
      expect(transformOptions).not.toHaveProperty('unstable_environment');
    },
  );
});
