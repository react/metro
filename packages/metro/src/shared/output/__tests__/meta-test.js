/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

'use strict';

import meta from '../meta';

test('exports the block list creator', () => {
  expect(meta('some formatted code', 'utf8')).toMatchSnapshot();
});
