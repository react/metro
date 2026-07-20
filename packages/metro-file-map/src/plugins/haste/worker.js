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

'use strict';

const excludedExtensions = require('../../workerExclusionList');
const path = require('node:path');

/*::
import type {MetadataWorker, WorkerMessage, V8Serializable} from '../../flow-types';
*/

const PACKAGE_JSON = path.sep + 'package.json';

module.exports = class Worker /*:: implements MetadataWorker */ {
  /*:: readonly  */ #hasteImpl /*: ?Readonly<{getHasteName: string => ?string}>  */ =
    null;

  constructor(
    {hasteImplModulePath} /*: Readonly<{hasteImplModulePath: ?string}> */,
  ) {
    if (hasteImplModulePath != null) {
      // $FlowFixMe[unsupported-syntax] - dynamic require
      const mod = require(hasteImplModulePath);
      this.#hasteImpl =
        mod.__esModule === true && 'default' in mod ? mod.default : mod;
    }
  }

  processFile(
    data /*: WorkerMessage */,
    utils /*: Readonly<{getContent: () => Buffer }> */,
  ) /*: V8Serializable */ {
    let hasteName /*: string | null */ = null;
    const {filePath} = data;
    if (filePath.endsWith(PACKAGE_JSON)) {
      // Process a package.json that is returned as a PACKAGE type with its name.
      try {
        const fileData = JSON.parse(utils.getContent().toString());
        if (fileData.name) {
          hasteName = fileData.name;
        }
      } catch (err) {
        throw new Error(`Cannot parse ${filePath} as JSON: ${err.message}`);
      }
    } else if (
      !excludedExtensions.has(filePath.substr(filePath.lastIndexOf('.')))
    ) {
      if (!this.#hasteImpl) {
        throw new Error('computeHaste is true but hasteImplModulePath not set');
      }
      // Process a random file that is returned as a MODULE.
      hasteName = this.#hasteImpl.getHasteName(filePath) || null;
    }
    return hasteName;
  }
};
