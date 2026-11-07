/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

'use strict';

export * from './export-star-source';

(global.__exportStarEvents || (global.__exportStarEvents = [])).push(
  'barrel body',
);

export const evaluationOrder = global.__exportStarEvents;

export const overridden = 'export-star-overrides: OVERRIDDEN';

export default 'export-star-overrides: DEFAULT';
