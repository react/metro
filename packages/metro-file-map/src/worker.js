/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

/* eslint-disable import/no-commonjs */

/*::
import type {
  FileMapPluginWorker,
  MetadataWorker,
  WorkerMessage,
  WorkerMetadata,
  WorkerSetupArgs,
  V8Serializable,
} from './flow-types';
*/

'use strict';

const fs = require('graceful-fs');
const {createHash} = require('node:crypto');

function sha1hex(content /*: string | Buffer */) /*: string */ {
  return createHash('sha1').update(content).digest('hex');
}

class Worker {
  // prettier-ignore
  #plugins /*: ReadonlyArray<MetadataWorker> */;

  constructor({plugins = []} /*: WorkerSetupArgs */) {
    this.#plugins = plugins.map(({modulePath, setupArgs}) => {
      // $FlowFixMe[unsupported-syntax] - dynamic require
      const mod = require(modulePath);
      const PluginWorker =
        mod.__esModule === true && 'default' in mod ? mod.default : mod;
      return new PluginWorker(setupArgs);
    });
  }

  processFile(data /*: WorkerMessage */) /*: WorkerMetadata */ {
    let content;
    let sha1;

    const {computeSha1, filePath, pluginsToRun} = data;

    const getContent = () /*: Buffer */ => {
      if (content == null) {
        content = fs.readFileSync(filePath);
      }

      return content;
    };

    const workerUtils = {getContent};
    const pluginData = pluginsToRun.map(pluginIdx =>
      this.#plugins[pluginIdx].processFile(data, workerUtils),
    );

    // If a SHA-1 is requested on update, compute it.
    if (computeSha1) {
      sha1 = sha1hex(getContent());
    }

    return content && data.maybeReturnContent
      ? {content, pluginData, sha1}
      : {pluginData, sha1};
  }
}

let singletonWorker;

function setup(args /*: WorkerSetupArgs */) /*: void */ {
  if (singletonWorker) {
    throw new Error('metro-file-map: setup() should only be called once');
  }
  singletonWorker = new Worker(args);
}

function processFile(data /*: WorkerMessage */) /*: WorkerMetadata */ {
  if (!singletonWorker) {
    throw new Error(
      'metro-file-map: setup() must be called before processFile()',
    );
  }
  return singletonWorker.processFile(data);
}

module.exports = {
  /**
   * Called automatically by jest-worker before the first call to `worker` when
   * this module is used as worker thread or child process.
   */
  setup,
  /**
   * Called by jest-worker with each workload
   */
  processFile,
  /**
   * Exposed for use outside a jest-worker context, ie when processing in-band.
   */
  Worker,
};
