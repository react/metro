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

/* eslint-disable import/no-commonjs */

'use strict';

const defaultDependencyExtractor = require('./dependencyExtractor');

/*::
import type {MetadataWorker, WorkerMessage, V8Serializable, DependencyExtractor} from '../../flow-types';
*/

class DependencyExtractorWorker /*:: implements MetadataWorker */ {
  // prettier-ignore
  /*:: readonly  */ #dependencyExtractor /*: ?DependencyExtractor['extract'] */;

  constructor(
    {dependencyExtractor} /*: Readonly<{dependencyExtractor: ?string}> */,
  ) {
    if (dependencyExtractor != null) {
      // $FlowFixMe[unsupported-syntax] - dynamic require
      const mod = require(dependencyExtractor);
      let extract = mod?.extract; // CJS export or ESM named export
      if (extract == null && mod?.__esModule === true) {
        extract = mod.default?.extract;
      }
      this.#dependencyExtractor = extract;
    }
  }

  processFile(
    data /*: WorkerMessage */,
    utils /*: Readonly<{getContent: () => Buffer}> */,
  ) /*: V8Serializable */ {
    const content = utils.getContent().toString();
    const {filePath} = data;

    const dependencies =
      this.#dependencyExtractor != null
        ? this.#dependencyExtractor(
            content,
            filePath,
            defaultDependencyExtractor.extract,
          )
        : defaultDependencyExtractor.extract(content);

    // Return as array (PerFileData type)
    return Array.from(dependencies);
  }
}

module.exports = DependencyExtractorWorker;
