/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

const worker = require('metro-transform-worker');
const fs = require('node:fs');

/**
 * Wraps Metro's transform worker so that the output of `Bar.js` embeds the
 * contents of the file at `config.unstable_testExternalInputPath`, and declares
 * that file as an external input.
 */
module.exports = {
  ...worker,
  async transform(config, projectRoot, filename, data, options) {
    const result = await worker.transform(
      config,
      projectRoot,
      filename,
      data,
      options,
    );
    const inputPath = config.unstable_testExternalInputPath;
    if (inputPath == null || !filename.endsWith('Bar.js')) {
      return result;
    }
    const value = fs.readFileSync(inputPath, 'utf8');
    return {
      ...result,
      output: result.output.map(output => ({
        ...output,
        data: {
          ...output.data,
          // Appended on the last line, so line counts and maps are unchanged.
          code: output.data.code + `/* external: ${value} */`,
        },
      })),
      unstable_externalInputs: [{type: 'file', filePath: inputPath}],
    };
  },
};
