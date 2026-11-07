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

/* eslint-disable import/no-commonjs */

'use strict';

/*::
import type {MetadataWorker, WorkerMessage, V8Serializable} from '../flow-types';
*/

// A plugin worker for tests, whose data for a file is the length of its content.
module.exports = class LazyPluginWorker /*:: implements MetadataWorker */ {
  processFile(
    data /*: WorkerMessage */,
    utils /*: Readonly<{getContent: () => Buffer }> */,
  ) /*: V8Serializable */ {
    return {length: utils.getContent().toString().length};
  }
};
