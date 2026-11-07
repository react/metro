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

import type {Node as BabelNode} from '@babel/types';

import generate from '@babel/generator';

const codeFromAst = (ast: BabelNode): string =>
  generate(ast, {concise: true}).code;
const comparableCode = (code: string): string =>
  code.trim().replace(/\s+/g, ' ');

export {codeFromAst, comparableCode};
