/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

import type {Node as BabelNode} from '@babel/types';

const t = require('@babel/types');

('use strict');

module.exports = function validateOutputAst(ast: BabelNode) {
  const seenNodes = new Set<BabelNode>();
  t.traverseFast(ast, function enter(node) {
    if (seenNodes.has(node)) {
      throw new Error(
        'Found a duplicate node in the output, which can cause' +
          ' undefined behavior in Babel.',
      );
    }
    seenNodes.add(node);
  });
};
