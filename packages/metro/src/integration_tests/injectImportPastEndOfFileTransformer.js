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

'use strict';

import type {PluginObj} from '@babel/core';
import type {
  BabelTransformer,
  BabelTransformerArgs,
} from 'metro-babel-transformer';

const {parse} = require('@babel/parser');
const baseTransformer = require('@react-native/metro-babel-transformer');

const TARGET_FILE = 'transform-injected-import.js';
const INJECTED_SPECIFIER = './does-not-exist';

/**
 * Returns a Babel plugin that appends `import './does-not-exist';` to the
 * module, parsed at `startLine` - which is what a plugin that generates and
 * appends code does, so that the generated code's locations do not overlap the
 * author's.
 *
 * Given a `startLine` past the end of the file, the dependency Metro collects
 * reports a source location that has no counterpart in the file on disk, which
 * is what the resolution error's code frame has to tolerate.
 */
function injectImportAt(startLine: number): () => PluginObj<> {
  return () => ({
    name: 'metro-test-inject-import-past-end-of-file',
    visitor: {
      Program(path) {
        const generated = parse(`import '${INJECTED_SPECIFIER}';`, {
          sourceType: 'module',
          startLine,
        });
        path.node.body.push(...generated.program.body);
      },
    },
  });
}

function transform(args: BabelTransformerArgs) {
  if (!args.filename.endsWith(TARGET_FILE)) {
    return baseTransformer.transform(args);
  }
  // One line past the last line of the source, so the injected import's
  // location does not exist in the file on disk.
  const startLine = args.src.split('\n').length + 1;
  return baseTransformer.transform({
    ...args,
    plugins: [...(args.plugins ?? []), injectImportAt(startLine)],
  });
}

module.exports = {
  transform,
  getCacheKey: baseTransformer.getCacheKey,
} as BabelTransformer;
