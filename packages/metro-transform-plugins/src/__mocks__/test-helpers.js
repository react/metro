/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 * @oncall react_native
 */

'use strict';

import type {BabelCoreOptions, EntryOptions, PluginEntry} from '@babel/core';

const {transformSync} = require('@babel/core');
const generate = require('@babel/generator').default;
const t = require('@babel/types');
const nullthrows = require('nullthrows');

function makeTransformOptions<OptionsT extends ?EntryOptions>(
  plugins: ReadonlyArray<PluginEntry>,
  pluginOptions: OptionsT,
  babelOptions?: BabelCoreOptions,
): BabelCoreOptions {
  return {
    ast: true,
    babelrc: false,
    browserslistConfigFile: false,
    code: false,
    compact: true,
    configFile: false,
    plugins: plugins.length
      ? plugins.map(plugin => [plugin, pluginOptions])
      : [() => ({visitor: {}})],
    sourceType: 'module',
    filename:
      '/Users/test/app/node_modules/react-native/Libraries/Components/Pressable/useAndroidRippleForView.js',
    ...babelOptions,
  };
}

function validateOutputAst(ast: BabelNode) {
  const seenNodes = new Set<BabelNode>();
  t.traverseFast(nullthrows(ast), function enter(node) {
    if (seenNodes.has(node)) {
      throw new Error(
        'Found a duplicate ' +
          node.type +
          ' node in the output, which can cause' +
          ' undefined behavior in Babel.',
      );
    }
    seenNodes.add(node);
  });
}

function transformToAst<T extends ?EntryOptions>(
  plugins: ReadonlyArray<PluginEntry>,
  code: string,
  options: T,
  babelOptions?: BabelCoreOptions,
): BabelNodeFile {
  const transformResult = transformSync(
    code,
    makeTransformOptions(plugins, options, babelOptions),
  );
  const ast = nullthrows(transformResult.ast);
  validateOutputAst(ast);
  return ast;
}

function transform(
  code: string,
  plugins: ReadonlyArray<PluginEntry>,
  options: ?EntryOptions,
  babelOptions?: BabelCoreOptions,
) {
  return generate(transformToAst(plugins, code, options, babelOptions)).code;
}

exports.compare = function (
  plugins: ReadonlyArray<PluginEntry>,
  code: string,
  expected: string,
  options: ?EntryOptions = {},
  babelOptions?: BabelCoreOptions,
) {
  expect(transform(code, plugins, options, babelOptions)).toBe(
    transform(expected, [], {}),
  );
};

exports.transformToAst = transformToAst;
