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

jest.mock('node:os');

import getMaxWorkers from '../getMaxWorkers';

const os = jest.requireMock('node:os');

test('calculates the number of max workers', () => {
  /* $FlowFixMe[prop-missing](>=0.99.0 site=react_native_fb) This comment suppresses an error
   * found when Flow v0.99 was deployed. To see the error, delete this comment
   * and run Flow. */
  os.availableParallelism.mockReturnValue(1);
  expect(getMaxWorkers()).toBe(1);
  /* $FlowFixMe[prop-missing](>=0.99.0 site=react_native_fb) This comment suppresses an error
   * found when Flow v0.99 was deployed. To see the error, delete this comment
   * and run Flow. */
  os.availableParallelism.mockReturnValue(8);
  expect(getMaxWorkers()).toBe(6);
  /* $FlowFixMe[prop-missing](>=0.99.0 site=react_native_fb) This comment suppresses an error
   * found when Flow v0.99 was deployed. To see the error, delete this comment
   * and run Flow. */
  os.availableParallelism.mockReturnValue(24);
  expect(getMaxWorkers()).toBe(14);
  expect(getMaxWorkers(5)).toBe(5);
});
