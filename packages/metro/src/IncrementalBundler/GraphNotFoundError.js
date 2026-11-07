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

import type {GraphId} from '../lib/getGraphId';

export default class GraphNotFoundError extends Error {
  graphId: GraphId;

  constructor(graphId: GraphId) {
    super(`The graph \`${graphId}\` was not found.`);
    this.graphId = graphId;
  }
}
