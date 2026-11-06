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

import getDefaultConfig from '../index';

const {getRunModuleStatement} = getDefaultConfig.getDefaultValues().serializer;

test.each([
  [42, '', '__r(42);'],
  [42, 'app1', 'app1__r(42);'],
  ['foo.js', 'app1', 'app1__r("foo.js");'],
])(
  'getRunModuleStatement(%p, %p) is %p',
  (moduleId, globalPrefix, expected) => {
    expect(getRunModuleStatement(moduleId, globalPrefix)).toBe(expected);
  },
);

test('getRunModuleStatement treats a missing prefix as empty', () => {
  // $FlowExpectedError[incompatible-type] Wrappers may omit the prefix.
  expect(getRunModuleStatement(42)).toBe('__r(42);');
});
