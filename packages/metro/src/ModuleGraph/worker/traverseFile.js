/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {IRFile} from './visitDependencyUses';
import type {TraverseOptions} from '@babel/traverse';

import {File, traverse as babelTraverse} from '@babel/core';

export default function traverseFile<TState>(
  file: IRFile,
  visitors: TraverseOptions<TState>,
  state: TState,
) {
  const {ast, sourceCode} = file;
  const babelFile = new File({}, {ast, code: sourceCode, inputMap: null});
  babelTraverse(ast, visitors, babelFile.scope, state);
}
